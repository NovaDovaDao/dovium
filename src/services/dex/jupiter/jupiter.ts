// src/services/dex/jupiter/jupiter.ts

import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  Instruction,
  QuoteResponse,
  SwapInstructionsResponse,
  SwapInstructionsResponseSuccess,
} from "../../../core/types/JupiterTypes.ts";
import { Logger } from "jsr:@deno-library/logger";
import { Buffer } from "node:buffer";

export class JupiterService {
  private logger = new Logger();
  private readonly JUPITER_V6_ENDPOINT = "https://quote-api.jup.ag/v6";

  constructor(private connection: Connection) {}

  async getSwapInstructions(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    userPublicKey: PublicKey,
    slippageBps: number = 50
  ): Promise<TransactionInstruction[]> {
    try {
      const quoteResponse = await this.getQuote(
        inputMint.toString(),
        outputMint.toString(),
        amount,
        slippageBps
      );

      this.logger.info("Got Jupiter quote:", quoteResponse);

      const swapResponse = await fetch(
        `${this.JUPITER_V6_ENDPOINT}/swap-instructions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: userPublicKey.toString(),
            wrapUnwrapSOL: true,
            useSharedAccounts: false,
            asLegacyTransaction: true,
            computeUnitPriceMicroLamports: 50000,
            dynamicComputeUnitLimit: true,
          }),
        }
      );

      if (!swapResponse.ok) {
        throw new Error(`Swap request failed: ${swapResponse.statusText}`);
      }

      const swapData: SwapInstructionsResponse = await swapResponse.json();

      if ("error" in swapData) {
        throw new Error(`Swap API error: ${swapData.error}`);
      }

      this.logger.info("Got swap instructions data:", swapData);

      const instructions = this.deserializeInstructions(swapData);

      if (!instructions || instructions.length === 0) {
        throw new Error("No valid instructions received");
      }

      return instructions;
    } catch (error) {
      this.logger.error("Failed to get swap instructions:", error);
      throw error;
    }
  }

  private async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number
  ): Promise<any> {
    try {
      const amountLamports = Math.floor(amount * 1e9);
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amountLamports.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: "false",
        asLegacyTransaction: "true",
      });

      const response = await fetch(
        `${this.JUPITER_V6_ENDPOINT}/quote?${params}`
      );

      if (!response.ok) {
        throw new Error(`Quote request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Quote API error: ${data.error}`);
      }

      return data;
    } catch (error) {
      this.logger.error("Failed to get quote:", error);
      throw error;
    }
  }

  private deserializeInstructions(
    swapData: SwapInstructionsResponseSuccess
  ): TransactionInstruction[] {
    try {
      const duplicateInstructions: TransactionInstruction[] = [];

      if (swapData.computeBudgetInstructions) {
        swapData.computeBudgetInstructions.forEach((ix) => {
          duplicateInstructions.push(this.deserializeSingleInstruction(ix));
        });
      }

      if (swapData.setupInstructions) {
        swapData.setupInstructions.forEach((ix) => {
          duplicateInstructions.push(this.deserializeSingleInstruction(ix));
        });
      }

      if (swapData.swapInstruction) {
        duplicateInstructions.push(
          this.deserializeSingleInstruction(swapData.swapInstruction)
        );
      }

      if (swapData.cleanupInstruction) {
        duplicateInstructions.push(
          this.deserializeSingleInstruction(swapData.cleanupInstruction)
        );
      }

      return duplicateInstructions;
    } catch (error) {
      this.logger.error("Error deserializing instructions:", error);
      throw new Error(
        `Failed to deserialize instructions: ${(error as Error).message}`
      );
    }
  }

  private deserializeSingleInstruction(
    ix: Instruction
  ): TransactionInstruction {
    if (!ix || !ix.programId || !ix.accounts || !ix.data) {
      throw new Error("Invalid instruction format");
    }

    return new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });
  }
}
