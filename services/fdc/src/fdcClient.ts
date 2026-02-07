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
  "function requestAttestation(bytes _data) external payable"
] as const;

const fdcRequestFeeConfigurationAbi = ["function getRequestFee(bytes _data) external view returns (uint256)"] as const;

const flareSystemsManagerAbi = [
  "function firstVotingRoundStartTs() external view returns (uint64)",
  "function votingEpochDurationSeconds() external view returns (uint64)"
] as const;

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
  flareSystemsManager: Contract;
};

let cachedContractsPromise: Promise<FdcRequestContracts> | undefined;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getVerifierBaseUrl(): string {
  return (process.env.FDC_BASE_URL || "https://fdc-verifiers-testnet.flare.network").replace(/\/$/, "");
}

function getDataAvailabilityBaseUrl(): string {
  return (process.env.FDC_DA_BASE_URL || "https://ctn2-data-availability.flare.network").replace(/\/$/, "");
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
      const [fdcHubAddress, flareSystemsManagerAddress] = await Promise.all([
        registry.getContractAddressByName("FdcHub"),
        registry.getContractAddressByName("FlareSystemsManager")
      ]);

      const fdcHub = new Contract(fdcHubAddress, fdcHubAbi, signer);
      const feeConfigAddress = await fdcHub.fdcRequestFeeConfigurations();
      const feeConfig = new Contract(feeConfigAddress, fdcRequestFeeConfigurationAbi, provider);
      const flareSystemsManager = new Contract(flareSystemsManagerAddress, flareSystemsManagerAbi, provider);

      return {
        provider,
        signer,
        fdcHub,
        feeConfig,
        flareSystemsManager
      };
    })();
  }

  return cachedContractsPromise;
}

function computeVotingRoundId(blockTimestamp: bigint, firstVotingRoundStart: bigint, votingRoundDuration: bigint): number {
  if (votingRoundDuration <= 0n) {
    throw new Error("invalid_voting_round_duration");
  }

  if (blockTimestamp < firstVotingRoundStart) {
    throw new Error("block_timestamp_before_first_voting_round");
  }

  const id = (blockTimestamp - firstVotingRoundStart) / votingRoundDuration;
  return Number(id);
}

function inferIssuedAtSeconds(response: unknown): number {
  if (!response || typeof response !== "object") {
    return Math.floor(Date.now() / 1000);
  }

  const candidate = (response as Record<string, unknown>).lowestUsedTimestamp;

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return Math.floor(candidate);
  }

  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }

  return Math.floor(Date.now() / 1000);
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
  const apiKey = process.env.FLARE_FDC_API_KEY;
  if (!apiKey) {
    return {
      accepted: false,
      reason: "Missing FLARE_FDC_API_KEY"
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
        reason: `verifier_prepare_request_failed_${prepare.status}`
      };
    }

    const verifierStatus = prepare.payload?.status;
    if (verifierStatus !== "VALID") {
      return {
        accepted: false,
        verifierStatus,
        reason: `verifier_invalid_status_${verifierStatus ?? "unknown"}`
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

    const [fee, firstVotingRoundStartTs, votingEpochDurationSeconds] = await Promise.all([
      contracts.feeConfig.getRequestFee(verifierRequestBytes),
      contracts.flareSystemsManager.firstVotingRoundStartTs(),
      contracts.flareSystemsManager.votingEpochDurationSeconds()
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

    const fdcVotingRoundId = computeVotingRoundId(
      BigInt(block.timestamp),
      BigInt(firstVotingRoundStartTs),
      BigInt(votingEpochDurationSeconds)
    );

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
  const url = `${getDataAvailabilityBaseUrl()}/api/v1/fdc/proof-by-request-round`;

  try {
    const response = await postJson<{ response?: unknown; proof?: string[]; error?: string }>(
      url,
      {
        requestBytes: params.verifierRequestBytes,
        votingRoundId: params.fdcVotingRoundId
      },
      {}
    );

    if (!response.ok) {
      const reason = response.payload?.error || `da_http_${response.status}`;
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

    const payload = response.payload;
    if (!payload || !Array.isArray(payload.proof) || payload.proof.length === 0 || !payload.response) {
      return {
        state: "pending",
        reason: "proof_not_available_yet"
      };
    }

    return {
      state: "verified",
      issuedAt: inferIssuedAtSeconds(payload.response)
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
