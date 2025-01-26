//src/transactions/BuyTokenTransaction.ts
import { BaseTransaction } from "./BaseTransaction.ts";
import { config } from "../../config.ts";
import { MintsDataReponse } from "../../core/types/Tracker.ts";
import axios from "axios";

export class BuyTokenTransaction extends BaseTransaction {
    async createSwapTransaction(solMint: string, tokenMint: string): Promise<string | null> {
        try {
            let retryCount = 0;
            while (retryCount < config.swap.token_not_tradable_400_error_retries) {
                try {
                    const quoteResponse = await this.getQuote(
                        solMint,
                        tokenMint,
                        config.swap.amount,
                        config.swap.slippageBps
                    );

                    const priorityConfig = {
                        priorityLevelWithMaxLamports: {
                            maxLamports: config.swap.prio_fee_max_lamports,
                            priorityLevel: config.swap.prio_level,
                        }
                    };

                    const serializedQuote = await this.serializeTransaction(quoteResponse, priorityConfig);
                    return await this.executeTransaction(serializedQuote);
                } catch (error: any) {
                    if (error.response?.status === 400 && error.response?.data?.errorCode === "TOKEN_NOT_TRADABLE") {
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, config.swap.token_not_tradable_400_error_delay));
                        continue;
                    }
                    throw error;
                }
            }
            return null;
        } catch (error) {
            console.error("Buy transaction failed:", error);
            return null;
        }
    }

    async fetchTransactionDetails(signature: string): Promise<MintsDataReponse | null> {
        const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
        let retryCount = 0;
        
        await new Promise(resolve => setTimeout(resolve, config.tx.fetch_tx_initial_delay));

        while (retryCount < config.tx.fetch_tx_max_retries) {
            try {
                const response = await axios.post(txUrl, {
                    transactions: [signature],
                    commitment: "finalized",
                    encoding: "jsonParsed"
                }, {
                    headers: { "Content-Type": "application/json" },
                    timeout: config.tx.get_timeout
                });

                if (!response.data?.[0]) throw new Error("No transaction data");

                const instruction = response.data[0].instructions.find(
                    (ix: any) => ix.programId === config.liquidity_pool.radiyum_program_id
                );

                if (!instruction?.accounts) throw new Error("No valid instruction found");

                const [accountOne, accountTwo] = [instruction.accounts[8], instruction.accounts[9]];
                const solTokenAccount = accountOne === config.liquidity_pool.wsol_pc_mint ? accountOne : accountTwo;
                const newTokenAccount = accountOne === config.liquidity_pool.wsol_pc_mint ? accountTwo : accountOne;

                return { tokenMint: newTokenAccount, solMint: solTokenAccount };
            } catch (error: any) {
                console.log(`Attempt ${retryCount + 1} failed: ${error.message}`);
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