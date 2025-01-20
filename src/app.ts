import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import "jsr:@std/dotenv/load";

const router = new Router();

router.get("/toptraders", async (context) => {
  /**
   *
   * get analyzed list of traders from redis
   */
  context.response.body = [];
});

router.post("/analyze", async (context) => {
  /**
   *
   * 1. get trending tokens
   * 2. get top traders per volume of those tokens
   * 3. get and store history of those traders
   * 4. loop through top traders and call n8n to analyze each one posting its results in redis
   */
  context.response.status = 200;
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "5001");
console.log("listening on port: ", port);
await app.listen({ port });
