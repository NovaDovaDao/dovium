import { BirdEyeToken } from '../types/BirdEyeToken';
import { TopTrader, TopTradersParams } from '../types/TopTraders';

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
