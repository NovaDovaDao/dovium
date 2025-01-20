export interface TopTrader {
  tokenAddress: string;
  owner: string;
  tags: string[];
  type: string;
  volume: number;
  trade: number;
  tradeBuy: number;
  tradeSell: number;
  volumeBuy: number;
  volumeSell: number;
}

export interface TopTradersResponse {
  success: boolean;
  data: {
    items: TopTrader[];
  };
}

export interface TopTradersParams {
  address?: string;
  timeFrame?: "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "24h";
  sortType?: "desc" | "asc";
  sortBy?: "volume" | "trade";
  offset?: number;
  limit?: number;
}
