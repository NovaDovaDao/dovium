// src/services/utils/AmountCalculator.ts

import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaWallet } from "../solana/wallet.ts";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DoviumLogger } from "../../core/logger.ts";

export class AmountCalculator {
  private logger = new DoviumLogger(AmountCalculator.name);

  constructor(private readonly wallet: SolanaWallet) {}

  convertToLamports(amount: string | number): string {
    return new BigDenary(amount).multipliedBy(LAMPORTS_PER_SOL).toFixed(0); // Remove decimals
  }

  convertFromLamports(lamports: string | number): string {
    return new BigDenary(lamports).div(LAMPORTS_PER_SOL).toString();
  }

  calculateBuyAmount(
    amount: string,
    slippageTolerance = 0.005 // 0.5% default slippage tolerance
  ): { rawAmount: string; formattedAmount: string } {
    try {
      // Convert to lamports
      const amountInLamports = this.convertToLamports(amount);

      // Add slippage buffer
      const withSlippage = new BigDenary(amountInLamports)
        .multipliedBy(1 + slippageTolerance)
        .toFixed(0);

      const formattedAmount = this.convertFromLamports(withSlippage);

      this.logger.log(
        `Buy amount: ${amount} SOL → ${withSlippage} lamports ` +
          `(with ${slippageTolerance * 100}% slippage)`
      );

      return {
        rawAmount: withSlippage,
        formattedAmount,
      };
    } catch (error) {
      this.logger.error("Error calculating buy amount:", error);
      throw error;
    }
  }

  calculateTokenAmount(
    solAmount: string,
    tokenDecimals: number,
    latestTokenPrice: string
  ): string {
    try {
      const result = new BigDenary(solAmount)
        .multipliedBy(latestTokenPrice)
        .multipliedBy(LAMPORTS_PER_SOL)
        .toFixed(tokenDecimals);

      this.logger.log(`Selling ${result} tokens from `);

      return result;
    } catch (error) {
      this.logger.error("Error calculating sell amount:", error);
      throw error;
    }
  }

  async validateBalance(
    amount: string,
    mint: string,
    isBuy: boolean,
    slippageBuffer = 0.01 // 1% additional buffer for fees and slippage
  ): Promise<void> {
    if (isBuy) {
      const solBalance = await this.wallet.getSolBalance();
      if (!solBalance) throw new Error("Could not fetch SOL balance");

      const requiredBalance = new BigDenary(amount.toString()).multipliedBy(
        1 + slippageBuffer
      ); // Add slippage buffer

      if (solBalance.lt(requiredBalance)) {
        throw new Error(
          `Insufficient SOL balance. Required: ${this.convertFromLamports(
            requiredBalance.toString()
          )} SOL, ` +
            `Available: ${this.convertFromLamports(solBalance.toString())} SOL`
        );
      }
    } else {
      const tokenAccounts =
        await this.wallet.connection.getParsedTokenAccountsByOwner(
          new PublicKey(this.wallet.getPublicKey()!),
          {
            programId: TOKEN_PROGRAM_ID,
            mint: new PublicKey(mint),
          }
        );

      const totalBalance = tokenAccounts.value.reduce((acc, account) => {
        const tokenAmount = account.account.data.parsed.log.tokenAmount;
        return acc.plus(tokenAmount.amount);
      }, new BigDenary(0));

      if (totalBalance.lessThan(amount)) {
        throw new Error(
          `Insufficient token balance. Required: ${amount.toString()}, ` +
            `Available: ${totalBalance.toString()}`
        );
      }
    }
  }

  async getMaxBuyAmount(
    safetyFactor = 0.95 // Use 95% of balance by default
  ): Promise<{ rawAmount: string; formattedAmount: string }> {
    const solBalance = await this.wallet.getSolBalance();
    if (!solBalance) throw new Error("Could not fetch SOL balance");

    // Reserve some SOL for fees
    const reserveForFees = new BigDenary("0.01"); // 0.01 SOL
    const availableBalance = solBalance.minus(reserveForFees);

    if (availableBalance.lte(0)) {
      throw new Error("Insufficient balance after reserving for fees");
    }

    // Apply safety factor
    const maxAmount = availableBalance.multipliedBy(safetyFactor).toFixed(0);

    return {
      rawAmount: maxAmount,
      formattedAmount: this.convertFromLamports(maxAmount),
    };
  }

  async getMaxSellAmount(
    tokenMint: string,
    safetyFactor = 0.95
  ): Promise<{ rawAmount: string; formattedAmount: string }> {
    const tokenAccounts =
      await this.wallet.connection.getParsedTokenAccountsByOwner(
        new PublicKey(this.wallet.getPublicKey()!),
        {
          programId: TOKEN_PROGRAM_ID,
          mint: new PublicKey(tokenMint),
        }
      );

    const totalBalance = tokenAccounts.value.reduce((acc, account) => {
      const tokenAmount = account.account.data.parsed.log.tokenAmount;
      return acc.plus(tokenAmount.amount);
    }, new BigDenary(0));

    const maxAmount = totalBalance
      .multipliedBy(Math.floor(safetyFactor * 100))
      .dividedBy(100n)
      .toFixed(0);

    return {
      rawAmount: maxAmount,
      formattedAmount: this.convertFromLamports(maxAmount.toString()),
    };
  }
}
