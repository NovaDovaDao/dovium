import { Buffer } from "node:buffer";
import { config } from "../../config.ts";
import { JupiterApi } from "../dex/jupiter/api.ts";
import { QuoteResponse } from "../dex/jupiter/types.ts";
import { HeliusApi } from "../helius/api.ts";
import {
  SerializedQuoteResponse,
  SwapEventDetailsResponse,
} from "../../core/types/Tracker.ts";
import { VersionedTransaction } from "@solana/web3.js";
import { SolanaWallet } from "../solana/wallet.ts";
import { RugCheckApi } from "../rugcheck/api.ts";
import { TrackerService } from "../db/DBTrackerService.ts";
import { Logger } from "jsr:@deno-library/logger";

export class BaseTransaction {
  private readonly logger = new Logger();
  private readonly jupiterApi = new JupiterApi();
  private readonly heliusApi = new HeliusApi();
  private readonly rugCheckApi = new RugCheckApi();
  private readonly db = new TrackerService();

  constructor(private readonly wallet: SolanaWallet) {}

  protected checkWallet() {
    if (!this.wallet) {
      throw new Error("Wallet not initialized. Call setWallet() first.");
    }
    return this.wallet;
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string | null = null,
    slippageBps: number = config.swap.slippageBps
  ): Promise<QuoteResponse | null> {
    try {
      const response = await this.jupiterApi.getQuote({
        inputMint,
        outputMint,
        amount: amount ?? config.swap.amount,
        slippageBps,
      });

      if (!response.data) {
        throw new Error("No quote response received");
      }

      this.logger.log("✅ Quote retrieved successfully");
      return response.data;
    } catch (error) {
      this.logger.error("Error while requesting quote:", error);
      return null;
    }
  }

  async serializeTransaction(
    quoteResponse: QuoteResponse,
    priorityConfig: any = null
  ): Promise<SerializedQuoteResponse | null> {
    try {
      const publicKey = this.wallet.getPublicKey();
      if (!publicKey) {
        throw new Error("Wallet not initialized");
      }

      const response = await this.jupiterApi.swapTransaction({
        quoteResponse,
        userPublicKey: publicKey.toString(),
        dynamicSlippage: {
          maxBps: config.tx.max_slippage_bps || 300,
        },
        prioritizationFeeLamports: priorityConfig
      });

      if (!response.data) {
        throw new Error("No serialized transaction received");
      }

      this.logger.log("✅ Transaction serialized successfully");
      return response.data;
    } catch (error) {
      this.logger.error("Error serializing transaction:", error);
      return null;
    }
  }

  async executeTransaction(serializedTx: SerializedQuoteResponse): Promise<string | null> {
    try {
      const transactionBuffer = Buffer.from(serializedTx.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      
      transaction.sign([this.wallet.getSigner()]);
      
      const rawTransaction = transaction.serialize();
      const txid = await this.wallet.sendTransaction(rawTransaction);

      if (!txid) {
        throw new Error("Transaction failed to send");
      }

      const latestBlockHash = await this.wallet.connection.getLatestBlockhash();
      const confirmation = await this.wallet.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
      });

      if (confirmation.value.err) {
        throw new Error("Transaction failed to confirm");
      }

      this.logger.log(`✅ Transaction executed successfully: ${txid}`);
      return txid;
    } catch (error) {
      this.logger.error("Error executing transaction:", error);
      return null;
    }
  }
    async fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
    try {
      const response = await this.heliusApi.transactions([tx]);

      // Verify if we received tx reponse data
      if (!response.data || response.data.length === 0) {
        this.logger.log(
          "⛔ Could not fetch swap details: No response received from API."
        );
        return false;
      }

      // Safely access the event information
      const transactions = response.data;
      const swapTransactionData: SwapEventDetailsResponse = {
        programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
        tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
        tokenOutputs: transactions[0]?.events.swap.innerSwaps[0].tokenOutputs,
        fee: transactions[0]?.fee,
        slot: transactions[0]?.slot,
        timestamp: transactions[0]?.timestamp,
        description: transactions[0]?.description,
      };

      // Get latest Sol Price
      const solMint = config.liquidity_pool.wsol_pc_mint;
      const priceResponse = await this.jupiterApi.getPrice(solMint);

      // Verify if we received the price response data
      if (!priceResponse.data.data[solMint]?.price) return false;

      // Calculate estimated price paid in sol
      const solUsdcPrice = priceResponse.data.data[solMint]?.price;
      const solPaidUsdc = new BigDenary(
        swapTransactionData.tokenInputs[0].tokenAmount
      ).multipliedBy(solUsdcPrice);
      const solFeePaidUsdc = new BigDenary(swapTransactionData.fee)
        .dividedBy(LAMPORTS_PER_SOL)
        .multipliedBy(solUsdcPrice);
      const perTokenUsdcPrice = solPaidUsdc.dividedBy(
        swapTransactionData.tokenOutputs[0].tokenAmount
      );

      // Get token meta data
      let tokenName = "N/A";
      const tokenData: NewTokenRecord[] = await this.db.findTokenByMint(
        swapTransactionData.tokenOutputs[0].mint
      );
      if (tokenData) {
        tokenName = tokenData[0].name;
      }

      // Add holding to db
      const newHolding: HoldingRecord = {
        Time: swapTransactionData.timestamp,
        Token: swapTransactionData.tokenOutputs[0].mint,
        TokenName: tokenName,
        Balance: swapTransactionData.tokenOutputs[0].tokenAmount,
        SolPaid: swapTransactionData.tokenInputs[0].tokenAmount,
        SolFeePaid: swapTransactionData.fee,
        SolPaidUSDC: solPaidUsdc.valueOf(),
        SolFeePaidUSDC: solFeePaidUsdc.valueOf(),
        PerTokenPaidUSDC: perTokenUsdcPrice.valueOf(),
        Slot: swapTransactionData.slot,
        Program: swapTransactionData.programInfo
          ? swapTransactionData.programInfo.source
          : "N/A",
      };

      await this.db.insertHolding(newHolding).catch((err) => {
        this.logger.log("⛔ Database Error: " + err);
        return false;
      });

      return true;
    } catch (error) {
      this.logger.error("Error during request:", error);
      return false;
    }
  }
}