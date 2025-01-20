import axios from "axios";
import { BirdEyeClient } from "../birdeye/BirdEyeClient.ts";
import { requireRedis } from "../redis/index.ts";

export class Traders {
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

  private setTopTraderHistory(topTraderWallet: string, value: unknown) {
    const key = `solana-account-${topTraderWallet}`;
    return this.redisClient?.set(key, JSON.stringify(value));
  }

  /**
   *
   * 1. get trending tokens
   * 2. get top traders per volume of those tokens
   * 3. get and store history of those traders
   * 4. loop through top traders and call n8n to analyze each one posting its results in redis
   */
  public async analyze(params?: { tokenAddresses: string[] }) {
    if (!this.birdEyeClient || !this.redisClient)
      throw "BirdsEye and/or Redis clients are missing";

    /**
     *
     * if token addresses are passed as params, skip Birdeye's trending tokens request.
     * we will mimic the shape the response of `getTopTraders()`.
     */
    const trendingTokensResponse = params?.tokenAddresses.length
      ? params.tokenAddresses.map((address) => ({
          address,
        }))
      : await this.birdEyeClient.getTrendingTokens();

    const uniqueTopTradersWalletAddress = new Set<string>();

    for (const trendingToken of trendingTokensResponse) {
      const topTradersResponse = await this.birdEyeClient.getTopTraders({
        address: trendingToken.address,
      });
      topTradersResponse.forEach((topTrader) => {
        uniqueTopTradersWalletAddress.add(topTrader.owner);
      });
    }

    for (const topTraderWallet of uniqueTopTradersWalletAddress) {
      const topTraderHistory =
        await this.birdEyeClient.walletTransactionHistory({
          wallet: topTraderWallet,
        });

      this.setTopTraderHistory(topTraderWallet, topTraderHistory);
    }

    const analysisRequests = [...Array.from(uniqueTopTradersWalletAddress)].map(
      (address) => {
        const url = new URL(Deno.env.get("N8N_DOVIUM_WEBHOOK")!);
        console.log("url", url);
        url.searchParams.append("wallet", address);

        return axios.get(url.toString());
      }
    );
    await Promise.all(analysisRequests).catch(console.error);

    return {
      topTraders: Array.from(uniqueTopTradersWalletAddress),
    };
  }
}
