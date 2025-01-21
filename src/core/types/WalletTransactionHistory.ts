interface BalanceChange {
  amount: number;
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  logoURI: string;
}

interface ContractLabel {
  address: string;
  name: string;
  metadata: {
    icon: string;
  };
}

interface SolanaTransaction {
  txHash: string;
  blockNumber: number;
  blockTime: string; // Consider using Date instead
  status: boolean;
  from: string;
  to: string;
  fee: number;
  mainAction: string;
  balanceChange: BalanceChange[];
  contractLabel: ContractLabel;
}

export interface WalletTransactionHistoryResponse {
  success: boolean;
  data: {
    solana: SolanaTransaction[];
  };
}

export interface WalletTransactionHistoryParams {
  wallet: string;
  limit?: number;
  before?: string;
}
