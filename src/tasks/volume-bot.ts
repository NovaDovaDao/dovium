// src/tasks/volume-bot.ts
import "jsr:@std/dotenv/load";
import { Connection } from "@solana/web3.js";
import { SolanaWallet } from "../services/solana/wallet.ts";
import { VolumeStrategy } from "../services/strategy/volume.ts";
import { DoviumLogger } from "../core/logger.ts";

function main() {
  const logger = new DoviumLogger("VolumeBot");
  try {
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const privKey = Deno.env.get("SOLANA_PRIVATE_KEY");
    if (!privKey || !rpcUrl) {
      throw new Error(
        "SOLANA_PRIVATE_KEY and/or SOLANA_RPC_URL not found in environment variables"
      );
    }

    const connection = new Connection(rpcUrl!);
    const wallet = new SolanaWallet(connection, privKey);

    console.clear();
    logger.verbose("🚀 Starting Volume Bot...");
    logger.verbose(`💳 Wallet: ${wallet.getPublicKey()}`);

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
    logger.error(error);
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
