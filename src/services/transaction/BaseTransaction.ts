// src/services/transaction/BaseTransaction.ts

import { Buffer } from "node:buffer";
import { VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { Logger } from "jsr:@deno-library/logger";

import { config } from "../../config.ts";
import { JupiterApi } from "../dex/jupiter/api.ts";
import { QuoteResponse } from "../dex/jupiter/types.ts";
import { HeliusApi } from "../helius/api.ts";
import { RugCheckApi } from "../rugcheck/api.ts";
import { TrackerService } from "../db/DBTrackerService.ts";
import { SolanaWallet } from "../solana/wallet.ts";

import {
  SerializedQuoteResponse,
  HoldingRecord,
  SwapEventDetailsResponse
} from "../../core/types/Tracker.ts";

interface TransactionExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export abstract class BaseTransaction {
  protected readonly logger = new Logger();
  protected readonly jupiterApi = new JupiterApi();
  protected readonly heliusApi = new HeliusApi();
  protected readonly rugCheckApi = new RugCheckApi();
  protected readonly db = new TrackerService();

  constructor(protected readonly wallet: SolanaWallet) {}

  protected async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string = config.swap.amount,
    slippageBps: string = config.swap.slippageBps
  ): Promise<QuoteResponse | null> {
    try {
      const response = await this.jupiterApi.getQuote({
        inputMint,
        outputMint,
        amount,
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

  protected async serializeTransaction(
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
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true
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

  protected async executeTransaction(
    serializedTx: SerializedQuoteResponse
  ): Promise<string | null> {
    try {
      const txBuffer = Buffer.from(serializedTx.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(txBuffer);
      
      transaction.sign([this.wallet.getSigner()]);
      
      const rawTransaction = transaction.serialize();
      const signature = await this.wallet.sendTransaction(rawTransaction);

      if (!signature) {
        throw new Error("Transaction failed to send");
      }

      const latestBlockHash = await this.wallet.connection.getLatestBlockhash();
      const confirmation = await this.wallet.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: signature
      });

      if (confirmation.value.err) {
        throw new Error("Transaction failed to confirm");
      }

      this.logger.log(`✅ Transaction executed successfully: ${signature}`);
      return signature;
    } catch (error) {
      this.logger.error("Error executing transaction:", error);
      return null;
    }
  }

  public async fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
    try {
      const response = await this.heliusApi.transactions([tx]);
      if (!response.data || response.data.length === 0) {
        throw new Error("No response received from API");
      }

      const swapTransactionData = this.extractSwapDetails(response.data[0]);
      const solPrice = await this.getSolPrice();
      const holdingRecord = await this.createHoldingRecord(swapTransactionData, solPrice);
      
      await this.db.insertHolding(holdingRecord);
      return true;
    } catch (error) {
      this.logger.error("Error during swap details processing:", error);
      return false;
    }
  }

  private async getSolPrice(): Promise<number> {
    const solMint = config.liquidity_pool.wsol_pc_mint;
    const response = await this.jupiterApi.getPrice(solMint);
    const priceStr = response.data.data[solMint]?.price;
    return priceStr ? Number(priceStr) : 0;
  }

  private extractSwapDetails(transaction: any): SwapEventDetailsResponse {
    return {
      programInfo: transaction.events.swap.innerSwaps[0].programInfo,
      tokenInputs: transaction.events.swap.innerSwaps[0].tokenInputs,
      tokenOutputs: transaction.events.swap.innerSwaps[0].tokenOutputs,
      fee: transaction.fee,
      slot: transaction.slot,
      timestamp: transaction.timestamp,
      description: transaction.description
    };
  }

  private async createHoldingRecord(
    swapDetails: SwapEventDetailsResponse,
    solPrice: number
  ): Promise<HoldingRecord> {
    const tokenName = await this.getTokenName(swapDetails.tokenOutputs[0].mint);
    
    const solPaidUsdc = new BigDenary(swapDetails.tokenInputs[0].tokenAmount)
      .multipliedBy(solPrice);
    const solFeePaidUsdc = new BigDenary(swapDetails.fee)
      .dividedBy(LAMPORTS_PER_SOL)
      .multipliedBy(solPrice);
    const perTokenUsdcPrice = solPaidUsdc.dividedBy(
      swapDetails.tokenOutputs[0].tokenAmount
    );

    return {
      Time: swapDetails.timestamp,
      Token: swapDetails.tokenOutputs[0].mint,
      TokenName: tokenName,
      Balance: swapDetails.tokenOutputs[0].tokenAmount,
      SolPaid: swapDetails.tokenInputs[0].tokenAmount,
      SolFeePaid: swapDetails.fee,
      SolPaidUSDC: solPaidUsdc.valueOf(),
      SolFeePaidUSDC: solFeePaidUsdc.valueOf(),
      PerTokenPaidUSDC: perTokenUsdcPrice.valueOf(),
      Slot: swapDetails.slot,
      Program: swapDetails.programInfo?.source || "N/A"
    };
  }

  private async getTokenName(tokenMint: string): Promise<string> {
    const tokenData = await this.db.findTokenByMint(tokenMint);
    return tokenData[0]?.name || "N/A";
  }
}