import { randomUUID } from "node:crypto";

type QueueParams = {
  provider: "udemy" | "coursera";
  certificateSource: string;
};

type QueueResult = {
  fdcRequestId: string;
  accepted: boolean;
  reason?: string;
};

export async function queueWeb2JsonVerification(params: QueueParams): Promise<QueueResult> {
  const apiKey = process.env.FLARE_FDC_API_KEY;
  const source = params.certificateSource.toLowerCase();

  if (!apiKey) {
    return {
      fdcRequestId: randomUUID(),
      accepted: false,
      reason: "Missing FLARE_FDC_API_KEY"
    };
  }

  // Scaffold behavior:
  // replace with the actual Flare verifier API flow from
  // https://dev.flare.network/fdc/guides/hardhat/web-2-json/
  const accepted = !source.includes("invalid");
  return {
    fdcRequestId: randomUUID(),
    accepted,
    reason: accepted ? undefined : `${params.provider} certificate source rejected`
  };
}

