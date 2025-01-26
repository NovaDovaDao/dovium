// src/services/transaction/TransactionService.ts
import { HeliusApi } from "../helius/api.ts";
import axios from "axios";
import { config } from "../../config.ts";
import { HoldingRecord, NewTokenRecord, RugResponseExtended, SwapEventDetailsResponse, TransactionDetailsResponseArray } from "../../core/types/Tracker.ts";
import { insertHolding, insertNewToken, selectTokenByMint, selectTokenByNameAndCreator } from "../../services/db/DBTrackerService.ts";

export class TransactionService {
    private readonly heliusApi: HeliusApi;
    private readonly priceUrl: string;

    constructor() {
        this.heliusApi = new HeliusApi();
        this.priceUrl = Deno.env.get("JUP_HTTPS_PRICE_URI") || "";
    }
    async getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
        const rugResponse = await axios.get<RugResponseExtended>(
            `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`,
            { timeout: config.tx.get_timeout }
        );

        if (!rugResponse.data) return false;

        const tokenReport = rugResponse.data;
        const tokenCreator = tokenReport.creator || tokenMint;
        let topHolders = tokenReport.topHolders;

        if (config.rug_check.exclude_lp_from_topholders && tokenReport.markets) {
            const liquidityAddresses = tokenReport.markets
                .flatMap(market => [market.liquidityA, market.liquidityB])
                .filter((address): address is string => !!address);
            
            topHolders = topHolders.filter(holder => !liquidityAddresses.includes(holder.address));
        }

        const conditions = this.getRugCheckConditions(tokenReport, topHolders);
        
        if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
            const duplicate = await selectTokenByNameAndCreator(tokenReport.tokenMeta.name, tokenCreator);
            
            if (duplicate.length !== 0) {
                if (config.rug_check.block_returning_token_names && 
                    duplicate.some(token => token.name === tokenReport.tokenMeta.name)) {
                    console.log("🚫 Token with this name was already created");
                    return false;
                }
                if (config.rug_check.block_returning_token_creators && 
                    duplicate.some(token => token.creator === tokenCreator)) {
                    console.log("🚫 Token from this creator was already created");
                    return false;
                }
            }
        }

        const newToken: NewTokenRecord = {
            time: Date.now(),
            mint: tokenMint,
            name: tokenReport.tokenMeta.name,
            creator: tokenCreator
        };
        
        await insertNewToken(newToken).catch(err => {
            if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
                console.log("⛔ Unable to store new token for tracking duplicate tokens: " + err);
            }
        });

        return !conditions.some(condition => condition.check);
    }

    async fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
        try {
            const response = await this.heliusApi.transactions([tx]);

            if (!response.data?.[0]?.events?.swap?.innerSwaps[0]) {
                console.log("⛔ Could not fetch swap details: Invalid response format");
                return false;
            }

            const swapDetails = this.extractSwapDetails(response.data[0]);
            const priceData = await this.fetchSolPrice(this.priceUrl);
            
            if (!priceData) return false;

            const holdingRecord = await this.createHoldingRecord(swapDetails, priceData);
            
            await insertHolding(holdingRecord).catch(err => {
                console.log("⛔ Database Error: " + err);
                return false;
            });

            return true;
        } catch (error: any) {
            console.error("Error during request:", error.message);
            return false;
        }
    }

    private getRugCheckConditions(tokenReport: RugResponseExtended, topHolders: any[]) {
        const rugCheckConfig = config.rug_check;
        const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;

        return [
            {
                check: !rugCheckConfig.allow_mint_authority && tokenReport.token.mintAuthority !== null,
                message: "🚫 Mint authority should be null"
            },
            {
                check: !rugCheckConfig.allow_not_initialized && !tokenReport.token.isInitialized,
                message: "🚫 Token is not initialized"
            },
            {
                check: !rugCheckConfig.allow_freeze_authority && tokenReport.token.freezeAuthority !== null,
                message: "🚫 Freeze authority should be null"
            },
            {
                check: !rugCheckConfig.allow_mutable && tokenReport.tokenMeta.mutable !== false,
                message: "🚫 Mutable should be false"
            },
            {
                check: !rugCheckConfig.allow_insider_topholders && topHolders.some(holder => holder.insider),
                message: "🚫 Insider accounts should not be part of the top holders"
            },
            {
                check: topHolders.some(holder => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
                message: "🚫 An individual top holder cannot hold more than the allowed percentage"
            },
            {
                check: tokenReport.totalLPProviders < rugCheckConfig.min_total_lp_providers,
                message: "🚫 Not enough LP Providers"
            },
            {
                check: (tokenReport.markets?.length || 0) < rugCheckConfig.min_total_markets,
                message: "🚫 Not enough Markets"
            },
            {
                check: tokenReport.totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
                message: "🚫 Not enough Market Liquidity"
            },
            {
                check: !rugCheckConfig.allow_rugged && tokenReport.rugged,
                message: "🚫 Token is rugged"
            },
            {
                check: rugCheckConfig.block_symbols.includes(tokenReport.tokenMeta.symbol),
                message: "🚫 Symbol is blocked"
            },
            {
                check: rugCheckConfig.block_names.includes(tokenReport.tokenMeta.name),
                message: "🚫 Name is blocked"
            },
            {
                check: tokenReport.score > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
                message: "🚫 Rug score too high"
            },
            {
                check: tokenReport.risks.some(risk => rugCheckLegacy.includes(risk.name)),
                message: "🚫 Token has legacy risks that are not allowed"
            }
        ];
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

    private async fetchSolPrice(priceUrl: string): Promise<number | null> {
        const solMint = config.liquidity_pool.wsol_pc_mint;
        const response = await axios.get(priceUrl, {
            params: { ids: solMint },
            timeout: config.tx.get_timeout
        });

        return response.data.data[solMint]?.price || null;
    }

    private async createHoldingRecord(swapDetails: SwapEventDetailsResponse, solPrice: number): Promise<HoldingRecord> {
        const solPaidUsdc = swapDetails.tokenInputs[0].tokenAmount * solPrice;
        const solFeePaidUsdc = (swapDetails.fee / 1_000_000_000) * solPrice;
        const perTokenUsdcPrice = solPaidUsdc / swapDetails.tokenOutputs[0].tokenAmount;

        let tokenName = "N/A";
        const tokenData = await selectTokenByMint(swapDetails.tokenOutputs[0].mint);
        if (tokenData && tokenData[0]) {
            tokenName = tokenData[0].name;
        }

        return {
            Time: swapDetails.timestamp,
            Token: swapDetails.tokenOutputs[0].mint,
            TokenName: tokenName,
            Balance: swapDetails.tokenOutputs[0].tokenAmount,
            SolPaid: swapDetails.tokenInputs[0].tokenAmount,
            SolFeePaid: swapDetails.fee,
            SolPaidUSDC: solPaidUsdc,
            SolFeePaidUSDC: solFeePaidUsdc,
            PerTokenPaidUSDC: perTokenUsdcPrice,
            Slot: swapDetails.slot,
            Program: swapDetails.programInfo ? swapDetails.programInfo.source : "N/A"
        };
    }
}