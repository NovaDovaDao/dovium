import axios, { AxiosInstance } from "axios";
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
  WalletTransactionHistoryParams,
  WalletTransactionHistoryResponse,
} from "../../core/types/WalletTransactionHistory.ts";
import Logger from "jsr:@deno-library/logger";

export class BirdEyeClient {
  private logger = new Logger();
  private readonly apiClient: AxiosInstance;

  constructor() {
    this.apiClient = axios.create({
      baseURL:
        Deno.env.get("BIRDEYE_BASE_URL") || "https://public-api.birdeye.so",
      headers: {
        accept: "application/json",
        "x-chain": Deno.env.get("CHAIN") || "solana",
        "X-API-KEY": Deno.env.get("BIRDEYE_API_KEY") || "",
      },
    });
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

      const response = await this.apiClient.get<TopTradersResponse>(
        "/defi/v2/tokens/top_traders",
        {
          params: queryParams,
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

      const response = await this.apiClient.get<TrendingTokensResponse>(
        "/defi/token_trending",
        {
          params: {
            sort_by: queryParams.sortBy,
            sort_type: queryParams.sortType,
            offset: queryParams.offset,
            limit: queryParams.limit,
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

  async walletTransactionHistory({
    wallet,
    limit = 10,
  }: WalletTransactionHistoryParams) {
    try {
      const getHistory = () =>
        this.apiClient.get<WalletTransactionHistoryResponse>(
          "/v1/wallet/tx_list",
          {
            params: {
              wallet,
              limit,
            },
            headers: {
              accept: "application/json",
            },
          }
        );
      const response = await getHistory();

      if (!response.data.data.solana) throw response;

      return response.data.data.solana;
    } catch (error) {
      this.logger.error("Failed to fetch token holders", error);
      return [];
    }
  }
}
