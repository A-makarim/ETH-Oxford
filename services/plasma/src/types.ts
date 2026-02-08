export type TransferEvent = {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  from: string;
  to: string;
  token: string;
  amount: string;
  timestamp: number;
};

export type EmploymentResult = {
  wallet: string;
  employer: string | null;
  monthsMatched: string[];
  paymentCount: number;
  qualifies: boolean;
  factCommitment: string;
};

export type TransferSource = "rpc" | "fallback";

export type TransferSourceResult = {
  transfers: TransferEvent[];
  dataSource: TransferSource;
  reason?: string;
};
