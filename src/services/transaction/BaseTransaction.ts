import { Buffer } from "node:buffer";
import { VersionedTransaction } from "@solana/web3.js";
import { JupiterApi } from "../dex/jupiter/api.ts";
import { HeliusApi } from "../helius/api.ts";
import { RugCheckApi } from "../rugcheck/api.ts";
import { TrackerService } from "../db/DBTrackerService.ts";
import { config } from "../../config.ts";
import {
  HoldingRecord,
  SwapEventDetailsResponse,
} from "../../core/types/Tracker.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import {
  QuoteResponse,
  SerializedQuoteResponse,
} from "../dex/jupiter/types.ts";
import { TransactionDetails } from "../helius/types.ts";
import { DoviumLogger } from "../../core/logger.ts";

export class BaseTransaction {
  protected readonly logger = new DoviumLogger(BaseTransaction.name);
  protected readonly jupiterApi = new JupiterApi();
  protected readonly heliusApi = new HeliusApi();
  protected readonly rugCheckApi = new RugCheckApi();
  protected readonly db = new TrackerService();

  constructor(protected readonly wallet: SolanaWallet) {}

  protected async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: string = config.swap.slippageBps
  ): Promise<QuoteResponse | null> {
    try {
      this.logger.log(
        `Getting quote for ${amount} from ${inputMint} to ${outputMint}`
      );

      const response = await this.jupiterApi.getQuote({
        inputMint,
        outputMint,
        amount,
        slippageBps,
      });

      if (!response.data) {
        throw new Error("No quote response received");
      }

      this.logger.log("Quote received successfully");
      return response.data;
    } catch (error) {
      this.logger.error("Error getting quote");
      if (config.swap.verbose_log) {
        this.logger.error("Detailed error:", error);
      }
      return null;
    }
  }

  protected async serializeTransaction(
    quoteResponse: QuoteResponse,
    priorityConfig: any = null
  ): Promise<SerializedQuoteResponse | null> {
    try {
      const publicKey = this.wallet.getPublicKey();
      if (!publicKey) {
        throw new Error("Wallet not initialized");
      }

      // Default priority config if none provided
      const defaultPriorityConfig = {
        computeBudget: {
          units: 400000,
          microLamports: 50000,
        },
      };
      const config = priorityConfig || defaultPriorityConfig;

      const response = await this.jupiterApi.swapTransaction({
        quoteResponse,
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true,
        ...config,
      });

      if (!response.data) {
        throw new Error("No serialized transaction received");
      }

      this.logger.log("Transaction serialized successfully");
      return response.data;
    } catch (error) {
      this.logger.error("Error serializing transaction:", error);
      if (config.swap.verbose_log) {
        this.logger.error("Detailed error:", error);
      }
      return null;
    }
  }

  protected async executeTransaction(
    serializedTx: SerializedQuoteResponse,
    retryAttempts = 3
  ): Promise<string | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const txBuffer = Buffer.from(serializedTx.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBuffer);

        transaction.sign([this.wallet.getSigner()]);

        const rawTransaction = transaction.serialize();
        const signature = await this.wallet.sendTransaction(rawTransaction);

        if (!signature) {
          throw new Error("Transaction failed to send");
        }

        const latestBlockHash =
          await this.wallet.connection.getLatestBlockhash();
        const confirmation = await this.wallet.connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: signature,
        });

        if (confirmation.value.err) {
          throw new Error(
            `Transaction failed to confirm: ${confirmation.value.err}`
          );
        }

        this.logger.log(`Transaction executed successfully: ${signature}`);
        return signature;
      } catch (error) {
        lastError = error as unknown as Error;
        this.logger.error(`Transaction attempt ${attempt + 1} failed:`, error);

        if (attempt < retryAttempts - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError) {
      this.logger.error("All transaction attempts failed", lastError);
    }
    return null;
  }

  public async fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
    try {
      const response = await this.heliusApi.transactions([tx]);
      if (!response.data || response.data.length === 0) {
        throw new Error("No response received from API");
      }

      const swapTransactionData = this.extractSwapDetails(response.data[0]);
      await this.saveSwapDetails(swapTransactionData);
      return true;
    } catch (error) {
      this.logger.error("Error processing swap details:", error);
      return false;
    }
  }

  private extractSwapDetails(
    transaction: TransactionDetails
  ): SwapEventDetailsResponse {
    return {
      programInfo: transaction.events.swap.innerSwaps[0].programInfo,
      tokenInputs: transaction.events.swap.innerSwaps[0].tokenInputs,
      tokenOutputs: transaction.events.swap.innerSwaps[0].tokenOutputs,
      fee: transaction.fee,
      slot: transaction.slot,
      timestamp: transaction.timestamp,
      description: transaction.description,
    };
  }

  private async saveSwapDetails(
    swapDetails: SwapEventDetailsResponse
  ): Promise<void> {
    // Get token info from database
    const tokenData = await this.db.findTokenByMint(
      swapDetails.tokenOutputs[0].mint
    );
    const tokenName = tokenData[0]?.name || "Unknown";

    // Create holding record
    const holdingRecord: HoldingRecord = {
      Time: swapDetails.timestamp,
      Token: swapDetails.tokenOutputs[0].mint,
      TokenName: tokenName,
      Balance: swapDetails.tokenOutputs[0].tokenAmount,
      SolPaid: swapDetails.tokenInputs[0].tokenAmount,
      SolFeePaid: swapDetails.fee,
      SolPaidUSDC: 0, // These will be calculated later if needed
      SolFeePaidUSDC: 0,
      PerTokenPaidUSDC: 0,
      Slot: swapDetails.slot,
      Program: swapDetails.programInfo?.source || "Unknown",
    };

    await this.db.insertHolding(holdingRecord);
  }
}
