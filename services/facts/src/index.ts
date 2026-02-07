import "dotenv/config";
import express from "express";
import { getAddress, keccak256, toUtf8Bytes } from "ethers";

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

function asWalletSet(csv: string | undefined): Set<string> {
  return new Set(
    (csv || "")
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
  );
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

    const mockEducationWallets = asWalletSet(process.env.MOCK_EDUCATION_WALLETS);
    const educationQualified = mockEducationWallets.has(wallet.toLowerCase());
    const employmentQualified = employment.qualifies;

    const educationCommitment = keccak256(
      toUtf8Bytes([wallet.toLowerCase(), educationQualified ? "1" : "0", "education"].join("|"))
    );
    const employmentCommitment = employment.factCommitment;
    const combinedCommitment = keccak256(
      toUtf8Bytes([educationCommitment.toLowerCase(), employmentCommitment.toLowerCase()].join("|"))
    );

    return res.json({
      educationQualified,
      employmentQualified,
      educationCommitment,
      employmentCommitment,
      combinedCommitment
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

