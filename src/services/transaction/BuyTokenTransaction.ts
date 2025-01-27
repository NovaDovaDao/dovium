// src/services/transaction/BuyTokenTransaction.ts

import { BaseTransaction } from "./BaseTransaction.ts";
import { config } from "../../config.ts";
import { MintsDataReponse } from "../../core/types/Tracker.ts";

export class BuyTokenTransaction extends BaseTransaction {
  async createSwapTransaction(
    solMint: string,
    tokenMint: string,
    amount: string = config.swap.amount
  ): Promise<string | null> {
    try {
      let retryCount = 0;
      while (retryCount < config.swap.token_not_tradable_400_error_retries) {
        try {
          const quoteResponse = await this.getQuote(
            solMint,
            tokenMint,
            amount
          );

          if (!quoteResponse) {
            throw new Error("Failed to get quote");
          }

          const priorityConfig = {
            computeBudget: {
              units: 400000,
              microLamports: 50000
            }
          };

          const serializedQuote = await this.serializeTransaction(
            quoteResponse,
            priorityConfig
          );

          if (!serializedQuote) {
            throw new Error("Failed to serialize transaction");
          }

          const txId = await this.executeTransaction(serializedQuote);
          if (!txId) {
            throw new Error("Failed to execute transaction");
          }

          // Allow some time for the transaction to be confirmed
          await new Promise(resolve => setTimeout(resolve, 2000));

          return txId;
        } catch (error: any) {
          if (error.response?.status === 400 && 
              error.response?.data?.errorCode === "TOKEN_NOT_TRADABLE") {
            retryCount++;
            await new Promise(resolve => 
              setTimeout(resolve, config.swap.token_not_tradable_400_error_delay)
            );
            continue;
          }
          throw error;
        }
      }
      return null;
    } catch (error) {
      this.logger.error("Buy transaction failed:", error);
      return null;
    }
  }

  async fetchTransactionDetails(signature: string): Promise<MintsDataReponse | null> {
    let retryCount = 0;
    await new Promise(resolve => 
      setTimeout(resolve, config.tx.fetch_tx_initial_delay)
    );

    while (retryCount < config.tx.fetch_tx_max_retries) {
      try {
        const response = await this.heliusApi.transactions([signature]);
        if (!response.data?.[0]) {
          throw new Error("No transaction data");
        }

        const instruction = response.data[0].instructions.find(
          (ix: any) => ix.programId === config.liquidity_pool.radiyum_program_id
        );

        if (!instruction?.accounts) {
          throw new Error("No valid instruction found");
        }

        const [accountOne, accountTwo] = [instruction.accounts[8], instruction.accounts[9]];
        const solTokenAccount = accountOne === config.liquidity_pool.wsol_pc_mint ? 
          accountOne : accountTwo;
        const newTokenAccount = accountOne === config.liquidity_pool.wsol_pc_mint ? 
          accountTwo : accountOne;

        return { tokenMint: newTokenAccount, solMint: solTokenAccount };
      } catch (error: any) {
        this.logger.log(`Attempt ${retryCount + 1} failed: ${error.message}`);
        retryCount++;
        
        if (retryCount < config.tx.fetch_tx_max_retries) {
          const delay = Math.min(4000 * Math.pow(1.5, retryCount), 15000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    return null;
  }
}