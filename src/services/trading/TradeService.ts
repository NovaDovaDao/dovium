import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { GasSpeed, TradeConfig, TradeParams } from '../../core/types/Trading.ts';
import { GasService } from '../../utils/gas/GasService.ts';

export class TradeService {
  private gasService: GasService;

  constructor(
    private connection: Connection,
    private wallet: PublicKey
  ) {
    this.gasService = new GasService(connection);
  }

  async executeTrade(params: TradeParams): Promise<string> {
    // Implementation
    return '';
  }
}
