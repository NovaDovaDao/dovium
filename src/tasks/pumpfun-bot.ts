import { Keypair } from "@solana/web3.js";
import { PumpFunStrategy } from "../services/strategy/pumpfun/index.ts";
import bs58 from "bs58";

function main() {
  try {
    const privKey = Deno.env.get("SOLANA_PRIVATE_KEY");
    if (!privKey) {
      throw new Error("SOLANA_PRIVATE_KEY not found in environment variables");
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(privKey));

    console.clear();
    console.log("🚀 Starting PumpFun Bot...");
    console.log(`💳 Wallet: ${keypair.publicKey.toString()}`);

    const strategy = new PumpFunStrategy(keypair);
    strategy.start();
  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
