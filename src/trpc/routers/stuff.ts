import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { db } from "#src/db";

export const stuffRouter = createTRPCRouter({
  cookieExample: publicProcedure.query(({ ctx }) => {
    //just an example of setting response headers from procedure
    //for client components:
    //both resHeaders and reqHeaders will exist
    //
    //for server components
    //reqHeaders will exist with apiRsc (dynamic page aka render at request time cuz usage of headers() or cookies() )
    //neither will exist with apiRscPublic (static page)
    if (!ctx.resHeaders) {
      return false;
    }
    ctx.resHeaders.append("Set-Cookie", `hello=world; Path=/; Secure; HttpOnly; SameSite=Lax`);
    ctx.resHeaders.append("Set-Cookie", `yep=yup; Path=/; Secure; HttpOnly; SameSite=Lax`);
    return true;
  }),
  revalidateExample: publicProcedure.input(z.object({ postId: z.number() })).query(async ({ input }) => {
    const post = await db
      .selectFrom("Post")
      .selectAll()
      .where("id", "=", input.postId)
      .getFirst({
        next: {
          revalidate: 10,
        },
      });
    return post;
  }),
});
