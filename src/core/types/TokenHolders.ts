export interface TokenHolder {
  owner: string;
  amount: number;
  percentage: number;
  rank: number;
}

export interface TokenHoldersResponse {
  success: boolean;
  data: {
    items: TokenHolder[];
    total: number;
  };
}

export interface TokenHoldersParams {
  address: string;
  offset?: number;
  limit?: number;
}
