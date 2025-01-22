import { Connection } from "@solana/web3.js";
import { GasSpeed } from "../../core/types/Trading.ts";

export class GasService {
  private readonly GAS_MULTIPLIERS = {
    fast: 1.2,
    turbo: 1.5,
    ultra: 2.0,
  };

  constructor(private connection: Connection) {}

  async getGasFee(gasSpeed: GasSpeed): Promise<number> {
    const baseFee = await this.getBaseFee();
    return baseFee * this.GAS_MULTIPLIERS[gasSpeed];
  }

  private async getBaseFee(): Promise<number> {
    try {
      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();

      if (recentFees.length === 0) {
        const { feeCalculator } = await this.connection.getRecentBlockhash();
        return feeCalculator.lamportsPerSignature;
      }

      // Calculate median fee from recent transactions
      const sortedFees = recentFees
        .map((fee) => fee.prioritizationFee)
        .sort((a, b) => a - b);

      const medianIndex = Math.floor(sortedFees.length / 2);
      const medianFee = sortedFees[medianIndex];

      // Get minimum rent exemption as baseline
      const minRent = await this.connection.getMinimumBalanceForRentExemption(
        0
      );

      // Return the higher of median fee or minimum rent
      return Math.max(medianFee, minRent);
    } catch (error) {
      // Fallback to minimum lamports per signature if fee fetch fails
      return 5000; // Default minimum fee in lamports
    }
  }
}
