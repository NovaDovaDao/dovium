import { config } from "../config.ts";
import { HeliusWebSocketClient } from "../services/helius/websocket.ts";

function main() {
  const programId = config.volume_strategy.pairs[0].quote;

  if (!programId) throw new Error("Program ID is required");

  const heliusWsClient = new HeliusWebSocketClient();
  heliusWsClient.socket.on("open", () => {
    heliusWsClient.subscribeToProgramLogs(programId, console.log);
  });
}

if (import.meta.main) {
  main();
}
