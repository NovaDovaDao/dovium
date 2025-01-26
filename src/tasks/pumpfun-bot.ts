import { Connection } from "@solana/web3.js";
import { PumpFunStrategy } from "../services/strategy/pumpfun.ts";
import { SolanaWallet } from "../services/solana/wallet.ts";

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
    console.log("🚀 Starting PumpFun Bot...");
    console.log(`💳 Wallet: ${wallet.getPublicKey()}`);

    const strategy = new PumpFunStrategy(wallet);
    strategy.start();
  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
