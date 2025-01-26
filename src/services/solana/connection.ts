import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { Logger } from "jsr:@deno-library/logger";

class SolanaConnection {
  private logger = new Logger();
  private connection: Connection;
  wallet: Keypair | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  /**
   * Gets the SOL balance of any public key
   * @returns The SOL balance as a Big number
   */
  async getBalanceFromPublicKey(publicKey: string): Promise<BigDenary> {
    try {
      const pubKey = new PublicKey(publicKey);
      const balanceLamports = await this.connection.getBalance(pubKey);
      const balanceSOL = new BigDenary(balanceLamports).div(LAMPORTS_PER_SOL);
      return balanceSOL;
    } catch (error) {
      this.logger.error("Error fetching balance", error);
      throw new Error("Error fetching SOL balance.");
    }
  }
}

export default SolanaConnection;
