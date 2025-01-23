import "jsr:@std/dotenv/load";
import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { SonarTopTraders } from "./services/sonar/SonarTopTraders.ts";

const router = new Router();
const sonarTopTradersService = new SonarTopTraders();

// Existing endpoints
router.get("/toptraders", async (context) => {
  const response = await sonarTopTradersService.getTopTraders();
  context.response.body = response;
});

router.get("/analyze", async (context) => {
  const tokenAddresses = context.request.url.searchParams.getAll("token");
  const response = await sonarTopTradersService.analyze({ tokenAddresses });
  context.response.body = response;
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "5001");
console.log("listening on port:", port);
await app.listen({ port });
