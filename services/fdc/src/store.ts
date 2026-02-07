import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EducationStatusRecord, FdcRequestStatus } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultStorePath = resolve(moduleDir, "..", ".fdc-requests.json");
const storePath = process.env.FDC_STORE_PATH ? resolve(process.env.FDC_STORE_PATH) : defaultStorePath;

const requestStore = new Map<string, EducationStatusRecord>();

function persist(): void {
  const records = [...requestStore.values()].sort((a, b) => a.createdAt - b.createdAt);
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(records, null, 2));
}

export function loadStore(): void {
  if (!existsSync(storePath)) {
    return;
  }

  const raw = readFileSync(storePath, "utf-8");
  const parsed = JSON.parse(raw) as EducationStatusRecord[];
  requestStore.clear();
  for (const record of parsed) {
    requestStore.set(record.requestId, record);
  }
}

export function setRequest(record: EducationStatusRecord): void {
  requestStore.set(record.requestId, record);
  persist();
}

export function getRequest(requestId: string): EducationStatusRecord | undefined {
  return requestStore.get(requestId);
}

export function listRequestsByStatuses(statuses: FdcRequestStatus[]): EducationStatusRecord[] {
  const statusSet = new Set(statuses);
  return [...requestStore.values()].filter((record) => statusSet.has(record.status));
}

export function updateRequest(
  requestId: string,
  patch: Partial<Omit<EducationStatusRecord, "requestId" | "createdAt">>
): EducationStatusRecord | undefined {
  const current = requestStore.get(requestId);
  if (!current) {
    return undefined;
  }

  const next: EducationStatusRecord = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };

  requestStore.set(requestId, next);
  persist();
  return next;
}
