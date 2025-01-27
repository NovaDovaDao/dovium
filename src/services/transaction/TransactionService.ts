// src/services/transaction/TransactionService.ts

import { Logger } from "jsr:@deno-library/logger";
import { SolanaWallet } from "../solana/wallet.ts";
import { BuyTokenTransaction } from "./BuyTokenTransaction.ts";
import { SellTokenTransaction } from "./SellTokenTransaction.ts";
import { config } from "../../config.ts";
import { RugCheckApi } from "../rugcheck/api.ts";
import { TrackerService } from "../db/DBTrackerService.ts";
import { NewTokenRecord, RugResponseExtended } from "../../core/types/Tracker.ts";

interface RugCheckCondition {
  check: boolean;
  message: string;
}

interface ExecuteTransactionOptions {
  skipRugCheck?: boolean;
  amount?: string;
}

export class TransactionService {
  private readonly logger = new Logger();
  private readonly rugCheckApi: RugCheckApi;
  private readonly db: TrackerService;
  private readonly buyTransaction: BuyTokenTransaction;
  private readonly sellTransaction: SellTokenTransaction;

  constructor(wallet: SolanaWallet) {
    this.rugCheckApi = new RugCheckApi();
    this.db = new TrackerService();
    this.buyTransaction = new BuyTokenTransaction(wallet);
    this.sellTransaction = new SellTokenTransaction(wallet);
  }

  async getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
    try {
      const rugResponse = await this.rugCheckApi.tokens(tokenMint);

      if (!rugResponse.data) return false;

      const tokenReport = rugResponse.data;
      const tokenCreator = tokenReport.creator || tokenMint;
      let topHolders = this.processTopHolders(tokenReport);

      const conditions = this.evaluateRugCheckConditions(tokenReport, topHolders);
      
      if (await this.shouldBlockToken(tokenReport, tokenCreator)) {
        return false;
      }

      await this.saveNewTokenRecord(tokenMint, tokenReport, tokenCreator);

      return !conditions.some(condition => condition.check);
    } catch (error) {
      this.logger.error("Rug check failed:", error);
      return false;
    }
  }

  async executeBuyTransaction(
    inputMint: string, 
    tokenMint: string,
    options: ExecuteTransactionOptions = {}
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      if (!options.skipRugCheck) {
        const isValid = await this.getRugCheckConfirmed(tokenMint);
        if (!isValid) {
          return { success: false, error: "Rug check failed" };
        }
      }

      const txId = await this.buyTransaction.createSwapTransaction(
        inputMint, 
        tokenMint,
        options.amount
      );

      if (!txId) {
        return { success: false, error: "Transaction failed" };
      }

      // Add delay to ensure transaction is confirmed
      await new Promise(resolve => setTimeout(resolve, 2000));

      const saved = await this.buyTransaction.fetchAndSaveSwapDetails(txId);
      if (!saved) {
        return { success: false, error: "Failed to save transaction details" };
      }

      return { success: true, txId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async executeSellTransaction(
    solMint: string,
    tokenMint: string,
    amount: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const result = await this.sellTransaction.createSellTransaction(
        solMint,
        tokenMint,
        amount
      );

      if (!result.success) {
        return { success: false, error: result.msg || "Sell transaction failed" };
      }

      return { success: true, txId: result.tx || undefined };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  private processTopHolders(tokenReport: RugResponseExtended): any[] {
    if (!config.rug_check.exclude_lp_from_topholders || !tokenReport.markets) {
      return tokenReport.topHolders;
    }

    const liquidityAddresses = tokenReport.markets
      .flatMap(market => [market.liquidityA, market.liquidityB])
      .filter((address): address is string => !!address);

    return tokenReport.topHolders.filter(
      holder => !liquidityAddresses.includes(holder.address)
    );
  }

  private evaluateRugCheckConditions(
    tokenReport: RugResponseExtended,
    topHolders: any[]
  ): RugCheckCondition[] {
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
        check: !rugCheckConfig.allow_insider_topholders && 
          topHolders.some(holder => holder.insider),
        message: "🚫 Insider accounts detected in top holders"
      },
      {
        check: topHolders.some(holder => 
          holder.pct > rugCheckConfig.max_alowed_pct_topholders),
        message: "🚫 Holder concentration too high"
      },
      {
        check: tokenReport.totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: "🚫 Insufficient LP providers"
      },
      {
        check: (tokenReport.markets?.length || 0) < rugCheckConfig.min_total_markets,
        message: "🚫 Insufficient markets"
      },
      {
        check: tokenReport.totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: "🚫 Insufficient market liquidity"
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
        check: tokenReport.score > rugCheckConfig.max_score && 
          rugCheckConfig.max_score !== 0,
        message: "🚫 Rug score too high"
      },
      {
        check: tokenReport.risks.some(risk => 
          rugCheckLegacy.includes(risk.name)),
        message: "🚫 Legacy risks detected"
      }
    ];
  }

  private async shouldBlockToken(
    tokenReport: RugResponseExtended,
    tokenCreator: string
  ): Promise<boolean> {
    if (!config.rug_check.block_returning_token_names && 
        !config.rug_check.block_returning_token_creators) {
      return false;
    }

    const duplicate = await this.db.findTokensByNameOrCreator(
      tokenReport.tokenMeta.name,
      tokenCreator
    );

    if (duplicate.length === 0) {
      return false;
    }

    if (config.rug_check.block_returning_token_names && 
        duplicate.some(token => token.name === tokenReport.tokenMeta.name)) {
      this.logger.log("🚫 Token with this name was already created");
      return true;
    }

    if (config.rug_check.block_returning_token_creators && 
        duplicate.some(token => token.creator === tokenCreator)) {
      this.logger.log("🚫 Token from this creator was already created");
      return true;
    }

    return false;
  }

  private async saveNewTokenRecord(
    tokenMint: string,
    tokenReport: RugResponseExtended,
    tokenCreator: string
  ): Promise<void> {
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: tokenMint,
      name: tokenReport.tokenMeta.name,
      creator: tokenCreator
    };

    try {
      await this.db.insertNewToken(newToken);
    } catch (error) {
      if (config.rug_check.block_returning_token_names || 
          config.rug_check.block_returning_token_creators) {
        this.logger.log(
          "⛔ Unable to store new token for tracking duplicate tokens:", error
        );
      }
    }
  }
}