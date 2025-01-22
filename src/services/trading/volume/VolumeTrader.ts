// src/services/trading/volume/VolumeTrader.ts

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { GasSpeed, TradeConfig } from "../../../core/types/Trading.ts";
import { VolumeTraderConfig, TradeState } from "../../../core/types/TradeVolume.ts";
import { TradeExecutor } from "../TradeExecuter.ts";
import { Logger } from "jsr:@deno-library/logger";
import { JupiterService } from "../../dex/jupiter/jupiter.ts";

type TradeType = 'buy' | 'sell';

export class VolumeTrader {
  private tradeExecutor: TradeExecutor;
  private jupiterService: JupiterService;
  private tradeState: TradeState;
  private isRunning = false;
  private tradeInterval: ReturnType<typeof setInterval> | null = null;
  private logger = new Logger();
  private lastTradeTime = 0;
  private lastTradeType: TradeType | null = null;
  private readonly MIN_TRADE_INTERVAL = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;
  private readonly MIN_BALANCE_REQUIRED = 0.01; // 0.01 SOL minimum balance
  private readonly ESTIMATED_FEES = 0.005 * LAMPORTS_PER_SOL; // 0.005 SOL for fees
  private retryCount = 0;
  private tradeCount = 0;
  private successfulBuys = 0;
  private successfulSells = 0;

  constructor(
    private connection: Connection,
    private wallet: Keypair,
    private config: VolumeTraderConfig
  ) {
    this.jupiterService = new JupiterService(connection);
    this.tradeExecutor = new TradeExecutor(connection, wallet, this.jupiterService);
    this.tradeState = {
      lastTradeTime: 0,
      totalBaseVolume: 0,
      totalQuoteVolume: 0,
      trades: 0
    };
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.tokenPair.base || !this.config.tokenPair.quote) {
      throw new Error('Invalid token pair configuration');
    }
    if (this.config.volumeAmount <= 0) {
      throw new Error('Volume amount must be greater than 0');
    }
    if (this.config.priceRange.min >= this.config.priceRange.max) {
      throw new Error('Invalid price range configuration');
    }
  }

  private async getAvailableBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  private async getTokenBalance(tokenAddress: string): Promise<number> {
    try {
      const tokenMint = new PublicKey(tokenAddress);
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: tokenMint }
      );

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const balance = await this.connection.getTokenAccountBalance(
        tokenAccounts.value[0].pubkey
      );

      return Number(balance.value.uiAmount || 0);
    } catch (error) {
      this.logger.error(`Error fetching token balance for ${tokenAddress}:`, error);
      return 0;
    }
  }

// src/services/trading/volume/VolumeTrader.ts

private calculateTradeAmount(): number {
  // Smaller trade amounts for more reliable execution
  const baseAmount = this.config.volumeAmount * 0.1; // Start with 10% of configured amount
  const variation = 0.05; // 5% variation
  const randomFactor = 1 + (Math.random() * variation * 2 - variation);
  
  const amount = baseAmount * randomFactor;
  
  // Ensure amount is within configured range
  return Math.max(
    this.config.priceRange.min,
    Math.min(amount, this.config.priceRange.max)
  );
}

private async executeTrade(): Promise<void> {
  if (!this.isRunning) return;

  const now = Date.now();
  if (now - this.lastTradeTime < this.MIN_TRADE_INTERVAL) {
    return;
  }

  try {
    const isBuy = this.shouldBuy();
    const tradeConfig: TradeConfig = {
      slippage: 1, // 1% slippage for both buy and sell
      gasSpeed: 'turbo' as GasSpeed
    };

    const baseAmount = this.calculateTradeAmount();
    
    this.logger.info(`Executing ${isBuy ? 'BUY' : 'SELL'} trade:`, {
      amount: baseAmount,
      inputToken: isBuy ? this.config.tokenPair.quote : this.config.tokenPair.base,
      outputToken: isBuy ? this.config.tokenPair.base : this.config.tokenPair.quote
    });

    const signature = isBuy 
      ? await this.executeBuyTrade(baseAmount, tradeConfig)
      : await this.executeSellTrade(baseAmount, tradeConfig);

    // Update state if successful
    if (signature) {
      this.tradeCount++;
      if (isBuy) {
        this.successfulBuys++;
      } else {
        this.successfulSells++;
      }
      this.lastTradeTime = now;
      this.lastTradeType = isBuy ? 'buy' : 'sell';
      this.retryCount = 0;
    }

    // Add random delay between trades
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
  } catch (error) {
    await this.handleTradeError(error as Error);
  }
}

  private shouldBuy(): boolean {
    // If no previous trades, start with buy
    if (this.lastTradeType === null) {
      return true;
    }

    // If buys are lagging behind sells, prioritize buy
    if (this.successfulBuys < this.successfulSells) {
      return true;
    }

    // If sells are lagging behind buys, prioritize sell
    if (this.successfulSells < this.successfulBuys) {
      return false;
    }

    // Add some randomness to the decision
    if (Math.random() < 0.1) { // 10% chance to break pattern
      return Math.random() < 0.5;
    }

    // Otherwise alternate
    return this.lastTradeType === 'sell';
  }

  private async executeBuyTrade(amount: number, config: TradeConfig): Promise<string> {
    try {
      const solBalance = await this.getAvailableBalance();
      if (solBalance < amount + (this.ESTIMATED_FEES / LAMPORTS_PER_SOL)) {
        throw new Error(`Insufficient SOL balance. Required: ${amount}, Available: ${solBalance}`);
      }

      this.logger.info('Executing buy trade:', {
        amount,
        inputToken: this.config.tokenPair.quote,
        outputToken: this.config.tokenPair.base,
      });

      return await this.tradeExecutor.executeBuy({
        inputToken: this.config.tokenPair.quote,
        outputToken: this.config.tokenPair.base,
        amount,
        config: {
          ...config,
          slippage: Math.min(config.slippage, 100),
        }
      });
    } catch (error) {
      this.logger.error('Buy trade failed:', error);
      throw error;
    }
  }

  private async executeSellTrade(amount: number, config: TradeConfig): Promise<string> {
    try {
      const tokenBalance = await this.getTokenBalance(this.config.tokenPair.base);
      if (tokenBalance < amount) {
        throw new Error(`Insufficient token balance. Required: ${amount}, Available: ${tokenBalance}`);
      }

      this.logger.info('Executing sell trade:', {
        amount,
        inputToken: this.config.tokenPair.base,
        outputToken: this.config.tokenPair.quote,
      });

      return await this.tradeExecutor.executeSell({
        inputToken: this.config.tokenPair.base,
        outputToken: this.config.tokenPair.quote,
        amount,
        config: {
          ...config,
          slippage: Math.min(config.slippage, 100),
        }
      });
    } catch (error) {
      this.logger.error('Sell trade failed:', error);
      throw error;
    }
  }

  private async handleTradeError(error: Error): Promise<void> {
    this.logger.error('Trade execution failed:', error);
    
    if (error.message.includes('insufficient')) {
      this.logger.error('Insufficient balance for trade, stopping trader');
      await this.stop();
      return;
    }

    this.retryCount++;

    if (this.retryCount >= this.MAX_RETRIES) {
      this.logger.error(`Maximum retries (${this.MAX_RETRIES}) reached. Stopping trader.`);
      await this.stop();
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = 5000;
    const maxJitter = 2000;
    const backoffTime = Math.min(
      baseDelay * Math.pow(2, this.retryCount) + Math.random() * maxJitter,
      30000
    );

    this.logger.info(`Retrying after ${backoffTime}ms (attempt ${this.retryCount} of ${this.MAX_RETRIES})`);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.info('Volume trader is already running');
      return;
    }
    
    try {
      const balance = await this.getAvailableBalance();
      const minRequired = this.MIN_BALANCE_REQUIRED + (this.ESTIMATED_FEES / LAMPORTS_PER_SOL);
      
      if (balance < minRequired) {
        throw new Error(`Insufficient balance for trading. Required: ${minRequired} SOL, Available: ${balance} SOL`);
      }

      this.isRunning = true;
      this.logger.info('Starting volume trader with config:', {
        base: this.config.tokenPair.base,
        quote: this.config.tokenPair.quote,
        volumeAmount: this.config.volumeAmount,
        interval: this.config.tradeInterval,
        priceRange: this.config.priceRange
      });
      
      this.tradeInterval = setInterval(
        () => this.executeTrade(),
        Math.max(this.config.tradeInterval, this.MIN_TRADE_INTERVAL)
      );

      await this.executeTrade();
    } catch (error) {
      this.logger.error('Failed to start volume trader:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping volume trader');
    this.isRunning = false;
    
    if (this.tradeInterval) {
      clearInterval(this.tradeInterval);
      this.tradeInterval = null;
    }

    await this.logFinalStats();
  }

  private async logFinalStats(): Promise<void> {
    const balance = await this.getAvailableBalance();
    const tokenBalance = await this.getTokenBalance(this.config.tokenPair.base);

    this.logger.info('Final trading statistics:', {
      totalTrades: this.tradeCount,
      successfulBuys: this.successfulBuys,
      successfulSells: this.successfulSells,
      totalBaseVolume: this.tradeState.totalBaseVolume,
      totalQuoteVolume: this.tradeState.totalQuoteVolume,
      finalSOLBalance: balance,
      finalTokenBalance: tokenBalance
    });
  }

  public getTradeState(): TradeState {
    return { 
      ...this.tradeState,
      trades: this.tradeCount,
      lastTradeTime: this.lastTradeTime
    };
  }
}