import { HeliusWebSocketClient } from "../services/helius/websocket.ts";

function main() {
  let programId: string | undefined | null = Deno.env.get("TOKEN_PAIR_QUOTE");

  // If there isn't any name or color, then prompt.
  if (!programId) {
    programId = prompt("What program (id) do you want to listen to?");
  }

  if (!programId) throw new Error("Program ID is required");

  const heliusWsClient = new HeliusWebSocketClient();
  heliusWsClient.socket.on("open", () => {
    heliusWsClient.subscribeToProgramLogs(programId, console.log);
  });
}

if (import.meta.main) {
  main();
}
