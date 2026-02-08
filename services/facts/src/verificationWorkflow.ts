import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import { generateProofPackage } from "./proofService.js";

type ProviderName = "udemy" | "coursera" | "datacamp" | "edx";

type FdcSubmitResponse = {
  requestId: string | null;
  status: string;
  reason?: string | null;
};

type FdcStatusResponse = {
  status: "pending" | "verified" | "failed" | "timeout";
  attestationId: string | null;
  txHash: string | null;
  reason: string | null;
  verifierStatus: string | null;
  fdcVotingRoundId: number | null;
  fdcRequestTxHash: string | null;
};

type PlasmaResponse = {
  wallet: string;
  employer: string | null;
  token: string | null;
  monthsMatched: string[];
  monthTransferCounts: number[];
  paymentCount: number;
  qualifies: boolean;
  factCommitment: string;
};

type VerificationState = "running" | "proof_ready" | "failed" | "timeout";
type VerificationStage =
  | "submitting_certificates"
  | "waiting_certificates"
  | "checking_employment"
  | "generating_proof"
  | "proof_ready"
  | "failed";

export type VerificationCertificateInput = {
  id?: string;
  label?: string;
  provider: ProviderName;
  certificateUrlOrId: string;
};

export type StartVerificationInput = {
  wallet: string;
  certificates: VerificationCertificateInput[];
  requiredSkillHash?: string;
  minExperienceMonths?: number | string;
  salaryCommitment?: string;
  educationExpiryAt?: number | string;
  employmentExperienceMonths?: number | string;
  educationSkillHash?: string;
};

type JobCertificate = {
  id: string;
  label: string;
  provider: ProviderName;
  certificateUrlOrId: string;
  status: "queued" | "pending" | "verified" | "failed" | "timeout";
  requestId: string | null;
  reason: string | null;
  attestationId: string | null;
  fdcRequestTxHash: string | null;
  attestationTxHash: string | null;
};

type ProofPackage = Awaited<ReturnType<typeof generateProofPackage>>;

export type VerificationJob = {
  jobId: string;
  state: VerificationState;
  stage: VerificationStage;
  wallet: string;
  certificates: JobCertificate[];
  employment: PlasmaResponse | null;
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

const jobs = new Map<string, VerificationJob>();

function envOr(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  return value;
}

function now(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as T & { error?: string; reason?: string };
  if (!response.ok) {
    throw new Error(body.error || body.reason || `request_failed_${response.status}`);
  }
  return body as T;
}

async function postJson<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as T & { error?: string; reason?: string };
  if (!response.ok) {
    throw new Error(payload.error || payload.reason || `request_failed_${response.status}`);
  }
  return payload as T;
}

function touch(job: VerificationJob): void {
  job.updatedAt = now();
}

function normalizeError(reason: string): string {
  const firstLine = reason.split(/\r?\n/)[0]?.trim() || "verification_failed";
  return firstLine.replace(/^Error:\s*/i, "");
}

function pushEvent(
  job: VerificationJob,
  network: "system" | "flare" | "plasma" | "zk",
  status: "info" | "pending" | "success" | "error",
  message: string,
  ref?: string
): void {
  job.events.push({
    at: now(),
    network,
    status,
    message,
    ref
  });
  if (job.events.length > 120) {
    job.events = job.events.slice(job.events.length - 120);
  }
  touch(job);
}

function failJob(job: VerificationJob, reason: string): void {
  job.state = "failed";
  job.stage = "failed";
  job.error = normalizeError(reason);
  pushEvent(job, "system", "error", job.error);
}

function timeoutJob(job: VerificationJob, reason: string): void {
  job.state = "timeout";
  job.stage = "failed";
  job.error = normalizeError(reason);
  pushEvent(job, "system", "error", job.error);
}

async function runVerificationJob(jobId: string, input: StartVerificationInput): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  const fdcBase = envOr("FDC_SERVICE_URL", "http://localhost:3001");
  const plasmaBase = envOr("PLASMA_SERVICE_URL", "http://localhost:3002");
  const timeoutMs = Number(process.env.VERIFICATION_JOB_TIMEOUT_MS || 12 * 60_000);
  const pollMs = Number(process.env.VERIFICATION_JOB_POLL_MS || 8_000);
  const deadline = now() + timeoutMs;

  try {
    job.stage = "submitting_certificates";
    pushEvent(job, "system", "pending", "Submitting certificate checks to Flare FDC");

    for (const certificate of job.certificates) {
      pushEvent(job, "flare", "pending", `Submitting ${certificate.provider.toUpperCase()} certificate`, certificate.id);
      const submit = await postJson<FdcSubmitResponse>(`${fdcBase}/fdc/education/submit`, {
        wallet: job.wallet,
        provider: certificate.provider,
        certificateUrlOrId: certificate.certificateUrlOrId
      });

      if (!submit.requestId || submit.status !== "accepted") {
        certificate.status = "failed";
        certificate.reason = submit.reason || "fdc_submit_rejected";
        failJob(job, `education_submit_failed:${certificate.provider}`);
        return;
      }

      certificate.requestId = submit.requestId;
      certificate.status = "pending";
      certificate.reason = null;
      pushEvent(job, "flare", "pending", "FDC request accepted", submit.requestId);
    }

    job.stage = "waiting_certificates";
    pushEvent(job, "flare", "pending", "Waiting for certificate attestation finalization");

    while (now() < deadline) {
      let allDone = true;
      for (const certificate of job.certificates) {
        if (!certificate.requestId) {
          allDone = false;
          continue;
        }
        if (certificate.status === "verified" || certificate.status === "failed" || certificate.status === "timeout") {
          continue;
        }

        const status = await getJson<FdcStatusResponse>(`${fdcBase}/fdc/education/status/${certificate.requestId}`);
        if (status.status === "pending") {
          allDone = false;
          certificate.status = "pending";
          certificate.reason = status.reason;
          certificate.fdcRequestTxHash = status.fdcRequestTxHash;
          continue;
        }

        if (status.status === "verified") {
          certificate.status = "verified";
          certificate.reason = null;
          certificate.attestationId = status.attestationId;
          certificate.attestationTxHash = status.txHash;
          certificate.fdcRequestTxHash = status.fdcRequestTxHash;
          pushEvent(
            job,
            "flare",
            "success",
            `${certificate.provider.toUpperCase()} certificate attested`,
            status.attestationId || undefined
          );
          continue;
        }

        certificate.status = status.status;
        certificate.reason = status.reason || "education_verification_failed";
        certificate.fdcRequestTxHash = status.fdcRequestTxHash;
        pushEvent(job, "flare", "error", `${certificate.provider.toUpperCase()} verification failed`, certificate.reason || undefined);
      }

      const failedCert = job.certificates.find((certificate) => certificate.status === "failed" || certificate.status === "timeout");
      if (failedCert) {
        failJob(job, failedCert.reason || "education_verification_failed");
        return;
      }

      if (allDone && job.certificates.every((certificate) => certificate.status === "verified")) {
        break;
      }

      await sleep(pollMs);
    }

    const unresolved = job.certificates.some((certificate) => certificate.status !== "verified");
    if (unresolved) {
      timeoutJob(job, "education_verification_timeout");
      return;
    }

    job.stage = "checking_employment";
    pushEvent(job, "plasma", "pending", "Checking employment qualification on Plasma");

    const employment = await getJson<PlasmaResponse>(`${plasmaBase}/plasma/employment/${job.wallet}`);
    job.employment = employment;
    if (employment.qualifies) {
      pushEvent(job, "plasma", "success", "Employment qualification passed", employment.employer || undefined);
    } else {
      pushEvent(job, "plasma", "error", "Employment qualification failed");
    }

    if (!employment.qualifies) {
      failJob(job, "employment_not_qualified");
      return;
    }
    const mode = (process.env.PLASMA_RULE_MODE || "strict_3_months").trim();
    const strictMode = mode !== "demo_one_payment";
    if (strictMode && (employment.monthsMatched.length < 3 || employment.monthTransferCounts.length < 3)) {
      failJob(job, "employment_requires_3_consecutive_months_for_zk");
      return;
    }

    job.stage = "generating_proof";
    pushEvent(job, "zk", "pending", "Generating ZK proof package");

    const attestationId = job.certificates.find((certificate) => certificate.attestationId)?.attestationId || undefined;
    const proofPackage = await generateProofPackage({
      wallet: job.wallet,
      requiredSkillHash: input.requiredSkillHash,
      minExperienceMonths: input.minExperienceMonths,
      salaryCommitment: input.salaryCommitment,
      educationExpiryAt: input.educationExpiryAt,
      employmentExperienceMonths: input.employmentExperienceMonths,
      educationSkillHash: input.educationSkillHash,
      attestationId
    });

    job.proofPackage = proofPackage;
    job.state = "proof_ready";
    job.stage = "proof_ready";
    job.error = null;
    pushEvent(job, "zk", "success", "Proof package ready", proofPackage.proofHash);
  } catch (error) {
    failJob(job, (error as Error).message || "verification_job_failed");
  }
}

export function startVerificationJob(input: StartVerificationInput): VerificationJob {
  const wallet = getAddress(input.wallet);
  const certificates = input.certificates.map((certificate, index) => ({
    id: certificate.id || `cert-${index + 1}`,
    label: certificate.label || `${certificate.provider.toUpperCase()} Certificate ${index + 1}`,
    provider: certificate.provider,
    certificateUrlOrId: certificate.certificateUrlOrId,
    status: "queued" as const,
    requestId: null,
    reason: null,
    attestationId: null,
    fdcRequestTxHash: null,
    attestationTxHash: null
  }));

  if (certificates.length === 0) {
    throw new Error("at_least_one_certificate_required");
  }

  const jobId = randomUUID();
  const createdAt = now();
  const job: VerificationJob = {
    jobId,
    state: "running",
    stage: "submitting_certificates",
    wallet,
    certificates,
    employment: null,
    proofPackage: null,
    events: [],
    error: null,
    createdAt,
    updatedAt: createdAt
  };

  jobs.set(jobId, job);
  pushEvent(job, "system", "info", "Verification job created", jobId);
  void runVerificationJob(jobId, {
    ...input,
    wallet
  });
  return job;
}

export function getVerificationJob(jobId: string): VerificationJob | null {
  return jobs.get(jobId) || null;
}
