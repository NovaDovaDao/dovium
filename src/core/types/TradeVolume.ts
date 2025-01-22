//src/core/trading/volume/types.ts
export interface VolumeTraderConfig {
  tokenPair: {
    base: string;
    quote: string;
  };
  volumeAmount: number;
  tradeInterval: number;
  priceRange: {
    min: number;
    max: number;
  };
}

export interface TradeState {
  lastTradeTime: number;
  totalBaseVolume: number;
  totalQuoteVolume: number;
  trades: number;
}