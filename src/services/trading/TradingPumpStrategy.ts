import { Connection, Keypair } from '@solana/web3.js';
import { PumpStrategy } from '../strategy/PumpStrategy.ts';
import { TradeExecutor } from '../TradeExecutor.ts';
import { GasSpeed } from '../../core/types/Trading.ts';
import SolanaService from '../solana/SolanaService.ts';

export class TradingStrategy {
  private pumpStrategy: PumpStrategy;
  private tradeExecutor: TradeExecutor;
  private solanaService: SolanaService;

  constructor(
    private connection: Connection,
    private wallet: Keypair,
    rpcUrl: string
  ) {
    this.solanaService = new SolanaService(rpcUrl);
    this.tradeExecutor = new TradeExecutor(connection, wallet);
    this.pumpStrategy = new PumpStrategy(this.solanaService);
  }

  async executeStrategyTrade(tokenAddress: string): Promise<string | null> {
    try {
      const analysis = await this.pumpStrategy.evaluateEntry(tokenAddress, []); // Pass appropriate price data

      if (analysis) {
        // Execute buy with ultra gas to ensure execution
        return await this.tradeExecutor.executeBuy({
          inputToken: "SOL",
          outputToken: tokenAddress,
          amount: 0.1, // Configure amount based on strategy
          config: {
            slippage: 1,
            gasSpeed: 'ultra' as GasSpeed
          }
        });
      }

      // Check exit conditions if we have a position
      const position = this.pumpStrategy.getActivePositions().get(tokenAddress);
      if (position) {
        const shouldExit = await this.pumpStrategy.evaluateExit(tokenAddress, []); // Pass appropriate price data
        
        if (shouldExit) {
          return await this.tradeExecutor.executeSell({
            inputToken: tokenAddress,
            outputToken: "SOL",
            amount: position.amount,
            config: {
              slippage: 0.5,
              gasSpeed: 'turbo' as GasSpeed
            }
          });
        }
      }

    } catch (error) {
      console.error("Strategy execution failed:", error);
      // Attempt emergency exit if needed
      await this.emergencyExit(tokenAddress);
    }

    return null;
  }

  private async emergencyExit(tokenAddress: string): Promise<void> {
    const position = this.pumpStrategy.getActivePositions().get(tokenAddress);
    if (position) {
      try {
        await this.tradeExecutor.executeSell({
          inputToken: tokenAddress,
          outputToken: "SOL",
          amount: position.amount,
          config: {
            slippage: 2, // Higher slippage for emergency
            gasSpeed: 'ultra' as GasSpeed
          }
        });
      } catch (error) {
        console.error("Emergency exit failed:", error);
      }
    }
  }

  async stopTrading(): Promise<void> {
    await this.pumpStrategy.stop();
  }
}