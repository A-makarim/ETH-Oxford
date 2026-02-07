import { getAddress } from "ethers";

function splitCsv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseAddressCsv(value: string | undefined, label: string): Set<string> {
  const result = new Set<string>();
  const entries = splitCsv(value);

  for (const entry of entries) {
    try {
      result.add(getAddress(entry).toLowerCase());
    } catch {
      throw new Error(`invalid_${label}_address_${entry}`);
    }
  }

  return result;
}

export function requireAddressCsv(value: string | undefined, label: string): Set<string> {
  const parsed = parseAddressCsv(value, label);
  if (parsed.size === 0) {
    throw new Error(`missing_${label}`);
  }
  return parsed;
}

export function envNumber(name: string, fallback: number): number {
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
