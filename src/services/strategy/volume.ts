// src/services/strategy/volume.ts

import { Logger } from "jsr:@deno-library/logger";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import { TransactionService } from "../transaction/TransactionService.ts";
import { config } from "../../config.ts";

interface VolumeOptions {
  simulation_mode?: boolean;
}

interface TradeMetrics {
  totalVolume: BigDenary;
  trades: number;
  successfulTrades: number;
  failedTrades: number;
}

export class VolumeStrategy {
  private readonly logger = new Logger();
  private readonly transactionService: TransactionService;
  private readonly tradeIntervals: Map<string, number> = new Map();
  private readonly metrics: Map<string, TradeMetrics> = new Map();
  private readonly simulation_mode: boolean;

  constructor(
    private readonly wallet: SolanaWallet, 
    options: VolumeOptions = {}
  ) {
    this.simulation_mode = options.simulation_mode ?? false;
    this.transactionService = new TransactionService(wallet);
  }

  async start(): Promise<void> {
    if (!config.volume_strategy.enabled) {
      this.logger.info("Volume trading is disabled");
      return;
    }

    try {
      await this.validateWalletBalance();
      
      this.logger.info("\n🚀 Starting volume trading bot...");
      this.logger.info(`💳 Wallet: ${this.wallet.getPublicKey()}`);
      this.logger.info(`📊 Mode: ${this.simulation_mode ? "🔬 Simulation" : "🚀 Live Trading"}`);
      
      await this.initializeTradingPairs();
    } catch (error) {
      this.logger.error("Failed to start volume trading:", error);
    }
  }

  private async validateWalletBalance(): Promise<void> {
    const balance = await this.wallet.getSolBalance();
    if (!balance || balance.lt(config.volume_strategy.pairs[0].min_trade_size)) {
      throw new Error("Insufficient wallet balance for trading");
    }
  }

  private async initializeTradingPairs(): Promise<void> {
    for (const pair of config.volume_strategy.pairs) {
      const pairId = `${pair.base}-${pair.quote}`;
      
      this.metrics.set(pairId, {
        totalVolume: new BigDenary(0),
        trades: 0,
        successfulTrades: 0,
        failedTrades: 0
      });

      // Start initial trading cycle
      await this.startTradingCycle(pair);

      // Set up interval for continuous trading
      const interval = setInterval(
        () => this.startTradingCycle(pair),
        pair.trade_interval
      );
      this.tradeIntervals.set(pairId, interval);

      this.logger.info(`\n📈 Initialized trading pair: ${pairId}`);
      this.logger.info(`⏱️ Trade interval: ${pair.trade_interval}ms`);
      this.logger.info(`💰 Trade size range: ${pair.min_trade_size} - ${pair.max_trade_size} SOL`);
    }
  }

  private async startTradingCycle(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): Promise<void> {
    const pairId = `${pair.base}-${pair.quote}`;
    
    try {
      // Generate random trade size within configured range
      const tradeSize = this.getRandomTradeSize(pair);
      
      // Execute buy trade
      this.logger.info(`\n🔄 Starting trading cycle for ${pairId}`);
      this.logger.info(`📊 Trade size: ${tradeSize} SOL`);
      
      await this.executeTrade(pair.base, pair.quote, tradeSize, pairId);
      
      // Random delay between trades
      const delay = this.getRandomDelay(1000, 5000);
      this.logger.info(`⏳ Waiting ${delay}ms before sell trade...`);
      await this.sleep(delay);
      
      // Execute sell trade
      await this.executeTrade(pair.quote, pair.base, tradeSize, pairId);

      this.updateMetrics(pairId, true, tradeSize);
    } catch (error) {
      this.logger.error(`Trading cycle failed for ${pairId}:`, error);
      this.updateMetrics(pairId, false, "0");
    }
  }

  private async executeTrade(
    inputMint: string,
    outputMint: string,
    amount: string,
    pairId: string
  ): Promise<void> {
    if (this.simulation_mode) {
      this.logger.info(`🔬 Simulating trade: ${inputMint} -> ${outputMint} (${amount})`);
      return;
    }

    const result = await this.transactionService.executeBuyTransaction(
      inputMint, 
      outputMint,
      { 
        skipRugCheck: true,
        amount: amount
      }
    );

    if (!result.success) {
      throw new Error(`Trade failed: ${result.error}`);
    }

    this.logger.info(
      `✅ Trade executed successfully: https://solscan.io/tx/${result.txId}`
    );
  }

  private getRandomTradeSize(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): string {
    return new BigDenary(pair.max_trade_size)
      .minus(pair.min_trade_size)
      .multipliedBy(Math.random().toFixed(6))
      .plus(pair.min_trade_size)
      .toString();
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateMetrics(pairId: string, success: boolean, volume: string): void {
    const metrics = this.metrics.get(pairId);
    if (!metrics) return;

    metrics.trades++;
    if (success) {
      metrics.successfulTrades++;
      metrics.totalVolume = metrics.totalVolume.plus(volume);
    } else {
      metrics.failedTrades++;
    }

    this.logMetrics(pairId, metrics);
  }

  private logMetrics(pairId: string, metrics: TradeMetrics): void {
    this.logger.info(`\n📊 Trading Metrics for ${pairId}:`);
    this.logger.info(`Total Trades: ${metrics.trades}`);
    this.logger.info(`Successful: ${metrics.successfulTrades}`);
    this.logger.info(`Failed: ${metrics.failedTrades}`);
    this.logger.info(`Total Volume: ${metrics.totalVolume.toString()} SOL`);
    this.logger.info(
      `Success Rate: ${(metrics.successfulTrades / metrics.trades * 100).toFixed(2)}%`
    );
  }

  stop(): void {
    this.tradeIntervals.forEach((interval) => clearInterval(interval));
    this.tradeIntervals.clear();
    
    for (const [pairId, metrics] of this.metrics.entries()) {
      this.logger.info(`\n🔚 Final Metrics for ${pairId}:`);
      this.logMetrics(pairId, metrics);
    }
    
    this.logger.info("\n✅ Volume trading bot stopped");
  }
}