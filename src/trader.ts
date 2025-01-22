import SolanaService from "./services/solana/SolanaService.ts"; // Adjust path if needed
import StrategyByVolume from "./services/strategy/StrategyByVolume.ts";

function main() {
  // Get environment variables or use default values
  const rpcUrl =
    Deno.env.get("SOLANA_RPC_URL") || "https://api.devnet.solana.com";
  const privateKey = Deno.env.get("SOLANA_PRIVATE_KEY");

  if (!privateKey) {
    console.error(
      "Error: SOLANA_PRIVATE_KEY environment variable is required."
    );
    Deno.exit(1); // Exit with error code
  }

  const solanaService = new SolanaService(rpcUrl);

  //   function setupKeyboardControls(): void {
  // // Configure stdin for raw mode to capture keystrokes
  // readline.emitKeypressEvents(process.stdin);
  // if (process.stdin.isTTY) {
  //   process.stdin.setRawMode(true);
  // }
  // process.stdin.on('keypress', async (str, key) => {
  //   if (key.name === 'x') {
  //     console.log('\n[Control] Stopping trading and closing all positions...');
  //     this.allowNewTrades = false;
  //     await this.closeAllPositions();
  //     // Report final balance
  //     const finalBalanceMessage = `🏦 Final Simulation Balance: ${this.simulatedBalance.toFixed(4)} SOL`;
  //     console.log(finalBalanceMessage);
  //     await this.discord.notifyTrade(finalBalanceMessage);
  //   }
  //   // Optional: Add ctrl+c handling for complete shutdown
  //   if (key.ctrl && key.name === 'c') {
  //     console.log('\n[Control] Stopping bot...');
  //     await this.stop();
  //     process.exit();
  //   }
  // });
  // console.log("\nKeyboard Controls:");
  // console.log("- Press 'x' to stop trading and close all positions");
  // console.log("- Press 'ctrl+c' to stop the bot completely\n");
  //   }

  try {
    solanaService.initializeWallet(privateKey);
    new StrategyByVolume(solanaService);
  } catch (error) {
    console.error("Error:", error);
    Deno.exit(1); // Exit with error code if there's an error during execution.
  }
}

if (import.meta.main) {
  main();
}
