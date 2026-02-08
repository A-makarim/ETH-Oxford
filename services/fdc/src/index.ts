import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { getAddress } from "ethers";
import { z } from "zod";
import {
  deriveAttestationId,
  pollWeb2JsonVerification,
  queueWeb2JsonVerification,
  writeEducationAttestation
} from "./fdcClient.js";
import { normalizeCertificateInput } from "./providerNormalizer.js";
import { getRequest, listRequestsByStatuses, loadStore, setRequest, updateRequest } from "./store.js";
import type { EducationStatusRecord } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(moduleDir, "../../../.env"), override: true });

const REQUEST_TIMEOUT_MS = Number(process.env.FDC_STATUS_TIMEOUT_MS || 10 * 60_000);
const POLL_INTERVAL_MS = Number(process.env.FDC_POLL_INTERVAL_MS || 10_000);
const INITIAL_BACKOFF_MS = Number(process.env.FDC_POLL_INITIAL_BACKOFF_MS || 5_000);
const MAX_BACKOFF_MS = Number(process.env.FDC_POLL_MAX_BACKOFF_MS || 60_000);

const processingRequestIds = new Set<string>();

const app = express();
app.use(express.json());

const submitSchema = z.object({
  wallet: z.string(),
  provider: z.enum(["udemy", "coursera", "datacamp", "edx"]),
  certificateUrlOrId: z.string().min(3)
});

function computeBackoffMs(attempt: number): number {
  const scaled = INITIAL_BACKOFF_MS * Math.max(1, 2 ** Math.max(0, attempt - 1));
  return Math.min(MAX_BACKOFF_MS, scaled);
}

function statusForApi(status: EducationStatusRecord["status"]): "pending" | "verified" | "failed" | "timeout" {
  if (status === "accepted" || status === "pending") {
    return "pending";
  }
  if (status === "verified") {
    return "verified";
  }
  if (status === "timeout") {
    return "timeout";
  }
  return "failed";
}

async function processRequest(requestId: string): Promise<void> {
  if (processingRequestIds.has(requestId)) {
    return;
  }

  processingRequestIds.add(requestId);

  try {
    const record = getRequest(requestId);
    if (!record) {
      return;
    }

    if (record.status === "verified" || record.status === "failed" || record.status === "timeout") {
      return;
    }

    const now = Date.now();
    if (now - record.createdAt > REQUEST_TIMEOUT_MS) {
      updateRequest(requestId, {
        status: "timeout",
        reason: "fdc_verification_timeout"
      });
      return;
    }

    if (record.nextPollAt > now) {
      return;
    }

    if (!record.verifierRequestBytes || record.fdcVotingRoundId === undefined) {
      updateRequest(requestId, {
        status: "failed",
        reason: "missing_fdc_request_metadata"
      });
      return;
    }

    const pollResult = await pollWeb2JsonVerification({
      verifierRequestBytes: record.verifierRequestBytes,
      fdcVotingRoundId: record.fdcVotingRoundId
    });

    if (pollResult.state === "pending") {
      const nextAttempts = record.pollAttempts + 1;
      updateRequest(requestId, {
        status: "accepted",
        pollAttempts: nextAttempts,
        nextPollAt: now + computeBackoffMs(nextAttempts),
        reason: pollResult.reason
      });
      return;
    }

    if (pollResult.state === "failed") {
      updateRequest(requestId, {
        status: "failed",
        reason: pollResult.reason,
        pollAttempts: record.pollAttempts + 1,
        nextPollAt: now + MAX_BACKOFF_MS
      });
      return;
    }

    if (!record.certHash) {
      updateRequest(requestId, {
        status: "failed",
        reason: "missing_cert_hash"
      });
      return;
    }

    const resolvedVotingRoundId = pollResult.resolvedVotingRoundId ?? record.fdcVotingRoundId;
    const attestationId = deriveAttestationId(record.verifierRequestBytes, resolvedVotingRoundId);

    try {
      const writeResult = await writeEducationAttestation({
        attestationId,
        wallet: record.wallet,
        certHash: record.certHash,
        provider: record.provider,
        issuedAt: pollResult.issuedAt
      });

      updateRequest(requestId, {
        status: "verified",
        attestationId,
        fdcVotingRoundId: resolvedVotingRoundId,
        issuedAt: pollResult.issuedAt,
        txHash: writeResult.txHash ?? undefined,
        reason: writeResult.alreadyExists ? "attestation_already_recorded" : undefined,
        pollAttempts: record.pollAttempts + 1,
        nextPollAt: now
      });
    } catch (error) {
      updateRequest(requestId, {
        status: "failed",
        reason: `attestation_write_failed_${(error as Error).message}`,
        pollAttempts: record.pollAttempts + 1,
        nextPollAt: now + MAX_BACKOFF_MS
      });
    }
  } finally {
    processingRequestIds.delete(requestId);
  }
}

async function processAllOpenRequests(): Promise<void> {
  const openRequests = listRequestsByStatuses(["pending", "accepted"]);
  await Promise.all(openRequests.map((record) => processRequest(record.requestId)));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "fdc" });
});

app.post("/fdc/education/submit", async (req, res) => {
  const parse = submitSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      requestId: null,
      status: "rejected",
      reason: parse.error.issues.map((issue) => issue.message).join(", ")
    });
  }

  let normalized;
  try {
    normalized = await normalizeCertificateInput(parse.data);
  } catch (error) {
    return res.status(400).json({
      requestId: null,
      status: "rejected",
      reason: (error as Error).message
    });
  }

  const requestId = randomUUID();
  const now = Date.now();

  const baseRecord: EducationStatusRecord = {
    requestId,
    status: "pending",
    wallet: getAddress(normalized.wallet),
    provider: normalized.provider,
    certificateUrlOrId: normalized.source,
    certHash: normalized.certHash,
    createdAt: now,
    updatedAt: now,
    pollAttempts: 0,
    nextPollAt: now
  };

  setRequest(baseRecord);

  const queueResult = await queueWeb2JsonVerification({
    normalized
  });

  if (!queueResult.accepted) {
    updateRequest(requestId, {
      status: "failed",
      verifierStatus: queueResult.verifierStatus,
      reason: queueResult.reason,
      pollAttempts: 1,
      nextPollAt: now + MAX_BACKOFF_MS
    });

    return res.json({
      requestId,
      status: "rejected"
    });
  }

  updateRequest(requestId, {
    status: "accepted",
    verifierStatus: queueResult.verifierStatus,
    verifierRequestBytes: queueResult.verifierRequestBytes,
    fdcVotingRoundId: queueResult.fdcVotingRoundId,
    fdcRequestTxHash: queueResult.fdcRequestTxHash,
    reason: undefined,
    pollAttempts: 0,
    nextPollAt: now
  });

  void processRequest(requestId);

  return res.json({
    requestId,
    status: "accepted"
  });
});

app.get("/fdc/education/status/:requestId", (req, res) => {
  const record = getRequest(req.params.requestId);
  if (!record) {
    return res.status(404).json({
      status: "failed",
      attestationId: null,
      txHash: null,
      reason: "request_id_not_found"
    });
  }

  return res.json({
    status: statusForApi(record.status),
    attestationId: record.attestationId ?? null,
    txHash: record.txHash ?? null,
    reason: record.reason ?? null,
    verifierStatus: record.verifierStatus ?? null,
    fdcVotingRoundId: record.fdcVotingRoundId ?? null,
    fdcRequestTxHash: record.fdcRequestTxHash ?? null
  });
});

loadStore();
void processAllOpenRequests();
setInterval(() => {
  void processAllOpenRequests();
}, POLL_INTERVAL_MS);

const port = Number(process.env.PORT_FDC || 3001);
app.listen(port, () => {
  console.log(`FDC service listening on http://localhost:${port}`);
});
