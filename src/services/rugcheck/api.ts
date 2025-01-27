import axios from "axios";
import { config } from "../../config.ts";
import { RugResponseExtended } from "./types.ts";

export class RugCheckApi {
  apiClient = axios.create({
    baseURL: "https://api.rugcheck.xyz",
  });
  tokens(tokenMint: string) {
    return this.apiClient.get<RugResponseExtended>(
      "v1/tokens/" + tokenMint + "/report",
      {
        timeout: config.tx.get_timeout,
      }
    );
  }
}
