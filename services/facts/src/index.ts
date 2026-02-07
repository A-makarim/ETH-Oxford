import "dotenv/config";
import express from "express";
import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { listEducationAttestationsForWallet } from "./educationSource.js";

type PlasmaResponse = {
  wallet: string;
  employer: string | null;
  monthsMatched: string[];
  paymentCount: number;
  qualifies: boolean;
  factCommitment: string;
};

const app = express();
app.use(express.json());

function educationCommitmentPayload(
  wallet: string,
  attestation:
    | {
        provider: string;
        certHash: string;
        attestationId: string;
        issuedAt: number;
      }
    | undefined
): string {
  const walletLower = wallet.toLowerCase();
  if (!attestation) {
    return [walletLower, "", "", "", "0"].join("|");
  }

  return [
    walletLower,
    attestation.provider.toLowerCase(),
    attestation.certHash.toLowerCase(),
    attestation.attestationId.toLowerCase(),
    String(attestation.issuedAt)
  ].join("|");
}

function combinedCommitment(educationCommitment: string, employmentCommitment: string): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32"],
    [educationCommitment, employmentCommitment]
  );
  return keccak256(encoded);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "facts" });
});

app.get("/facts/:wallet", async (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);
    const plasmaUrl = process.env.PLASMA_SERVICE_URL || "http://localhost:3002";
    const plasmaResp = await fetch(`${plasmaUrl}/plasma/employment/${wallet}`);
    if (!plasmaResp.ok) {
      return res.status(502).json({
        error: "plasma_service_unavailable"
      });
    }

    const employment = (await plasmaResp.json()) as PlasmaResponse;

    const attestations = await listEducationAttestationsForWallet(wallet);
    const latestAttestation = attestations[0];
    const educationQualified = Boolean(latestAttestation);
    const employmentQualified = employment.qualifies;

    const educationCommitment = keccak256(toUtf8Bytes(educationCommitmentPayload(wallet, latestAttestation)));
    const employmentCommitment = employment.factCommitment;

    return res.json({
      educationQualified,
      employmentQualified,
      educationCommitment,
      employmentCommitment,
      combinedCommitment: combinedCommitment(educationCommitment, employmentCommitment)
    });
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message
    });
  }
});

const port = Number(process.env.PORT_FACTS || 3003);
app.listen(port, () => {
  console.log(`Facts service listening on http://localhost:${port}`);
});
