import { BirdEyeToken } from "../types/BirdEyeToken.ts";
import { TopTrader, TopTradersParams } from "../types/TopTraders.ts";

export interface IBirdEyeClient {
  getTokenList(params: {
    sortBy: string;
    sortType: string;
    offset: number;
    limit: number;
    minLiquidity: number;
  }): Promise<BirdEyeToken[]>;

  getTopTraders(params?: TopTradersParams): Promise<TopTrader[]>;
}
