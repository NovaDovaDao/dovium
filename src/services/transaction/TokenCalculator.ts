// src/services/utils/TokenCalculator.ts
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Logger } from "jsr:@deno-library/logger";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { Connection } from "@solana/web3.js";

interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number;
}

interface ParsedTokenAccount {
  pubkey: PublicKey;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          tokenAmount: TokenAmount;
        };
        type: string;
      };
    };
  };
}

export interface TokenBalance {
  rawAmount: bigint;
  decimals: number;
  uiAmount: number;
}

export class TokenCalculator {
  private logger = new Logger();

  constructor() {
    this.logger.info("Initialized TokenCalculator");
  }

  convertToRaw(amount: number, decimals: number): bigint {
    try {
      return BigInt(Math.floor(amount * Math.pow(10, decimals)));
    } catch (error) {
      this.logger.error("Error converting to raw amount:", error);
      throw new Error("Failed to convert to raw amount");
    }
  }

  convertToUi(rawAmount: bigint, decimals: number): number {
    try {
      return Number(rawAmount) / Math.pow(10, decimals);
    } catch (error) {
      this.logger.error("Error converting to UI amount:", error);
      throw new Error("Failed to convert to UI amount");
    }
  }

  validateTokenAccount(account: ParsedTokenAccount): boolean {
    return (
      account.account?.data?.parsed?.info?.tokenAmount &&
      typeof account.account.data.parsed.info.tokenAmount.amount === "string" &&
      typeof account.account.data.parsed.info.tokenAmount.decimals === "number"
    );
  }

  calculateTotalBalance(accounts: ParsedTokenAccount[]): TokenBalance {
    try {
      let totalRawAmount = 0n;
      let decimals = 0;

      for (const account of accounts) {
        if (!this.validateTokenAccount(account)) {
          this.logger.warn("Invalid token account data:", account);
          continue;
        }

        const { amount, decimals: tokenDecimals } = account.account.data.parsed.info.tokenAmount;
        totalRawAmount += BigInt(amount);
        decimals = tokenDecimals; // All accounts for same token should have same decimals
      }

      const uiAmount = this.convertToUi(totalRawAmount, decimals);

      return {
        rawAmount: totalRawAmount,
        decimals,
        uiAmount
      };
    } catch (error) {
      this.logger.error("Error calculating total balance:", error);
      throw new Error("Failed to calculate total balance");
    }
  }

  async getTokenAccountBalance(
    connection: Connection,
    walletPublicKey: PublicKey,
    mintAddress: string
  ): Promise<TokenBalance> {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        {
          programId: TOKEN_PROGRAM_ID,
          mint: new PublicKey(mintAddress)
        }
      );

      if (!tokenAccounts.value.length) {
        throw new Error(`No token accounts found for mint: ${mintAddress}`);
      }

      return this.calculateTotalBalance(tokenAccounts.value as ParsedTokenAccount[]);
    } catch (error) {
      this.logger.error("Error getting token account balance:", error);
      throw error;
    }
  }

  validateAmount(amount: bigint, available: bigint): void {
    if (amount <= 0n) {
      throw new Error("Amount must be greater than 0");
    }
    if (amount > available) {
      throw new Error(
        `Insufficient balance. Required: ${amount.toString()}, ` +
        `Available: ${available.toString()}`
      );
    }
  }

  calculateOptimalSellAmount(
    balance: TokenBalance,
    targetSolAmount: BigDenary,
    currentPrice: BigDenary
  ): bigint {
    try {
      // Calculate how many tokens needed to get target SOL amount
      const requiredTokens = targetSolAmount.div(currentPrice);
      const rawRequiredAmount = this.convertToRaw(
        Number(requiredTokens.toString()),
        balance.decimals
      );

      // Validate against available balance
      this.validateAmount(rawRequiredAmount, balance.rawAmount);

      return rawRequiredAmount;
    } catch (error) {
      this.logger.error("Error calculating optimal sell amount:", error);
      throw error;
    }
  }
}