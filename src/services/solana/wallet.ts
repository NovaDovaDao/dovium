import { Connection, Keypair, LAMPORTS_PER_SOL, Signer } from "@solana/web3.js";
import bs58 from "bs58";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { Logger } from "jsr:@deno-library/logger";
import { config } from "../../config.ts";
import { PublicKey } from "@solana/web3.js";

export class SolanaWallet {
  private logger = new Logger();
  private wallet: Keypair | null = null;

  constructor(readonly connection: Connection, privateKey: string) {
    this.logger.log("Initialized Solana Wallet Service");
    this.initializeWallet(privateKey);
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
  async getSolBalance(): Promise<BigDenary | null> {
    if (!this.wallet) {
      throw new Error("Wallet not initialized. Call initializeWallet() first.");
    }

    try {
      const balanceLamports = await this.connection.getBalance(
        this.wallet.publicKey
      );

      // Use Big.js for accurate decimal representation
      const balanceSOL = new BigDenary(balanceLamports).div(LAMPORTS_PER_SOL);
      return balanceSOL;
    } catch (error) {
      this.logger.error("Error fetching balance", error);
      throw new Error("Error fetching SOL balance.");
    }
  }

  sendTransaction(transaction: Uint8Array): Promise<string> {
    try {
      return this.connection.sendRawTransaction(transaction, {
        skipPreflight: false, // If True, This will skip transaction simulation entirely.
        preflightCommitment: "confirmed",
        maxRetries: config.tx.fetch_tx_max_retries,
      });
    } catch (error) {
      this.logger.error("Transaction send failed:", error);
      throw error;
    }
  }

  /**
   * Gets the public key of the initialized wallet.
   * @returns The public key as a string, or null if the wallet is not initialized.
   */
  getPublicKey(): string | null {
    return this.wallet ? this.wallet.publicKey.toBase58() : null;
  }

  getSigner(): Signer {
    return this.wallet!;
  }

  getTokenBalance(tokenMint: string) {
    return this.connection.getParsedTokenAccountsByOwner(
      this.wallet?.publicKey!,
      { mint: new PublicKey(tokenMint) }
    );
  }
}
