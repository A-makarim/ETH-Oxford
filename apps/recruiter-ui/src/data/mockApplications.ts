export const applications = [
  {
    id: "app-01",
    name: "Ariana Noor",
    subtitle: "Applied for Research Engineer",
    cv: [
      {
        id: "cv-edu-oxford",
        title: "MSc Machine Learning, University of Oxford",
        detail: "Distinction, 2024. Thesis on privacy-preserving verification.",
        tag: "Education",
      },
      {
        id: "cv-exp-eth",
        title: "ETH Oxford Lab - Research Engineer",
        detail: "Built ZK-based credential workflows for academic verification.",
        tag: "Experience",
      },
      {
        id: "cv-exp-flare",
        title: "Flare Data Connector - Integrations Lead",
        detail: "Designed Web2-to-chain attestation pipelines.",
        tag: "Experience",
      },
      {
        id: "cv-cert-zk",
        title: "ZK Circuits Specialist",
        detail: "Groth16 prover pipelines, circuit audits, and optimizations.",
        tag: "Certification",
      },
      {
        id: "cv-edu-coursera",
        title: "Coursera Verified: Cryptography I",
        detail: "Credential verified via Flare FDC attestation.",
        tag: "Education",
      },
      {
        id: "cv-exp-plasma",
        title: "Plasma Protocol - Protocol Engineer",
        detail: "Built deterministic payment qualification rules.",
        tag: "Experience",
      },
    ],
  },
  {
    id: "app-02",
    name: "Kenji Takeda",
    subtitle: "Applied for Protocol Analyst",
    cv: [
      {
        id: "cv-edu-stanford",
        title: "BSc Computer Science, Stanford University",
        detail: "Systems, cryptography, and distributed networks.",
        tag: "Education",
      },
      {
        id: "cv-exp-bridge",
        title: "Bridge Core - Infrastructure Analyst",
        detail: "Compliance pipelines for cross-chain attestations.",
        tag: "Experience",
      },
      {
        id: "cv-exp-zk",
        title: "ZeroKnowledge Labs - Research Intern",
        detail: "Built circuit constraints for anonymized verifiers.",
        tag: "Experience",
      },
      {
        id: "cv-cert-sol",
        title: "Solidity Security Audits",
        detail: "Reviewed production contracts and access control logic.",
        tag: "Certification",
      },
    ],
  },
  {
    id: "app-03",
    name: "Lena Okafor",
    subtitle: "Applied for Frontend Engineer",
    cv: [
      {
        id: "cv-edu-imperial",
        title: "MSc Human-Computer Interaction, Imperial College",
        detail: "Visual systems for complex crypto data.",
        tag: "Education",
      },
      {
        id: "cv-exp-consensys",
        title: "Consensys - Product Designer",
        detail: "Designed wallet flows for enterprise onboarding.",
        tag: "Experience",
      },
      {
        id: "cv-exp-ui",
        title: "Evident UI - Senior Engineer",
        detail: "Built CV visualization dashboards for recruiters.",
        tag: "Experience",
      },
      {
        id: "cv-cert-ux",
        title: "Advanced UX Systems",
        detail: "Accessibility-first UI for sensitive data.",
        tag: "Certification",
      },
    ],
  },
];

export type CvLine = {
  id: string;
  title: string;
  detail: string;
  tag: string;
};

export type Application = {
  id: string;
  name: string;
  subtitle: string;
  cv: CvLine[];
};

export type GraphBlueprintNode = {
  id: string;
  label: string;
  subLabel: string;
  ring: number;
  angle: number;
  parentId?: string;
};

export const graphBlueprintNodes: GraphBlueprintNode[] = [
  { id: "root", label: "Applicant", subLabel: "Core profile", ring: 0, angle: 0 },
  { id: "edu", label: "Education", subLabel: "Verified", ring: 1, angle: 220, parentId: "root" },
  { id: "exp", label: "Experience", subLabel: "Verified", ring: 1, angle: 320, parentId: "root" },
  { id: "promo", label: "Promotions", subLabel: "Growth path", ring: 1, angle: 20, parentId: "root" },
  { id: "claims", label: "Claims", subLabel: "Attested", ring: 1, angle: 120, parentId: "root" },
  { id: "edu-1", label: "Primary degree", subLabel: "Academic", ring: 2, angle: 238, parentId: "edu" },
  { id: "edu-2", label: "Extra credential", subLabel: "Course", ring: 2, angle: 188, parentId: "edu" },
  { id: "exp-1", label: "Core role", subLabel: "Main track", ring: 2, angle: 338, parentId: "exp" },
  { id: "exp-2", label: "Secondary role", subLabel: "Support track", ring: 2, angle: 288, parentId: "exp" },
  { id: "promo-1", label: "Promotion", subLabel: "Progression", ring: 2, angle: 38, parentId: "promo" },
  { id: "claims-1", label: "Proof hash", subLabel: "On-chain", ring: 2, angle: 98, parentId: "claims" },
];
