export type TransferEvent = {
  txHash: string;
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

