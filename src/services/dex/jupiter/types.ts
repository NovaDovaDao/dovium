interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
}

interface SwapInfo {
  ammKey: string;
  label?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapParams {
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
  quoteResponse: QuoteResponse;
  dynamicSlippage?: {
    minBps: number;
    maxBps: number;
  };
  priorityLevel?: {
    type: "none" | "low" | "medium" | "high" | "very-high";
    maxLamports?: number;
  };
}

interface ImpactRatio {
  depth: {
    "10": number;
    "100": number;
    "1000": number;
  };
  timestamp: number;
}

export interface GetPriceResponse {
  data: Record<
    string,
    {
      id: string;
      type: string;
      price: string;
      extraInfo: {
        lastSwappedPrice: {
          lastJupiterSellAt: number;
          lastJupiterSellPrice: string;
          lastJupiterBuyAt: number;
          lastJupiterBuyPrice: string;
        };
        quotedPrice: {
          buyPrice: string;
          buyAt: number;
          sellPrice: string;
          sellAt: number;
        };
        confidenceLevel: "high" | "medium" | "low";
        depth: {
          buyPriceImpactRatio: ImpactRatio;
          sellPriceImpactRatio: ImpactRatio;
        };
      };
    }
  >;
  timeTaken: 0.00395219;
}

export interface SerializedQuoteResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: {
    computeBudget: Record<string, unknown>;
  };
  simulationSlot: number;
  dynamicSlippageReport: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
    categoryName: string;
    heuristicMaxSlippageBps: number;
  };
  simulationError: string | null;
}
