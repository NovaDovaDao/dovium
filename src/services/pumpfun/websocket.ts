import "jsr:@std/dotenv/load";
import { StandardWebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { Logger } from "jsr:@deno-library/logger";

type MessageBase = { message: string };
type MessageNewToken = {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: string;
  initialBuy: number;
  solAmount: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  name: string;
  symbol: string;
  uri: string;
  pool: string;
};

type MessageType = MessageBase | MessageNewToken;

export class PumpFunWebSocket {
  private readonly logger = new Logger();
  socket: StandardWebSocketClient;

  constructor(
    private readonly messageHandler?: (message: MessageType) => void
  ) {
    const ws = new StandardWebSocketClient("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
      this.logger.info("WebSocket is open");
    });

    ws.on("close", () => {
      this.logger.info("WebSocket closed");
    });

    ws.on("error", () => {
      this.logger.error("Websocket error");
    });

    ws.addListener("message", (event: MessageEvent<string>) => {
      this.logger.log("Received message event...");

      if (this.messageHandler) {
        const message = JSON.parse(event.data);
        this.messageHandler(message);
      }
    });

    this.socket = ws;
  }

  // Subscribing to token creation events
  subscribeNewToken() {
    const payload = {
      method: "subscribeNewToken",
    };
    this.socket.send(JSON.stringify(payload));
  }
}
