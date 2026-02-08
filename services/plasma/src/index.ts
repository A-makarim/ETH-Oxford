import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { getAddress } from "ethers";
import { requireAddressCsv } from "./config.js";
import { resolveRegisteredEmployers } from "./employerResolver.js";
import { evaluateEmployment } from "./qualification.js";
import type { EmploymentRuleMode } from "./qualification.js";
import { loadTransfersForWallet } from "./transferSource.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
loadEnv();
loadEnv({ path: resolve(moduleDir, "../../../.env"), override: false });

const app = express();
app.use(express.json());

function fallbackUrl(): string | undefined {
  const configured = process.env.PLASMA_FALLBACK_URL;
  if (!configured || configured.trim().length === 0) {
    return undefined;
  }
  return configured;
}

function ruleMode(): EmploymentRuleMode {
  const mode = (process.env.PLASMA_RULE_MODE || "strict_3_months").trim();
  if (mode === "strict_3_months" || mode === "demo_one_payment") {
    return mode;
  }
  throw new Error("invalid_PLASMA_RULE_MODE");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "plasma" });
});

app.get("/plasma/employment/:wallet", async (req, res) => {
  try {
    const wallet = getAddress(req.params.wallet);
    const stablecoins = requireAddressCsv(process.env.STABLECOIN_ALLOWLIST, "STABLECOIN_ALLOWLIST");

    const transferSource = await loadTransfersForWallet({
      wallet,
      stablecoinAllowlist: stablecoins,
      fallbackUrl: fallbackUrl()
    });

    const candidateEmployers = new Set(transferSource.transfers.map((transfer) => transfer.from.toLowerCase()));
    const employers = await resolveRegisteredEmployers({
      candidates: candidateEmployers
    });

    const result = evaluateEmployment(wallet, transferSource.transfers, employers, stablecoins, {
      ruleMode: ruleMode()
    });

    if (transferSource.dataSource === "fallback") {
      console.warn(
        `[plasma] fallback data source used for wallet=${wallet} reason=${transferSource.reason ?? "unknown"}`
      );
    }

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
