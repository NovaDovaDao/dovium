// src/services/strategy/volume.ts

import { Logger } from "jsr:@deno-library/logger";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import { config } from "../../config.ts";
import { BuyTokenTransaction } from "../transaction/BuyTokenTransaction.ts";
import { SellTokenTransaction } from "../transaction/SellTokenTransaction.ts";
import { createSellTransactionResponse } from "../../core/types/Tracker.ts";

interface VolumeStrategyOptions {
  simulation_mode?: boolean;
}

export class VolumeStrategy {
  private logger = new Logger();
  private tradeIntervals: Map<string, number> = new Map();
  private readonly buyTransaction: BuyTokenTransaction;
  private readonly sellTransaction: SellTokenTransaction;
  private readonly simulation_mode: boolean;

  constructor(private readonly wallet: SolanaWallet, options: VolumeStrategyOptions = {}) {
    this.simulation_mode = options.simulation_mode ?? false;
    this.buyTransaction = new BuyTokenTransaction();
    this.sellTransaction = new SellTokenTransaction();
    
    // Initialize transactions with the wallet
    this.buyTransaction.setWallet(this.wallet);
    this.sellTransaction.setWallet(this.wallet);
  }

  start(): void {
    if (!config.volume_strategy.enabled) {
      this.logger.info("Volume trading is disabled");
      return;
    }

    this.logger.info(`Starting volume trading bot...`);
    this.logger.info(`Wallet: ${this.wallet.getPublicKey()}`);
    this.logger.info(`Mode: ${this.simulation_mode ? "🔬 Simulation" : "🚀 Live Trading"}`);
    this.initializeTradingPairs();
  }

  private initializeTradingPairs(): void {
    for (const pair of config.volume_strategy.pairs) {
      const pairId = `${pair.base}-${pair.quote}`;
      this.startTradingCycle(pair);

      const interval = setInterval(
        () => this.startTradingCycle(pair),
        pair.trade_interval
      );
      this.tradeIntervals.set(pairId, interval);
    }
  }

  private async startTradingCycle(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): Promise<void> {
    try {
      const balance = await this.wallet.getSolBalance();
      if (!balance || balance.lt(pair.min_trade_size)) {
        this.logger.error("Insufficient balance for trading");
        return;
      }

      const tradeSize = this.calculateTradeSize(pair);
      await this.executeTradeSequence(pair, tradeSize);
    } catch (error) {
      this.logger.error("Trading cycle failed:", error);
      await this.handleTradeError(error);
    }
  }

  private async executeTradeSequence(
    pair: (typeof config.volume_strategy.pairs)[0],
    tradeSize: string
  ): Promise<void> {
    try {
      // Buy token
      const buyTxId = await this.buyTransaction.createSwapTransaction(
        pair.base,
        pair.quote
      );

      if (!buyTxId) {
        throw new Error("Buy transaction failed");
      }

      this.logger.info(`🎯 Buy executed: https://solscan.io/tx/${buyTxId}`);
      await this.sleep(this.getRandomDelay(1000, 5000));

      // Sell token
      const sellResult = await this.sellTransaction.createSellTransaction(
        pair.base,
        pair.quote,
        tradeSize
      );

      this.handleSellResult(sellResult);
    } catch (error) {
      this.logger.error("Trade sequence failed:", error);
      throw error;
    }
  }

  private handleSellResult(result: createSellTransactionResponse): void {
    if (result.success && result.tx) {
      this.logger.info(`🎯 Sell executed: https://solscan.io/tx/${result.tx}`);
    } else {
      this.logger.error(`👻 Sell failed: ${result.msg}`);
    }
  }

  private calculateTradeSize(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): string {
    const range = new BigDenary(pair.max_trade_size).minus(pair.min_trade_size);
    const random = new BigDenary(Math.random().toFixed(6));
    return range.multipliedBy(random).plus(pair.min_trade_size).toString();
  }

  private async handleTradeError(error: unknown): Promise<void> {
    const maxRetries = config.volume_strategy.general.retry_attempts;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await this.sleep(config.volume_strategy.general.retry_delay);
        retryCount++;
        this.logger.info(`Retrying... Attempt ${retryCount}/${maxRetries}`);
        // Retry logic here if needed
        break;
      } catch (retryError) {
        if (retryCount === maxRetries) {
          this.logger.error("Max retries reached:", retryError);
        }
      }
    }
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    this.tradeIntervals.forEach((interval) => clearInterval(interval));
    this.tradeIntervals.clear();
    this.logger.info("Volume trading bot stopped");
  }
}