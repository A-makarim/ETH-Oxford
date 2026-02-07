import "dotenv/config";
import express from "express";
import { getAddress } from "ethers";
import { mockTransfers } from "./mockData.js";
import { evaluateEmployment } from "./qualification.js";

const app = express();
app.use(express.json());

function parseCsvSet(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "plasma" });
});

app.get("/plasma/employment/:wallet", async (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);

    const employers = parseCsvSet(process.env.MOCK_EMPLOYER_REGISTRY);
    const stablecoins = parseCsvSet(process.env.STABLECOIN_ALLOWLIST);

    // Default mock values let the endpoint run without additional setup.
    if (employers.size === 0) {
      employers.add("0x1000000000000000000000000000000000000001");
    }
    if (stablecoins.size === 0) {
      stablecoins.add("0x2000000000000000000000000000000000000001");
    }

    const result = evaluateEmployment(wallet, mockTransfers, employers, stablecoins);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      wallet: req.params.wallet,
      employer: null,
      monthsMatched: [],
      paymentCount: 0,
      qualifies: false,
      factCommitment: "0x",
      error: (error as Error).message
    });
  }
});

const port = Number(process.env.PORT_PLASMA || 3002);
app.listen(port, () => {
  console.log(`Plasma service listening on http://localhost:${port}`);
});

