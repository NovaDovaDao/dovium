// src/services/dex/jupiter/jupiter.ts

import axios from "axios";
import { GetPriceResponse, QuoteResponse } from "./types.ts";
import { Logger } from "jsr:@deno-library/logger";

export class JupiterService {
  private logger = new Logger();
  private readonly JUPITER_V6_ENDPOINT = "https://quote-api.jup.ag/v6";

  constructor() {
    this.logger.log("Initialized Jupiter Service");
  }

  getPrice(tokenAddresses: string[]) {
    const baseUrl = "https://api.jup.ag/price/v2?ids=";
    return axios.get<GetPriceResponse>(baseUrl + tokenAddresses.join(","));
  }

  getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number
  ) {
    const amountLamports = Math.floor(amount * 1e9);
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountLamports.toString(),
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: "false",
      asLegacyTransaction: "true",
    });

    return axios.get<QuoteResponse>(
      `${this.JUPITER_V6_ENDPOINT}/quote?${params}`
    );
  }
}
