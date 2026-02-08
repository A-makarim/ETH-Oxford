import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet, keccak256, solidityPacked } from "ethers";
import type {
  PollWeb2JsonRequestParams,
  PollWeb2JsonRequestResult,
  QueueWeb2JsonVerificationParams,
  QueueWeb2JsonVerificationResult,
  WriteAttestationParams,
  WriteAttestationResult
} from "./types.js";

const WEB2_JSON_ATTESTATION_TYPE = "0x576562324a736f6e000000000000000000000000000000000000000000000000";
const PUBLIC_WEB2_SOURCE_ID = "0x5075626c69635765623200000000000000000000000000000000000000000000";
const FLARE_CONTRACT_REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const flareContractRegistryAbi = [
  "function getContractAddressByName(string) external view returns (address)"
] as const;

const fdcHubAbi = [
  "function fdcRequestFeeConfigurations() external view returns (address)",
  "function requestsOffsetSeconds() external view returns (uint8)",
  "function requestAttestation(bytes _data) external payable"
] as const;

const fdcRequestFeeConfigurationAbi = ["function getRequestFee(bytes _data) external view returns (uint256)"] as const;

const relayAbi = [
  "function isFinalized(uint256 _protocolId,uint256 _votingRoundId) external view returns (bool)",
  "function getVotingRoundId(uint256 _timestamp) external view returns (uint256)"
] as const;
const fdcVerificationAbi = ["function fdcProtocolId() external view returns (uint8)"] as const;

const attestationStorageAbi = [
  "function recordEducationAttestation(bytes32 attestationId,address subject,bytes32 certHash,string provider,uint64 issuedAt) external",
  "function getEducationAttestation(bytes32 attestationId) external view returns (address subject,bytes32 certHash,string provider,uint64 issuedAt,bool exists)"
] as const;

type VerifierPrepareRequestResponse = {
  status?: string;
  abiEncodedRequest?: string;
  message?: string;
};

type FdcRequestContracts = {
  provider: JsonRpcProvider;
  signer: Wallet;
  fdcHub: Contract;
  feeConfig: Contract;
  relay: Contract;
  fdcVerification: Contract;
};

let cachedContractsPromise: Promise<FdcRequestContracts> | undefined;

function getEnv(name: string): string {
  const value = getSanitizedEnv(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getSanitizedEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.replace(/^['"]|['"]$/g, "").trim();
}

function getVerifierBaseUrl(): string {
  return (
    getSanitizedEnv("FDC_BASE_URL") ||
    getSanitizedEnv("VERIFIER_URL_TESTNET") ||
    "https://fdc-verifiers-testnet.flare.network"
  ).replace(/\/$/, "");
}

function getDataAvailabilityBaseUrl(): string {
  return (
    getSanitizedEnv("FDC_DA_BASE_URL") ||
    getSanitizedEnv("COSTON2_DA_LAYER_URL") ||
    "https://ctn2-data-availability.flare.network"
  ).replace(/\/$/, "");
}

function getDaRoundLookback(): number {
  const raw = getSanitizedEnv("FDC_DA_ROUND_LOOKBACK");
  const parsed = raw ? Number(raw) : 12;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 12;
  }
  return Math.floor(parsed);
}

function getDaRoundLookahead(): number {
  const raw = getSanitizedEnv("FDC_DA_ROUND_LOOKAHEAD");
  const parsed = raw ? Number(raw) : 1;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 1;
  }
  return Math.floor(parsed);
}

function parseAttestationStorageAddressFromDeployments(): string | undefined {
  const candidatePaths = [
    resolve(process.cwd(), "deployments", "testnet", "addresses.latest.json"),
    resolve(process.cwd(), "deployments", "testnet", "addresses.example.json")
  ];

  for (const path of candidatePaths) {
    if (!existsSync(path)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
        attestationStorage?: string;
      };
      if (parsed.attestationStorage) {
        return parsed.attestationStorage;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function getAttestationStorageAddress(): string {
  const fromEnv = process.env.ATTESTATION_STORAGE_ADDRESS;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }

  const fromDeployments = parseAttestationStorageAddressFromDeployments();
  if (fromDeployments) {
    return fromDeployments;
  }

  throw new Error("Missing ATTESTATION_STORAGE_ADDRESS and deployments/testnet address artifact");
}

async function getContracts(): Promise<FdcRequestContracts> {
  if (!cachedContractsPromise) {
    cachedContractsPromise = (async () => {
      const provider = new JsonRpcProvider(getEnv("FLARE_RPC_URL"));
      const signer = new Wallet(getEnv("DEPLOYER_PRIVATE_KEY"), provider);

      const registry = new Contract(FLARE_CONTRACT_REGISTRY_ADDRESS, flareContractRegistryAbi, provider);
      const [fdcHubAddress, relayAddress, fdcVerificationAddress] = await Promise.all([
        registry.getContractAddressByName("FdcHub"),
        registry.getContractAddressByName("Relay"),
        registry.getContractAddressByName("FdcVerification")
      ]);

      const fdcHub = new Contract(fdcHubAddress, fdcHubAbi, signer);
      const feeConfigAddress = await fdcHub.fdcRequestFeeConfigurations();
      const feeConfig = new Contract(feeConfigAddress, fdcRequestFeeConfigurationAbi, provider);
      const relay = new Contract(relayAddress, relayAbi, provider);
      const fdcVerification = new Contract(fdcVerificationAddress, fdcVerificationAbi, provider);

      return {
        provider,
        signer,
        fdcHub,
        feeConfig,
        relay,
        fdcVerification
      };
    })();
  }

  return cachedContractsPromise;
}

function inferIssuedAtSeconds(response: unknown): number {
  const fallback = Math.floor(Date.now() / 1000);
  const candidate = findFirstNumericValue(response, new Set(["lowestusedtimestamp", "timestamp", "issuedat"]));
  if (candidate === undefined || candidate <= 0) {
    return fallback;
  }
  return candidate;
}

function inferVotingRoundId(response: unknown): number | undefined {
  const candidate = findFirstNumericValue(response, new Set(["votinground", "votingroundid"]));
  if (candidate === undefined || candidate < 0) {
    return undefined;
  }
  return candidate;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function proofNotReadyReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("no proof") ||
    lower.includes("not available") ||
    lower.includes("not yet") ||
    lower.includes("not finalized") ||
    lower.includes("does not exist")
  );
}

function isRetryableDaStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function findFirstNumericValue(value: unknown, candidateKeys: Set<string>): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findFirstNumericValue(entry, candidateKeys);
      if (nested !== undefined) {
        return nested;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (candidateKeys.has(key.toLowerCase())) {
      const direct = findFirstNumericValue(nestedValue, candidateKeys);
      if (direct !== undefined) {
        return direct;
      }
    }
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    const nested = findFirstNumericValue(nestedValue, candidateKeys);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function getDaHeaders(): Record<string, string> {
  const apiKey = getSanitizedEnv("FDC_DA_API_KEY") || getSanitizedEnv("X_API_KEY");
  if (!apiKey || apiKey.trim().length === 0) {
    return {};
  }

  return {
    "X-API-KEY": apiKey,
    "x-api-key": apiKey
  };
}

function resolveVerifierApiKey(): { apiKey?: string; reason?: string } {
  const apiKey =
    getSanitizedEnv("FLARE_FDC_API_KEY") || getSanitizedEnv("VERIFIER_API_KEY_TESTNET") || getSanitizedEnv("VERIFIER_API_KEY");
  if (!apiKey) {
    return {
      reason: "Missing FLARE_FDC_API_KEY"
    };
  }

  return {
    apiKey
  };
}

async function getJson<TResponse>(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; payload: TResponse | null }> {
  const response = await fetch(url, {
    method: "GET",
    headers
  });

  let payload: TResponse | null = null;
  try {
    payload = (await response.json()) as TResponse;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

type DaRoundStatus = {
  voting_round_id?: number;
};

type DaFspStatus = {
  latest_fdc?: DaRoundStatus;
};

async function getLatestFdcRoundId(headers: Record<string, string>): Promise<number | undefined> {
  const url = `${getDataAvailabilityBaseUrl()}/api/v0/fsp/status`;
  const response = await getJson<DaFspStatus>(url, headers);
  if (!response.ok) {
    return undefined;
  }

  const roundId = response.payload?.latest_fdc?.voting_round_id;
  if (typeof roundId !== "number" || !Number.isFinite(roundId)) {
    return undefined;
  }

  return Math.floor(roundId);
}

function buildRoundCandidates(primaryRoundId: number, latestRoundId?: number): number[] {
  const candidates = new Set<number>();
  const lookback = getDaRoundLookback();
  const lookahead = getDaRoundLookahead();

  const push = (value: number | undefined): void => {
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      return;
    }
    candidates.add(Math.floor(value));
  };

  for (let delta = -lookback; delta <= lookahead; delta++) {
    push(primaryRoundId + delta);
  }

  if (latestRoundId !== undefined) {
    for (let delta = -lookback; delta <= lookahead; delta++) {
      push(latestRoundId + delta);
    }
  }

  return [...candidates].sort((a, b) => a - b);
}

type DaRawProofPayload = {
  response_hex?: string;
  proof?: string[];
  error?: string;
};

type DaDecodedProofPayload = {
  response?: unknown;
  proof?: string[];
  error?: string;
};

async function fetchProofByRound(
  verifierRequestBytes: string,
  votingRoundId: number | undefined,
  headers: Record<string, string>
): Promise<
  | {
      state: "pending";
      reason: string;
    }
  | {
      state: "failed";
      reason: string;
    }
  | {
      state: "verified";
      issuedAt: number;
      resolvedVotingRoundId?: number;
    }
> {
  const rawUrl = `${getDataAvailabilityBaseUrl()}/api/v1/fdc/proof-by-request-round-raw`;
  const decodedUrl = `${getDataAvailabilityBaseUrl()}/api/v1/fdc/proof-by-request-round`;
  const legacyDecodedUrl = `${getDataAvailabilityBaseUrl()}/api/v0/fdc/get-proof-round-id-bytes`;

  const requestPayload =
    votingRoundId === undefined
      ? {
          requestBytes: verifierRequestBytes
        }
      : {
          requestBytes: verifierRequestBytes,
          votingRoundId
        };

  const rawResponse = await postJson<DaRawProofPayload>(rawUrl, requestPayload, headers);
  if (!rawResponse.ok) {
    if (isRetryableDaStatus(rawResponse.status)) {
      return {
        state: "pending",
        reason: `da_http_${rawResponse.status}`
      };
    }

    const reason = rawResponse.payload?.error || `da_http_${rawResponse.status}`;
    if (proofNotReadyReason(reason)) {
      return {
        state: "pending",
        reason
      };
    }

    return {
      state: "failed",
      reason
    };
  }

  const rawPayload = rawResponse.payload;
  if (!rawPayload || !Array.isArray(rawPayload.proof) || rawPayload.proof.length === 0 || !rawPayload.response_hex) {
    return {
      state: "pending",
      reason: "proof_not_available_yet"
    };
  }

  const decodedResponse = await postJson<DaDecodedProofPayload>(decodedUrl, requestPayload, headers);
  if (!decodedResponse.ok) {
    if (isRetryableDaStatus(decodedResponse.status)) {
      return {
        state: "pending",
        reason: `da_decoded_http_${decodedResponse.status}`
      };
    }

    const decodedError = decodedResponse.payload?.error || `da_decoded_http_${decodedResponse.status}`;
    if (!proofNotReadyReason(decodedError)) {
      const legacyDecodedResponse = await postJson<DaDecodedProofPayload>(legacyDecodedUrl, requestPayload, headers);
      if (!legacyDecodedResponse.ok) {
        if (isRetryableDaStatus(legacyDecodedResponse.status)) {
          return {
            state: "pending",
            reason: `da_legacy_decoded_http_${legacyDecodedResponse.status}`
          };
        }

        const legacyError = legacyDecodedResponse.payload?.error || `da_legacy_decoded_http_${legacyDecodedResponse.status}`;
        if (!proofNotReadyReason(legacyError)) {
          return {
            state: "failed",
            reason: legacyError
          };
        }
      } else {
        return {
          state: "verified",
          issuedAt: inferIssuedAtSeconds(legacyDecodedResponse.payload?.response),
          resolvedVotingRoundId: votingRoundId ?? inferVotingRoundId(legacyDecodedResponse.payload?.response)
        };
      }
    }
  } else {
    return {
      state: "verified",
      issuedAt: inferIssuedAtSeconds(decodedResponse.payload?.response),
      resolvedVotingRoundId: votingRoundId ?? inferVotingRoundId(decodedResponse.payload?.response)
    };
  }

  return {
    state: "pending",
    reason: "proof_not_available_yet"
  };
}

async function postJson<TResponse>(
  url: string,
  body: object,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; payload: TResponse | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  let payload: TResponse | null = null;
  try {
    payload = (await response.json()) as TResponse;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

export async function queueWeb2JsonVerification(
  params: QueueWeb2JsonVerificationParams
): Promise<QueueWeb2JsonVerificationResult> {
  const { apiKey, reason: verifierApiKeyReason } = resolveVerifierApiKey();
  if (!apiKey) {
    return {
      accepted: false,
      reason: verifierApiKeyReason
    };
  }

  try {
    const prepareUrl = `${getVerifierBaseUrl()}/verifier/web2/Web2Json/prepareRequest`;
    const prepare = await postJson<VerifierPrepareRequestResponse>(
      prepareUrl,
      {
        attestationType: WEB2_JSON_ATTESTATION_TYPE,
        sourceId: PUBLIC_WEB2_SOURCE_ID,
        requestBody: params.normalized.web2JsonRequestBody
      },
      {
        "X-API-KEY": apiKey
      }
    );

    if (!prepare.ok) {
      return {
        accepted: false,
        reason: prepare.payload?.message || `verifier_prepare_request_failed_${prepare.status}`
      };
    }

    const verifierStatus = prepare.payload?.status;
    if (verifierStatus !== "VALID") {
      return {
        accepted: false,
        verifierStatus,
        reason: prepare.payload?.message || `verifier_invalid_status_${verifierStatus ?? "unknown"}`
      };
    }

    const verifierRequestBytes = prepare.payload?.abiEncodedRequest;
    if (!verifierRequestBytes) {
      return {
        accepted: false,
        verifierStatus,
        reason: "missing_verifier_request_bytes"
      };
    }

    const contracts = await getContracts();

    const [fee, requestOffsetSeconds] = await Promise.all([
      contracts.feeConfig.getRequestFee(verifierRequestBytes),
      contracts.fdcHub.requestsOffsetSeconds()
    ]);

    const requestTx = await contracts.fdcHub.requestAttestation(verifierRequestBytes, {
      value: fee
    });

    const receipt = await requestTx.wait();
    if (!receipt?.blockNumber) {
      return {
        accepted: false,
        verifierStatus,
        reason: "missing_request_tx_receipt"
      };
    }

    const block = await contracts.provider.getBlock(receipt.blockNumber);
    if (!block) {
      return {
        accepted: false,
        verifierStatus,
        reason: "missing_request_tx_block"
      };
    }

    const candidateTimestamp = BigInt(block.timestamp) + BigInt(requestOffsetSeconds);
    const computedRoundId = await contracts.relay.getVotingRoundId(candidateTimestamp);
    const fdcVotingRoundId = Number(computedRoundId);
    if (!Number.isFinite(fdcVotingRoundId)) {
      return {
        accepted: false,
        verifierStatus,
        reason: "invalid_computed_voting_round_id"
      };
    }

    return {
      accepted: true,
      verifierStatus,
      verifierRequestBytes,
      fdcVotingRoundId,
      fdcRequestTxHash: requestTx.hash
    };
  } catch (error) {
    return {
      accepted: false,
      reason: `fdc_request_error_${errorMessage(error)}`
    };
  }
}

export async function pollWeb2JsonVerification(
  params: PollWeb2JsonRequestParams
): Promise<PollWeb2JsonRequestResult> {
  try {
    const contracts = await getContracts();
    const protocolId = await contracts.fdcVerification.fdcProtocolId();
    const headers = getDaHeaders();

    // Prefer round-agnostic lookup first; DA returns the concrete voting round in response.
    const roundAgnosticProof = await fetchProofByRound(params.verifierRequestBytes, undefined, headers);
    if (roundAgnosticProof.state === "verified") {
      return {
        state: "verified",
        issuedAt: roundAgnosticProof.issuedAt,
        resolvedVotingRoundId: roundAgnosticProof.resolvedVotingRoundId
      };
    }
    if (roundAgnosticProof.state === "failed") {
      return {
        state: "failed",
        reason: roundAgnosticProof.reason
      };
    }
    if (roundAgnosticProof.reason && /^da(_decoded|_legacy_decoded)?_http_(408|429|5\d\d)$/.test(roundAgnosticProof.reason)) {
      return {
        state: "pending",
        reason: roundAgnosticProof.reason
      };
    }

    const latestRoundId = await getLatestFdcRoundId(headers);
    const roundCandidates = buildRoundCandidates(params.fdcVotingRoundId, latestRoundId);

    let sawFinalizedRound = false;
    let pendingReason = "proof_not_available_yet";

    for (const roundId of roundCandidates) {
      const isFinalized = await contracts.relay.isFinalized(protocolId, BigInt(roundId));
      if (!isFinalized) {
        continue;
      }

      sawFinalizedRound = true;

      const proofResult = await fetchProofByRound(params.verifierRequestBytes, roundId, headers);
      if (proofResult.state === "verified") {
        return {
          state: "verified",
          issuedAt: proofResult.issuedAt,
          resolvedVotingRoundId: proofResult.resolvedVotingRoundId
        };
      }

      if (proofResult.state === "failed") {
        return {
          state: "failed",
          reason: proofResult.reason
        };
      }

      pendingReason = proofResult.reason;
    }

    if (!sawFinalizedRound) {
      return {
        state: "pending",
        reason: "voting_round_not_finalized"
      };
    }

    return {
      state: "pending",
      reason: pendingReason
    };
  } catch (error) {
    return {
      state: "pending",
      reason: `da_poll_error_${errorMessage(error)}`
    };
  }
}

export function deriveAttestationId(verifierRequestBytes: string, fdcVotingRoundId: number): string {
  return keccak256(solidityPacked(["bytes", "uint64"], [verifierRequestBytes, BigInt(fdcVotingRoundId)]));
}

export async function writeEducationAttestation(params: WriteAttestationParams): Promise<WriteAttestationResult> {
  const contracts = await getContracts();
  const attestationStorage = new Contract(getAttestationStorageAddress(), attestationStorageAbi, contracts.signer);

  try {
    const existing = await attestationStorage.getEducationAttestation(params.attestationId);
    const exists = Boolean(existing?.[4]);
    if (exists) {
      return {
        txHash: null,
        alreadyExists: true
      };
    }

    const tx = await attestationStorage.recordEducationAttestation(
      params.attestationId,
      params.wallet,
      params.certHash,
      params.provider,
      params.issuedAt
    );

    await tx.wait();

    return {
      txHash: tx.hash,
      alreadyExists: false
    };
  } catch (error) {
    const reason = errorMessage(error);
    if (reason.includes("DuplicateAttestation")) {
      return {
        txHash: null,
        alreadyExists: true
      };
    }

    throw error;
  }
}
