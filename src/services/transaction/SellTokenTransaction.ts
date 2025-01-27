// src/services/transaction/SellTokenTransaction.ts

import { PublicKey } from "@solana/web3.js";
import { BaseTransaction } from "./BaseTransaction.ts";
import { config } from "../../config.ts";
import { createSellTransactionResponse } from "../../core/types/Tracker.ts";

export class SellTokenTransaction extends BaseTransaction {
  async createSellTransaction(
    solMint: string,
    tokenMint: string,
    amount: string
  ): Promise<createSellTransactionResponse> {
    try {
      await this.validateTokenBalance(tokenMint, amount);
      
      const quoteResponse = await this.getQuote(
        tokenMint,
        solMint,
        amount,
        config.sell.slippageBps
      );

      if (!quoteResponse) {
        throw new Error("Failed to get sell quote");
      }

      const priorityConfig = {
        computeBudget: {
          maxLamports: config.sell.prio_fee_max_lamports,
          priorityLevel: config.sell.prio_level,
        }
      };

      const serializedQuote = await this.serializeTransaction(
        quoteResponse,
        priorityConfig
      );

      if (!serializedQuote) {
        throw new Error("Failed to serialize sell transaction");
      }

      const txid = await this.executeTransaction(serializedQuote);
      if (!txid) {
        throw new Error("Failed to execute sell transaction");
      }

      await this.db.removeHolding(tokenMint);

      return {
        success: true,
        msg: null,
        tx: txid
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : "Unknown error",
        tx: null
      };
    }
  }

  private async validateTokenBalance(
    tokenMint: string,
    amount: string
  ): Promise<void> {
    const tokenAccounts = await this.wallet.connection.getParsedTokenAccountsByOwner(
      new PublicKey(this.wallet.getPublicKey()!),
      { mint: new PublicKey(tokenMint) }
    );

    const totalBalance = tokenAccounts.value.reduce((sum, account) => {
      const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
      return sum + BigInt(tokenAmount);
    }, BigInt(0));

    if (totalBalance <= 0n) {
      await this.db.removeHolding(tokenMint);
      throw new Error("Token has 0 balance - Already sold elsewhere. Removing from tracking.");
    }

    if (totalBalance !== BigInt(amount)) {
      throw new Error(
        "Wallet and tracker balance mismatch. Sell manually and token will be removed during next price check."
      );
    }
  }
}