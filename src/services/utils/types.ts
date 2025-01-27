import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";

// src/services/utils/types.ts
export interface TokenPriceInfo {
  price: BigDenary;
  confidence: number;
  timestamp: number;
}

export interface TokenMetadata {
  mint: string;
  decimals: number;
  symbol: string;
  name: string;
}

export interface TokenTransactionResult {
  success: boolean;
  txId?: string;
  error?: string;
  amount?: {
    raw: bigint;
    ui: number;
  };
}