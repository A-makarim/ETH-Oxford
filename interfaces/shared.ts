export type ProviderName = "udemy" | "coursera";

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
  token: string;
  matchedMonths: [string, string, string];
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

