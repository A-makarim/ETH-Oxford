import { keccak256, toUtf8Bytes } from "ethers";
import type { EmploymentResult, TransferEvent } from "./types.js";

type EmploymentResultWithToken = Omit<EmploymentResult, "factCommitment"> & {
  token: string | null;
};

function monthKey(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthKey(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return year * 12 + (month - 1);
}

function toConsecutiveWindows(months: string[]): [string, string, string][] {
  const unique = [...new Set(months)].sort((a, b) => parseMonthKey(a) - parseMonthKey(b));
  const windows: [string, string, string][] = [];

  for (let i = 0; i <= unique.length - 3; i += 1) {
    const a = parseMonthKey(unique[i]);
    const b = parseMonthKey(unique[i + 1]);
    const c = parseMonthKey(unique[i + 2]);

    if (b === a + 1 && c === b + 1) {
      windows.push([unique[i], unique[i + 1], unique[i + 2]]);
    }
  }

  return windows;
}

function resolveToken(transfersInWindow: TransferEvent[]): string {
  const counts = new Map<string, number>();
  for (const transfer of transfersInWindow) {
    const token = transfer.token.toLowerCase();
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let bestToken: string | null = null;
  let bestCount = -1;

  for (const [token, count] of counts.entries()) {
    if (count > bestCount) {
      bestToken = token;
      bestCount = count;
      continue;
    }

    if (count === bestCount && bestToken && token < bestToken) {
      bestToken = token;
    }
  }

  return bestToken ?? "";
}

function pickBestWindowForEmployer(transfers: TransferEvent[]): {
  monthsMatched: [string, string, string] | null;
  paymentCount: number;
  token: string | null;
} {
  const months = transfers.map((transfer) => monthKey(transfer.timestamp));
  const windows = toConsecutiveWindows(months);
  if (windows.length === 0) {
    return {
      monthsMatched: null,
      paymentCount: 0,
      token: null
    };
  }

  let bestMonths: [string, string, string] | null = null;
  let bestCount = -1;
  let bestToken = "";

  for (const window of windows) {
    const transfersInWindow = transfers.filter((transfer) => window.includes(monthKey(transfer.timestamp)));
    const paymentCount = transfersInWindow.length;
    const token = resolveToken(transfersInWindow);

    if (paymentCount > bestCount) {
      bestMonths = window;
      bestCount = paymentCount;
      bestToken = token;
      continue;
    }

    if (paymentCount === bestCount && bestMonths) {
      const currentKey = bestMonths.join("|");
      const nextKey = window.join("|");

      if (nextKey < currentKey || (nextKey === currentKey && token < bestToken)) {
        bestMonths = window;
        bestCount = paymentCount;
        bestToken = token;
      }
    }
  }

  return {
    monthsMatched: bestMonths,
    paymentCount: bestCount,
    token: bestToken || null
  };
}

function commitmentPayload(result: EmploymentResultWithToken): string {
  const [month1 = "", month2 = "", month3 = ""] = result.monthsMatched;

  return [
    result.wallet.toLowerCase(),
    (result.employer ?? "").toLowerCase(),
    (result.token ?? "").toLowerCase(),
    month1,
    month2,
    month3,
    String(result.paymentCount),
    result.qualifies ? "1" : "0"
  ].join("|");
}

function withCommitment(result: EmploymentResultWithToken): EmploymentResult {
  return {
    wallet: result.wallet,
    employer: result.employer,
    monthsMatched: result.monthsMatched,
    paymentCount: result.paymentCount,
    qualifies: result.qualifies,
    factCommitment: keccak256(toUtf8Bytes(commitmentPayload(result)))
  };
}

type QualifiedCandidate = {
  wallet: string;
  employer: string;
  monthsMatched: [string, string, string];
  paymentCount: number;
  token: string;
  qualifies: true;
};

export function evaluateEmployment(
  wallet: string,
  transfers: TransferEvent[],
  registeredEmployers: Set<string>,
  stablecoinAllowlist: Set<string>
): EmploymentResult {
  const walletLower = wallet.toLowerCase();
  const filtered = transfers.filter(
    (transfer) =>
      transfer.to.toLowerCase() === walletLower &&
      registeredEmployers.has(transfer.from.toLowerCase()) &&
      stablecoinAllowlist.has(transfer.token.toLowerCase())
  );

  const byEmployer = new Map<string, TransferEvent[]>();
  for (const transfer of filtered) {
    const employer = transfer.from.toLowerCase();
    const current = byEmployer.get(employer) ?? [];
    current.push(transfer);
    byEmployer.set(employer, current);
  }

  let best: QualifiedCandidate | null = null;

  for (const [employer, employerTransfers] of byEmployer.entries()) {
    const window = pickBestWindowForEmployer(employerTransfers);
    if (!window.monthsMatched || !window.token) {
      continue;
    }

    const candidate: QualifiedCandidate = {
      wallet,
      employer,
      monthsMatched: window.monthsMatched,
      paymentCount: window.paymentCount,
      token: window.token,
      qualifies: true
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.paymentCount > best.paymentCount) {
      best = candidate;
      continue;
    }

    if (candidate.paymentCount === best.paymentCount && candidate.employer < best.employer) {
      best = candidate;
    }
  }

  if (!best) {
    return withCommitment({
      wallet,
      employer: null,
      monthsMatched: [],
      paymentCount: 0,
      token: null,
      qualifies: false
    });
  }

  return withCommitment(best);
}
