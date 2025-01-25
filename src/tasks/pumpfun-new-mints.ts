import { PumpFunWebSocket } from "../services/pumpfun/websocket.ts";

function main() {
  const pumpfunClient = new PumpFunWebSocket((message) => {
    if ("message" in message) {
      console.log("message:", message.message);
    }
    if ("txType" in message) {
      console.log("new mint:", message);
    }
  });

  pumpfunClient.socket.on("open", () => {
    pumpfunClient.subscribeNewToken();
  });
}

if (import.meta.main) {
  main();
}
