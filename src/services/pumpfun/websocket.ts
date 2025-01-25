import "jsr:@std/dotenv/load";
import { StandardWebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { Logger } from "jsr:@deno-library/logger";
import { MessageType } from "./types.ts";

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
      if (this.messageHandler) this.messageHandler(JSON.parse(event.data));
    });

    this.socket = ws;
  }

  // Subscribing to token creation events
  subscribeNewToken() {
    this.socket.send(
      JSON.stringify({
        method: "subscribeNewToken",
      })
    );
  }
}
