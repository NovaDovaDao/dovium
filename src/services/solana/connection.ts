// src/services/solana/connection.ts
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import Big from "big.js";
import { Logger } from "jsr:@deno-library/logger";
import { config } from "../../config.ts";

class SolanaConnection {
  private logger = new Logger();
  private connection: Connection;
  private wallet: Keypair | null = null;
  private publicKey: PublicKey | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  /**
   * Initializes the wallet from a private key.
   * @param privateKey Base58 encoded private key.
   * @throws Error if the private key is invalid.
   */
  initializeWallet(privateKey: string) {
    try {
      const privateKeyBytes = bs58.decode(privateKey);
      this.wallet = Keypair.fromSecretKey(privateKeyBytes);
      this.publicKey = this.wallet.publicKey;
    } catch (error) {
      this.logger.error("Error initializing wallet", error);
      throw new Error("Invalid private key. Please check the format.");
    }
  }

  /**
   * Gets the SOL balance of the initialized wallet.
   * @returns The SOL balance as a Big number, or null if the wallet is not initialized.
   * @throws Error if there is an issue fetching the balance.
   */
  async getSolBalance(): Promise<Big | null> {
    if (!this.publicKey) {
      throw new Error("Wallet not initialized. Call initializeWallet() first.");
    }

    try {
      const balanceLamports = await this.connection.getBalance(this.publicKey);

      // Use Big.js for accurate decimal representation
      const balanceSOL = new Big(balanceLamports).div(LAMPORTS_PER_SOL);
      return balanceSOL;
    } catch (error) {
      this.logger.error("Error fetching balance", error);
      throw new Error("Error fetching SOL balance.");
    }
  }

  async sendTransaction(transaction: string, wallet: Keypair): Promise<string> {
    try {
      const sig = await this.connection.sendRawTransaction(
        bs58.decode(transaction),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: config.tx.fetch_tx_max_retries
        }
      );

      await this.connection.confirmTransaction(sig);
      return sig;
    } catch (error) {
      this.logger.error("Transaction send failed:", error);
      throw error;
    }
  }

  /**
   * Gets the SOL balance of any public key
   * @returns The SOL balance as a Big number
   */
  async getBalanceFromPublicKey(publicKey: string): Promise<Big> {
    try {
      const pubKey = new PublicKey(publicKey);
      const balanceLamports = await this.connection.getBalance(pubKey);
      const balanceSOL = new Big(balanceLamports).div(LAMPORTS_PER_SOL);
      return balanceSOL;
    } catch (error) {
      this.logger.error("Error fetching balance", error);
      throw new Error("Error fetching SOL balance.");
    }
  }

  /**
   * Gets the public key of the initialized wallet.
   * @returns The public key as a string, or null if the wallet is not initialized.
   */
  getPublicKey(): string | null {
    return this.publicKey ? this.publicKey.toBase58() : null;
  }
}

export default SolanaConnection;
