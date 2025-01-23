import "jsr:@std/dotenv/load";
import { VolumeTrader } from "./services/trading/volume/VolumeTrader.ts";
import { VolumeTraderConfig } from "./core/types/TradeVolume.ts";
import { Connection, Keypair } from "@solana/web3.js";
import { default as bs58 } from "bs58";

async function main() {
  // Get environment variables or use default values
  const rpcUrl =
    Deno.env.get("SOLANA_RPC_URL") || "https://api.devnet.solana.com";
  const privateKey = Deno.env.get("SOLANA_PRIVATE_KEY");

  const base = Deno.env.get("TOKEN_PAIR_BASE");
  const quote = Deno.env.get("TOKEN_PAIR_QUOTE");

  if (!base || !quote || !rpcUrl || !privateKey) {
    throw new Error("Missing required environment variables");
  }

  const config: VolumeTraderConfig = {
    tokenPair: {
      base,
      quote,
    },
    volumeAmount: Number(Deno.env.get("VOLUME_AMOUNT") || 10),
    tradeInterval: Number(Deno.env.get("TRADE_INTERVAL") || 600),
    priceRange: {
      min: Number(Deno.env.get("PRICE_RANGE_MIN") || 0.0005),
      max: Number(Deno.env.get("PRICE_RANGE_MAX") || 0.005),
    },
  };
  const connection = new Connection(rpcUrl);
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  const volumeTrader = new VolumeTrader(connection, wallet, config);

  try {
    await volumeTrader.start();

    //   function setupKeyboardControls(): void {
    // // Configure stdin for raw mode to capture keystrokes
    // readline.emitKeypressEvents(process.stdin);
    // if (process.stdin.isTTY) {
    //   process.stdin.setRawMode(true);
    // }
    // process.stdin.on('keypress', async (str, key) => {
    //   if (key.name === 'x') {
    //     console.log('\n[Control] Stopping trading and closing all positions...');
    //     this.allowNewTrades = false;
    //     await this.closeAllPositions();
    //     // Report final balance
    //     const finalBalanceMessage = `🏦 Final Simulation Balance: ${this.simulatedBalance.toFixed(4)} SOL`;
    //     console.log(finalBalanceMessage);
    //     await this.discord.notifyTrade(finalBalanceMessage);
    //   }
    //   // Optional: Add ctrl+c handling for complete shutdown
    //   if (key.ctrl && key.name === 'c') {
    //     console.log('\n[Control] Stopping bot...');
    //     await this.stop();
    //     process.exit();
    //   }
    // });
    // console.log("\nKeyboard Controls:");
    // console.log("- Press 'x' to stop trading and close all positions");
    // console.log("- Press 'ctrl+c' to stop the bot completely\n");
    //   }
  } catch (error) {
    await volumeTrader.stop();
    console.error("Error:", error);
    Deno.exit(1); // Exit with error code if there's an error during execution.
  }
}

if (import.meta.main) {
  main();
}
