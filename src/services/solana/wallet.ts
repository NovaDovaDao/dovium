import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getMint, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { config } from "../../config.ts";
import { DoviumLogger } from "../../core/logger.ts";

export class SolanaWallet {
  private logger = new DoviumLogger(SolanaWallet.name);
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
      return new BigDenary(balanceLamports).div(LAMPORTS_PER_SOL);
    } catch (error) {
      this.logger.error("Error fetching SOL balance", error);
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
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }
    return this.wallet;
  }

  async getTokenDecimals(mint: PublicKey): Promise<number> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      return mintInfo.decimals;
    } catch (error) {
      this.logger.error(
        `Error fetching token decimals for ${mint.toString()}:`,
        error
      );
      // Default to 9 decimals in case of error
      return 9;
    }
  }

  async getTokenBalance(
    mint: PublicKey | string
  ): Promise<{ amount: BigDenary; decimals: number }> {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }

    const mintPublicKey = typeof mint === "string" ? new PublicKey(mint) : mint;

    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
          mint: mintPublicKey,
        }
      );

      let totalBalance = new BigDenary(0);
      const decimals = await this.getTokenDecimals(mintPublicKey);

      for (const account of tokenAccounts.value) {
        const tokenAmount = account.account.data.parsed?.info?.tokenAmount;
        if (tokenAmount?.amount) {
          // Verify the account balance
          const accountInfo = await getAccount(
            this.connection, 
            new PublicKey(account.pubkey)
          );
          
          // Use the verified balance from the account info
          totalBalance = totalBalance.plus(accountInfo.amount.toString());
        }
      }

      return { 
        amount: totalBalance,
        decimals 
      };
    } catch (error) {
      this.logger.error(
        `Error fetching token balance for ${mintPublicKey.toString()}:`,
        error
      );
      return { 
        amount: new BigDenary(0),
        decimals: 0 
      };
    }
  }

  async validateTokenBalance(
    tokenMint: string,
    requiredAmount: string
  ): Promise<boolean> {
    try {
      const { amount: balance, decimals } = await this.getTokenBalance(tokenMint);
      const requiredBigDenary = new BigDenary(requiredAmount);

      // Convert to same decimal places for comparison
      const scaledBalance = balance.div(Math.pow(10, decimals));
      return scaledBalance.greaterThanOrEqualTo(requiredBigDenary);
    } catch (error) {
      this.logger.error("Error validating token balance:", error);
      return false;
    }
  }
}