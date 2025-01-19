export interface TopTrader {
  address: string;
  volume: number;
  trades: number;
  volumeUSD: number;
  priceAvg: number;
  timestamp: number;
}

export interface TopTradersResponse {
  success: boolean;
  data: {
    items: TopTrader[];
  };
}

export interface TopTradersParams {
  address?: string;
  timeFrame?: '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '24h';
  sortType?: 'desc' | 'asc';
  sortBy?: 'volume' | 'trade';
  offset?: number;
  limit?: number;
}
