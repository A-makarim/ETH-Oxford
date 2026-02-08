export type ProviderName = "udemy" | "coursera" | "datacamp" | "edx";

export type EducationFact = {
  wallet: string;
  provider: ProviderName;
  certHash: string;
  fdcRequestId: string;
  attestationId: string;
  timestamp: number;
};

export type EmploymentFact = {
  wallet: string;
  employer: string;
  token: string | null;
  matchedMonths: [string, string, string];
  monthTransferCounts: [number, number, number];
  transferCount: number;
  qualifies: boolean;
};

export type CVPublicSignals = {
  requiredSkillHash: string;
  minExperienceMonths: number;
  educationCommitment: string;
  employmentCommitment: string;
  result: 0 | 1;
};
