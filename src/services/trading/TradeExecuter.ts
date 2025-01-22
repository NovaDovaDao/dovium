// src/services/trading/TradeExecuter.ts

import { 
    Connection, 
    PublicKey, 
    TransactionMessage, 
    TransactionInstruction,
    Keypair,
    Commitment,
    TransactionSignature,
    VersionedTransaction,
    ComputeBudgetProgram,
  } from '@solana/web3.js';
  import { GasSpeed, TradeParams } from '../../core/types/Trading.ts';
  import { JupiterService } from '../dex/jupiter/jupiter.ts';
  import { Logger } from "jsr:@deno-library/logger";
  
  export class TradeExecutor {
    private logger = new Logger();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 2000;
    private readonly CONFIRMATION_COMMITMENT: Commitment = 'confirmed';
  
    constructor(
      private connection: Connection,
      private wallet: Keypair,
      private jupiterService: JupiterService = new JupiterService(connection)
    ) {}
  
    async executeSell(params: TradeParams): Promise<string> {
      const { inputToken, outputToken, amount, config } = params;
  
      try {
        const instructions = await this.jupiterService.getSwapInstructions(
          new PublicKey(inputToken),
          new PublicKey(outputToken),
          amount,
          this.wallet.publicKey,
          50
        );
  
        if (!instructions || instructions.length === 0) {
          throw new Error('No instructions received from Jupiter API');
        }
  
        return await this.executeTransaction(instructions);
      } catch (error) {
        this.logger.error('Sell execution failed:', error);
        throw new Error(`Sell execution failed: ${error.message}`);
      }
    }

private async executeTransaction(
  instructions: TransactionInstruction[],
  attempt: number = 1
): Promise<string> {
  try {
    // Get latest blockhash with confirmation
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
    
    const transaction = new VersionedTransaction(new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message());

    // Sign transaction
    transaction.sign([this.wallet]);
    
    // Send with higher priority and skipPreflight
    const rawTransaction = transaction.serialize();
    const signature = await this.connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 3,
      preflightCommitment: 'processed',
    });

    this.logger.info(`Transaction sent with signature: ${signature}`);

    // Wait for confirmation with a reasonable timeout
    const confirmation = await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'processed' // Use 'processed' instead of 'confirmed' for faster confirmation
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
    }

    return signature;

  } catch (error) {
    this.logger.error(`Transaction attempt ${attempt} failed:`, error);
    
    if (this.shouldRetry(error) && attempt < this.MAX_RETRIES) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      this.logger.info(`Retrying transaction in ${delayMs}ms (attempt ${attempt + 1} of ${this.MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return this.executeTransaction(instructions, attempt + 1);
    }
    throw error;
  }
}

// Add compute budget instructions helper
private addComputeBudgetInstructions(instructions: TransactionInstruction[]): void {
  // Add higher compute budget
  instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 })
  );
}

async executeBuy(params: TradeParams): Promise<string> {
  try {
    let instructions = await this.jupiterService.getSwapInstructions(
      new PublicKey(params.inputToken),
      new PublicKey(params.outputToken),
      params.amount,
      this.wallet.publicKey,
      Math.floor(params.config.slippage * 100) // Convert to basis points
    );

    this.addComputeBudgetInstructions(instructions);
    return await this.executeTransaction(instructions);
  } catch (error) {
    this.logger.error('Buy execution failed:', error);
    throw error;
  }
}
  
    private shouldRetry(error: any): boolean {
      const errorMessage = error.message?.toLowerCase() || '';
      return (
        errorMessage.includes('blockhash not found') ||
        errorMessage.includes('block height exceeded') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('rate limit')
      );
    }
  }