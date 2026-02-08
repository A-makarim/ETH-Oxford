import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchTransfersFromFallback } from "../src/fallbackIndexer.js";
import { FIXTURE_WALLET, TOKEN_A, TOKEN_B } from "./fixtures.js";

describe("fetchTransfersFromFallback", () => {
  it("filters by wallet and allowlist, then dedupes deterministically", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            txHash: "0xaaa",
            blockNumber: 10,
            logIndex: 1,
            from: "0x1000000000000000000000000000000000000001",
            to: FIXTURE_WALLET,
            token: TOKEN_A,
            amount: "1000",
            timestamp: 1761955200
          },
          {
            txHash: "0xaaa",
            blockNumber: 10,
            logIndex: 1,
            from: "0x1000000000000000000000000000000000000001",
            to: FIXTURE_WALLET,
            token: TOKEN_A,
            amount: "1000",
            timestamp: 1761955200
          },
          {
            txHash: "0xbbb",
            blockNumber: 11,
            logIndex: 1,
            from: "0x1000000000000000000000000000000000000001",
            to: FIXTURE_WALLET,
            token: TOKEN_B,
            amount: "1000",
            timestamp: 1764547200
          },
          {
            txHash: "0xccc",
            blockNumber: 12,
            logIndex: 1,
            from: "0x1000000000000000000000000000000000000001",
            to: "0x8888888888888888888888888888888888888888",
            token: TOKEN_A,
            amount: "1000",
            timestamp: 1767225600
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    try {
      const result = await fetchTransfersFromFallback({
        wallet: FIXTURE_WALLET,
        stablecoinAllowlist: new Set([TOKEN_A.toLowerCase()]),
        fallbackUrl: "https://fallback.local/transfers"
      });

      assert.equal(result.length, 1);
      assert.equal(result[0]?.token.toLowerCase(), TOKEN_A.toLowerCase());
      assert.equal(result[0]?.to.toLowerCase(), FIXTURE_WALLET.toLowerCase());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on invalid transfer amount", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            txHash: "0xddd",
            blockNumber: 10,
            logIndex: 1,
            from: "0x1000000000000000000000000000000000000001",
            to: FIXTURE_WALLET,
            token: TOKEN_A,
            amount: "not_a_number",
            timestamp: 1761955200
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    try {
      await assert.rejects(
        () =>
          fetchTransfersFromFallback({
            wallet: FIXTURE_WALLET,
            stablecoinAllowlist: new Set([TOKEN_A.toLowerCase()]),
            fallbackUrl: "https://fallback.local/transfers"
          }),
        /fallback_transfer_invalid_amount/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
