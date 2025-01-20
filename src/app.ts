import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import "jsr:@std/dotenv/load";
import { Traders } from "./services/traders/Traders.ts";

const router = new Router();
const tradersService = new Traders();

router.get("/toptraders", async (context) => {
  const response = await tradersService.getTopTraders();
  context.response.body = response;
});

router.get("/analyze", async (context) => {
  const tokenAddresses = context.request.url.searchParams.getAll("token");
  const response = await tradersService.analyze({ tokenAddresses });
  context.response.body = response;
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "5001");
console.log("listening on port: ", port);
await app.listen({ port });
