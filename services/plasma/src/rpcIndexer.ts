import { JsonRpcProvider, getAddress, id } from "ethers";
import { envNumber } from "./config.js";
import { getWalletCache, setWalletCache } from "./cache.js";
import type { TransferEvent } from "./types.js";

const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

type RpcIndexParams = {
  wallet: string;
  stablecoinAllowlist: Set<string>;
};

function transferKey(transfer: TransferEvent): string {
  return [transfer.txHash.toLowerCase(), String(transfer.logIndex), transfer.token.toLowerCase()].join(":");
}

function sortTransfers(transfers: TransferEvent[]): TransferEvent[] {
  return [...transfers].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    if (a.logIndex !== b.logIndex) {
      return a.logIndex - b.logIndex;
    }
    const tokenCmp = a.token.toLowerCase().localeCompare(b.token.toLowerCase());
    if (tokenCmp !== 0) {
      return tokenCmp;
    }
    return a.txHash.toLowerCase().localeCompare(b.txHash.toLowerCase());
  });
}

function dedupeTransfers(transfers: TransferEvent[]): TransferEvent[] {
  const deduped = new Map<string, TransferEvent>();
  for (const transfer of transfers) {
    deduped.set(transferKey(transfer), transfer);
  }
  return sortTransfers([...deduped.values()]);
}

function asAddressFromTopic(topic: string): string {
  return getAddress(`0x${topic.slice(26)}`);
}

async function fetchBlockTimestamp(
  provider: JsonRpcProvider,
  blockNumber: number,
  cache: Map<number, number>
): Promise<number> {
  const cached = cache.get(blockNumber);
  if (cached !== undefined) {
    return cached;
  }

  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`missing_block_${blockNumber}`);
  }

  cache.set(blockNumber, block.timestamp);
  return block.timestamp;
}

async function fetchLogsByChunks(
  provider: JsonRpcProvider,
  token: string,
  toTopic: string,
  fromBlock: number,
  toBlock: number,
  chunkSize: number
): Promise<Awaited<ReturnType<JsonRpcProvider["getLogs"]>>> {
  const logs: Awaited<ReturnType<JsonRpcProvider["getLogs"]>> = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);

    const chunkLogs = await provider.getLogs({
      address: token,
      fromBlock: start,
      toBlock: end,
      topics: [TRANSFER_TOPIC, null, toTopic]
    });

    logs.push(...chunkLogs);
  }

  return logs;
}

function parseStartBlock(latestBlock: number): number {
  const explicit = process.env.PLASMA_START_BLOCK;
  if (explicit && explicit.trim().length > 0) {
    const value = Number(explicit);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("invalid_PLASMA_START_BLOCK");
    }
    return Math.floor(value);
  }

  const lookback = envNumber("PLASMA_LOOKBACK_BLOCKS", 350_000);
  return Math.max(0, latestBlock - lookback);
}

function expectedChainId(): number | null {
  const raw = process.env.PLASMA_CHAIN_ID;
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error("invalid_PLASMA_CHAIN_ID");
  }

  return parsed;
}

export async function fetchTransfersFromRpc(params: RpcIndexParams): Promise<TransferEvent[]> {
  const rpcUrl = process.env.PLASMA_RPC_URL;
  if (!rpcUrl || rpcUrl.trim().length === 0) {
    throw new Error("missing_PLASMA_RPC_URL");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const [network, latestBlock] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
  const chainId = Number(network.chainId);
  const configuredChainId = expectedChainId();
  if (configuredChainId !== null && configuredChainId !== chainId) {
    throw new Error(`plasma_chain_id_mismatch_expected_${configuredChainId}_actual_${chainId}`);
  }
  const wallet = getAddress(params.wallet);
  const walletLower = wallet.toLowerCase();

  const reorgDepth = Math.max(1, envNumber("PLASMA_REORG_DEPTH", 12));
  const chunkSize = Math.max(100, envNumber("PLASMA_LOG_CHUNK_SIZE", 2_000));

  const defaultStartBlock = parseStartBlock(latestBlock);
  const existing = getWalletCache(walletLower);

  const cacheUsable = existing && existing.chainId === chainId;
  const previousTransfers = cacheUsable ? existing.transfers : [];
  const previousSyncedBlock = cacheUsable ? existing.latestSyncedBlock : -1;

  const requeryFromBlock =
    previousSyncedBlock >= 0
      ? Math.max(defaultStartBlock, Math.max(0, previousSyncedBlock - reorgDepth + 1))
      : defaultStartBlock;

  const keepExisting = previousTransfers.filter((transfer) => transfer.blockNumber < requeryFromBlock);

  const toTopic = `0x000000000000000000000000${walletLower.slice(2)}`;

  const allLogs = [] as Awaited<ReturnType<JsonRpcProvider["getLogs"]>>;
  for (const token of params.stablecoinAllowlist) {
    const logs = await fetchLogsByChunks(provider, token, toTopic, requeryFromBlock, latestBlock, chunkSize);
    allLogs.push(...logs);
  }

  const blockTimestampCache = new Map<number, number>();
  const fetchedTransfers: TransferEvent[] = [];

  for (const log of allLogs) {
    if (!log.topics || log.topics.length < 3 || log.topics[0] !== TRANSFER_TOPIC) {
      continue;
    }

    const logIndex = log.index;
    if (log.blockNumber == null || logIndex == null || log.transactionHash == null) {
      continue;
    }

    const timestamp = await fetchBlockTimestamp(provider, log.blockNumber, blockTimestampCache);

    fetchedTransfers.push({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(logIndex),
      from: asAddressFromTopic(log.topics[1]),
      to: asAddressFromTopic(log.topics[2]),
      token: getAddress(log.address),
      amount: BigInt(log.data).toString(),
      timestamp
    });
  }

  const merged = dedupeTransfers([...keepExisting, ...fetchedTransfers]);

  setWalletCache(walletLower, {
    chainId,
    latestSyncedBlock: latestBlock,
    transfers: merged
  });

  return merged;
}
