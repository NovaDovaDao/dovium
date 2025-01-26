//src/transactions/SellTokenTransaction.ts
import { BaseTransaction } from "./BaseTransaction.ts";
import { config } from "../../config.ts";
import { createSellTransactionResponse } from "../../core/types/Tracker.ts";
import { PublicKey } from "@solana/web3.js";
import { removeHolding } from "../../services/db/DBTrackerService.ts";

export class SellTokenTransaction extends BaseTransaction {
    async createSellTransaction(solMint: string, tokenMint: string, amount: string): Promise<createSellTransactionResponse> {
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                this.wallet!.publicKey,
                { mint: new PublicKey(tokenMint) }
            );

            const totalBalance = tokenAccounts.value.reduce((sum, account) => {
                const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
                return sum + BigInt(tokenAmount);
            }, BigInt(0));

            if (totalBalance <= 0n) {
                await removeHolding(tokenMint);
                throw new Error("Token has 0 balance - Already sold elsewhere. Removing from tracking.");
            }

            if (totalBalance !== BigInt(amount)) {
                throw new Error("Wallet and tracker balance mismatch. Sell manually and token will be removed during next price check.");
            }

            const quoteResponse = await this.getQuote(
                tokenMint,
                solMint,
                amount,
                config.sell.slippageBps
            );

            const priorityConfig = {
                priorityLevelWithMaxLamports: {
                    maxLamports: config.sell.prio_fee_max_lamports,
                    priorityLevel: config.sell.prio_level,
                }
            };

            const serializedQuote = await this.serializeTransaction(quoteResponse, priorityConfig);
            const txid = await this.executeTransaction(serializedQuote);
            
            await removeHolding(tokenMint);

            return {
                success: true,
                msg: null,
                tx: txid
            };
        } catch (error: any) {
            return {
                success: false,
                msg: error instanceof Error ? error.message : "Unknown error",
                tx: null
            };
        }
    }
}