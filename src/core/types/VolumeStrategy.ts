// src/core/types/VolumeStrategy.ts
export interface VolumeStrategyConfig {
    enabled: boolean;
    pairs: {
      base: string;
      quote: string;
      volume_target: number;
      min_trade_size: number;
      max_trade_size: number;
      trade_interval: number;
      price_impact_limit: number;
      spread_threshold: number;
    }[];
    general: {
      max_slippage: number;
      priority_fee: {
        max_lamports: number;
        level: string;
      };
      retry_attempts: number;
      retry_delay: number;
    };
  }