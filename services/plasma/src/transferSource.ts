import { fetchTransfersFromFallback } from "./fallbackIndexer.js";
import { fetchTransfersFromRpc } from "./rpcIndexer.js";
import type { TransferEvent, TransferSourceResult } from "./types.js";

type LoadTransfersParams = {
  wallet: string;
  stablecoinAllowlist: Set<string>;
  fallbackUrl?: string;
};

type LoadTransfersDeps = {
  rpcIndexer?: (params: { wallet: string; stablecoinAllowlist: Set<string> }) => Promise<TransferEvent[]>;
  fallbackIndexer?: (params: {
    wallet: string;
    stablecoinAllowlist: Set<string>;
    fallbackUrl: string;
  }) => Promise<TransferEvent[]>;
};

export async function loadTransfersForWallet(
  params: LoadTransfersParams,
  deps: LoadTransfersDeps = {}
): Promise<TransferSourceResult> {
  const rpcIndexer = deps.rpcIndexer ?? fetchTransfersFromRpc;
  const fallbackIndexer = deps.fallbackIndexer ?? fetchTransfersFromFallback;

  try {
    const transfers = await rpcIndexer({
      wallet: params.wallet,
      stablecoinAllowlist: params.stablecoinAllowlist
    });

    return {
      transfers,
      dataSource: "rpc"
    };
  } catch (error) {
    const rpcError = (error as Error).message;

    if (!params.fallbackUrl) {
      throw new Error(`rpc_indexer_failed_${rpcError}`);
    }

    const fallbackTransfers = await fallbackIndexer({
      wallet: params.wallet,
      stablecoinAllowlist: params.stablecoinAllowlist,
      fallbackUrl: params.fallbackUrl
    });

    return {
      transfers: fallbackTransfers,
      dataSource: "fallback",
      reason: `rpc_failed_${rpcError}`
    };
  }
}
