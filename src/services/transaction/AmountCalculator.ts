// src/services/utils/AmountCalculator.ts

import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";
import { Logger } from "jsr:@deno-library/logger";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaWallet } from "../solana/wallet.ts";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export class AmountCalculator {
 private logger = new Logger();

 constructor(private readonly wallet: SolanaWallet) {}

 convertToLamports(amount: string | number): string {
   return new BigDenary(amount)
     .multipliedBy(LAMPORTS_PER_SOL)
     .toFixed(0); // Remove decimals
 }

 convertFromLamports(lamports: string | number): string {
   return new BigDenary(lamports)
     .div(LAMPORTS_PER_SOL)
     .toString();
 }

 async calculateBuyAmount(
   amount: string,
   slippageTolerance = 0.005 // 0.5% default slippage tolerance
 ): Promise<{ rawAmount: bigint; formattedAmount: string }> {
   try {
     // Convert to lamports
     const amountInLamports = this.convertToLamports(amount);
     
     // Add slippage buffer
     const withSlippage = new BigDenary(amountInLamports)
       .multipliedBy(1 + slippageTolerance)
       .toFixed(0);

     const formattedAmount = this.convertFromLamports(withSlippage);

     this.logger.info(
       `Buy amount: ${amount} SOL → ${withSlippage} lamports ` +
       `(with ${slippageTolerance * 100}% slippage)`
     );

     return {
       rawAmount: BigInt(withSlippage),
       formattedAmount
     };
   } catch (error) {
     this.logger.error("Error calculating buy amount:", error);
     throw error;
   }
 }

 async calculateSellAmount(
   tokenMint: string,
   tokenDecimals: number,
   originalBuyAmount: BigDenary
 ): Promise<{ rawAmount: bigint; formattedAmount: string }> {
   try {
     // Get token accounts
     const tokenAccounts = await this.wallet.connection.getParsedTokenAccountsByOwner(
       new PublicKey(this.wallet.getPublicKey()!),
       {
         programId: TOKEN_PROGRAM_ID,
         mint: new PublicKey(tokenMint)
       }
     );

     // Calculate total balance
     const totalBalance = tokenAccounts.value.reduce((acc, account) => {
       const tokenAmount = account.account.data.parsed.info.tokenAmount;
       return acc + BigInt(tokenAmount.amount);
     }, 0n);

     // Convert original buy amount to lamports for comparison
     const originalBuyLamports = this.convertToLamports(originalBuyAmount.toString());

     // Use either total balance or original buy amount, whichever is smaller
     const baseAmount = BigInt(Math.min(
       Number(totalBalance), 
       Number(originalBuyLamports)
     ));

     // Use 95% of amount to account for price impact and fees
     const sellAmount = (baseAmount * 95n) / 100n;
     const formattedAmount = this.convertFromLamports(sellAmount.toString());

     this.logger.info(
       `Selling ${formattedAmount} tokens from ` +
       `total balance of ${this.convertFromLamports(totalBalance.toString())}`
     );

     return {
       rawAmount: sellAmount,
       formattedAmount
     };
   } catch (error) {
     this.logger.error("Error calculating sell amount:", error);
     throw error;
   }
 }

 async validateBalance(
   amount: bigint,
   mint: string,
   isBuy: boolean,
   slippageBuffer = 0.01 // 1% additional buffer for fees and slippage
 ): Promise<void> {
   if (isBuy) {
     const solBalance = await this.wallet.getSolBalance();
     if (!solBalance) throw new Error("Could not fetch SOL balance");

     const requiredBalance = new BigDenary(amount.toString())
       .multipliedBy(1 + slippageBuffer); // Add slippage buffer

     if (solBalance.lt(requiredBalance)) {
       throw new Error(
         `Insufficient SOL balance. Required: ${this.convertFromLamports(requiredBalance.toString())} SOL, ` +
         `Available: ${this.convertFromLamports(solBalance.toString())} SOL`
       );
     }
   } else {
     const tokenAccounts = await this.wallet.connection.getParsedTokenAccountsByOwner(
       new PublicKey(this.wallet.getPublicKey()!),
       {
         programId: TOKEN_PROGRAM_ID,
         mint: new PublicKey(mint)
       }
     );

     const totalBalance = tokenAccounts.value.reduce((acc, account) => {
       const tokenAmount = account.account.data.parsed.info.tokenAmount;
       return acc + BigInt(tokenAmount.amount);
     }, 0n);

     if (totalBalance < amount) {
       throw new Error(
         `Insufficient token balance. Required: ${amount.toString()}, ` +
         `Available: ${totalBalance.toString()}`
       );
     }
   }
 }

 async getMaxBuyAmount(
   safetyFactor = 0.95 // Use 95% of balance by default
 ): Promise<{ rawAmount: bigint; formattedAmount: string }> {
   const solBalance = await this.wallet.getSolBalance();
   if (!solBalance) throw new Error("Could not fetch SOL balance");

   // Reserve some SOL for fees
   const reserveForFees = new BigDenary("0.01"); // 0.01 SOL
   const availableBalance = solBalance.minus(reserveForFees);

   if (availableBalance.lte(0)) {
     throw new Error("Insufficient balance after reserving for fees");
   }

   // Apply safety factor
   const maxAmount = availableBalance
     .multipliedBy(safetyFactor)
     .toFixed(0);

   return {
     rawAmount: BigInt(maxAmount),
     formattedAmount: this.convertFromLamports(maxAmount)
   };
 }

 async getMaxSellAmount(
   tokenMint: string,
   safetyFactor = 0.95
 ): Promise<{ rawAmount: bigint; formattedAmount: string }> {
   const tokenAccounts = await this.wallet.connection.getParsedTokenAccountsByOwner(
     new PublicKey(this.wallet.getPublicKey()!),
     {
       programId: TOKEN_PROGRAM_ID,
       mint: new PublicKey(tokenMint)
     }
   );

   const totalBalance = tokenAccounts.value.reduce((acc, account) => {
     const tokenAmount = account.account.data.parsed.info.tokenAmount;
     return acc + BigInt(tokenAmount.amount);
   }, 0n);

   const maxAmount = (totalBalance * BigInt(Math.floor(safetyFactor * 100))) / 100n;

   return {
     rawAmount: maxAmount,
     formattedAmount: this.convertFromLamports(maxAmount.toString())
   };
 }
}