import { sql, type Kysely } from "kysely";
import {
  REFERENTIAL_ACTION_MAP,
  prisma_default_from_col,
  prisma_type_from_col,
  prisma_updatedat_from_col,
} from "./mysql-prisma-map";
import { ts_type_from_col } from "./mysql-typescript-map";
import { groupBy } from "./utils";
import type { MysqlDB } from "./mysqldb";

type DB = Kysely<MysqlDB>;

export type IntrospectResult = Awaited<ReturnType<typeof introspect>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function introspect(db: Kysely<any>) {
  if (!(await hasConnection(db))) {
    throw new Error("no connection to db");
  }

  const [{ tableTypes, enums }, { tableIndexing }, { tableRelations, opposingTableRelations }] = await Promise.all([
    getTableTypes(db as DB),
    getTableIndexing(db as DB),
    getTableRelations(db as DB),
  ]);

  return { tableTypes, enums, tableIndexing, tableRelations, opposingTableRelations };
}

async function hasConnection(db: Kysely<unknown>) {
  try {
    await sql`SELECT 1;`.execute(db);
    return true;
  } catch {
    return false;
  }
}

async function getTableRelations(db: DB) {
  const RELATIONS = await db
    .selectFrom("information_schema.REFERENTIAL_CONSTRAINTS as rc")
    .innerJoin("information_schema.KEY_COLUMN_USAGE as kcu", "rc.CONSTRAINT_NAME", "kcu.CONSTRAINT_NAME")
    .where("kcu.TABLE_SCHEMA", "=", sql`database()`)
    .select([
      "kcu.TABLE_NAME",
      "kcu.COLUMN_NAME",
      "kcu.REFERENCED_TABLE_NAME",
      "kcu.REFERENCED_COLUMN_NAME",
      "kcu.CONSTRAINT_NAME",
      //"kcu.POSITION_IN_UNIQUE_CONSTRAINT",
      "rc.DELETE_RULE",
      "rc.UPDATE_RULE",
    ])
    .execute();
  //console.log({ RELATIONS });

  //the only reason for this query is for prisma.schema, we need to know if the actual column is nullable
  //because the relation written out needs to be with "?" if the actual column is written with "?".
  const STATISTICS = await db
    .selectFrom("information_schema.STATISTICS as s")
    .select(["s.COLUMN_NAME", "s.TABLE_NAME", "s.INDEX_NAME", "s.SEQ_IN_INDEX", "s.NON_UNIQUE", "s.NULLABLE"])
    .where("s.TABLE_SCHEMA", "=", sql`database()`)
    .execute();

  const statistics = groupBy(STATISTICS, "TABLE_NAME");
  const opposingTableRelations: Record<string, { prismastring: string }[]> = {};

  const tableRelations = Object.fromEntries(
    Object.entries(groupBy(RELATIONS, "TABLE_NAME")).map(([tableName, relations]) => {
      return [
        tableName,
        relations.map((relation) => {
          //add some info
          const fieldName = relation.COLUMN_NAME;
          const pseudocolName = relation.CONSTRAINT_NAME;
          const referencedCol = relation.REFERENCED_COLUMN_NAME;
          const referencedModel = relation.REFERENCED_TABLE_NAME!;
          const onUpdate = REFERENTIAL_ACTION_MAP[relation.UPDATE_RULE];
          const onDelete = REFERENTIAL_ACTION_MAP[relation.DELETE_RULE];

          //prisma string
          //someColname Example? @relation(fields: [exampleId], references: [id], onDelete: somestr, onUpdate: somestr)

          //note: we have to look at the column itself aka "exampleId" here to know if the relation
          //  should be written as nullable in prisma.schema
          //note2: relations are written as "fields" in schema, but they are not actual column in db
          //note3: there is also the caveat that in prisma.schema we write relation on "referenced side"
          //  aswell, but again, they are not actual columns in db either
          //note4: if the key is @unique then opposite relation is "example Example" instead of "example Example[]"
          //note5: note4 is not quite corrcect, turns out prisma considers "Example[]" vs "Example?" on recieving table equivalent
          //  again, this field does not exist on db level but thought perhaps prisma diff would care about it
          //  so far it seems to work fine by always using array form eg "Example[]" on recieving side

          const indexInfo = statistics[tableName]?.find((x) => x.COLUMN_NAME === fieldName);
          //const indexInfo = STATISTICS.find((x) => x.TABLE_NAME === tableName && x.COLUMN_NAME === fieldName);

          //const isUnique = indexInfo?.NON_UNIQUE === 0;
          const isNullable = indexInfo?.NULLABLE === "YES";
          const optional = isNullable ? "?" : "";

          const opposing_prismastring = `${pseudocolName} ${tableName}[]`;
          //const opposing_prismastring = `${pseudocolName} ${tableName}?\n` //any scenario where this is required?..

          if (opposingTableRelations[referencedModel]) {
            opposingTableRelations[referencedModel]!.push({ prismastring: opposing_prismastring });
          } else {
            opposingTableRelations[referencedModel] = [{ prismastring: opposing_prismastring }];
          }

          const prismastring = `${pseudocolName} ${referencedModel}${optional} @relation(fields: [${fieldName}], references: [${referencedCol}], onUpdate: ${onUpdate}, onDelete: ${onDelete})`;
          return { ...relation, prismastring };
        }),
      ] as const;
    })
  );

  return { tableRelations, opposingTableRelations };
}

async function getTableIndexing(db: DB) {
  const STATISTICS = await db
    .selectFrom("information_schema.STATISTICS as s")
    .select(["s.COLUMN_NAME", "s.TABLE_NAME", "s.INDEX_NAME", "s.SEQ_IN_INDEX", "s.NON_UNIQUE", "s.NULLABLE"])
    .where("s.TABLE_SCHEMA", "=", sql`database()`)
    .execute();

  //console.log({ STATISTICS });

  const tableIndexing = Object.fromEntries(
    Object.entries(groupBy(STATISTICS, "TABLE_NAME")).map(([tableName, columns]) => {
      return [
        tableName,
        Object.entries(groupBy(columns, "INDEX_NAME")).map(([indexName, indexes]) => {
          //add some info to column
          const orderedIndexes = indexes.sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX);
          const colNames = orderedIndexes.map((x) => x.COLUMN_NAME);
          const first = orderedIndexes[0]!; //they are all the same except order and colname

          const isNullable = first.NULLABLE === "YES";
          const isUnique = first.NON_UNIQUE === 0;
          const prismaindextype = first.INDEX_NAME === "PRIMARY" ? "id" : isUnique ? "unique" : "index";
          const prismastring = `@@${prismaindextype}([${colNames.map((s) => s).join(", ")}])`;

          return {
            tableName,
            indexName,
            isNullable,
            colNames,
            prismaindextype,
            prismastring,
          };
        }),
      ] as const;
    })
  );
  return { tableIndexing };
}

function unique(v: string[]) {
  return Array.from(new Set(v));
}

type ColumnsQuery = Awaited<ReturnType<typeof columnsQuery>>;
export type Col = ColumnsQuery[number];

async function columnsQuery(db: DB) {
  const COLUMNS = await db
    .selectFrom("information_schema.COLUMNS as c")
    .select([
      "c.COLUMN_NAME",
      "c.DATA_TYPE",
      "c.COLUMN_TYPE",
      "c.DATETIME_PRECISION",
      "c.NUMERIC_PRECISION",
      "c.NUMERIC_SCALE",
      "c.CHARACTER_MAXIMUM_LENGTH",
      "c.CHARACTER_OCTET_LENGTH",
      "c.TABLE_NAME",
      "c.IS_NULLABLE",
      "c.EXTRA",
      "c.COLUMN_DEFAULT",
    ])
    .where("c.TABLE_SCHEMA", "=", sql`database()`)
    .orderBy("c.ORDINAL_POSITION asc")
    .execute();

  return COLUMNS;
}

async function getTableTypes(db: DB) {
  const COLUMNS = await columnsQuery(db);

  //console.log(groupBy(COLUMNS, "TABLE_NAME"));

  //for prisma schema. in db they only exist on column level (max 65535 variants, https://dev.mysql.com/doc/refman/8.0/en/enum.html)
  const enums: { enumName: string; variants: string[] }[] = [];

  const tableTypes = Object.fromEntries(
    Object.entries(groupBy(COLUMNS, "TABLE_NAME")).map(([tableName, columns]) => {
      return [
        tableName,
        columns.map((column) => {
          //add some info to column
          const [type, dbtype] = prisma_type_from_col(column);
          const isNullable = column.IS_NULLABLE === "YES";
          const defaultValue = prisma_default_from_col(type, column);
          const atDefault = defaultValue ? `@default(${defaultValue})` : "";
          const atUpdatedAt = prisma_updatedat_from_col(column);
          const isGenerated = !!defaultValue;
          const colName = column.COLUMN_NAME;
          const tsstring = `${ts_type_from_col(column)}${isNullable ? " | null" : ""}`;

          //special care for "prisma enum", which is defined separately eg "table level" in prisma but on "column level" in db and typescript types
          const isEnum = column.DATA_TYPE === "enum";
          if (isEnum) {
            //"enum('USER','ADMIN')" => ["USER", "ADMIN"]
            const variants = column.COLUMN_TYPE.slice(5, -1).replaceAll("'", "").split(",");
            const enumName = `${tableName}_${column.COLUMN_NAME}_enum`;
            enums.push({
              enumName,
              variants,
            });
            return {
              ...column,
              tableName,
              colName,
              defaultValue,
              prismastring: `${column.COLUMN_NAME} ${enumName}${
                isNullable ? "?" : ""
              } ${atDefault} ${atUpdatedAt}`.trim(),
              tsstring: `${colName}: ${isGenerated ? `Generated<${tsstring}>` : tsstring}`,
            };
          }

          return {
            ...column,
            tableName,
            colName,
            defaultValue,
            prismastring: `${column.COLUMN_NAME} ${type}${
              isNullable ? "?" : ""
            } ${dbtype} ${atDefault} ${atUpdatedAt}`.trim(),
            tsstring: `${colName}: ${isGenerated ? `Generated<${tsstring}>` : tsstring}`,
          };
        }),
      ] as const;
    })
  );
  return { tableTypes, enums };
}