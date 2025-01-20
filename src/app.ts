import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { BirdEyeClient } from "./services/birdeye/BirdEyeClient.ts";
import "jsr:@std/dotenv/load";

const router = new Router();
const client = new BirdEyeClient();

router.get("/toptraders", async (context) => {
  const traders = await client.getTopTraders();
  console.log(`Fetched ${traders.length} traders, sending to Discord...`);
  context.response.body = traders;
});

router.post("/process-message", async (context) => {
  const tokens = await client.getTokenList({
    sortBy: "",
    sortType: "",
    offset: 0,
    limit: 0,
    minLiquidity: 0,
  });
  console.log(`Fetched ${tokens.length} tokens, sending to Discord...`);
  context.response.body = tokens;
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "5001");
console.log("listening on port: ", port);
await app.listen({ port });
