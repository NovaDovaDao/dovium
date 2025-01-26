// src/tasks/volume-bot.ts
import "jsr:@std/dotenv/load";
import { Connection } from "@solana/web3.js";
import { JupiterApi } from "../services/dex/jupiter/api.ts";
import { config } from "../config.ts";
import { Logger } from "jsr:@deno-library/logger";
import { SolanaWallet } from "../services/solana/wallet.ts";
import { Transactions } from "../core/transactions.ts";

interface VolumeOptions {
  simulation_mode?: boolean;
}

class VolumeBot {
  private logger = new Logger();
  private readonly transactionService: Transactions;
  private tradeIntervals: Map<string, number> = new Map();
  private simulation_mode: boolean;

  constructor(private wallet: SolanaWallet, options: VolumeOptions = {}) {
    this.simulation_mode = options.simulation_mode ?? false;
    this.transactionService = new Transactions(wallet);
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

      // const tradeSize = this.getRandomTradeSize(pair);

      // await this.executeTrade(pair.base, pair.quote, tradeSize);
      // await this.sleep(this.getRandomDelay(1000, 5000));
      // await this.executeTrade(pair.quote, pair.base, tradeSize);
    } catch (error) {
      this.logger.error("Trading cycle failed:", error);
    }
  }

  private async executeTrade() // inputMint: string,
  // outputMint: string,
  // amount: number
  {
    try {
      // TODO: last piece of the puzzle
      // const txid = await this.transactionService.createSwapTransaction(
      //   inputMint,
      //   outputMint,
      //   amount,
      //   this.wallet,
      //   config.volume_strategy.general.max_slippage,
      //   {
      //     type: config.volume_strategy.general.priority_fee.level,
      //     maxLamports: config.volume_strategy.general.priority_fee.max_lamports,
      //   }
      // );
      // if (!txid) {
      //   throw new Error("Failed to execute swap");
      // }
      // this.logger.info(`Trade executed successfully: ${txid}`);
    } catch (error) {
      this.logger.error("Trade execution failed:", error);
      throw error;
    }
  }

  private getRandomTradeSize(
    pair: (typeof config.volume_strategy.pairs)[0]
  ): number {
    return (
      Math.random() * (pair.max_trade_size - pair.min_trade_size) +
      pair.min_trade_size
    );
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

function main() {
  try {
    const privKey = Deno.env.get("SOLANA_PRIVATE_KEY");
    if (!privKey) {
      throw new Error("SOLANA_PRIVATE_KEY not found in environment variables");
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const connection = new Connection(rpcUrl!);
    const wallet = new SolanaWallet(connection, privKey);

    console.clear();
    console.log("🚀 Starting Volume Bot...");
    console.log(`💳 Wallet: ${wallet.getPublicKey()}`);

    // Get simulation mode from command line args
    const args = Deno.args;
    const simulation_mode = args.includes("--simulation");

    const bot = new VolumeBot(wallet, { simulation_mode });
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
