// src/services/transaction/SellTokenTransaction.ts

import { PublicKey } from "@solana/web3.js";
import { BaseTransaction } from "./BaseTransaction.ts";
import { config } from "../../config.ts";
import { createSellTransactionResponse } from "../../core/types/Tracker.ts";
import { AmountCalculator } from "./AmountCalculator.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import { DoviumLogger } from "../../core/logger.ts";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";

export class SellTokenTransaction extends BaseTransaction {
  override logger = new DoviumLogger(SellTokenTransaction.name);
  private amountCalculator: AmountCalculator;
  private desiredSolAmount: string = "";

  constructor(wallet: SolanaWallet) {
    super(wallet);
    this.amountCalculator = new AmountCalculator(wallet);
  }
  // FIXME: calculate amounts better
  async createSellTransaction(
    solMint: string,
    tokenMint: string,
    originalBuyAmount: string // Pass the original buy amount
  ): Promise<createSellTransactionResponse> {
    try {
      const tokenDecimals = await this.wallet.getTokenDecimals(
        new PublicKey(tokenMint)
      );

      const tokenPriceData = await this.jupiterApi.getPrice(tokenMint);
      const latestTokenPrice = tokenPriceData.data.data[tokenMint].price;

      // Calculate sell amount using original buy amount
      const calculatedAmount = this.amountCalculator.calculateTokenAmount(
        originalBuyAmount,
        tokenDecimals,
        latestTokenPrice
      );
      this.logger.verbose("Calculated amount of tokens: ", calculatedAmount);

      // Validate the token balance before proceeding
      const hasBalance = await this.wallet.validateTokenBalance(
        tokenMint,
        calculatedAmount
      );
      if (!hasBalance) {
        throw new Error(
          `Insufficient token balance for ${tokenMint}. ` +
            `Required: ${calculatedAmount}`
        );
      }

      // Get initial quote to estimate amount
      const quoteResponse = await this.getQuote(
        tokenMint,
        solMint,
        calculatedAmount,
        config.sell.slippageBps
      );

      if (!quoteResponse) {
        throw new Error("Failed to get sell quote");
      }

      this.desiredSolAmount = quoteResponse.outAmount;

      const serializedQuote = await this.serializeTransaction(quoteResponse, {
        computeBudget: {
          maxLamports: config.sell.prio_fee_max_lamports,
          priorityLevel: config.sell.prio_level,
        },
      });

      if (!serializedQuote) {
        throw new Error("Failed to serialize sell transaction");
      }

      const txid = await this.executeTransaction(serializedQuote);
      if (!txid) {
        throw new Error("Failed to execute sell transaction");
      }

      await this.db.removeHolding(tokenMint);

      this.logger.log(
        `Successfully sold ${calculatedAmount} tokens for ${this.desiredSolAmount} SOL`
      );

      return {
        success: true,
        msg: null,
        tx: txid,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : "Unknown error",
        tx: null,
      };
    }
  }
}
