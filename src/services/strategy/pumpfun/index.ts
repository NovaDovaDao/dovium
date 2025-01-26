// src/services/strategies/PumpFunStrategy.ts

import axios from "axios";
import { Strategy, StrategyState } from "../types.ts";
import { MACD } from "../../indicators/MACD.ts";
import { MarketDepth } from "../../indicators/MarketDepth.ts";
import { MovingAverage } from "../../indicators/MovingAverage.ts";
import { RSI } from "../../indicators/RSI.ts";
import { PriceData } from "../../indicators/types.ts";
import { VolumeProfile } from "../../indicators/VolumeProfile.ts";
import { config } from "../../../config.ts";
import { PumpFunWebSocket } from "../../pumpfun/websocket.ts";
import { Logger } from "jsr:@deno-library/logger";
import { SolanaWallet } from "../../solana/wallet.ts";
import { Transactions } from "../../../core/transactions.ts";
import { JupiterApi } from "../../dex/jupiter/api.ts";
import { HeliusApi } from "../../helius/api.ts";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";

export class PumpFunStrategy implements Strategy {
  private logger = new Logger();
  private readonly heliusApi = new HeliusApi();
  private readonly jupiterApi = new JupiterApi();
  private transactionService: Transactions;
  private state: StrategyState;
  private monitoringInterval: number | null = null;
  private lastPriceCheck = 0;

  private indicators: {
    rsi: RSI;
    macd: MACD;
    ma: MovingAverage;
    marketDepth: MarketDepth;
    volume: VolumeProfile;
  };

  constructor(private readonly wallet: SolanaWallet) {
    this.state = {
      lastSignal: null,
      activePositions: new Map(),
      walletBalance: 0,
    };

    this.transactionService = new Transactions(wallet);

    const pumpFunWebSocket = new PumpFunWebSocket((event) => {
      if ("mint" in event) {
        this.processNewToken.bind(this)(event.mint, event.signature);
      }
      this.logger.log(event);
    });

    pumpFunWebSocket.socket.on("open", () => {
      pumpFunWebSocket.subscribeNewToken();
    });

    this.indicators = {
      rsi: new RSI({ period: config.pump_fun_strategy.rsi.period }),
      macd: new MACD({
        period: config.pump_fun_strategy.macd.fast_period,
        signalPeriod: config.pump_fun_strategy.macd.signal_period,
      }),
      ma: new MovingAverage({
        period: config.pump_fun_strategy.moving_average.short_period,
      }),
      marketDepth: new MarketDepth(),
      volume: new VolumeProfile(),
    };
  }

  async start(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log("⚠️ PumpFun strategy is disabled in config");
      return;
    }

    await this.checkWalletBalance();
    this.startPnLMonitoring();

    this.logger.log("\n✅ PumpFun strategy started successfully");
    this.logger.log("📊 Configuration:");
    this.logger.log(`- Simulation Mode: ${config.rug_check.simulation_mode}`);
    this.logger.log(
      `- Min SOL Balance: ${config.pump_fun_strategy.minimum_sol_balance}`
    );
    this.logger.log(`- Trade Amount: ${config.swap.amount} lamports`);
    this.logger.log(
      `- Price check interval: ${config.pump_fun_strategy.price_check_interval}ms`
    );
  }

  private startPnLMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        const now = Date.now();
        if (
          now - this.lastPriceCheck <
          config.pump_fun_strategy.price_check_interval
        ) {
          return;
        }

        this.lastPriceCheck = now;
        await this.updatePositions();
      } catch (error) {
        this.logger.error("Error updating positions:", error);
      }
    }, config.pump_fun_strategy.price_check_interval);
  }

  private async updatePositions(): Promise<void> {
    const balance = await this.wallet.getSolBalance();
    this.logger.log(`\n💰 Current SOL Balance: ${balance} SOL`);

    if (this.state.activePositions.size > 0) {
      this.logger.log("\n📈 Current Positions:");
      for (const [tokenMint, amount] of this.state.activePositions) {
        const currentPrice = await this.getCurrentPrice(tokenMint);
        if (currentPrice.greaterThan(0)) {
          this.logger.log(
            `${tokenMint}: ${amount} tokens @ ${currentPrice.toFixed(6)} SOL`
          );
        }
      }
    }
  }

  private async processNewToken(
    tokenMint: string,
    signature: string
  ): Promise<void> {
    this.logger.log("\n=============================================");
    this.logger.log("🔎 New PumpFun Token Found");
    this.logger.log(`Token: ${tokenMint}`);
    this.logger.log(`Signature: ${signature}`);

    try {
      const data = await Promise.race([
        this.heliusApi.transactions([signature]),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Transaction fetch timeout")),
            15000
          )
        ),
      ]);

      if (!data) {
        this.logger.log("⛔ Transaction fetch failed");
        return;
      }

      if (!(await this.checkWalletBalance())) {
        return;
      }

      const isRugCheckPassed =
        await this.transactionService.getRugCheckConfirmed(tokenMint);
      if (!isRugCheckPassed) {
        this.logger.log("🚫 Rug Check failed!");
        return;
      }

      // Wait for token registration and collect initial prices
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const initialPrices: PriceData[] = [];
      for (let i = 0; i < 3; i++) {
        const priceData = await this.fetchPriceData(tokenMint);
        if (priceData.length) {
          initialPrices.push(priceData[0]);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (initialPrices.length < 3) {
        this.logger.log("⚠️ Insufficient price data for analysis");
        return;
      }

      this.logger.log("📊 Analyzing token...");
      const shouldTrade = await this.analyze(initialPrices);

      if (!shouldTrade) {
        this.logger.log("📉 Analysis indicates no trade opportunity");
        return;
      }

      if (config.rug_check.simulation_mode) {
        this.logger.log("🔬 Simulation mode - logging trade signals only");
        return;
      }

      const tx = await this.transactionService.createSwapTransaction(
        config.liquidity_pool.wsol_pc_mint,
        tokenMint
      );
      if (!tx) {
        this.logger.log("⛔ Swap transaction creation failed");
        return;
      }

      this.logger.log("🚀 Executing swap:");
      this.logger.log(`https://solscan.io/tx/${tx}`);

      const saveConfirmation =
        await this.transactionService.fetchAndSaveSwapDetails(tx);
      if (!saveConfirmation) {
        this.logger.log("❌ Failed to save trade details");
        return;
      }

      // Track position
      const amount = Number(config.swap.amount) / 1e9;
      this.state.activePositions.set(tokenMint, amount);
      this.monitorPosition(tokenMint);
    } catch (error) {
      this.logger.error("❌ Error processing token:", error);
    }
  }

  private monitorPosition(tokenMint: string) {
    const checkPosition = async () => {
      try {
        const priceData = await this.fetchPriceData(tokenMint);
        if (!priceData.length) return;

        const shouldSell = await this.checkSellSignals(priceData);
        if (shouldSell) {
          await this.executeSell(tokenMint);
          return;
        }

        setTimeout(
          checkPosition,
          config.pump_fun_strategy.price_check_interval
        );
      } catch (error) {
        this.logger.error("Error monitoring position:", error);
      }
    };

    checkPosition();
  }

  private checkSellSignals(priceData: PriceData[]): boolean {
    const rsiResult = this.indicators.rsi.calculate(priceData);
    const macdResult = this.indicators.macd.calculate(priceData);
    const volumeResult = this.indicators.volume.calculate(priceData);

    const shouldSell =
      rsiResult.value > config.pump_fun_strategy.rsi.overbought ||
      macdResult.histogram < config.pump_fun_strategy.macd.sell_threshold ||
      volumeResult.sellPressure >
        config.pump_fun_strategy.volume_profile.sell_pressure_threshold;

    if (shouldSell) {
      this.logger.log("\n🔔 Sell signals detected:");
      this.logger.log(
        `RSI: ${rsiResult.value.toFixed(2)} (> ${
          config.pump_fun_strategy.rsi.overbought
        })`
      );
      this.logger.log(`MACD Histogram: ${macdResult.histogram.toFixed(6)}`);
      this.logger.log(
        `Sell Pressure: ${(volumeResult.sellPressure * 100).toFixed(2)}%`
      );
    }

    return shouldSell;
  }

  private async executeSell(tokenMint: string): Promise<void> {
    const position = this.state.activePositions.get(tokenMint);
    if (!position) return;

    try {
      const response = await this.transactionService.createSellTransaction(
        config.liquidity_pool.wsol_pc_mint,
        tokenMint,
        position.toString()
      );

      if (response.success) {
        const exitPrice = await this.getCurrentPrice(tokenMint);
        this.logger.log(`\n✅ Sold position for ${tokenMint}`);
        this.logger.log(`Exit price: ${exitPrice} SOL`);
        this.state.activePositions.delete(tokenMint);
      } else {
        this.logger.error(`❌ Sell failed for ${tokenMint}:`, response.msg);
      }
    } catch (error) {
      this.logger.error(`❌ Error selling ${tokenMint}:`, error);
    }
  }

  async analyze(priceData: PriceData[]): Promise<boolean> {
    if (
      !this.isEnabled() ||
      !(await this.checkWalletBalance()) ||
      !priceData.length
    ) {
      return false;
    }

    const rsiResult = this.indicators.rsi.calculate(priceData);
    const macdResult = this.indicators.macd.calculate(priceData);
    const volumeResult = this.indicators.volume.calculate(priceData);
    const depthResult = this.indicators.marketDepth.calculate(priceData);

    this.logger.log("\n📊 Technical Analysis:");
    this.logger.log(`RSI: ${rsiResult.value.toFixed(2)}`);
    this.logger.log(`MACD Histogram: ${macdResult.histogram.toFixed(6)}`);
    this.logger.log(`Volume Ratio: ${volumeResult.volumeRatio.toFixed(2)}`);
    this.logger.log(`Market Depth Ratio: ${depthResult.ratio.toFixed(2)}`);

    return (
      rsiResult.value < config.pump_fun_strategy.rsi.oversold &&
      macdResult.histogram > config.pump_fun_strategy.macd.buy_threshold &&
      volumeResult.buyPressure >
        config.pump_fun_strategy.volume_profile.buy_pressure_threshold &&
      depthResult.ratio >
        config.pump_fun_strategy.market_depth.min_bid_ask_ratio
    );
  }

  private async checkWalletBalance(): Promise<boolean> {
    try {
      const balance = await this.wallet.getSolBalance();
      this.state.walletBalance = balance!.dividedBy(1e9).valueOf();

      const sufficientBalance =
        this.state.walletBalance >=
        config.pump_fun_strategy.minimum_sol_balance;

      if (!sufficientBalance) {
        this.logger.log(
          `⚠️ Insufficient balance: ${this.state.walletBalance.toFixed(4)} SOL`
        );
        await this.emergencyExit();
      }

      return sufficientBalance;
    } catch (error) {
      this.logger.error("Error checking balance:", error);
      return false;
    }
  }

  private async emergencyExit(): Promise<void> {
    this.logger.log("🚨 Emergency exit - closing all positions");

    for (const [token, position] of this.state.activePositions) {
      try {
        const response = await this.transactionService.createSellTransaction(
          config.liquidity_pool.wsol_pc_mint,
          token,
          position.toString()
        );

        if (response.success) {
          this.logger.log(`✅ Closed position for ${token}`);
          this.state.activePositions.delete(token);
        }
      } catch (error) {
        this.logger.error(`❌ Failed to close ${token}:`, error);
      }
    }
  }

  private async getCurrentPrice(tokenMint: string): Promise<BigDenary> {
    try {
      const response = await this.jupiterApi.getPrice(tokenMint);
      return (
        new BigDenary(response.data.data[tokenMint]?.price) || new BigDenary(0)
      );
    } catch (error) {
      this.logger.error(`Error fetching price for ${tokenMint}:`, error);
      return new BigDenary(0);
    }
  }

  private async fetchPriceData(tokenMint: string): Promise<PriceData[]> {
    try {
      const jupiterPriceUrl = process.env.JUP_HTTPS_PRICE_URI;
      if (!jupiterPriceUrl) {
        throw new Error("Jupiter API URL not configured");
      }

      const solMint = config.liquidity_pool.wsol_pc_mint;
      const response = await axios.get(jupiterPriceUrl, {
        params: {
          ids: `${tokenMint},${solMint}`,
          showExtraInfo: true,
        },
        timeout: config.tx.get_timeout,
      });

      if (!response.data?.data) {
        throw new Error("Invalid price data response");
      }

      const tokenData = response.data.data[tokenMint];
      if (!tokenData?.extraInfo?.lastSwappedPrice) {
        return [];
      }

      return [
        {
          timestamp: Date.now(),
          price: tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice,
          volume: tokenData.extraInfo.oneDayVolume || 0,
          high:
            tokenData.extraInfo.high24h ||
            tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice,
          low:
            tokenData.extraInfo.low24h ||
            tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice,
        },
      ];
    } catch (error) {
      this.logger.error("Error fetching price data:", error);
      return [];
    }
  }

  async execute(): Promise<void> {
    // Implementation handled in processNewToken
  }

  getName(): string {
    return "PumpFun Strategy";
  }

  isEnabled(): boolean {
    return config.pump_fun_strategy.enabled;
  }

  cleanup(): void {
    this.logger.log("\n🧹 Cleaning up PumpFun strategy...");

    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger.log("✅ Cleanup complete");
  }
}
