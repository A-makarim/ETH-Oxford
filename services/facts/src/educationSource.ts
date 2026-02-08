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

  const lookback = envNumber("FACTS_ATTESTATION_LOOKBACK_BLOCKS", 5_000);
  return Math.max(0, latestBlock - lookback);
}

function parseMaxBlockRangeFromError(error: unknown): number | null {
  const message = (error as { message?: string })?.message;
  if (!message) {
    return null;
  }

  const exact = message.match(/maximum is set to (\d+)/i);
  if (exact) {
    return Number(exact[1]);
  }

  const generic = message.match(/max(?:imum)?(?:imum)?[^0-9]*(\d+)/i);
  if (generic) {
    return Number(generic[1]);
  }

  return null;
}

export async function listEducationAttestationsForWallet(
  wallet: string,
  options?: { limit?: number }
): Promise<EducationAttestationRecord[]> {
  const provider = new JsonRpcProvider(resolveRpcUrl());
  const iface = new Interface(attestationStorageAbi);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = parseStartBlock(latestBlock);
  let chunkSize = Math.max(1, envNumber("FACTS_LOG_CHUNK_SIZE", 30));
  const attestationStorage = resolveAttestationStorageAddress();
  const walletLower = getAddress(wallet).toLowerCase();
  const limit = options?.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

  const results: EducationAttestationRecord[] = [];

  for (let end = latestBlock; end >= fromBlock; ) {
    const start = Math.max(fromBlock, end - chunkSize + 1);
    let logs;

    try {
      logs = await provider.getLogs({
        address: attestationStorage,
        fromBlock: start,
        toBlock: end,
        topics: [educationEventTopic]
      });
    } catch (error) {
      const maxRange = parseMaxBlockRangeFromError(error);
      if (maxRange && maxRange > 0 && maxRange < chunkSize) {
        chunkSize = maxRange;
        continue;
      }
      throw error;
    }

    for (let index = logs.length - 1; index >= 0; index--) {
      const log = logs[index];
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

      if (limit && results.length >= limit) {
        return results;
      }
    }

    end = start - 1;
  }

  return results.sort((a, b) => {
    if (a.issuedAt !== b.issuedAt) {
      return b.issuedAt - a.issuedAt;
    }
    return a.attestationId.toLowerCase().localeCompare(b.attestationId.toLowerCase());
  });
}
