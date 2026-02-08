import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTransfersForWallet } from "../src/transferSource.js";
import { FIXTURE_WALLET, TOKEN_A, positiveTransfers } from "./fixtures.js";

describe("loadTransfersForWallet", () => {
  it("uses rpc source when rpc indexer succeeds", async () => {
    const result = await loadTransfersForWallet(
      {
        wallet: FIXTURE_WALLET,
        stablecoinAllowlist: new Set([TOKEN_A.toLowerCase()])
      },
      {
        rpcIndexer: async () => positiveTransfers.slice(0, 1)
      }
    );

    assert.equal(result.dataSource, "rpc");
    assert.equal(result.transfers.length, 1);
  });

  it("falls back when rpc indexer fails", async () => {
    const result = await loadTransfersForWallet(
      {
        wallet: FIXTURE_WALLET,
        stablecoinAllowlist: new Set([TOKEN_A.toLowerCase()]),
        fallbackUrl: "https://fallback.local/transfers"
      },
      {
        rpcIndexer: async () => {
          throw new Error("rpc_down");
        },
        fallbackIndexer: async () => positiveTransfers.slice(0, 2)
      }
    );

    assert.equal(result.dataSource, "fallback");
    assert.equal(result.transfers.length, 2);
    assert.match(result.reason || "", /rpc_failed/);
  });

  it("throws when rpc fails and fallback is not configured", async () => {
    await assert.rejects(
      () =>
        loadTransfersForWallet(
          {
            wallet: FIXTURE_WALLET,
            stablecoinAllowlist: new Set([TOKEN_A.toLowerCase()])
          },
          {
            rpcIndexer: async () => {
              throw new Error("rpc_down");
            }
          }
        ),
      /rpc_indexer_failed_rpc_down/
    );
  });
});
