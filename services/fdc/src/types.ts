export type ProviderName = "udemy" | "coursera" | "datacamp" | "edx";

export type EducationSubmitRequest = {
  wallet: string;
  provider: ProviderName;
  certificateUrlOrId: string;
};

export type FdcRequestStatus = "pending" | "accepted" | "rejected" | "verified" | "failed" | "timeout";

export type Web2JsonRequestBody = {
  url: string;
  httpMethod: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: string;
  queryParams: string;
  body: string;
  postProcessJq: string;
  abiSignature: string;
};

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
  verifierStatus?: string;
  verifierRequestBytes?: string;
  fdcVotingRoundId?: number;
  fdcRequestTxHash?: string;
  pollAttempts: number;
  nextPollAt: number;
  issuedAt?: number;
};

export type NormalizedCertificate = {
  wallet: string;
  provider: ProviderName;
  source: string;
  sourceUrl: string;
  certificateId: string;
  certHash: string;
  canonicalCertificateJson: string;
  web2JsonRequestBody: Web2JsonRequestBody;
};

export type QueueWeb2JsonVerificationParams = {
  normalized: NormalizedCertificate;
};

export type QueueWeb2JsonVerificationResult = {
  accepted: boolean;
  reason?: string;
  verifierStatus?: string;
  verifierRequestBytes?: string;
  fdcVotingRoundId?: number;
  fdcRequestTxHash?: string;
};

export type PollWeb2JsonRequestParams = {
  verifierRequestBytes: string;
  fdcVotingRoundId: number;
};

export type PollWeb2JsonRequestResult =
  | {
      state: "pending";
      reason?: string;
    }
  | {
      state: "failed";
      reason: string;
    }
  | {
      state: "verified";
      issuedAt: number;
      resolvedVotingRoundId?: number;
    };

export type WriteAttestationParams = {
  attestationId: string;
  wallet: string;
  certHash: string;
  provider: ProviderName;
  issuedAt: number;
};

export type WriteAttestationResult = {
  txHash: string | null;
  alreadyExists: boolean;
};
