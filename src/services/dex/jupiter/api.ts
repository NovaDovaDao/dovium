// src/services/dex/jupiter/jupiter.ts

import axios from "axios";
import { GetPriceResponse, QuoteResponse } from "./types.ts";
import { Logger } from "jsr:@deno-library/logger";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "../../../config.ts";
import { SerializedQuoteResponse } from "../../../core/types/Tracker.ts";

export class JupiterApi {
  private logger = new Logger();
  private apiClient = axios.create({
    baseURL: "https://api.jup.ag",
  });

  constructor() {
    this.logger.log("Initialized Jupiter Service");
  }

  getPrice(tokenAddresses: string | string[]) {
    return this.apiClient.get<GetPriceResponse>("/price/v2", {
      params: {
        ids: Array.isArray(tokenAddresses)
          ? tokenAddresses.join(",")
          : tokenAddresses,

        showExtraInfo: true,
      },
    });
  }

  getQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  }: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: string;
  }) {
    const amountLamports = new BigDenary(amount).multipliedBy(LAMPORTS_PER_SOL);

    return this.apiClient.get<QuoteResponse>("/quote", {
      params: {
        inputMint,
        outputMint,
        amount: amountLamports.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: "false",
        asLegacyTransaction: "true",
      },
      timeout: config.tx.get_timeout,
    });
  }

  swapTransaction({
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol = true,
  }: {
    quoteResponse: QuoteResponse;
    userPublicKey: string;
    wrapAndUnwrapSol?: boolean;
  }) {
    return this.apiClient.post<SerializedQuoteResponse>(
      "/v6/swap",
      {
        // quoteResponse from /quote api
        quoteResponse,
        // user public key to be used for the swap
        userPublicKey,
        // auto wrap and unwrap SOL. default is true
        wrapAndUnwrapSol,
        // Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
        // feeAccount: "fee_account_public_key"
        // dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
        dynamicSlippage: {
          // This will set an optimized slippage to ensure high success rate
          maxBps: 300, // Make sure to set a reasonable cap here to prevent MEV
        },
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: config.swap.prio_fee_max_lamports,
            priorityLevel: config.swap.prio_level,
          },
        },
      },
      {
        timeout: config.tx.get_timeout,
      }
    );
  }
}
