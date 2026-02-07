export type ProviderName = "udemy" | "coursera";

export type EducationSubmitRequest = {
  wallet: string;
  provider: ProviderName;
  certificateUrlOrId: string;
};

export type FdcRequestStatus = "pending" | "accepted" | "rejected" | "verified" | "failed" | "timeout";

export type EducationStatusRecord = {
  requestId: string;
  status: FdcRequestStatus;
  wallet: string;
  provider: ProviderName;
  certificateUrlOrId: string;
  certHash?: string;
  attestationId?: string;
  txHash?: string;
  reason?: string;
  createdAt: number;
  updatedAt: number;
};

