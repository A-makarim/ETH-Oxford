import { getAddress } from "ethers";
import type { TransferEvent } from "./types.js";

type FallbackParams = {
  wallet: string;
  stablecoinAllowlist: Set<string>;
  fallbackUrl: string;
};

type RawTransfer = Partial<TransferEvent> & {
  txHash?: string;
  blockNumber?: number;
  logIndex?: number;
  from?: string;
  to?: string;
  token?: string;
  amount?: string;
  timestamp?: number;
};

function resolveFallbackUrl(baseUrl: string, wallet: string, tokens: string[]): string {
  const encodedWallet = encodeURIComponent(wallet);
  const encodedTokens = encodeURIComponent(tokens.join(","));

  const withWallet = baseUrl.includes("{wallet}") ? baseUrl.replace("{wallet}", encodedWallet) : baseUrl;
  const delimiter = withWallet.includes("?") ? "&" : "?";

  return `${withWallet}${delimiter}wallet=${encodedWallet}&tokens=${encodedTokens}`;
}

function normalizeTransfer(value: RawTransfer, wallet: string): TransferEvent {
  if (
    !value.txHash ||
    value.blockNumber === undefined ||
    value.logIndex === undefined ||
    !value.from ||
    !value.to ||
    !value.token ||
    value.amount === undefined ||
    value.timestamp === undefined
  ) {
    throw new Error("fallback_transfer_missing_fields");
  }

  return {
    txHash: value.txHash,
    blockNumber: Number(value.blockNumber),
    logIndex: Number(value.logIndex),
    from: getAddress(value.from),
    to: getAddress(value.to),
    token: getAddress(value.token),
    amount: String(value.amount),
    timestamp: Number(value.timestamp)
  };
}

export async function fetchTransfersFromFallback(params: FallbackParams): Promise<TransferEvent[]> {
  const url = resolveFallbackUrl(params.fallbackUrl, params.wallet, [...params.stablecoinAllowlist]);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`fallback_http_${response.status}`);
  }

  const payload = (await response.json()) as RawTransfer[] | { transfers?: RawTransfer[] };
  const items = Array.isArray(payload) ? payload : payload.transfers;
  if (!items || !Array.isArray(items)) {
    throw new Error("fallback_invalid_payload");
  }

  const normalized = items
    .map((item) => normalizeTransfer(item, params.wallet))
    .filter((transfer) => transfer.to.toLowerCase() === params.wallet.toLowerCase());

  return normalized.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    if (a.logIndex !== b.logIndex) {
      return a.logIndex - b.logIndex;
    }
    return a.txHash.toLowerCase().localeCompare(b.txHash.toLowerCase());
  });
}
