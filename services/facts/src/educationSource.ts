import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Interface, JsonRpcProvider, getAddress, id } from "ethers";

export type EducationAttestationRecord = {
  attestationId: string;
  subject: string;
  certHash: string;
  provider: string;
  issuedAt: number;
};

const educationEventTopic = id("EducationAttested(bytes32,address,bytes32,string,uint64)");
const attestationStorageAbi = [
  "event EducationAttested(bytes32 attestationId,address subject,bytes32 certHash,string provider,uint64 issuedAt)"
] as const;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid_${name}`);
  }

  return parsed;
}

function resolveRpcUrl(): string {
  const rpcUrl = process.env.FLARE_RPC_URL;
  if (!rpcUrl || rpcUrl.trim().length === 0) {
    throw new Error("missing_FLARE_RPC_URL");
  }
  return rpcUrl;
}

function resolveAttestationStorageAddress(): string {
  const fromEnv = process.env.ATTESTATION_STORAGE_ADDRESS;
  if (fromEnv && fromEnv.trim().length > 0) {
    return getAddress(fromEnv);
  }

  const candidates = [
    resolve(process.cwd(), "deployments", "testnet", "addresses.latest.json"),
    resolve(process.cwd(), "deployments", "testnet", "addresses.example.json")
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf-8")) as {
        attestationStorage?: string;
      };
      if (parsed.attestationStorage) {
        return getAddress(parsed.attestationStorage);
      }
    } catch {
      continue;
    }
  }

  throw new Error("missing_ATTESTATION_STORAGE_ADDRESS");
}

function parseStartBlock(latestBlock: number): number {
  const explicit = process.env.FACTS_ATTESTATION_START_BLOCK;
  if (explicit && explicit.trim().length > 0) {
    const parsed = Number(explicit);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("invalid_FACTS_ATTESTATION_START_BLOCK");
    }
    return Math.floor(parsed);
  }

  const lookback = envNumber("FACTS_ATTESTATION_LOOKBACK_BLOCKS", 350_000);
  return Math.max(0, latestBlock - lookback);
}

export async function listEducationAttestationsForWallet(wallet: string): Promise<EducationAttestationRecord[]> {
  const provider = new JsonRpcProvider(resolveRpcUrl());
  const iface = new Interface(attestationStorageAbi);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = parseStartBlock(latestBlock);
  const chunkSize = Math.max(100, envNumber("FACTS_LOG_CHUNK_SIZE", 2_000));
  const attestationStorage = resolveAttestationStorageAddress();
  const walletLower = getAddress(wallet).toLowerCase();

  const results: EducationAttestationRecord[] = [];

  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    const end = Math.min(latestBlock, start + chunkSize - 1);
    const logs = await provider.getLogs({
      address: attestationStorage,
      fromBlock: start,
      toBlock: end,
      topics: [educationEventTopic]
    });

    for (const log of logs) {
      const parsed = iface.parseLog({
        topics: [...log.topics],
        data: log.data
      });

      if (!parsed) {
        continue;
      }

      const subject = getAddress(String(parsed.args.subject));
      if (subject.toLowerCase() !== walletLower) {
        continue;
      }

      results.push({
        attestationId: String(parsed.args.attestationId),
        subject,
        certHash: String(parsed.args.certHash),
        provider: String(parsed.args.provider),
        issuedAt: Number(parsed.args.issuedAt)
      });
    }
  }

  return results.sort((a, b) => {
    if (a.issuedAt !== b.issuedAt) {
      return b.issuedAt - a.issuedAt;
    }
    return a.attestationId.toLowerCase().localeCompare(b.attestationId.toLowerCase());
  });
}
