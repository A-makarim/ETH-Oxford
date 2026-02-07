import { getAddress, id, keccak256, toUtf8Bytes } from "ethers";
import type { EducationSubmitRequest } from "./types.js";

type NormalizedCertificate = {
  wallet: string;
  provider: "udemy" | "coursera";
  source: string;
  certificateId: string;
  certHash: string;
};

export function normalizeCertificateInput(payload: EducationSubmitRequest): NormalizedCertificate {
  const wallet = getAddress(payload.wallet);
  const provider = payload.provider.toLowerCase() as "udemy" | "coursera";
  const source = payload.certificateUrlOrId.trim();

  const certificateId =
    source.startsWith("http://") || source.startsWith("https://") ? id(source.toLowerCase()) : id(source);

  const canonicalPayload = JSON.stringify(
    {
      wallet: wallet.toLowerCase(),
      provider,
      source
    },
    Object.keys({
      wallet: "",
      provider: "",
      source: ""
    }).sort()
  );

  return {
    wallet,
    provider,
    source,
    certificateId,
    certHash: keccak256(toUtf8Bytes(canonicalPayload))
  };
}

