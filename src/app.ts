// src/app.ts
import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Connection, Keypair } from "@solana/web3.js";
import { default as bs58 } from "bs58";
import "jsr:@std/dotenv/load";
import { SonarTopTraders } from "./services/sonar/SonarTopTraders.ts";
import { VolumeTrader } from "./services/trading/volume/VolumeTrader.ts";
import { VolumeTraderConfig } from "./core/types/TradeVolume.ts";

const router = new Router();
const sonarTopTradersService = new SonarTopTraders();
let volumeTrader: VolumeTrader | null = null;

const initVolumeTrader = (): VolumeTrader => {
  const base = Deno.env.get("TOKEN_PAIR_BASE");
  const quote = Deno.env.get("TOKEN_PAIR_QUOTE");
  const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
  const privateKey = Deno.env.get("SOLANA_PRIVATE_KEY");

  if (!base || !quote || !rpcUrl || !privateKey) {
    throw new Error("Missing required environment variables");
  }

  const config: VolumeTraderConfig = {
    tokenPair: {
      base,
      quote
    },
    volumeAmount: Number(Deno.env.get("VOLUME_AMOUNT") || 10),
    tradeInterval: Number(Deno.env.get("TRADE_INTERVAL") || 600),
    priceRange: {
      min: Number(Deno.env.get("PRICE_RANGE_MIN") || 0.0005),
      max: Number(Deno.env.get("PRICE_RANGE_MAX") || 0.005)
    }
  };

  try {
    const connection = new Connection(rpcUrl);
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    return new VolumeTrader(connection, wallet, config);
  } catch (err) {
    const error = err as Error;
    throw new Error(`Failed to initialize VolumeTrader: ${error.message}`);
  }
};

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

// Volume trading endpoints
router.post("/volume/start", async (context) => {
  try {
    if (!volumeTrader) {
      volumeTrader = initVolumeTrader();
      await volumeTrader.start();
      context.response.body = { status: "Volume trader started" };
    } else {
      context.response.body = { status: "Volume trader already running" };
    }
  } catch (err) {
    const error = err as Error;
    context.response.status = 500;
    context.response.body = { error: error.message };
  }
});

router.post("/volume/stop", async (context) => {
  try {
    if (volumeTrader) {
      await volumeTrader.stop();
      volumeTrader = null;
      context.response.body = { status: "Volume trader stopped" };
    } else {
      context.response.body = { status: "Volume trader not running" };
    }
  } catch (err) {
    const error = err as Error;
    context.response.status = 500;
    context.response.body = { error: error.message };
  }
});

router.get("/volume/status", (context) => {
  if (volumeTrader) {
    context.response.body = {
      status: "running",
      tradeState: volumeTrader.getTradeState()
    };
  } else {
    context.response.body = { status: "stopped" };
  }
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "5001");
console.log("listening on port:", port);
await app.listen({ port });