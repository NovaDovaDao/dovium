export interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  rank?: number;
  volume24hUSD?: number;
  liquidity?: number;
}

export interface TrendingTokensResponse {
  success: boolean;
  data: {
    items: TrendingToken[];
  };
}

export interface TrendingTokensParams {
  sortBy?: 'rank' | 'volume24hUSD' | 'liquidity';
  sortType?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}
