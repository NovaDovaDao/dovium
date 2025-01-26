import { Logger } from "jsr:@deno-library/logger";
import axios from "axios";
import { config } from "../../config.ts";

export class HeliusApi {
  logger = new Logger();
  apiClient = axios.create({
    baseURL: "https://api.helius.xyz",
  });

  constructor(private readonly apiKey = Deno.env.get("HELIUS_API_KEY")) {
    if (!this.apiKey) {
      this.logger.error("Missing Helius API key");
    }

    this.apiClient.interceptors.request.use((config) => {
      config.params["api-key"] = this.apiKey;
      return config;
    });
  }

  transactions(transactions: string[]) {
    return this.apiClient.post(
      "/v0/transactions",
      {
        transactions,
      },
      {
        params: { commitment: "finalized", encoding: "jsonParsed" },
        timeout: config.tx.get_timeout,
      }
    );
  }
}
