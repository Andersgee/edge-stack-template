import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Post = {
  id: Generated<number>;
  text: string;
};
export type User = {
  id: Generated<number>;
  email: string;
  googleUserSub: string | null;
  discordUserId: string | null;
  githubUserId: number | null;
  image: string | null;
  name: string;
};
export type UserPostPivot = {
  userId: number;
  postId: number;
};
export type DB = {
  Post: Post;
  User: User;
  UserPostPivot: UserPostPivot;
};
