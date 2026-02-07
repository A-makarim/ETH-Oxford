import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TransferEvent } from "./types.js";

type WalletCache = {
  chainId: number;
  latestSyncedBlock: number;
  transfers: TransferEvent[];
};

type PlasmaCache = {
  wallets: Record<string, WalletCache>;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultPath = resolve(moduleDir, "..", ".plasma-index-cache.json");
const cachePath = process.env.PLASMA_INDEX_CACHE_PATH ? resolve(process.env.PLASMA_INDEX_CACHE_PATH) : defaultPath;

function loadRaw(): PlasmaCache {
  if (!existsSync(cachePath)) {
    return { wallets: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8")) as PlasmaCache;
    return {
      wallets: parsed.wallets || {}
    };
  } catch {
    return { wallets: {} };
  }
}

function persist(cache: PlasmaCache): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export function getWalletCache(wallet: string): WalletCache | undefined {
  const cache = loadRaw();
  return cache.wallets[wallet.toLowerCase()];
}

export function setWalletCache(wallet: string, entry: WalletCache): void {
  const cache = loadRaw();
  cache.wallets[wallet.toLowerCase()] = entry;
  persist(cache);
}
