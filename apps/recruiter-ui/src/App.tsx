import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { getAddress, isAddress } from "viem";
import type { GraphBlueprintNode } from "./data/mockApplications";
import type { CandidateCV } from "./data/candidates";
import { cvVerifierAbi } from "./abis/cvVerifier";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { parseCandidatePdf } from "./utils/pdfCandidateParser";

const ClaimGraph3D = lazy(() =>
  import("./components/ClaimGraph3D").then((module) => ({ default: module.ClaimGraph3D }))
);

const SAMPLE_PDFS = [
  { label: "Asad Malik Sample PDF", href: "/examples/asad-malik-sovereigncv.pdf" },
  { label: "Demo Applicant Sample PDF", href: "/examples/demo-applicant-sovereigncv.pdf" }
];

type UiPhase = "landing" | "dashboard";
type NodeStatus = "idle" | "pending" | "verified" | "failed";
type LaneState = "idle" | "running" | "success" | "failed";

type VerificationCertificate = {
  id: string;
  label: string;
  provider: "udemy" | "coursera" | "datacamp" | "edx";
  certificateUrlOrId: string;
  status: "queued" | "pending" | "verified" | "failed" | "timeout";
  requestId: string | null;
  reason: string | null;
  attestationId: string | null;
  fdcRequestTxHash: string | null;
  attestationTxHash: string | null;
};

type VerificationEmployment = {
  wallet: string;
  employer: string | null;
  token: string | null;
  monthsMatched: string[];
  monthTransferCounts: number[];
  paymentCount: number;
  qualifies: boolean;
  factCommitment: string;
};

type ProofPackage = {
  wallet: string;
  generatedAt: string;
  proofBytes: string;
  publicSignals: string[];
  proofHash: string;
  metadata: Record<string, unknown> | null;
};

type VerificationJob = {
  jobId: string;
  state: "running" | "proof_ready" | "failed" | "timeout";
  stage:
    | "submitting_certificates"
    | "waiting_certificates"
    | "checking_employment"
    | "generating_proof"
    | "proof_ready"
    | "failed";
  wallet: string;
  certificates: VerificationCertificate[];
  employment: VerificationEmployment | null;
  proofPackage: ProofPackage | null;
  events: {
    at: number;
    network: "system" | "flare" | "plasma" | "zk";
    status: "info" | "pending" | "success" | "error";
    message: string;
    ref?: string;
  }[];
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

type ResultPopup = {
  kind: "success" | "failure";
  title: string;
  message: string;
  reasons: string[];
};

function buildGraph(cv: CandidateCV): GraphBlueprintNode[] {
  const certificateAngles = [188, 218, 248, 278, 308];
  const employmentAngles = [288, 318, 348, 18, 48];
  const nodes: GraphBlueprintNode[] = [
    { id: "root", label: cv.name, subLabel: "Candidate", ring: 0, angle: 0 },
    { id: "education-group", label: "Education", subLabel: "Flare FDC", ring: 1, angle: 225, parentId: "root" },
    { id: "employment-group", label: "Employment", subLabel: "Plasma", ring: 1, angle: 320, parentId: "root" },
    { id: "proof-group", label: "Proof", subLabel: "ZK + On-chain", ring: 1, angle: 80, parentId: "root" }
  ];

  cv.certificates.forEach((certificate, index) => {
    nodes.push({
      id: `cert-${certificate.id}`,
      label: certificate.provider.toUpperCase(),
      subLabel: certificate.title,
      ring: 2,
      angle: certificateAngles[index % certificateAngles.length],
      parentId: "education-group"
    });
  });

  cv.employments.forEach((employment, index) => {
    nodes.push({
      id: `emp-${employment.id}`,
      label: employment.company,
      subLabel: employment.role,
      ring: 2,
      angle: employmentAngles[index % employmentAngles.length],
      parentId: "employment-group"
    });
  });

  nodes.push({
    id: "proof-node",
    label: "CV Proof",
    subLabel: "Groth16 verification",
    ring: 2,
    angle: 98,
    parentId: "proof-group"
  });

  return nodes;
}

function baseStatuses(cv: CandidateCV): Record<string, NodeStatus> {
  const statuses: Record<string, NodeStatus> = {
    root: "idle",
    "education-group": "idle",
    "employment-group": "idle",
    "proof-group": "idle",
    "proof-node": "idle"
  };

  cv.certificates.forEach((certificate) => {
    statuses[`cert-${certificate.id}`] = "idle";
  });
  cv.employments.forEach((employment) => {
    statuses[`emp-${employment.id}`] = "idle";
  });
  return statuses;
}

function toNodeStatus(status: VerificationCertificate["status"]): NodeStatus {
  if (status === "verified") return "verified";
  if (status === "failed" || status === "timeout") return "failed";
  if (status === "pending" || status === "queued") return "pending";
  return "idle";
}

function deriveStatuses(
  cv: CandidateCV,
  job: VerificationJob | null,
  onchainState: "idle" | "verifying" | "success" | "error",
  revealSuccess: boolean
): Record<string, NodeStatus> {
  const statuses = baseStatuses(cv);
  if (!job) {
    return statuses;
  }

  statuses.root = "pending";
  for (const certificate of cv.certificates) {
    const jobCertificate = job.certificates.find((item) => item.id === certificate.id);
    if (!jobCertificate) {
      statuses[`cert-${certificate.id}`] = "pending";
      continue;
    }
    const rawStatus = toNodeStatus(jobCertificate.status);
    statuses[`cert-${certificate.id}`] = rawStatus === "verified" && !revealSuccess ? "pending" : rawStatus;
  }

  const certificateStatuses = cv.certificates.map((certificate) => statuses[`cert-${certificate.id}`]);
  if (certificateStatuses.some((status) => status === "failed")) {
    statuses["education-group"] = "failed";
  } else if (certificateStatuses.length > 0 && certificateStatuses.every((status) => status === "verified")) {
    statuses["education-group"] = "verified";
  } else {
    statuses["education-group"] = "pending";
  }

  const hasEmploymentResult = job.employment !== null;
  const employmentStatus: NodeStatus = hasEmploymentResult
    ? job.employment!.qualifies
      ? revealSuccess
        ? "verified"
        : "pending"
      : "failed"
    : job.state === "failed" || job.state === "timeout"
      ? "failed"
      : "pending";

  cv.employments.forEach((employment) => {
    statuses[`emp-${employment.id}`] = employmentStatus;
  });
  statuses["employment-group"] = employmentStatus;

  if (job.state === "failed" || job.state === "timeout") {
    statuses["proof-group"] = "failed";
    statuses["proof-node"] = "failed";
    statuses.root = "failed";
    return statuses;
  }

  if (job.state === "proof_ready") {
    statuses["proof-group"] =
      onchainState === "success" ? (revealSuccess ? "verified" : "pending") : onchainState === "error" ? "failed" : "pending";
    statuses["proof-node"] = statuses["proof-group"];
    statuses.root = statuses["proof-group"] === "verified" ? "verified" : "pending";
    return statuses;
  }

  statuses["proof-group"] = "pending";
  statuses["proof-node"] = "pending";
  return statuses;
}

function statusLabel(status: NodeStatus): string {
  if (status === "verified") return "Verified";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Verifying";
  return "Not Checked";
}

function streamClass(status: "info" | "pending" | "success" | "error"): string {
  if (status === "success") return "stream-item success";
  if (status === "error") return "stream-item error";
  if (status === "pending") return "stream-item pending";
  return "stream-item";
}

function laneClass(state: LaneState): string {
  if (state === "running") return "timeline-lane running";
  if (state === "success") return "timeline-lane success";
  if (state === "failed") return "timeline-lane failed";
  return "timeline-lane idle";
}

function humanize(message: string): string {
  const map: Record<string, string> = {
    employment_requires_3_consecutive_months_for_zk:
      "Employment proof needs 3 consecutive monthly stablecoin payments for ZK verification.",
    employment_not_qualified: "Employment verification failed. Candidate is not qualified from Plasma payments.",
    missing_education_attestation_for_wallet: "Education attestation not found for candidate wallet.",
    missing_salary_commitment: "Missing salary commitment in verification policy.",
    fdc_verification_timeout: "Flare verification timed out before attestation could be finalized."
  };
  if (message.startsWith("education_submit_failed:")) {
    const provider = message.split(":")[1] || "certificate";
    return `Flare rejected ${provider.toUpperCase()} certificate submission.`;
  }
  if (message.startsWith("attestation_write_failed_")) return "Flare attestation write failed on-chain.";
  if (message.startsWith("command_failed_node:")) return "ZK proof generation failed for this candidate.";
  return map[message] || message;
}

function laneStateFromEvent(event: VerificationJob["events"][number] | undefined): LaneState {
  if (!event) return "idle";
  if (event.status === "error") return "failed";
  if (event.status === "success") return "success";
  if (event.status === "pending") return "running";
  return "running";
}

function collectFailureReasons(
  job: VerificationJob | null,
  onchainState: "idle" | "verifying" | "success" | "error",
  onchainMessage: string
): string[] {
  const reasons: string[] = [];
  if (!job) return onchainState === "error" ? [humanize(onchainMessage)] : [];

  if (job.error) reasons.push(humanize(job.error));
  for (const certificate of job.certificates) {
    if (certificate.status === "failed" || certificate.status === "timeout") {
      const detail = certificate.reason ? humanize(certificate.reason) : "Certificate verification failed.";
      reasons.push(`${certificate.provider.toUpperCase()}: ${detail}`);
    }
  }
  if (job.employment && !job.employment.qualifies) reasons.push("Plasma employment qualification failed.");
  if (onchainState === "error" && onchainMessage.trim().length > 0) reasons.push(humanize(onchainMessage));
  const unique = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
  return unique.length > 0 ? unique : ["Verification failed due to an unknown error."];
}

function makeSparkles(count: number): Array<{ left: string; top: string; delay: string; size: string }> {
  return Array.from({ length: count }, (_, index) => {
    const seed = (index * 73 + 19) % 100;
    const seedB = (index * 41 + 7) % 100;
    return {
      left: `${seed}%`,
      top: `${seedB}%`,
      delay: `${(index % 11) * 0.35}s`,
      size: `${2 + (index % 3)}px`
    };
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(`Cannot reach ${url}`);
  }

  const body = (await response.json()) as T & { error?: string; reason?: string };
  if (!response.ok) {
    throw new Error(body.error || body.reason || `HTTP ${response.status}`);
  }
  return body as T;
}

export default function App() {
  const [phase, setPhase] = useState<UiPhase>("landing");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotes, setUploadNotes] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateCV[]>([]);

  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [activeNodeId, setActiveNodeId] = useState<string>("root");
  const [verificationJobId, setVerificationJobId] = useState<string | null>(null);
  const [verificationJob, setVerificationJob] = useState<VerificationJob | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string>("Upload candidate CV PDFs to begin.");
  const [txHash, setTxHash] = useState<string>("");
  const [onchainState, setOnchainState] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [onchainMessage, setOnchainMessage] = useState<string>("Waiting for proof generation.");
  const [resultPopup, setResultPopup] = useState<ResultPopup | null>(null);
  const [showTimelineOverlay, setShowTimelineOverlay] = useState<boolean>(false);
  const [celebrationUnlocked, setCelebrationUnlocked] = useState<boolean>(false);
  const lastOutcomeKeyRef = useRef<string>("");
  const ctaRef = useRef<HTMLDivElement | null>(null);

  const sparkleDots = useMemo(() => makeSparkles(56), []);

  useEffect(() => {
    setShowUploadModal(false);
  }, []);

  const selectedCv = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCvId) ?? candidates[0] ?? null,
    [candidates, selectedCvId]
  );

  const graphNodes = useMemo(() => (selectedCv ? buildGraph(selectedCv) : []), [selectedCv]);
  const nodeStatusById = useMemo(
    () => (selectedCv ? deriveStatuses(selectedCv, verificationJob, onchainState, celebrationUnlocked) : {}),
    [selectedCv, verificationJob, onchainState, celebrationUnlocked]
  );

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || 114);
  const factsBaseUrl = (import.meta.env.VITE_FACTS_BASE_URL || "http://localhost:3003").replace(/\/+$/, "");
  const cvVerifierAddress = import.meta.env.VITE_CV_VERIFIER_ADDRESS;
  const contractAddress = cvVerifierAddress && isAddress(cvVerifierAddress) ? getAddress(cvVerifierAddress) : "";
  const chainMismatch = Number.isFinite(expectedChainId) && publicClient?.chain?.id !== expectedChainId;

  const streamItems = useMemo(() => {
    const base = verificationJob?.events ?? [];
    const onchainEvent =
      onchainState === "idle"
        ? []
        : [
            {
              at: Date.now(),
              network: "system" as const,
              status:
                onchainState === "success"
                  ? ("success" as const)
                  : onchainState === "error"
                    ? ("error" as const)
                    : ("pending" as const),
              message: onchainMessage,
              ref: txHash || undefined
            }
          ];
    return [...base, ...onchainEvent].slice(-18).reverse();
  }, [verificationJob?.events, onchainState, onchainMessage, txHash]);

  const timelineRows = useMemo(() => {
    const base = verificationJob?.events ?? [];
    const onchainEvent =
      onchainState === "idle"
        ? []
        : [
            {
              at: Date.now(),
              network: "system" as const,
              status:
                onchainState === "success"
                  ? ("success" as const)
                  : onchainState === "error"
                    ? ("error" as const)
                    : ("pending" as const),
              message: onchainMessage
            }
          ];
    return [...base, ...onchainEvent].slice(-10);
  }, [verificationJob?.events, onchainState, onchainMessage]);

  const verificationLanes = useMemo(() => {
    const events = verificationJob?.events ?? [];
    const latestByNetwork = (network: "flare" | "plasma" | "zk") =>
      [...events].reverse().find((event) => event.network === network);

    const flareEvent = latestByNetwork("flare");
    const plasmaEvent = latestByNetwork("plasma");
    const zkEvent = latestByNetwork("zk");

    const onchainLaneState: LaneState =
      onchainState === "success"
        ? "success"
        : onchainState === "error"
          ? "failed"
          : onchainState === "verifying"
            ? "running"
            : verificationJob?.state === "proof_ready"
              ? "running"
              : "idle";

    const onchainDetail =
      onchainState === "idle"
        ? verificationJob?.state === "proof_ready"
          ? "Awaiting wallet confirmation"
          : "Pending ZK output"
        : onchainMessage;

    return [
      {
        id: "flare",
        title: "Flare FDC",
        subtitle: "Web2 certificate attestation",
        state: laneStateFromEvent(flareEvent),
        detail: flareEvent ? humanize(flareEvent.message) : "Waiting to start"
      },
      {
        id: "plasma",
        title: "Plasma",
        subtitle: "Stablecoin employment checks",
        state: laneStateFromEvent(plasmaEvent),
        detail: plasmaEvent ? humanize(plasmaEvent.message) : "Waiting to start"
      },
      {
        id: "zk",
        title: "ZK Circuit",
        subtitle: "Groth16 proof generation",
        state: laneStateFromEvent(zkEvent),
        detail: zkEvent ? humanize(zkEvent.message) : "Waiting to start"
      },
      {
        id: "onchain",
        title: "On-chain Finalize",
        subtitle: "CVVerifier.verifyCVProof",
        state: onchainLaneState,
        detail: humanize(onchainDetail)
      }
    ];
  }, [verificationJob, onchainState, onchainMessage]);

  const verificationActive = useMemo(() => {
    if (!verificationJob) return false;
    if (verificationJob.state === "running") return true;
    if (verificationJob.state === "proof_ready" && onchainState !== "success" && onchainState !== "error") return true;
    if (onchainState === "verifying") return true;
    return false;
  }, [verificationJob, onchainState]);

  const progressPercent = useMemo(() => {
    if (!verificationJob) return 0;
    const stageBase: Record<VerificationJob["stage"], number> = {
      submitting_certificates: 18,
      waiting_certificates: 40,
      checking_employment: 62,
      generating_proof: 82,
      proof_ready: 90,
      failed: 100
    };
    let percent = stageBase[verificationJob.stage] ?? 8;
    if (verificationJob.state === "failed" || verificationJob.state === "timeout") return 100;
    if (onchainState === "verifying") percent = Math.max(percent, 96);
    if (onchainState === "success" || onchainState === "error") percent = 100;
    return Math.max(6, Math.min(100, percent));
  }, [verificationJob, onchainState]);

  useEffect(() => {
    setShowTimelineOverlay(verificationActive);
  }, [verificationActive]);

  useEffect(() => {
    if (!selectedCv) return;
    setActiveNodeId("root");
    setVerificationJobId(null);
    setVerificationJob(null);
    setWorkflowMessage("Select a CV and click Verify CV.");
    setOnchainState("idle");
    setOnchainMessage("Waiting for proof generation.");
    setTxHash("");
    setResultPopup(null);
    setShowTimelineOverlay(false);
    setCelebrationUnlocked(false);
    lastOutcomeKeyRef.current = "";
  }, [selectedCv?.id]);

  useEffect(() => {
    if (phase !== "landing") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.setTimeout(() => {
      window.scrollTo(0, 0);
      const shell = document.querySelector(".landing-shell");
      if (shell instanceof HTMLElement) {
        shell.scrollTo(0, 0);
      }
    }, 0);
  }, [phase]);

  useEffect(() => {
    if (!verificationJobId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const job = await fetchJson<VerificationJob>(`${factsBaseUrl}/verification/${verificationJobId}`);
        if (cancelled) return;
        setVerificationJob(job);
        setWorkflowMessage(`Stage: ${job.stage}`);

        if (job.state === "failed" || job.state === "timeout") {
          setVerificationJobId(null);
          setWorkflowMessage(humanize(job.error || "Verification failed."));
          setOnchainState("idle");
          setOnchainMessage("Verification failed before on-chain step.");
        }
        if (job.state === "proof_ready") {
          setVerificationJobId(null);
          setWorkflowMessage("Evidence verified. Finalizing on-chain...");
        }
      } catch (error) {
        if (cancelled) return;
        setVerificationJobId(null);
        setWorkflowMessage(humanize((error as Error).message || "Verification polling failed."));
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [verificationJobId, factsBaseUrl]);

  useEffect(() => {
    if (!verificationJob) return;

    if (verificationJob.state === "failed" || verificationJob.state === "timeout") {
      const outcomeKey = `fail:${verificationJob.jobId}:${verificationJob.updatedAt}`;
      if (lastOutcomeKeyRef.current === outcomeKey) return;
      lastOutcomeKeyRef.current = outcomeKey;
      setResultPopup({
        kind: "failure",
        title: "Background Check Failed",
        message: "Candidate did not pass automated verification.",
        reasons: collectFailureReasons(verificationJob, onchainState, onchainMessage)
      });
      return;
    }

    if (verificationJob.state === "proof_ready" && onchainState === "error") {
      const outcomeKey = `onchain-fail:${verificationJob.jobId}:${onchainMessage}`;
      if (lastOutcomeKeyRef.current === outcomeKey) return;
      lastOutcomeKeyRef.current = outcomeKey;
      setResultPopup({
        kind: "failure",
        title: "On-chain Verification Failed",
        message: "Proof generated, but final chain verification failed.",
        reasons: collectFailureReasons(verificationJob, onchainState, onchainMessage)
      });
      return;
    }

    if (verificationJob.state === "proof_ready" && onchainState === "success") {
      const outcomeKey = `success:${verificationJob.jobId}`;
      if (lastOutcomeKeyRef.current === outcomeKey) return;
      lastOutcomeKeyRef.current = outcomeKey;
      setResultPopup({
        kind: "success",
        title: "Background Check Passed",
        message: "Candidate has passed Flare, Plasma, and ZK verification.",
        reasons: []
      });
    }
  }, [verificationJob, onchainState, onchainMessage]);

  useEffect(() => {
    if (!verificationJob || verificationJob.state !== "proof_ready" || !verificationJob.proofPackage) return;
    if (onchainState !== "idle") return;

    if (!isConnected || !walletClient || !publicClient) {
      setOnchainMessage("Connect recruiter wallet to complete on-chain verification.");
      return;
    }
    if (!contractAddress) {
      setOnchainState("error");
      setOnchainMessage("Missing VITE_CV_VERIFIER_ADDRESS.");
      return;
    }
    if (chainMismatch) {
      setOnchainMessage("Switch wallet network to Coston2 before final verification.");
      return;
    }

    const verify = async () => {
      try {
        setOnchainState("verifying");
        setOnchainMessage("Submitting on-chain verification...");
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: cvVerifierAbi,
          functionName: "verifyCVProof",
          args: [
            verificationJob.proofPackage!.proofBytes as `0x${string}`,
            verificationJob.proofPackage!.publicSignals.map((value) => BigInt(value))
          ]
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setOnchainState("success");
        setOnchainMessage("CV verified on-chain.");
      } catch (error) {
        setOnchainState("error");
        setOnchainMessage((error as Error).message || "On-chain verification failed.");
      }
    };

    void verify();
  }, [verificationJob, onchainState, isConnected, walletClient, publicClient, contractAddress, chainMismatch]);

  function openUploadModal(): void {
    setUploadError("");
    setUploadNotes([]);
    setUploadFiles([]);
    setShowUploadModal(true);
  }

  function closeUploadModal(): void {
    if (uploading) return;
    setShowUploadModal(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files || []);
    setUploadFiles(files.filter((file) => file.name.toLowerCase().endsWith(".pdf")));
  }

  async function processUploadedPdfs(): Promise<void> {
    if (uploadFiles.length === 0) {
      setUploadError("Attach at least one PDF file.");
      return;
    }

    setUploading(true);
    setUploadError("");
    const parsedCandidates: CandidateCV[] = [];
    const notes: string[] = [];

    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index];
      try {
        const parsed = await parseCandidatePdf(file, index);
        parsedCandidates.push({ ...parsed, id: `${parsed.id}-${index + 1}` });
        notes.push(`Parsed ${file.name}`);
      } catch (error) {
        notes.push(`Skipped ${file.name}: ${(error as Error).message}`);
      }
    }

    setUploadNotes(notes);
    setUploading(false);

    if (parsedCandidates.length === 0) {
      setUploadError("No valid candidate PDFs were parsed. Ensure each PDF contains wallet, Experience, and Courses with URLs.");
      return;
    }

    setCandidates(parsedCandidates);
    setSelectedCvId(parsedCandidates[0].id);
    setPhase("dashboard");
    setShowUploadModal(false);
  }

  async function handleVerifyCv(): Promise<void> {
    if (!selectedCv) return;

    try {
      setOnchainState("idle");
      setOnchainMessage("Running Flare + Plasma checks...");
      setTxHash("");
      setResultPopup(null);
      setCelebrationUnlocked(false);
      lastOutcomeKeyRef.current = "";
      setWorkflowMessage("Creating verification job...");

      const job = await fetchJson<VerificationJob>(`${factsBaseUrl}/verification/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: selectedCv.wallet,
          certificates: selectedCv.certificates.map((certificate) => ({
            id: certificate.id,
            label: certificate.title,
            provider: certificate.provider,
            certificateUrlOrId: certificate.certificateUrlOrId
          })),
          requiredSkillHash: selectedCv.requiredSkillHash,
          minExperienceMonths: selectedCv.minExperienceMonths,
          salaryCommitment: selectedCv.salaryCommitment,
          educationExpiryAt: selectedCv.educationExpiryAt,
          employmentExperienceMonths: selectedCv.employmentExperienceMonths,
          educationSkillHash: selectedCv.educationSkillHash
        })
      });

      setVerificationJob(job);
      setVerificationJobId(job.jobId);
      setWorkflowMessage("Verification in progress...");
    } catch (error) {
      setWorkflowMessage(humanize((error as Error).message || "Failed to start verification."));
      setOnchainState("error");
      setOnchainMessage("Verification start failed.");
    }
  }

  function closeResultPopup(): void {
    if (resultPopup?.kind === "success") {
      setCelebrationUnlocked(true);
    }
    setResultPopup(null);
  }

  if (phase === "landing") {
    return (
      <main className="landing-shell">
        <div className="landing-sparkle-field" aria-hidden>
          {sparkleDots.map((sparkle, index) => (
            <span
              key={`sparkle-${index}`}
              className="sparkle-dot"
              style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay, width: sparkle.size, height: sparkle.size }}
            />
          ))}
        </div>

        <section className="landing-hero">
          <p className="landing-kicker">Privacy-first Recruitment Verification</p>
          <h1>HireFlow</h1>
          <p className="landing-slogan">trust the hire, skip the paperwork</p>
          <button className="landing-scroll-btn" onClick={() => ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            Scroll to Start
          </button>
        </section>

        <section ref={ctaRef} className="landing-cta">
          <div className="landing-cta-card">
            <h2>Start Background Checks</h2>
            <p>Upload one or multiple candidate CV PDFs with wallet, experience lines, and course certificate URLs.</p>
            <button className="panel-btn landing-start-btn" onClick={openUploadModal}>
              Start Background Checks
            </button>
          </div>
        </section>

        {showUploadModal ? (
          <section className="upload-overlay" role="dialog" aria-modal="true">
            <div className="upload-modal">
              <h3>Upload Candidate PDFs</h3>
              <p>Attach one or multiple PDF resumes. Parser expects wallet, Experience section, and Courses section with URLs.</p>
              <label className="upload-drop">
                <input type="file" accept="application/pdf" multiple onChange={handleFileChange} />
                <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file(s) selected` : "Choose PDF files"}</span>
              </label>
              <div className="upload-samples">
                {SAMPLE_PDFS.map((sample) => (
                  <a key={sample.href} href={sample.href} target="_blank" rel="noreferrer">
                    {sample.label}
                  </a>
                ))}
              </div>

              {uploadFiles.length > 0 ? (
                <ul className="upload-file-list">
                  {uploadFiles.map((file) => (
                    <li key={file.name}>{file.name}</li>
                  ))}
                </ul>
              ) : null}

              {uploadError ? <p className="status-error">{uploadError}</p> : null}
              {uploadNotes.length > 0 ? (
                <ul className="upload-notes">
                  {uploadNotes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <div className="upload-actions">
                <button className="panel-btn ghost" onClick={closeUploadModal} disabled={uploading}>
                  Cancel
                </button>
                <button className="panel-btn" onClick={() => void processUploadedPdfs()} disabled={uploading}>
                  {uploading ? "Parsing..." : "Parse and Continue"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    );
  }

  if (!selectedCv) {
    return (
      <main className="app-shell empty-dashboard">
        <div className="empty-dashboard-card">
          <h2>No candidate PDFs loaded</h2>
          <p>Upload one or multiple PDF resumes to continue.</p>
          <button className="panel-btn" onClick={openUploadModal}>
            Upload PDFs
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className={showTimelineOverlay ? "app-content blurred" : "app-content"}>
        <section className="graph-stage">
          <ErrorBoundary fallback={<div className="graph-fallback">Graph failed to load.</div>}>
            <Suspense fallback={<div className="graph-fallback">Loading graph...</div>}>
              <ClaimGraph3D
                activeNodeId={activeNodeId}
                onSelectNode={setActiveNodeId}
                blueprintNodes={graphNodes}
                nodeStatusById={nodeStatusById}
                celebrationMode={celebrationUnlocked}
              />
            </Suspense>
          </ErrorBoundary>
        </section>

        <aside className="left-panel">
          <div className="panel-card">
            <div className="panel-title">Recruiter Wallet</div>
            {isConnected ? (
              <div className="wallet-row">
                <span className="wallet-address">{address}</span>
                <button className="panel-btn ghost" onClick={() => disconnect()}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="panel-btn" onClick={() => connect({ connector: connectors[0] })} disabled={isPending}>
                {isPending ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
            {chainMismatch ? (
              <button className="panel-btn ghost" onClick={() => switchChain({ chainId: expectedChainId })}>
                Switch to Coston2
              </button>
            ) : null}
          </div>

          <div className="panel-card">
            <div className="panel-title">Applicants</div>
            <div className="candidate-list">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  className={candidate.id === selectedCv.id ? "candidate-item active" : "candidate-item"}
                  onClick={() => setSelectedCvId(candidate.id)}
                >
                  <strong>{candidate.name}</strong>
                  <span>{candidate.roleApplied}</span>
                </button>
              ))}
            </div>
            <button className="panel-btn ghost" onClick={openUploadModal}>
              Upload CV PDFs
            </button>
            <button className="panel-btn" onClick={() => void handleVerifyCv()} disabled={Boolean(verificationJobId) || onchainState === "verifying"}>
              {verificationJobId ? "Verification Running..." : "Verify CV"}
            </button>
            <p className="status-message">{workflowMessage}</p>
            <p className={onchainState === "error" ? "status-error" : "status-message"}>{onchainMessage}</p>
            {txHash ? <p className="status-meta">Tx: {txHash}</p> : null}
          </div>

          <div className="panel-card">
            <div className="panel-title">Verification Stream</div>
            <div className="stream-list">
              {streamItems.length === 0 ? (
                <p className="status-message">No verification activity yet.</p>
              ) : (
                streamItems.map((event, index) => (
                  <div key={`${event.at}-${index}`} className={streamClass(event.status)}>
                    <div className="stream-head">
                      <span className="stream-network">{event.network.toUpperCase()}</span>
                      <span className="stream-time">{new Date(event.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="stream-message">{event.status === "error" ? humanize(event.message) : event.message}</div>
                    {event.ref ? <div className="stream-ref">{event.ref}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <aside className="right-panel">
          <div className="cv-head">
            <h2>{selectedCv.name}</h2>
            <p>{selectedCv.roleApplied}</p>
            <p className="cv-wallet">Wallet: {selectedCv.wallet}</p>
          </div>

          <section className="cv-section">
            <h3>Education Certificates</h3>
            {selectedCv.certificates.map((certificate) => {
              const status = nodeStatusById[`cert-${certificate.id}`];
              return (
                <button key={certificate.id} className="cv-line" onClick={() => setActiveNodeId(`cert-${certificate.id}`)}>
                  <span>{certificate.title}</span>
                  <span className={`badge ${status}`}>{statusLabel(status)}</span>
                </button>
              );
            })}
          </section>

          <section className="cv-section">
            <h3>Employment</h3>
            {selectedCv.employments.map((employment) => {
              const status = nodeStatusById[`emp-${employment.id}`];
              return (
                <button key={employment.id} className="cv-line" onClick={() => setActiveNodeId(`emp-${employment.id}`)}>
                  <span>
                    {employment.company} - {employment.role}
                  </span>
                  <span className={`badge ${status}`}>{statusLabel(status)}</span>
                </button>
              );
            })}
          </section>

          <section className="cv-section">
            <h3>Proof Status</h3>
            <button className="cv-line" onClick={() => setActiveNodeId("proof-node")}>
              <span>ZK Proof + On-chain Check</span>
              <span className={`badge ${nodeStatusById["proof-node"]}`}>{statusLabel(nodeStatusById["proof-node"])} </span>
            </button>
          </section>
        </aside>
      </div>

      {showTimelineOverlay ? (
        <section className="verification-overlay" aria-live="polite">
          <div className="verification-window">
            <header className="verification-head">
              <div>
                <h3>Verification In Progress</h3>
                <p>{workflowMessage}</p>
              </div>
              <span className="verification-pulse">Live</span>
            </header>

            <div className="verification-progress">
              <div className="verification-progress-meta">
                <span>Progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="verification-progress-track">
                <div
                  className={verificationActive ? "verification-progress-fill running" : "verification-progress-fill"}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="timeline-lanes">
              {verificationLanes.map((lane) => (
                <article key={lane.id} className={laneClass(lane.state)}>
                  <div className="timeline-lane-head">
                    <strong>{lane.title}</strong>
                    <span>{lane.state === "running" ? "Running" : lane.state === "success" ? "Done" : lane.state === "failed" ? "Failed" : "Queued"}</span>
                  </div>
                  <p className="timeline-lane-sub">{lane.subtitle}</p>
                  <p className="timeline-lane-detail">{lane.detail}</p>
                </article>
              ))}
            </div>

            <div className="timeline-stream">
              {timelineRows.map((event, index) => (
                <div key={`${event.at}-${index}`} className={`timeline-event ${event.status}`}>
                  <div className="timeline-event-dot" />
                  <div className="timeline-event-body">
                    <div className="timeline-event-meta">
                      <span>{event.network.toUpperCase()}</span>
                      <span>{new Date(event.at).toLocaleTimeString()}</span>
                    </div>
                    <p>{event.status === "error" ? humanize(event.message) : event.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showUploadModal ? (
        <section className="upload-overlay" role="dialog" aria-modal="true">
          <div className="upload-modal">
            <h3>Upload Candidate PDFs</h3>
            <p>Attach one or multiple PDF resumes. Parser expects wallet, Experience section, and Courses section with URLs.</p>
            <label className="upload-drop">
              <input type="file" accept="application/pdf" multiple onChange={handleFileChange} />
              <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file(s) selected` : "Choose PDF files"}</span>
            </label>
            <div className="upload-samples">
              {SAMPLE_PDFS.map((sample) => (
                <a key={sample.href} href={sample.href} target="_blank" rel="noreferrer">
                  {sample.label}
                </a>
              ))}
            </div>

            {uploadFiles.length > 0 ? (
              <ul className="upload-file-list">
                {uploadFiles.map((file) => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            ) : null}

            {uploadError ? <p className="status-error">{uploadError}</p> : null}
            {uploadNotes.length > 0 ? (
              <ul className="upload-notes">
                {uploadNotes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            ) : null}

            <div className="upload-actions">
              <button className="panel-btn ghost" onClick={closeUploadModal} disabled={uploading}>
                Cancel
              </button>
              <button className="panel-btn" onClick={() => void processUploadedPdfs()} disabled={uploading}>
                {uploading ? "Parsing..." : "Parse and Continue"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {resultPopup ? (
        <section className="result-popup-overlay" role="dialog" aria-modal="true">
          <div className={resultPopup.kind === "success" ? "result-popup success" : "result-popup failure"}>
            <div className="result-icon-wrap">
              <div className="result-icon">{resultPopup.kind === "success" ? "\u2713" : "\u2715"}</div>
            </div>
            <h3>{resultPopup.title}</h3>
            <p>{resultPopup.message}</p>
            {resultPopup.reasons.length > 0 ? (
              <ul className="result-reasons">
                {resultPopup.reasons.map((reason, index) => (
                  <li key={`${reason}-${index}`}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <button className="panel-btn" onClick={closeResultPopup}>
              Close
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
