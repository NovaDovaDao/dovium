// src/services/transaction/GasTransactionService.ts
import { SolanaGasService } from '../solana/gas.ts';
import { Connection } from '@solana/web3.js';
import { DoviumLogger } from '../../core/logger.ts';
import { GasSpeed } from '../../core/types/Trading.ts';
import { config } from '../../config.ts';

export class GasTransactionService {
  private readonly logger = new DoviumLogger(GasTransactionService.name);
  private readonly gasService: SolanaGasService;

  constructor(connection: Connection) {
    this.gasService = new SolanaGasService(connection);
    this.logger.log('Initialized GasTransactionService');
  }

  async getTransactionFee(speed: GasSpeed = config.gas.defaultSpeed): Promise<number> {
    try {
      return await this.gasService.getGasFee(speed);
    } catch (error) {
      this.logger.error('Error getting transaction fee:', error);
      return config.gas.speeds[speed].maxLamports; // Fallback to configured max lamports
    }
  }

  getPriorityFeeConfig(speed: GasSpeed = config.gas.defaultSpeed) {
    const speedConfig = config.gas.speeds[speed];

    return {
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: speedConfig.maxLamports,
          priorityLevel: speedConfig.priorityLevel,
        },
      },
    };
  }

  getComputeUnitConfig(speed: GasSpeed = config.gas.defaultSpeed) {
    const speedConfig = config.gas.speeds[speed];

    return {
      computeUnits: speedConfig.computeUnits,
      microLamports: speedConfig.microLamports,
    };
  }

  async validateGasSettings(speed: GasSpeed = config.gas.defaultSpeed): Promise<boolean> {
    try {
      const speedConfig = config.gas.speeds[speed];
      if (!speedConfig) {
        this.logger.error(`Invalid gas speed configuration: ${speed}`);
        return false;
      }

      // Validate required properties
      const requiredProps = ['maxLamports', 'priorityLevel', 'computeUnits', 'microLamports'];
      for (const prop of requiredProps) {
        if (!(prop in speedConfig)) {
          this.logger.error(`Missing required gas config property: ${prop} for speed ${speed}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Error validating gas settings:', error);
      return false;
    }
  }

  async getCurrentGasEstimates(): Promise<Record<GasSpeed, number>> {
    const estimates: Partial<Record<GasSpeed, number>> = {};
    const speeds: GasSpeed[] = ['fast', 'turbo', 'ultra'];

    for (const speed of speeds) {
      try {
        estimates[speed] = await this.getTransactionFee(speed);
      } catch (error) {
        this.logger.error(`Error getting gas estimate for ${speed}:`, error);
        estimates[speed] = config.gas.speeds[speed].maxLamports;
      }
    }

    return estimates as Record<GasSpeed, number>;
  }
}