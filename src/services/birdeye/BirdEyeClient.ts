import axios from "axios";
import { IBirdEyeClient } from "../../core/interfaces/IBirdEyeClient.ts";
import {
  BirdEyeToken,
  BirdEyeResponse,
} from "../../core/types/BirdEyeToken.ts";
import {
  TopTrader,
  TopTradersParams,
  TopTradersResponse,
} from "../../core/types/TopTraders.ts";
import {
  TrendingToken,
  TrendingTokensParams,
  TrendingTokensResponse,
} from "../../core/types/TrendingTokens.ts";
import {
  TokenHolder,
  TokenHoldersParams,
  TokenHoldersResponse,
} from "../../core/types/TokenHolders.ts";
import { WalletTransactionHistoryResponse } from "../../core/types/WalletTransactionHistory.ts";

export class BirdEyeClient implements IBirdEyeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chain: string;

  constructor() {
    this.baseUrl =
      Deno.env.get("BIRDEYE_BASE_URL") || "https://public-api.birdeye.so";
    this.apiKey = Deno.env.get("BIRDEYE_API_KEY") || "";
    this.chain = Deno.env.get("CHAIN") || "solana";
  }

  async getTokenList(params: {
    sortBy: string;
    sortType: string;
    offset: number;
    limit: number;
    minLiquidity: number;
  }): Promise<BirdEyeToken[]> {
    try {
      const response = await axios.get<BirdEyeResponse>(
        `${this.baseUrl}/defi/tokenlist`,
        {
          params: {
            sort_by: params.sortBy,
            sort_type: params.sortType,
            offset: params.offset,
            limit: params.limit,
            min_liquidity: params.minLiquidity,
          },
          headers: {
            accept: "application/json",
            "x-chain": this.chain,
            "X-API-KEY": this.apiKey,
          },
        }
      );

      const tokens = response.data.data.tokens;

      // const timestamp = new Date().toISOString().replace(/[:]/g, "-");
      // const logDir = path.join(__dirname, "../../../logs");
      // const filePath = path.join(logDir, `token_data_${timestamp}.json`);

      // if (!fs.existsSync(logDir)) {
      //   fs.mkdirSync(logDir, { recursive: true });
      // }

      // const simplifiedTokens = tokens.map((token) => ({
      //   address: token.address,
      //   liquidity: token.liquidity,
      //   symbol: token.symbol,
      //   name: token.name,
      //   v24hChangePercent: token.v24hChangePercent,
      // }));

      // fs.writeFileSync(filePath, JSON.stringify(simplifiedTokens, null, 2));
      // console.log(`Token data saved to ${filePath}`);

      return tokens;
    } catch (error) {
      console.error("Error fetching token list:", error);
      throw error;
    }
  }

  async getTopTraders(params: TopTradersParams = {}): Promise<TopTrader[]> {
    try {
      const defaultParams = {
        address: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
        timeFrame: "30min",
        sortType: "desc",
        sortBy: "volume",
        offset: 0,
        limit: 10,
      };

      const queryParams = { ...defaultParams, ...params };

      const response = await axios.get<TopTradersResponse>(
        `${this.baseUrl}/defi/v2/tokens/top_traders`,
        {
          params: queryParams,
          headers: {
            accept: "application/json",
            "x-chain": this.chain,
            "X-API-KEY": this.apiKey,
          },
        }
      );

      if (!response.data.success) {
        throw new Error("Failed to fetch top traders data");
      }

      const traders = response.data.data.items;

      return traders;
    } catch (error) {
      console.error("Error fetching top traders:", error);
      throw error;
    }
  }

  async getTrendingTokens(
    params: TrendingTokensParams = {}
  ): Promise<TrendingToken[]> {
    try {
      const defaultParams = {
        sortBy: "rank",
        sortType: "asc",
        offset: 0,
        limit: 5,
      };

      const queryParams = { ...defaultParams, ...params };

      const response = await axios.get<TrendingTokensResponse>(
        `${this.baseUrl}/defi/token_trending`,
        {
          params: {
            sort_by: queryParams.sortBy,
            sort_type: queryParams.sortType,
            offset: queryParams.offset,
            limit: queryParams.limit,
          },
          headers: {
            accept: "application/json",
            "x-chain": this.chain,
            "X-API-KEY": this.apiKey,
          },
        }
      );

      if (!response.data.data) {
        throw new Error("Failed to fetch trending tokens");
      }

      const tokens = response.data.data.tokens;

      return tokens;
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  }

  async getTokenHolders(params: TokenHoldersParams): Promise<TokenHolder[]> {
    try {
      const defaultParams = {
        address: "So11111111111111111111111111111111111111112",
        offset: 0,
        limit: 100,
      };

      const queryParams = { ...defaultParams, ...params };

      const response = await axios.get<TokenHoldersResponse>(
        `${this.baseUrl}/defi/v3/token/holder`,
        {
          params: {
            address: queryParams.address,
            offset: queryParams.offset,
            limit: queryParams.limit,
          },
          headers: {
            accept: "application/json",
            "x-chain": this.chain,
            "X-API-KEY": this.apiKey,
          },
        }
      );

      if (!response.data.success) {
        throw new Error("Failed to fetch token holders");
      }

      const holders = response.data.data.items;
      // const total = response.data.data.total;

      // const timestamp = new Date().toISOString().split("T")[0];
      // const logDir = path.join(__dirname, "../../../logs");
      // const filePath = path.join(
      //   logDir,
      //   `token_holders_${params.address}_${timestamp}.json`
      // );

      // if (!fs.existsSync(logDir)) {
      //   fs.mkdirSync(logDir, { recursive: true });
      // }

      // const logData = {
      //   timestamp: new Date().toISOString(),
      //   tokenAddress: params.address,
      //   parameters: queryParams,
      //   totalHolders: total,
      //   holders: holders,
      // };

      // fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
      // console.log(`Token holders data saved to ${filePath}`);

      return holders;
    } catch (error) {
      console.error("Error fetching token holders:", error);
      throw error;
    }
  }

  async walletTransactionHistory({ wallet }: { wallet: string }) {
    const response = await axios.get<WalletTransactionHistoryResponse>(
      `${this.baseUrl}/v1/wallet/tx_list`,
      {
        params: {
          wallet,
          limit: 1000,
        },
        headers: {
          accept: "application/json",
          "x-chain": this.chain,
          "X-API-KEY": this.apiKey,
        },
      }
    );

    if (!response.data.success) {
      throw new Error("Failed to fetch token holders");
    }

    return response.data.data.solana;
  }
}
