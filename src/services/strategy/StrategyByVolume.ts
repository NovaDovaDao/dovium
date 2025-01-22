import SolanaService from "../solana/SolanaService.ts";
import { Logger } from "jsr:@deno-library/logger";
import Big from "big.js";

// Trading Configuration Constants
const VOLUME_THRESHOLD = BigInt(1 * 1e9); // 1 SOL minimum volume
const MONITORING_PERIOD = 10 * 60 * 1000; // 10 minutes
const BALANCE_CHECK_INTERVAL = 30000; // 30 seconds
const PROFIT_TAKE_THRESHOLD = 0.15; // 15% profit target
const STOP_LOSS_THRESHOLD = -0.05; // 5% stop loss
const SLIPPAGE_BASIS_POINTS = BigInt(500); // 5% slippage

// Market Analysis Constants
const RSI_PERIOD = 14;
const VOLUME_MA_PERIOD = 20;
const PRICE_MA_PERIOD = 20;

interface PricePoint {
  price: bigint;
  volume: bigint;
  timestamp: number;
  isBuy: boolean;
}

interface TokenTradeMetrics {
  mint: number;
  name: string;
  symbol: string;
  launchTimestamp: number;
  volumeSOL: Big;
}

interface MarketState {
  lastPrice: bigint;
  highPrice: bigint;
  lowPrice: bigint;
  volumeMA: bigint;
  priceMA: bigint;
  buyVolume: bigint;
  sellVolume: bigint;
}

interface TradeEvent {
  tokenAmount: number;
  solAmount: number;
}

interface TradePosition {
  entryTimestamp: number;
  amount: number;
}

export default class StrategyByVolume {
  private logger = new Logger();
  private activeTokens: Map<string, TokenTradeMetrics> = new Map();
  private positions: Map<string, TradePosition> = new Map();
  private marketStates: Map<string, MarketState> = new Map();
  private priceHistory: Map<string, PricePoint[]> = new Map();
  private lastTradeTime: Map<string, number> = new Map();

  private simulatedBalance = 1 * Math.pow(10, 9); // 1 Sol?
  private simulationMode = true;
  private balanceCheckInterval = 30 * 1000; // 30 seconds

  private isRunning = true;
  private allowNewTrades = true;

  constructor(private tradingWallet: SolanaService) {
    void this.setupEventListeners();
    void this.startBalanceReporting();

    this.logger.log(
      `[VolumeTracker] Started with wallet: ${tradingWallet.getPublicKey()}`
    );
  }

  private async startBalanceReporting() {
    await this.reportBalance();

    this.balanceCheckInterval = setInterval(async () => {
      try {
        await this.reportBalance();
      } catch (error) {
        this.logger.error("Error checking balance:", error);
      }
    }, BALANCE_CHECK_INTERVAL);
  }

  private async reportBalance() {
    const balance = this.simulationMode
      ? this.simulatedBalance
      : await this.tradingWallet.getSolBalance();

    this.logger.log(`The balance is: ${balance}`);
  }

  //   public getFinalBalance(): number {
  //     return this.simulatedBalance;
  //   }

  private async setupEventListeners() {
    // this.logger.log("[VolumeTracker] Setting up event listeners...");
    // this.sdk.addEventListener("createEvent", async (event) => {
    //   if (!this.isRunning) return;
    //   this.logger.log(`[New Token Launch] ${event.name} (${event.symbol})`);
    //   const metrics: TokenTradeMetrics = {
    //     mint: event.mint,
    //     name: event.name,
    //     symbol: event.symbol,
    //     launchTimestamp: Date.now(),
    //     volumeSOL: BigInt(0),
    //   };
    //   this.activeTokens.set(event.mint.toBase58(), metrics);
    //   this.initializeMarketState(event.mint.toBase58());
    //   setTimeout(() => {
    //     void this.cleanupToken(event.mint.toBase58());
    //   }, MONITORING_PERIOD);
    // });
    // this.sdk.addEventListener("tradeEvent", async (event) => {
    //   if (!this.isRunning) return;
    //   const mintAddress = event.mint.toBase58();
    //   const metrics = this.activeTokens.get(mintAddress);
    //   if (metrics) {
    //     this.logger.log(
    //       `[Trade] ${metrics.symbol}: ${this.formatSOL(
    //         event.solAmount
    //       )} SOL - ${event.isBuy ? "BUY" : "SELL"}`
    //     );
    //     await this.processTradeEvent(event, metrics, mintAddress);
    //   }
    // });
  }

  private initializeMarketState(mintAddress: string): void {
    this.marketStates.set(mintAddress, {
      lastPrice: BigInt(0),
      highPrice: BigInt(0),
      lowPrice: BigInt(0),
      volumeMA: BigInt(0),
      priceMA: BigInt(0),
      buyVolume: BigInt(0),
      sellVolume: BigInt(0),
    });
    this.priceHistory.set(mintAddress, []);
  }

  private async processTradeEvent(
    event: TradeEvent,
    metrics: TokenTradeMetrics,
    mintAddress: string
  ) {
    try {
      if (!this.isValidTrade(event)) return;

      this.updateMetrics(event, metrics, mintAddress);
      const indicators = this.calculateIndicators(mintAddress);

      if (indicators) {
        await this.evaluateTradeOpportunity(metrics, indicators, mintAddress);
      }
    } catch (error) {
      this.logger.error("[Error] Processing trade:", error);
    }
  }

  private isValidTrade(event: TradeEvent): boolean {
    return (
      event.solAmount > 0 &&
      event.tokenAmount > 0 &&
      event.solAmount < BigInt(1e15) // Sanity check for maximum trade size
    );
  }

  private updateMetrics(
    event: TradeEvent,
    metrics: TokenTradeMetrics,
    mintAddress: string
  ) {
    metrics.volumeSOL += event.solAmount;

    const currentPrice = (event.solAmount * BigInt(1e9)) / event.tokenAmount;

    const state = this.marketStates.get(mintAddress)!;

    state.lastPrice = currentPrice;
    state.highPrice =
      currentPrice > state.highPrice ? currentPrice : state.highPrice;
    state.lowPrice =
      state.lowPrice === BigInt(0) || currentPrice < state.lowPrice
        ? currentPrice
        : state.lowPrice;

    if (event.isBuy) {
      state.buyVolume += event.solAmount;
    } else {
      state.sellVolume += event.solAmount;
    }

    const history = this.priceHistory.get(mintAddress)!;
    history.push({
      price: currentPrice,
      volume: event.solAmount,
      timestamp: Date.now(),
      isBuy: event.isBuy,
    });

    if (history.length > 100) {
      history.shift();
    }

    const recentVolumes = history.slice(-VOLUME_MA_PERIOD);
    const recentPrices = history.slice(-PRICE_MA_PERIOD);

    state.volumeMA = this.calculateBigIntAverage(
      recentVolumes.map((p) => p.volume)
    );
    state.priceMA = this.calculateBigIntAverage(
      recentPrices.map((p) => p.price)
    );

    this.marketStates.set(mintAddress, state);
    this.activeTokens.set(mintAddress, metrics);
  }

  private calculateBigIntAverage(values: bigint[]): bigint {
    if (values.length === 0) return BigInt(0);
    const sum = values.reduce((a, b) => a + b, BigInt(0));
    return sum / BigInt(values.length);
  }

  private calculateIndicators(mintAddress: string): any {
    const history = this.priceHistory.get(mintAddress)!;
    const state = this.marketStates.get(mintAddress)!;

    if (history.length < RSI_PERIOD) return null;

    const priceChanges = history.slice(-RSI_PERIOD).map((point, i, arr) => {
      if (i === 0) return 0;
      const prevPrice = Number(arr[i - 1].price) / 1e9;
      const currentPrice = Number(point.price) / 1e9;
      return (currentPrice - prevPrice) / prevPrice;
    });

    const gains = priceChanges.filter((c) => c > 0);
    const losses = priceChanges.filter((c) => c < 0).map(Math.abs);

    const avgGain = gains.length
      ? gains.reduce((a, b) => a + b) / gains.length
      : 0;
    const avgLoss = losses.length
      ? losses.reduce((a, b) => a + b) / losses.length
      : 0;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return {
      rsi,
      volumeProfile: this.calculateVolumeProfile(history),
      volumeTrend: this.calculateVolumeTrend(history),
      priceVelocity: this.calculatePriceVelocity(history),
      marketDepth:
        Number(state.buyVolume) /
        (Number(state.buyVolume) + Number(state.sellVolume)),
      priceMA: state.priceMA,
      volumeMA: state.volumeMA,
    };
  }

  private async evaluateTradeOpportunity(
    metrics: TokenTradeMetrics,
    indicators: any,
    mintAddress: string
  ) {
    const position = this.positions.get(mintAddress);
    const state = this.marketStates.get(mintAddress)!;

    if (!position) {
      if (
        this.allowNewTrades &&
        this.shouldEnterTrade(metrics, indicators, state)
      ) {
        await this.simulateEntry(metrics, indicators, state);
      }
    } else {
      if (this.shouldExitTrade(position, indicators, state)) {
        await this.simulateExit(mintAddress, indicators, state);
      }
    }
  }

  public pauseTrading(): void {
    this.allowNewTrades = false;
    this.logger.log("[VolumeTracker] Trading paused");
  }

  public resumeTrading(): void {
    this.allowNewTrades = true;
    this.logger.log("[VolumeTracker] Trading resumed");
  }

  private shouldEnterTrade(
    metrics: TokenTradeMetrics,
    indicators: any,
    state: MarketState
  ): boolean {
    if (metrics.volumeSOL < VOLUME_THRESHOLD) return false;
    if (state.lastPrice === BigInt(0)) return false;

    const conditions = {
      volume: indicators.volumeTrend > 0.2,
      rsi:
        indicators.rsi < 30 ||
        (indicators.rsi < 45 && indicators.volumeProfile > 0.7),
      marketDepth: indicators.marketDepth > 0.6,
      priceVelocity: indicators.priceVelocity > 0,
      volatility: Math.abs(indicators.priceVelocity) < 0.1,
    };

    const trueConditions = Object.values(conditions).filter(Boolean).length;
    const lastTradeTime = this.lastTradeTime.get(metrics.mint.toBase58()) || 0;
    const timeSinceLastTrade = Date.now() - lastTradeTime;

    return trueConditions >= 4 && timeSinceLastTrade > 60000;
  }

  private shouldExitTrade(
    position: TradePosition,
    indicators: any,
    state: MarketState
  ): boolean {
    const profitLoss =
      Number(state.lastPrice - position.entryPrice) /
      Number(position.entryPrice);
    const holdTime = (Date.now() - position.entryTimestamp) / 1000;

    return (
      profitLoss >= PROFIT_TAKE_THRESHOLD ||
      profitLoss <= STOP_LOSS_THRESHOLD ||
      (indicators.rsi > 70 && profitLoss > 0.05) ||
      (indicators.volumeTrend < -0.2 && profitLoss > 0.03) ||
      (holdTime > 300 && indicators.marketDepth < 0.4)
    );
  }

  private simulateEntry(
    metrics: TokenTradeMetrics,
    indicators: any,
    state: MarketState
  ) {
    try {
      const entryAmount = BigInt(0.1 * 1e9); // 0.1 SOL
      const maxSolCost =
        entryAmount + (entryAmount * SLIPPAGE_BASIS_POINTS) / BigInt(10000);
      const tokenAmount =
        state.lastPrice > 0
          ? (entryAmount * BigInt(1e9)) / state.lastPrice
          : BigInt(0);

      // Check simulated balance
      if (this.simulatedBalance < Number(entryAmount) / 1e9) {
        this.logger.log(
          `[Simulation] Insufficient balance for ${metrics.symbol}`
        );
        return;
      }

      // Simulate trade
      this.simulatedBalance -= Number(entryAmount) / 1e9;
      this.lastTradeTime.set(metrics.mint.toBase58(), Date.now());

      const entryMessage = `🤖 SIMULATION ENTRY 🎲
🚀 ${metrics.name} (${metrics.symbol})
💰 Token: ${metrics.mint.toBase58()}
💵 Amount: ${Number(entryAmount) / 1e9} SOL
🎯 Max Cost: ${Number(maxSolCost) / 1e9} SOL (5% slippage)
📊 RSI: ${indicators.rsi.toFixed(2)}
📈 Volume Profile: ${(indicators.volumeProfile * 100).toFixed(2)}%
💫 Volume Trend: ${(indicators.volumeTrend * 100).toFixed(2)}%
⚡ Price Velocity: ${(indicators.priceVelocity * 100).toFixed(2)}%
💼 Balance: ${this.simulatedBalance.toFixed(4)} SOL`;

      this.logger.log(entryMessage);

      this.positions.set(metrics.mint.toBase58(), {
        mint: metrics.mint,
        entryTimestamp: Date.now(),
        entryPrice: state.lastPrice,
        amount: tokenAmount,
      });
    } catch (error) {
      this.logger.error("[Simulation] Entry error:", error);
    }
  }

  private simulateExit(
    mintAddress: string,
    indicators: any,
    state: MarketState
  ) {
    const position = this.positions.get(mintAddress);
    const metrics = this.activeTokens.get(mintAddress);

    if (!position || !metrics) return;

    try {
      // Simulate sell
      const exitAmount = position.amount;
      const exitPrice = state.lastPrice;
      const solReceived = (exitAmount * exitPrice) / BigInt(1e9);

      const profitLoss = Number(solReceived) / 1e9 - 0.1; // Compare to initial 0.1 SOL entry
      const holdTime = (Date.now() - position.entryTimestamp) / 1000;

      this.simulatedBalance += Number(solReceived) / 1e9;

      const exitMessage = `🤖 SIMULATION EXIT 🎲
🚀 ${metrics.name} (${metrics.symbol})
💰 Token: ${mintAddress}
💵 P/L: ${profitLoss.toFixed(4)} SOL (${(profitLoss * 100).toFixed(2)}%)
💸 Amount: ${Number(solReceived) / 1e9} SOL
⏱ Hold Time: ${holdTime.toFixed(0)}s
📊 RSI: ${indicators.rsi.toFixed(2)}
📈 Volume Profile: ${(indicators.volumeProfile * 100).toFixed(2)}%
💫 Volume Trend: ${(indicators.volumeTrend * 100).toFixed(2)}%
⚡ Price Velocity: ${(indicators.priceVelocity * 100).toFixed(2)}%
💼 Balance: ${this.simulatedBalance.toFixed(4)} SOL`;

      this.logger.log(exitMessage);

      this.positions.delete(mintAddress);
    } catch (error) {
      this.logger.error("[Simulation] Exit error:", error);
    }
  }

  private calculateVolumeProfile(history: PricePoint[]): number {
    const buyVolume = history
      .filter((p) => p.isBuy)
      .reduce((sum, p) => sum + Number(p.volume), 0);
    const totalVolume = history.reduce((sum, p) => sum + Number(p.volume), 0);
    return totalVolume === 0 ? 0 : buyVolume / totalVolume;
  }

  private calculateVolumeTrend(history: PricePoint[]): number {
    const recentVolume = history
      .slice(-5)
      .reduce((sum, p) => sum + Number(p.volume) / 1e9, 0);
    const previousVolume = history
      .slice(-10, -5)
      .reduce((sum, p) => sum + Number(p.volume) / 1e9, 0);
    return previousVolume === 0 ? 0 : recentVolume / previousVolume - 1;
  }

  private calculatePriceVelocity(history: PricePoint[]): number {
    if (history.length < 2) return 0;
    const prices = history.map((p) => Number(p.price) / 1e9);
    const changes = prices
      .slice(1)
      .map((price, i) => (price - prices[i]) / prices[i]);
    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  private formatSOL(lamports: bigint): string {
    return (Number(lamports) / 1e9).toFixed(4);
  }

  public async closeAllPositions() {
    this.logger.log("[VolumeTracker] Closing all positions...");
    this.allowNewTrades = false;

    try {
      const positionPromises = [];
      for (const [mintAddress, metrics] of this.activeTokens.entries()) {
        const position = this.positions.get(mintAddress);
        if (position) {
          const state = this.marketStates.get(mintAddress);
          const indicators = this.calculateIndicators(mintAddress);

          if (state && indicators) {
            this.logger.log(`[Cleanup] Closing position for ${metrics.symbol}`);
            positionPromises.push(
              this.simulateExit(mintAddress, indicators, state)
            );
          }
        }
      }

      await Promise.all(positionPromises);
      await this.logger.log("🔄 All positions closed. Not taking new trades.");
    } catch (error) {
      this.logger.error("[ClosePositions] Error:", error);
    }
  }

  private async cleanupToken(mintAddress: string) {
    const metrics = this.activeTokens.get(mintAddress);
    if (metrics) {
      this.logger.log(`[Cleanup] Ending monitoring for ${metrics.symbol}`);

      // Force exit any remaining position
      const position = this.positions.get(mintAddress);
      if (position) {
        const state = this.marketStates.get(mintAddress);
        const indicators = this.calculateIndicators(mintAddress);

        if (state && indicators) {
          await this.simulateExit(mintAddress, indicators, state);
        }
      }

      await this.logger.info(`📊 Monitoring ended for ${metrics.symbol}
Volume: ${this.formatSOL(metrics.volumeSOL)} SOL`);
    }

    this.activeTokens.delete(mintAddress);
    this.marketStates.delete(mintAddress);
    this.priceHistory.delete(mintAddress);
    this.lastTradeTime.delete(mintAddress);
  }

  public async stop() {
    this.logger.log("[VolumeTracker] Stopping...");
    this.isRunning = false;

    // Clear balance check interval
    if (this.balanceCheckInterval) {
      clearInterval(this.balanceCheckInterval);
    }

    // Close all positions
    try {
      await this.closeAllPositions();
    } catch (error) {
      this.logger.error("[Stop] Error closing positions:", error);
    }

    // Clear all data
    this.activeTokens.clear();
    this.positions.clear();
    this.marketStates.clear();
    this.priceHistory.clear();
    this.lastTradeTime.clear();

    this.logger.log("🛑 Volume Tracker stopped. All positions closed.");
  }
}
