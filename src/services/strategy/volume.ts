import { Logger } from "jsr:@deno-library/logger";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { TokenTransaction } from "../utils/transactions.ts";
import { SolanaWallet } from "../solana/wallet.ts";
import { config } from "../../config.ts";

interface VolumeOptions {
  simulation_mode?: boolean;
}

export class VolumeStrategy {
  private logger = new Logger();
  private readonly tokenTransaction: TokenTransaction;
  private tradeIntervals: Map<string, number> = new Map();
  private simulation_mode: boolean;

  constructor(private wallet: SolanaWallet, options: VolumeOptions = {}) {
    this.simulation_mode = options.simulation_mode ?? false;
    this.tokenTransaction = new TokenTransaction(wallet);
  }

  start() {
    if (!config.volume_strategy.enabled) {
      this.logger.info("Volume trading is disabled");
      return;
    }

    this.logger.info("Starting volume trading bot...");
    this.logger.info(`Wallet: ${this.wallet.getPublicKey()}`);
    this.logger.info(
      `Mode: ${this.simulation_mode ? "🔬 Simulation" : "🚀 Live Trading"}`
    );
    this.initializeTradingPairs();
  }

  private initializeTradingPairs() {
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
  ) {
    try {
      const balance = await this.wallet.getSolBalance();
      if (!balance || balance.lt(pair.min_trade_size)) {
        this.logger.error("Insufficient balance for trading");
        return;
      }

      const tradeSize = this.getRandomTradeSize(pair);

      await this.executeTrade(pair.base, pair.quote, tradeSize);
      await this.sleep(this.getRandomDelay(1000, 5000));
      await this.executeTrade(pair.quote, pair.base, tradeSize);
    } catch (error) {
      this.logger.error("Trading cycle failed:", error);
    }
  }

  private async executeTrade(
    inputMint: string,
    outputMint: string,
    amount: string
  ) {
    try {
      const txid = await this.tokenTransaction.createSwapTransaction(
        inputMint,
        outputMint,
        amount
      );
      if (!txid) {
        throw new Error("Failed to execute swap");
      }
      this.logger.info(
        `🎉 Trade executed successfully: https://solscan.io/tx/${txid}`
      );
    } catch (error) {
      this.logger.error("👻👻👻 Trade execution failed:", error);
      throw error;
    }
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

  stop() {
    this.tradeIntervals.forEach((interval) => clearInterval(interval));
    this.tradeIntervals.clear();
    this.logger.info("Volume trading bot stopped");
  }
}
