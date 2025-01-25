// src/tasks/volume-bot.ts
import "jsr:@std/dotenv/load";
import { Keypair } from "@solana/web3.js";
import { JupiterService } from "../services/dex/jupiter/index.ts";
import { config } from "../config.ts";
import bs58 from "bs58";
import { Logger } from "jsr:@deno-library/logger";
import Big from "big.js";
import SolanaConnection from "../services/solana/connection.ts";

interface VolumeOptions {
  simulation_mode?: boolean;
}

class VolumeBot {
  private logger = new Logger();
  private jupiterService: JupiterService;
  private connection: SolanaConnection;
  private tradeIntervals: Map<string, number> = new Map();
  private wallet: Keypair;
  private simulation_mode: boolean;

  constructor(wallet: Keypair, options: VolumeOptions = {}) {
    this.wallet = wallet;
    this.jupiterService = new JupiterService();
    this.connection = new SolanaConnection(Deno.env.get("SOLANA_RPC_URL")!);
    this.simulation_mode = options.simulation_mode ?? false;
  }

  async start() {
    if (!config.volume_strategy.enabled) {
      this.logger.info("Volume trading is disabled");
      return;
    }

    this.connection.initializeWallet(bs58.encode(this.wallet.secretKey));
    
    this.logger.info("Starting volume trading bot...");
    this.logger.info(`Wallet: ${this.wallet.publicKey.toString()}`);
    this.logger.info(`Mode: ${this.simulation_mode ? '🔬 Simulation' : '🚀 Live Trading'}`);
    await this.initializeTradingPairs();
  }

  private async initializeTradingPairs() {
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

  private async startTradingCycle(pair: typeof config.volume_strategy.pairs[0]) {
    try {
      const balance = await this.connection.getSolBalance();
      if (!balance || balance.lt(new Big(pair.min_trade_size))) {
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

//   private async executeTrade(
//     inputMint: string,
//     outputMint: string,
//     amount: number
//   ) {
//     try {
//       const quote = await this.jupiterService.getQuote(
//         inputMint,
//         outputMint,
//         amount,
//         config.volume_strategy.general.max_slippage
//       );

//       if (!quote.data) {
//         throw new Error("Failed to get quote");
//       }

//       const priceImpact = parseFloat(quote.data.priceImpactPct);
//       if (priceImpact > config.volume_strategy.pairs[0].price_impact_limit) {
//         throw new Error(`Price impact too high: ${priceImpact}%`);
//       }

//       this.logger.info(`Executing trade: ${amount} ${inputMint} -> ${outputMint}`);
      
//       if (this.simulation_mode) {
//         this.logger.info("🔬 Simulated trade execution");
//       } else {
//         // Execute actual trade
//         const swapResult = await this.jupiterService.getSwapTransaction({
//           userPublicKey: this.wallet.publicKey.toString(),
//           quoteResponse: quote.data,
//           priorityLevel: {
//             type: config.volume_strategy.general.priority_fee.level,
//             maxLamports: config.volume_strategy.general.priority_fee.max_lamports
//           }
//         });
//         // TODO: Execute transaction with instructions and signers
//       }

//       this.logger.info(`Quote details:`);
//       this.logger.info(`- Input amount: ${quote.data.inAmount}`);
//       this.logger.info(`- Output amount: ${quote.data.outAmount}`);
//       this.logger.info(`- Price impact: ${priceImpact}%`);
//       this.logger.info(`- Slippage: ${quote.data.slippageBps / 100}%`);

//       this.logger.info(`${this.simulation_mode ? 'Simulated trade' : 'Trade'} executed successfully`);

//     } catch (error) {
//       this.logger.error("Trade execution failed:", error);
//       throw error;
//     }
//   }
private async executeTrade(
    inputMint: string, 
    outputMint: string,
    amount: number
  ) {
    try {
      const txid = await this.jupiterService.executeSwap(
        inputMint,
        outputMint,
        amount,
        this.wallet,
        config.volume_strategy.general.max_slippage,
        {
          type: config.volume_strategy.general.priority_fee.level,
          maxLamports: config.volume_strategy.general.priority_fee.max_lamports
        }
      );
  
      if (!txid) {
        throw new Error("Failed to execute swap");
      }
  
      this.logger.info(`Trade executed successfully: ${txid}`);
      
    } catch (error) {
      this.logger.error("Trade execution failed:", error);
      throw error;
    }
  }
  
  private getRandomTradeSize(pair: typeof config.volume_strategy.pairs[0]): number {
    return (
      Math.random() * (pair.max_trade_size - pair.min_trade_size) +
      pair.min_trade_size
    );
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.tradeIntervals.forEach(interval => clearInterval(interval));
    this.tradeIntervals.clear();
    this.logger.info("Volume trading bot stopped");
  }
}

function main() {
  try {
    const privKey = Deno.env.get("SOLANA_PRIVATE_KEY");
    if (!privKey) {
      throw new Error("SOLANA_PRIVATE_KEY not found in environment variables");
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(privKey));

    console.clear();
    console.log("🚀 Starting Volume Bot...");
    console.log(`💳 Wallet: ${keypair.publicKey.toString()}`);

    // Get simulation mode from command line args
    const args = Deno.args;
    const simulation_mode = args.includes('--simulation');

    const bot = new VolumeBot(keypair, { simulation_mode });
    bot.start();

    Deno.addSignalListener("SIGINT", () => {
      bot.stop();
      Deno.exit();
    });

  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}