import type { EducationStatusRecord } from "./types.js";

const requestStore = new Map<string, EducationStatusRecord>();

export function setRequest(record: EducationStatusRecord): void {
  requestStore.set(record.requestId, record);
}

export function getRequest(requestId: string): EducationStatusRecord | undefined {
  return requestStore.get(requestId);
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
  return next;
}

