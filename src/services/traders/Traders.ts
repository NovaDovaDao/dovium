import axios from "axios";
import { BirdEyeClient } from "../birdeye/BirdEyeClient.ts";
import { requireRedis } from "../redis/index.ts";
import { Logger } from "jsr:@deno-library/logger";
import Big from "big.js";

export class Traders {
  private logger = new Logger();
  private TOP_TRADERS_KEY = "toptraders";
  private redisClient: Awaited<ReturnType<typeof requireRedis>> | null = null;
  private birdEyeClient: BirdEyeClient | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.birdEyeClient = new BirdEyeClient();
    this.redisClient = await requireRedis();
  }

  public getTopTraders() {
    return this.redisClient?.get(this.TOP_TRADERS_KEY);
  }

  private setTopTraders(value: unknown) {
    return this.redisClient?.set(this.TOP_TRADERS_KEY, JSON.stringify(value));
  }

  /**
   *
   * 1. get trending tokens
   * 2. get top traders per volume of those tokens
   * 3. get and store history of those traders
   * 4. loop through top traders and call n8n to analyze each one posting its results in redis
   */
  public async analyze(params?: { tokenAddresses?: string[] }) {
    if (!this.birdEyeClient || !this.redisClient)
      throw "BirdsEye and/or Redis clients are missing";

    /**
     *
     * if token addresses are passed as params, skip Birdeye's trending tokens request.
     * we will mimic the shape the response of `getTopTraders()`.
     */
    const trendingTokensResponse = params?.tokenAddresses?.length
      ? params.tokenAddresses.map((address) => ({
          address,
        }))
      : await this.birdEyeClient.getTrendingTokens({ limit: 10 });
    this.logger.info(
      `Analyzing the following tokens: \n ${trendingTokensResponse
        .map(({ address }) => address)
        .join(", \n")}`
    );

    const uniqueTopTradersWalletAddress = new Set<string>();

    for (const trendingToken of trendingTokensResponse) {
      const topTradersResponse = await this.birdEyeClient.getTopTraders({
        address: trendingToken.address,
        limit: 10,
      });
      topTradersResponse.forEach((topTrader) => {
        uniqueTopTradersWalletAddress.add(topTrader.owner);
      });
    }

    const topTraders = new Map<
      string,
      ReturnType<typeof aggregateTransactions>
    >();
    for (const topTraderWallet of uniqueTopTradersWalletAddress) {
      const topTraderHistory =
        await this.birdEyeClient.walletTransactionHistory({
          wallet: topTraderWallet,
          limit: 200,
        });

      const aggregatedTxs = aggregateTransactions(topTraderHistory);
      this.logger.info(
        `Aggregated data for: \n ${topTraderWallet}`,
        JSON.stringify(aggregatedTxs, null, 2)
      );
      topTraders.set(topTraderWallet, aggregatedTxs);
    }

    await this.setTopTraders(Array.from(topTraders.entries()));

    await axios.get(Deno.env.get("N8N_DOVIUM_WEBHOOK")!);

    return {
      topTraders: Array.from(topTraders.entries()),
    };
  }
}

function aggregateTransactions(
  transactions: Awaited<ReturnType<BirdEyeClient["walletTransactionHistory"]>>
) {
  const aggregatedData: {
    [key: string]: {
      tokenVolumes: { [symbol: string]: Big };
      numberOfTransactions: number;
    };
  } = {};

  for (const transaction of transactions) {
    const date = transaction.blockTime.split("T")[0];

    if (!aggregatedData[date]) {
      aggregatedData[date] = {
        tokenVolumes: {},
        numberOfTransactions: 0,
      };
    }

    aggregatedData[date].numberOfTransactions += 1;

    for (const balanceChange of transaction.balanceChange) {
      const { amount, symbol, decimals } = balanceChange;
      const amountInBaseUnits = new Big(amount).div(Math.pow(10, decimals)); // Convert to base units

      if (!aggregatedData[date].tokenVolumes[symbol]) {
        aggregatedData[date].tokenVolumes[symbol] = new Big(0);
      }
      aggregatedData[date].tokenVolumes[symbol] =
        aggregatedData[date].tokenVolumes[symbol].plus(amountInBaseUnits);
    }
  }

  return Object.entries(aggregatedData).map(([date, data]) => ({
    date,
    tokenVolumes: data.tokenVolumes,
    numberOfTransactions: data.numberOfTransactions,
  }));
}
