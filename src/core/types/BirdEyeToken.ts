export interface BirdEyeToken {
  address: string;
  liquidity: number;
  symbol: string;
  name: string;
  v24hChangePercent: number | null;
}

export interface BirdEyeResponse {
  success: boolean;
  data: {
    tokens: BirdEyeToken[];
  };
}
