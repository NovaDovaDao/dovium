export type GasSpeed = 'fast' | 'turbo' | 'ultra';

export interface TradeConfig {
  slippage: number; // Percentage (0-100)
  gasSpeed: GasSpeed;
  maxGasLimit?: number;
}

export interface TradeParams {
  inputToken: string;
  outputToken: string;
  amount: number;
  config: TradeConfig;
}
