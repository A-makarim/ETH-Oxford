import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AbiCoder, getAddress, keccak256 } from "ethers";
import { listEducationAttestationsForWallet } from "./educationSource.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(moduleDir, "../../../");
const packagesDir = resolve(moduleDir, "..", ".proof-packages");
const vectorsBaseDir = resolve(rootDir, "circuits", "vectors", "generated");

export type GenerateProofParams = {
  wallet: string;
  requiredSkillHash?: string;
  minExperienceMonths?: number | string;
  salaryCommitment?: string;
  educationExpiryAt?: number | string;
  employmentExperienceMonths?: number | string;
  educationSkillHash?: string;
  attestationId?: string;
};

export type ProofPackage = {
  wallet: string;
  generatedAt: string;
  proofBytes: string;
  publicSignals: string[];
  proofHash: string;
  metadata: Record<string, unknown> | null;
  artifacts: {
    input: string;
    proof: string;
    publicSignals: string;
    calldata: string;
  };
};

type CalldataVector = {
  proofBytes: string;
  publicSignals: string[];
};

type PlasmaEmploymentResponse = {
  qualifies: boolean;
  employer: string | null;
  token: string | null;
  monthsMatched: string[];
  paymentCount: number;
};

function envOr(name: string, fallback?: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  return value;
}

function requireNumber(value: number | string | undefined, fallbackEnv: string, label: string): number {
  const fromEnv = envOr(fallbackEnv);
  const normalized =
    value === undefined ? undefined : typeof value === "string" ? Number(value.trim()) : Number(value);
  const candidate = normalized ?? (fromEnv ? Number(fromEnv) : undefined);
  if (candidate === undefined || !Number.isFinite(candidate) || candidate < 0) {
    throw new Error(`missing_or_invalid_${label}`);
  }
  return Math.floor(candidate);
}

function requireNumericString(value: string | undefined, fallbackEnv: string, label: string): string {
  const candidate = value ?? envOr(fallbackEnv);
  if (!candidate) {
    throw new Error(`missing_${label}`);
  }
  if (!/^\d+$/.test(candidate.trim())) {
    throw new Error(`invalid_${label}`);
  }
  return candidate.trim();
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const preferred =
      lines.find((line) => /error in template/i.test(line)) ||
      lines.find((line) => /assert failed/i.test(line)) ||
      lines.find((line) => /^error:/i.test(line)) ||
      lines.find((line) => /missing_|not found|failed|invalid/i.test(line)) ||
      lines[0] ||
      "unknown_error";
    throw new Error(`command_failed_${command}: ${preferred}`);
  }
}

function relativeToRoot(path: string): string {
  return path.replace(`${rootDir}\\`, "").replace(`${rootDir}/`, "");
}

function packagePathForWallet(wallet: string): string {
  mkdirSync(packagesDir, { recursive: true });
  return resolve(packagesDir, `${wallet.toLowerCase()}.json`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function computeProofHash(proofBytes: string, publicSignals: string[]): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256[]"],
    [proofBytes, publicSignals.map((value) => BigInt(value))]
  );
  return keccak256(encoded);
}

async function assertEmploymentQualifies(wallet: string): Promise<void> {
  const plasmaUrl = (process.env.PLASMA_SERVICE_URL || "http://localhost:3002").replace(/\/+$/, "");
  const response = await fetch(`${plasmaUrl}/plasma/employment/${wallet}`);
  const body = (await response.json()) as PlasmaEmploymentResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "plasma_service_unavailable");
  }
  if (!body.qualifies) {
    throw new Error("employment_not_qualified");
  }
}

async function resolveAttestationId(wallet: string, requestedAttestationId?: string): Promise<string> {
  const attestations = await listEducationAttestationsForWallet(wallet, { limit: 10 });

  if (requestedAttestationId && requestedAttestationId.trim().length > 0) {
    const normalizedRequested = requestedAttestationId.trim().toLowerCase();
    const matched = attestations.find(
      (attestation) => attestation.attestationId.toLowerCase() === normalizedRequested
    );
    if (matched) {
      return matched.attestationId;
    }
    if (attestations[0]) {
      return attestations[0].attestationId;
    }
    throw new Error("missing_education_attestation_for_wallet");
  }

  if (!attestations[0]) {
    throw new Error("missing_education_attestation_for_wallet");
  }
  return attestations[0].attestationId;
}

export async function generateProofPackage(params: GenerateProofParams): Promise<ProofPackage> {
  const wallet = getAddress(params.wallet);
  await assertEmploymentQualifies(wallet);
  const attestationId = await resolveAttestationId(wallet, params.attestationId);

  const requiredSkillHash = requireNumericString(
    params.requiredSkillHash,
    "ZK_REQUIRED_SKILL_HASH",
    "required_skill_hash"
  );
  const minExperienceMonths = requireNumber(
    params.minExperienceMonths,
    "ZK_MIN_EXPERIENCE_MONTHS",
    "min_experience_months"
  );
  const salaryCommitment = requireNumericString(
    params.salaryCommitment,
    "ZK_SALARY_COMMITMENT",
    "salary_commitment"
  );
  const educationExpiryAt = requireNumber(
    params.educationExpiryAt,
    "ZK_EDUCATION_EXPIRY_AT",
    "education_expiry_at"
  );
  const employmentExperienceMonths = requireNumber(
    params.employmentExperienceMonths,
    "ZK_EMPLOYMENT_EXPERIENCE_MONTHS",
    "employment_experience_months"
  );
  const educationSkillHash = requireNumericString(
    params.educationSkillHash,
    "ZK_EDUCATION_SKILL_HASH",
    "education_skill_hash"
  );

  const walletDir = resolve(vectorsBaseDir, wallet.toLowerCase());
  mkdirSync(walletDir, { recursive: true });

  const inputPath = resolve(walletDir, "input.real.json");
  const metadataPath = resolve(walletDir, "input.real.meta.json");
  const proofPath = resolve(walletDir, "proof.json");
  const publicSignalsPath = resolve(walletDir, "public.json");
  const calldataPath = resolve(walletDir, "calldata.json");

  runCommand("node", [
    resolve(rootDir, "scripts", "zk", "generate-inputs-real.js"),
    "--wallet",
    wallet,
    "--attestation-id",
    attestationId,
    "--required-skill-hash",
    requiredSkillHash,
    "--education-skill-hash",
    educationSkillHash,
    "--min-experience-months",
    String(minExperienceMonths),
    "--salary-commitment",
    salaryCommitment,
    "--education-expiry-at",
    String(educationExpiryAt),
    "--employment-experience-months",
    String(employmentExperienceMonths),
    "--out",
    inputPath
  ]);

  runCommand("node", [
    resolve(rootDir, "scripts", "zk", "generate-proof.js"),
    "--input",
    inputPath,
    "--out",
    walletDir
  ]);

  const calldata = readJson<CalldataVector>(calldataPath);
  const metadata = existsSync(metadataPath) ? readJson<Record<string, unknown>>(metadataPath) : null;

  const pkg: ProofPackage = {
    wallet,
    generatedAt: new Date().toISOString(),
    proofBytes: calldata.proofBytes,
    publicSignals: calldata.publicSignals,
    proofHash: computeProofHash(calldata.proofBytes, calldata.publicSignals),
    metadata,
    artifacts: {
      input: relativeToRoot(inputPath),
      proof: relativeToRoot(proofPath),
      publicSignals: relativeToRoot(publicSignalsPath),
      calldata: relativeToRoot(calldataPath)
    }
  };

  writeFileSync(packagePathForWallet(wallet), JSON.stringify(pkg, null, 2));
  return pkg;
}

export function getLatestProofPackage(wallet: string): ProofPackage | null {
  const normalized = getAddress(wallet);
  const path = packagePathForWallet(normalized);
  if (!existsSync(path)) {
    return null;
  }
  return readJson<ProofPackage>(path);
}
