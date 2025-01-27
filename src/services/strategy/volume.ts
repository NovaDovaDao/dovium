import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import { TransactionService } from "../transaction/TransactionService.ts";
import { config } from "../../config.ts";
import { DoviumLogger } from "../../core/logger.ts";

interface VolumeOptions {
  simulation_mode?: boolean;
}

interface TradeMetrics {
  totalVolume: BigDenary;
  trades: number;
  successfulTrades: number;
  failedTrades: number;
}
type Pair = (typeof config.volume_strategy.pairs)[0];

export class VolumeStrategy {
  private readonly logger = new DoviumLogger(VolumeStrategy.name);
  private readonly transactionService: TransactionService;
  private readonly tradeIntervals: Map<string, number> = new Map();
  private readonly metrics: Map<string, TradeMetrics> = new Map();
  private readonly simulation_mode: boolean;
  private isRunning: boolean = false;

  constructor(
    private readonly wallet: SolanaWallet,
    options: VolumeOptions = {}
  ) {
    this.simulation_mode = options.simulation_mode ?? false;
    this.transactionService = new TransactionService(wallet);
  }

  async start(): Promise<void> {
    if (!config.volume_strategy.enabled) {
      this.logger.log("Volume trading is disabled in config");
      return;
    }

    try {
      this.isRunning = true;
      await this.validateSetup();
      await this.initializeTradingPairs();
    } catch (error) {
      this.logger.error("Failed to start volume trading:", error);
      this.stop();
    }
  }

  private async validateSetup(): Promise<void> {
    const balance = await this.wallet.getSolBalance();
    if (!balance) {
      throw new Error("Could not fetch wallet balance");
    }

    const minRequired = config.volume_strategy.pairs[0].min_trade_size;
    if (balance.lt(minRequired)) {
      throw new Error(
        `Insufficient wallet balance: ${balance.toString()} SOL (minimum required: ${minRequired} SOL)`
      );
    }

    this.logger.log(`💰 Balance: ${balance.toString()} SOL`);
    this.logger.log(
      `📊 Mode: ${this.simulation_mode ? "🔬 Simulation" : "🚀 Live Trading"}`
    );
  }

  private async initializeTradingPairs(): Promise<void> {
    for (const pair of config.volume_strategy.pairs) {
      const pairId = `${pair.base}-${pair.quote}`;

      this.metrics.set(pairId, {
        totalVolume: new BigDenary(0),
        trades: 0,
        successfulTrades: 0,
        failedTrades: 0,
      });

      // Start initial trading cycle
      await this.startTradingCycle(pair);

      // Set up interval for subsequent cycles if still running
      if (this.isRunning) {
        const interval = setInterval(
          () => this.startTradingCycle(pair),
          pair.trade_interval
        );
        this.tradeIntervals.set(pairId, interval);

        this.logger.log(`\n📈 Initialized trading pair: ${pairId}`);
        this.logger.log(`⏱️ Trade interval: ${pair.trade_interval}ms`);
        this.logger.log(
          `💰 Trade size range: ${pair.min_trade_size} - ${pair.max_trade_size} SOL`
        );
      }
    }
  }

  private async startTradingCycle(pair: Pair): Promise<void> {
    if (!this.isRunning) return;

    const pairId = `${pair.base}-${pair.quote}`;

    try {
      const tradeSize = this.getRandomTradeSize(pair);

      this.logger.log(`\n🔄 Starting trading cycle for ${pairId}`);
      this.logger.log(`📊 Trade size: ${tradeSize} SOL`);

      const trade = this.executeTrade(pair, tradeSize);
      // // Execute buy trade
      // await trade("buy");

      // // Add random delay between trades
      // const delay = this.getRandomDelay(1000, 5000);
      // this.logger.log(`⏳ Waiting ${delay}ms before sell trade...`);
      // await this.sleep(delay);

      // Execute sell trade if still running
      if (this.isRunning) {
        await trade("sell");
      }

      this.updateMetrics(pairId, true, tradeSize);
    } catch (error) {
      this.logger.error(`Trading cycle failed for ${pairId}:`, error);
      this.updateMetrics(pairId, false, "0");

      // Add exponential backoff for errors
      const backoffDelay = Math.min(
        1000 * Math.pow(2, this.metrics.get(pairId)?.failedTrades || 0),
        30000
      );
      await this.sleep(backoffDelay);
    }
  }

  private executeTrade(pair: Pair, amountSol: string) {
    return async (action: "buy" | "sell") => {
      if (this.simulation_mode) {
        this.logger.log(
          `🔬 Simulating ${action}: ${
            action === "buy" ? pair.quote : pair.base
          } (${amountSol} SOL)`
        );
        return;
      }

      const result =
        action === "buy"
          ? await this.transactionService.executeBuyTransaction(
              pair.base,
              pair.quote,
              {
                skipRugCheck: true,
                amount: amountSol,
              }
            )
          : await this.transactionService.executeSellTransaction(
              pair.base,
              pair.quote,
              amountSol
            );

      if (!result.success) {
        throw new Error(`Trade failed: ${result.error || "Unknown error"}`);
      }

      this.logger.verbose(
        `✅ Trade executed successfully: https://solscan.io/tx/${result.txId}`
      );
    };
  }

  private getRandomTradeSize(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): string {
    const minTradeSize = new BigDenary(pair.min_trade_size);
    const maxTradeSize = new BigDenary(pair.max_trade_size);
    const result = maxTradeSize
      .minus(minTradeSize)
      .multipliedBy(Math.random())
      .plus(minTradeSize);

    return result.toFixed(9); // 9 decimals for SOL
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateMetrics(
    pairId: string,
    success: boolean,
    volume: string
  ): void {
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
    this.logger.log(`\n📊 Trading Metrics for ${pairId}:`);
    this.logger.log(`Total Trades: ${metrics.trades}`);
    this.logger.log(`Successful: ${metrics.successfulTrades}`);
    this.logger.log(`Failed: ${metrics.failedTrades}`);
    this.logger.log(`Total Volume: ${metrics.totalVolume.toString()} SOL`);
    this.logger.log(
      `Success Rate: ${(
        (metrics.successfulTrades / metrics.trades) *
        100
      ).toFixed(2)}%`
    );
  }

  stop(): void {
    this.isRunning = false;
    this.tradeIntervals.forEach((interval) => clearInterval(interval));
    this.tradeIntervals.clear();

    for (const [pairId, metrics] of this.metrics.entries()) {
      this.logger.verbose(`\n🔚 Final Metrics for ${pairId}:`);
      this.logMetrics(pairId, metrics);
    }

    this.logger.verbose("\n✅ Volume trading bot stopped");
  }
}
