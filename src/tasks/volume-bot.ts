// src/tasks/volume-bot.ts
import "jsr:@std/dotenv/load";
import { Connection } from "@solana/web3.js";
import { SolanaWallet } from "../services/solana/wallet.ts";
import { VolumeStrategy } from "../services/strategy/volume.ts";

function main() {
  try {
    const privKey = Deno.env.get("SOLANA_PRIVATE_KEY");
    if (!privKey) {
      throw new Error("SOLANA_PRIVATE_KEY not found in environment variables");
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const connection = new Connection(rpcUrl!);
    const wallet = new SolanaWallet(connection, privKey);

    console.clear();
    console.log("🚀 Starting Volume Bot...");
    console.log(`💳 Wallet: ${wallet.getPublicKey()}`);

    // Get simulation mode from command line args
    const args = Deno.args;
    const simulation_mode = args.includes("--simulation");

    const strategy = new VolumeStrategy(wallet, { simulation_mode });
    strategy.start();

    Deno.addSignalListener("SIGINT", () => {
      strategy.stop();
      Deno.exit();
    });
  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
