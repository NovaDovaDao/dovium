// src/services/transaction/TokenTransactionBase.ts
//I dont think this file is needed
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Logger } from "jsr:@deno-library/logger";
import { TokenCalculator } from "./TokenCalculator.ts";
import { TokenPriceInfo, TokenTransactionResult } from "../utils/types.ts";

export abstract class TokenTransactionBase {
  protected readonly logger = new Logger();
  protected readonly calculator: TokenCalculator;

  constructor(
    protected readonly connection: Connection,
    protected readonly tokenCalculator: TokenCalculator
  ) {
    this.calculator = new TokenCalculator();
  }

  protected async validateTokenAccount(
    walletPublicKey: PublicKey,
    mintAddress: string
  ): Promise<void> {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        {
          programId: TOKEN_PROGRAM_ID,
          mint: new PublicKey(mintAddress)
        }
      );

      if (!accounts.value.length) {
        throw new Error(`No token account found for mint: ${mintAddress}`);
      }
    } catch (error) {
      this.logger.error("Error validating token account:", error);
      throw error;
    }
  }

  protected async prepareTokenTransaction(
    walletPublicKey: PublicKey,
    mintAddress: string,
    amount: bigint,
    price: TokenPriceInfo
  ): Promise<TokenTransactionResult> {
    try {
      await this.validateTokenAccount(walletPublicKey, mintAddress);

      const balance = await this.calculator.getTokenAccountBalance(
        this.connection,
        walletPublicKey,
        mintAddress
      );

      this.calculator.validateAmount(amount, balance.rawAmount);

      return {
        success: true,
        amount: {
          raw: amount,
          ui: this.calculator.convertToUi(amount, balance.decimals)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}