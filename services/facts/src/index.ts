import { config as loadEnv } from "dotenv";
import express from "express";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { listEducationAttestationsForWallet } from "./educationSource.js";
import { generateProofPackage, getLatestProofPackage } from "./proofService.js";
import { getVerificationJob, startVerificationJob, type VerificationCertificateInput } from "./verificationWorkflow.js";

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

const moduleDir = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(moduleDir, "../../../.env"), override: true });

const app = express();
app.use(
  cors({
    origin: (process.env.FACTS_CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  })
);
app.use(express.json());

function educationCommitmentPayload(
  wallet: string,
  attestation:
    | {
        provider: string;
        certHash: string;
        attestationId: string;
        issuedAt: number;
      }
    | undefined
): string {
  const walletLower = wallet.toLowerCase();
  if (!attestation) {
    return [walletLower, "", "", "", "0"].join("|");
  }

  return [
    walletLower,
    attestation.provider.toLowerCase(),
    attestation.certHash.toLowerCase(),
    attestation.attestationId.toLowerCase(),
    String(attestation.issuedAt)
  ].join("|");
}

function combinedCommitment(educationCommitment: string, employmentCommitment: string): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32"],
    [educationCommitment, employmentCommitment]
  );
  return keccak256(encoded);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "facts" });
});

app.get("/facts/:wallet", async (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);
    const plasmaUrl = process.env.PLASMA_SERVICE_URL || "http://localhost:3002";
    const plasmaResp = await fetch(`${plasmaUrl}/plasma/employment/${wallet}`);
    if (!plasmaResp.ok) {
      return res.status(502).json({
        error: "plasma_service_unavailable"
      });
    }

    const employment = (await plasmaResp.json()) as PlasmaResponse;

    const attestations = await listEducationAttestationsForWallet(wallet, { limit: 1 });
    const latestAttestation = attestations[0];
    const educationQualified = Boolean(latestAttestation);
    const employmentQualified = employment.qualifies;

    const educationCommitment = keccak256(toUtf8Bytes(educationCommitmentPayload(wallet, latestAttestation)));
    const employmentCommitment = employment.factCommitment;

    return res.json({
      educationQualified,
      employmentQualified,
      educationCommitment,
      employmentCommitment,
      combinedCommitment: combinedCommitment(educationCommitment, employmentCommitment)
    });
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message
    });
  }
});

app.get("/facts/:wallet/proof/latest", (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);
    const pkg = getLatestProofPackage(wallet);
    if (!pkg) {
      return res.status(404).json({
        error: "proof_package_not_found"
      });
    }
    return res.json(pkg);
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message
    });
  }
});

app.post("/facts/:wallet/proof/generate", async (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);
    const body = (req.body ?? {}) as {
      requiredSkillHash?: string;
      minExperienceMonths?: number | string;
      salaryCommitment?: string;
      educationExpiryAt?: number | string;
      employmentExperienceMonths?: number | string;
      educationSkillHash?: string;
      attestationId?: string;
    };

    const pkg = await generateProofPackage({
      wallet,
      requiredSkillHash: body.requiredSkillHash,
      minExperienceMonths: body.minExperienceMonths,
      salaryCommitment: body.salaryCommitment,
      educationExpiryAt: body.educationExpiryAt,
      employmentExperienceMonths: body.employmentExperienceMonths,
      educationSkillHash: body.educationSkillHash,
      attestationId: body.attestationId
    });

    return res.json(pkg);
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message
    });
  }
});

app.post("/verification/start", (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      wallet?: string;
      certificates?: VerificationCertificateInput[];
      requiredSkillHash?: string;
      minExperienceMonths?: number | string;
      salaryCommitment?: string;
      educationExpiryAt?: number | string;
      employmentExperienceMonths?: number | string;
      educationSkillHash?: string;
    };

    if (!body.wallet) {
      return res.status(400).json({ error: "missing_wallet" });
    }

    const certificates = Array.isArray(body.certificates) ? body.certificates : [];
    if (certificates.length === 0) {
      return res.status(400).json({ error: "missing_certificates" });
    }

    const invalidCertificate = certificates.find(
      (certificate) =>
        !certificate ||
        !certificate.provider ||
        !["udemy", "coursera", "datacamp", "edx"].includes(certificate.provider) ||
        !certificate.certificateUrlOrId
    );
    if (invalidCertificate) {
      return res.status(400).json({ error: "invalid_certificate_payload" });
    }

    const job = startVerificationJob({
      wallet: body.wallet,
      certificates,
      requiredSkillHash: body.requiredSkillHash,
      minExperienceMonths: body.minExperienceMonths,
      salaryCommitment: body.salaryCommitment,
      educationExpiryAt: body.educationExpiryAt,
      employmentExperienceMonths: body.employmentExperienceMonths,
      educationSkillHash: body.educationSkillHash
    });

    return res.json(job);
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message
    });
  }
});

app.get("/verification/:jobId", (req, res) => {
  const job = getVerificationJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      error: "verification_job_not_found"
    });
  }
  return res.json(job);
});

const port = Number(process.env.PORT_FACTS || 3003);
app.listen(port, () => {
  console.log(`Facts service listening on http://localhost:${port}`);
});
