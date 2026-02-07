import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { getAddress } from "ethers";
import { z } from "zod";
import { queueWeb2JsonVerification } from "./fdcClient.js";
import { normalizeCertificateInput } from "./providerNormalizer.js";
import { getRequest, setRequest, updateRequest } from "./store.js";
import type { EducationStatusRecord } from "./types.js";

const app = express();
app.use(express.json());

const submitSchema = z.object({
  wallet: z.string(),
  provider: z.enum(["udemy", "coursera"]),
  certificateUrlOrId: z.string().min(3)
});

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
    normalized = normalizeCertificateInput(parse.data);
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
    updatedAt: now
  };

  setRequest(baseRecord);

  const queueResult = await queueWeb2JsonVerification({
    provider: normalized.provider,
    certificateSource: normalized.source
  });

  if (!queueResult.accepted) {
    updateRequest(requestId, {
      status: "failed",
      reason: queueResult.reason
    });
    return res.json({
      requestId,
      status: "rejected"
    });
  }

  updateRequest(requestId, {
    status: "accepted"
  });

  // Simulate async verifier completion and chain write.
  setTimeout(() => {
    const status = getRequest(requestId);
    if (!status) {
      return;
    }

    const attestationId = `0x${requestId.replace(/-/g, "").padEnd(64, "0").slice(0, 64)}`;
    const txHash = `0x${requestId.replace(/-/g, "").padEnd(64, "a").slice(0, 64)}`;

    updateRequest(requestId, {
      status: "verified",
      attestationId,
      txHash,
      reason: undefined
    });
  }, 1500);

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
    status: record.status,
    attestationId: record.attestationId ?? null,
    txHash: record.txHash ?? null,
    reason: record.reason ?? null
  });
});

const port = Number(process.env.PORT_FDC || 3001);
app.listen(port, () => {
  console.log(`FDC service listening on http://localhost:${port}`);
});

