import type { TransferEvent } from "../src/types.js";

export const FIXTURE_WALLET = "0x9999999999999999999999999999999999999999";
export const EMPLOYER_A = "0x1000000000000000000000000000000000000001";
export const EMPLOYER_B = "0x1000000000000000000000000000000000000002";
export const TOKEN_A = "0x2000000000000000000000000000000000000001";
export const TOKEN_B = "0x2000000000000000000000000000000000000002";

export const employers = new Set([EMPLOYER_A.toLowerCase(), EMPLOYER_B.toLowerCase()]);
export const stablecoins = new Set([TOKEN_A.toLowerCase(), TOKEN_B.toLowerCase()]);

export const positiveTransfers: TransferEvent[] = [
  {
    txHash: "0x01",
    blockNumber: 10,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1764547199
  },
  {
    txHash: "0x02",
    blockNumber: 11,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1765756800
  },
  {
    txHash: "0x03",
    blockNumber: 12,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_B,
    amount: "1000",
    timestamp: 1767225600
  },
  {
    txHash: "0x04",
    blockNumber: 13,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1767916800
  }
];

export const missingMonthTransfers: TransferEvent[] = [
  {
    txHash: "0x05",
    blockNumber: 20,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1762732800
  },
  {
    txHash: "0x06",
    blockNumber: 21,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1767225600
  }
];

export const tieBreakTransfers: TransferEvent[] = [
  {
    txHash: "0x10",
    blockNumber: 30,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1761955200
  },
  {
    txHash: "0x11",
    blockNumber: 31,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1764547200
  },
  {
    txHash: "0x12",
    blockNumber: 32,
    logIndex: 0,
    from: EMPLOYER_A,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1767225600
  },
  {
    txHash: "0x20",
    blockNumber: 33,
    logIndex: 0,
    from: EMPLOYER_B,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1761955200
  },
  {
    txHash: "0x21",
    blockNumber: 34,
    logIndex: 0,
    from: EMPLOYER_B,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1764547200
  },
  {
    txHash: "0x22",
    blockNumber: 35,
    logIndex: 0,
    from: EMPLOYER_B,
    to: FIXTURE_WALLET,
    token: TOKEN_A,
    amount: "1000",
    timestamp: 1767225600
  }
];
