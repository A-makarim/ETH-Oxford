import { keccak256, toUtf8Bytes } from "ethers";
import type { EmploymentResult, TransferEvent } from "./types.js";

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

function getBestThreeConsecutiveMonths(months: string[]): string[] | null {
  const unique = [...new Set(months)].sort((a, b) => parseMonthKey(a) - parseMonthKey(b));
  if (unique.length < 3) {
    return null;
  }

  for (let i = 0; i <= unique.length - 3; i += 1) {
    const a = parseMonthKey(unique[i]);
    const b = parseMonthKey(unique[i + 1]);
    const c = parseMonthKey(unique[i + 2]);
    if (b === a + 1 && c === b + 1) {
      return [unique[i], unique[i + 1], unique[i + 2]];
    }
  }

  return null;
}

function commitmentPayload(result: Omit<EmploymentResult, "factCommitment">): string {
  return [
    result.wallet.toLowerCase(),
    (result.employer ?? "").toLowerCase(),
    result.monthsMatched.join(","),
    String(result.paymentCount),
    result.qualifies ? "1" : "0"
  ].join("|");
}

function withCommitment(result: Omit<EmploymentResult, "factCommitment">): EmploymentResult {
  return {
    ...result,
    factCommitment: keccak256(toUtf8Bytes(commitmentPayload(result)))
  };
}

type QualifiedCandidate = {
  wallet: string;
  employer: string;
  monthsMatched: string[];
  paymentCount: number;
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
    (t) =>
      t.to.toLowerCase() === walletLower &&
      registeredEmployers.has(t.from.toLowerCase()) &&
      stablecoinAllowlist.has(t.token.toLowerCase())
  );

  const byEmployer = new Map<string, TransferEvent[]>();
  for (const t of filtered) {
    const key = t.from.toLowerCase();
    const next = byEmployer.get(key) ?? [];
    next.push(t);
    byEmployer.set(key, next);
  }

  let best: QualifiedCandidate | null = null;

  for (const [employer, employerTransfers] of byEmployer.entries()) {
    const months = employerTransfers.map((t) => monthKey(t.timestamp));
    const matchedMonths = getBestThreeConsecutiveMonths(months);
    if (!matchedMonths) {
      continue;
    }

    const transfersInWindow = employerTransfers.filter((t) => matchedMonths.includes(monthKey(t.timestamp)));
    const candidate: QualifiedCandidate = {
      wallet,
      employer,
      monthsMatched: matchedMonths,
      paymentCount: transfersInWindow.length,
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
      qualifies: false
    });
  }

  return withCommitment(best);
}
