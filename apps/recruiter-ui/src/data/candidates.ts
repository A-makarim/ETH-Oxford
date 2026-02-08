export type CandidateCertificate = {
  id: string;
  title: string;
  provider: "udemy" | "coursera" | "datacamp" | "edx";
  certificateUrlOrId: string;
};

export type CandidateEmployment = {
  id: string;
  company: string;
  role: string;
  employerWallet: string;
  token: string;
};

export type CandidateCV = {
  id: string;
  name: string;
  roleApplied: string;
  wallet: string;
  summary: string;
  requiredSkillHash: string;
  minExperienceMonths: number;
  salaryCommitment: string;
  educationExpiryAt: number;
  employmentExperienceMonths: number;
  educationSkillHash: string;
  certificates: CandidateCertificate[];
  employments: CandidateEmployment[];
};

export const candidateCvs: CandidateCV[] = [
  {
    id: "candidate-1",
    name: "Asad Malik",
    roleApplied: "ZK Verification Engineer",
    wallet: "0xC4a6729B77Db779CB45f007742C8A86761c8bf00",
    summary: "Builds privacy-preserving verification pipelines across Flare and Plasma.",
    requiredSkillHash: "77110099",
    minExperienceMonths: 12,
    salaryCommitment: "123456789",
    educationExpiryAt: 1893456000,
    employmentExperienceMonths: 12,
    educationSkillHash: "77110099",
    certificates: [
      {
        id: "cert-edx-cs50",
        title: "HarvardX CS50x Certificate",
        provider: "edx",
        certificateUrlOrId: "https://courses.edx.org/certificates/0fd386a027b24db18cb3a29682073e7a"
      }
    ],
    employments: [
      {
        id: "emp-sovereign",
        company: "Sovereign Labs",
        role: "Protocol Engineer",
        employerWallet: "0x7B9f4f291755cE74654659bcA2eFa3c7cf57D7f1",
        token: "USDT0"
      }
    ]
  },
  {
    id: "candidate-2",
    name: "Demo Applicant",
    roleApplied: "Frontend Engineer",
    wallet: "0x0000000000000000000000000000000000000001",
    summary: "Failure-path applicant with no valid education attestation on-chain.",
    requiredSkillHash: "77110099",
    minExperienceMonths: 12,
    salaryCommitment: "123456789",
    educationExpiryAt: 1893456000,
    employmentExperienceMonths: 12,
    educationSkillHash: "77110099",
    certificates: [
      {
        id: "cert-demo",
        title: "Coursera Certificate (Expected Fail)",
        provider: "coursera",
        certificateUrlOrId: "https://www.coursera.org/account/accomplishments/verify/INVALIDDEMO123"
      }
    ],
    employments: [
      {
        id: "emp-demo",
        company: "Demo Corp",
        role: "Engineer",
        employerWallet: "0x0000000000000000000000000000000000000002",
        token: "USDT0"
      }
    ]
  }
];
