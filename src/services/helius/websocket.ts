import "jsr:@std/dotenv/load";
import { StandardWebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { LogNotification, WebSocketMessageData } from "./types.ts";
import { Logger } from "jsr:@deno-library/logger";

interface LogsSubscribeListener {
  method: "logsSubscribe";
  programId: string;
  callback: (notification: LogNotification) => void;
}

export class HeliusWebSocketClient {
  logger = new Logger();
  socket: StandardWebSocketClient;

  constructor() {
    const endpoint = Deno.env.get("SOLANA_WS_URL")!;
    const ws = new StandardWebSocketClient(endpoint);

    ws.on("open", () => {
      this.logger.log("Helius WebSocket is open");
    });

    ws.on("close", () => {
      this.logger.log("Helius WebSocket closed");
    });

    ws.on("error", () => {
      this.logger.error("Helius WebSocket error");
    });
    this.socket = ws;
  }

  subscribeToProgramLogs(
    programId: string,
    callback?: (notification: LogNotification) => void
  ) {
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [
        {
          mentions: [programId],
        },
        {
          commitment: "finalized",
        },
      ],
    };
    this.socket.send(JSON.stringify(request));

    const listenerId = this.socket.addListener(
      "message",
      (ev: MessageEvent<string>) => {
        const messageStr = ev.data;
        try {
          const data: WebSocketMessageData = JSON.parse(messageStr);

          if (!!callback && "method" in data && !data.params.result.value.err) {
            callback(data);
          }

          this.logger.log("Received:", data);
        } catch (e) {
          this.logger.error("Failed to parse JSON:", e);
        }
      }
    );

    return listenerId;
  }
}
