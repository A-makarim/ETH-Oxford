const fs = require("node:fs");
const path = require("node:path");
const { buildPoseidon } = require("circomlibjs");
const { Contract, Interface, JsonRpcProvider, getAddress, id, zeroPadValue } = require("ethers");

const rootDir = path.resolve(__dirname, "..", "..");
const defaultOut = path.join("circuits", "inputs", "real.json");
const transferIface = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);

const attestationAbi = [
  "function getEducationAttestation(bytes32 attestationId) view returns (address subject,bytes32 certHash,string provider,uint64 issuedAt,bool exists)"
];
const registryAbi = ["function isEmployer(address employer) view returns (bool)"];

const providerCodeByName = {
  udemy: 1n,
  coursera: 2n,
  datacamp: 3n,
  edx: 4n
};

function usage() {
  console.log(`Usage:
  node scripts/zk/generate-inputs-real.js --wallet 0x... --attestation-id 0x... --required-skill-hash <uint> --min-experience-months <uint> --salary-commitment <uint> --education-expiry-at <unix> --employment-experience-months <uint> [--out circuits/inputs/real.json]

Alternative:
  pass --fdc-request-id <uuid> instead of --attestation-id to resolve attestation from FDC status endpoint.

Reads env:
  FLARE_RPC_URL (required)
  PLASMA_RPC_URL (required)
  EMPLOYER_REGISTRY_ADDRESS (required)
  ATTESTATION_STORAGE_ADDRESS (required)
  STABLECOIN_ALLOWLIST (required comma-separated)
  PLASMA_LOOKBACK_BLOCKS (optional, default 350000)
  PORT_FDC / FDC_SERVICE_URL (optional)

Optional arg:
  --education-skill-hash <uint> (defaults to --required-skill-hash)
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return options;
}

function ensure(value, label) {
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required ${label}`);
  }
  return value;
}

function parseNumberish(value, label) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid numeric value for ${label}: ${value}`);
  }
}

function parseMonthKey(key) {
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month key: ${key}`);
  }
  return BigInt(year * 12 + (month - 1));
}

function monthKey(timestampSeconds) {
  const d = new Date(Number(timestampSeconds) * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getBestThreeConsecutiveMonths(months) {
  const unique = [...new Set(months)].sort((a, b) => {
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    return ay * 12 + am - (by * 12 + bm);
  });
  if (unique.length < 3) {
    return null;
  }
  for (let i = 0; i <= unique.length - 3; i += 1) {
    const a = parseMonthKey(unique[i]);
    const b = parseMonthKey(unique[i + 1]);
    const c = parseMonthKey(unique[i + 2]);
    if (b === a + 1n && c === b + 1n) {
      return [unique[i], unique[i + 1], unique[i + 2]];
    }
  }
  return null;
}

function parseAddressList(csv, label) {
  const parts = (csv || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return [...new Set(parts.map((item) => getAddress(item)))];
}

function readFdcBaseUrl() {
  if (process.env.FDC_SERVICE_URL && process.env.FDC_SERVICE_URL.trim()) {
    return process.env.FDC_SERVICE_URL.trim().replace(/\/+$/, "");
  }
  const port = process.env.PORT_FDC || "3001";
  return `http://localhost:${port}`;
}

async function resolveAttestationIdFromFdc(requestId) {
  const base = readFdcBaseUrl();
  const response = await fetch(`${base}/fdc/education/status/${requestId}`);
  if (!response.ok) {
    throw new Error(`FDC status lookup failed (${response.status}) for requestId ${requestId}`);
  }
  const body = await response.json();
  if (body.status !== "verified" || !body.attestationId) {
    throw new Error(`FDC request ${requestId} is not verified yet`);
  }
  return body.attestationId;
}

async function loadEducationEvidence({ flareProvider, attestationStorageAddress, attestationIdHex, wallet }) {
  const storage = new Contract(attestationStorageAddress, attestationAbi, flareProvider);
  const [subject, certHash, provider, issuedAt, exists] = await storage.getEducationAttestation(attestationIdHex);
  if (!exists) {
    throw new Error(`Attestation not found on-chain: ${attestationIdHex}`);
  }
  if (getAddress(subject) !== wallet) {
    throw new Error(`Attestation subject mismatch. expected=${wallet} got=${subject}`);
  }
  const providerLower = String(provider).toLowerCase();
  const providerCode = providerCodeByName[providerLower];
  if (!providerCode) {
    throw new Error(`Unsupported provider in attestation: ${provider}`);
  }

  return {
    certHash: String(certHash),
    provider: providerLower,
    providerCode,
    issuedAt: BigInt(issuedAt)
  };
}

async function fetchTransfersForWallet({ plasmaProvider, wallet, allowlistedTokens, lookbackBlocks }) {
  const latest = await plasmaProvider.getBlockNumber();
  const fromBlock = Math.max(0, latest - lookbackBlocks);
  const toTopic = zeroPadValue(wallet, 32);
  const transferTopic = id("Transfer(address,address,uint256)");

  const allLogs = [];
  for (const token of allowlistedTokens) {
    const logs = await plasmaProvider.getLogs({
      address: token,
      fromBlock,
      toBlock: latest,
      topics: [transferTopic, null, toTopic]
    });
    allLogs.push(...logs.map((log) => ({ ...log, token })));
  }

  if (allLogs.length === 0) {
    throw new Error("No allowlisted incoming transfers found for wallet in lookback window");
  }

  const blockNumbers = [...new Set(allLogs.map((log) => Number(log.blockNumber)))];
  const timestampByBlock = new Map();
  for (const blockNumber of blockNumbers) {
    const block = await plasmaProvider.getBlock(blockNumber);
    if (!block) {
      continue;
    }
    timestampByBlock.set(blockNumber, Number(block.timestamp));
  }

  return allLogs.map((log) => {
    const parsed = transferIface.parseLog(log);
    if (!parsed) {
      throw new Error("Failed to parse transfer log");
    }
    return {
      token: getAddress(log.token),
      from: getAddress(parsed.args.from),
      to: getAddress(parsed.args.to),
      timestamp: timestampByBlock.get(Number(log.blockNumber))
    };
  });
}

async function pickEmploymentWindow({
  transfers,
  wallet,
  flareProvider,
  employerRegistryAddress
}) {
  const registry = new Contract(employerRegistryAddress, registryAbi, flareProvider);
  const candidates = new Map();

  const uniqueEmployers = [...new Set(transfers.map((t) => t.from))];
  const registered = new Set();
  for (const employer of uniqueEmployers) {
    // eslint-disable-next-line no-await-in-loop
    const isRegistered = await registry.isEmployer(employer);
    if (isRegistered) {
      registered.add(getAddress(employer));
    }
  }

  if (registered.size === 0) {
    throw new Error("No registered employer found in incoming allowlisted transfers");
  }

  for (const event of transfers) {
    if (event.to !== wallet || !registered.has(event.from) || typeof event.timestamp !== "number") {
      continue;
    }
    const key = `${event.from.toLowerCase()}|${event.token.toLowerCase()}`;
    const list = candidates.get(key) || [];
    list.push(event);
    candidates.set(key, list);
  }

  let best = null;
  for (const [key, events] of candidates.entries()) {
    const months = events.map((event) => monthKey(event.timestamp));
    const matchedMonths = getBestThreeConsecutiveMonths(months);
    if (!matchedMonths) {
      continue;
    }

    const [employer, token] = key.split("|");
    const monthCounts = new Map([
      [matchedMonths[0], 0],
      [matchedMonths[1], 0],
      [matchedMonths[2], 0]
    ]);
    for (const event of events) {
      const mk = monthKey(event.timestamp);
      if (monthCounts.has(mk)) {
        monthCounts.set(mk, Number(monthCounts.get(mk)) + 1);
      }
    }

    const c0 = Number(monthCounts.get(matchedMonths[0]));
    const c1 = Number(monthCounts.get(matchedMonths[1]));
    const c2 = Number(monthCounts.get(matchedMonths[2]));
    if (c0 <= 0 || c1 <= 0 || c2 <= 0) {
      continue;
    }

    const paymentCount = c0 + c1 + c2;
    const current = {
      employer: getAddress(employer),
      token: getAddress(token),
      monthsMatched: matchedMonths,
      monthCounts: [c0, c1, c2],
      paymentCount
    };

    if (!best) {
      best = current;
      continue;
    }
    if (current.paymentCount > best.paymentCount) {
      best = current;
      continue;
    }
    if (current.paymentCount === best.paymentCount) {
      const a = `${current.employer.toLowerCase()}|${current.token.toLowerCase()}`;
      const b = `${best.employer.toLowerCase()}|${best.token.toLowerCase()}`;
      if (a < b) {
        best = current;
      }
    }
  }

  if (!best) {
    throw new Error("No qualifying 3-consecutive-month employment window found for registered employer + allowlisted token");
  }

  return best;
}

function stringifyRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value.toString()])
  );
}

async function main() {
  const args = parseArgs();

  const wallet = getAddress(ensure(args.wallet, "--wallet"));
  let attestationIdHex = args["attestation-id"];
  const fdcRequestId = args["fdc-request-id"];
  if (!attestationIdHex) {
    if (!fdcRequestId) {
      throw new Error("Provide either --attestation-id or --fdc-request-id");
    }
    attestationIdHex = await resolveAttestationIdFromFdc(fdcRequestId);
  }
  attestationIdHex = ensure(attestationIdHex, "attestation id");

  const requiredSkillHash = parseNumberish(ensure(args["required-skill-hash"], "--required-skill-hash"), "--required-skill-hash");
  const educationSkillHash = parseNumberish(
    args["education-skill-hash"] || requiredSkillHash.toString(),
    "--education-skill-hash"
  );
  const minExperienceMonths = parseNumberish(
    ensure(args["min-experience-months"], "--min-experience-months"),
    "--min-experience-months"
  );
  const salaryCommitment = parseNumberish(
    ensure(args["salary-commitment"], "--salary-commitment"),
    "--salary-commitment"
  );
  const educationExpiryAt = parseNumberish(
    ensure(args["education-expiry-at"], "--education-expiry-at"),
    "--education-expiry-at"
  );
  const employmentExperienceMonths = parseNumberish(
    ensure(args["employment-experience-months"], "--employment-experience-months"),
    "--employment-experience-months"
  );

  const flareRpcUrl = ensure(process.env.FLARE_RPC_URL, "FLARE_RPC_URL");
  const plasmaRpcUrl = ensure(process.env.PLASMA_RPC_URL, "PLASMA_RPC_URL");
  const employerRegistryAddress = getAddress(ensure(process.env.EMPLOYER_REGISTRY_ADDRESS, "EMPLOYER_REGISTRY_ADDRESS"));
  const attestationStorageAddress = getAddress(ensure(process.env.ATTESTATION_STORAGE_ADDRESS, "ATTESTATION_STORAGE_ADDRESS"));
  const allowlistedTokens = parseAddressList(process.env.STABLECOIN_ALLOWLIST, "STABLECOIN_ALLOWLIST");
  const lookbackBlocks = Number(process.env.PLASMA_LOOKBACK_BLOCKS || "350000");

  const flareProvider = new JsonRpcProvider(flareRpcUrl);
  const plasmaProvider = new JsonRpcProvider(plasmaRpcUrl);

  const education = await loadEducationEvidence({
    flareProvider,
    attestationStorageAddress,
    attestationIdHex,
    wallet
  });
  if (educationExpiryAt < education.issuedAt) {
    throw new Error("education-expiry-at must be >= attestation issuedAt");
  }

  const transfers = await fetchTransfersForWallet({
    plasmaProvider,
    wallet,
    allowlistedTokens,
    lookbackBlocks
  });
  const employment = await pickEmploymentWindow({
    transfers,
    wallet,
    flareProvider,
    employerRegistryAddress
  });

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const toFieldObject = (value) => F.toObject(F.e(value.toString()));
  const poseidonHash = (inputs) => F.toObject(poseidon(inputs.map((v) => BigInt(v.toString()))));
  const squareInField = (value) => F.toObject(F.mul(F.e(value.toString()), F.e(value.toString())));

  const walletHash = toFieldObject(BigInt(wallet));
  const educationAttestationId = toFieldObject(BigInt(attestationIdHex));
  const employmentEmployerHash = toFieldObject(BigInt(employment.employer));
  const employmentTokenHash = toFieldObject(BigInt(employment.token));
  const employmentMonth0 = parseMonthKey(employment.monthsMatched[0]);
  const employmentMonth1 = parseMonthKey(employment.monthsMatched[1]);
  const employmentMonth2 = parseMonthKey(employment.monthsMatched[2]);
  const month0TransferCount = BigInt(employment.monthCounts[0]);
  const month1TransferCount = BigInt(employment.monthCounts[1]);
  const month2TransferCount = BigInt(employment.monthCounts[2]);
  const totalTransferCount = month0TransferCount + month1TransferCount + month2TransferCount;

  const certificateWitnessHash = poseidonHash([
    walletHash,
    salaryCommitment,
    education.providerCode,
    educationSkillHash,
    education.issuedAt,
    educationExpiryAt,
    educationAttestationId
  ]);

  const educationCommitment = poseidonHash([
    walletHash,
    education.providerCode,
    certificateWitnessHash,
    educationAttestationId,
    education.issuedAt
  ]);

  const employmentCommitment = poseidonHash([
    walletHash,
    employmentEmployerHash,
    employmentTokenHash,
    employmentMonth0,
    employmentMonth1,
    employmentMonth2,
    totalTransferCount,
    1n
  ]);

  const record = stringifyRecord({
    walletHash,
    salaryCommitment,
    providerCode: education.providerCode,
    educationSkillHash,
    educationIssuedAt: education.issuedAt,
    educationExpiryAt,
    educationAttestationId,
    employmentEmployerHash,
    employmentTokenHash,
    employmentMonth0,
    employmentMonth1,
    employmentMonth2,
    month0TransferCount,
    month1TransferCount,
    month2TransferCount,
    employmentExperienceMonths,
    policyRequiredSkillHash: requiredSkillHash,
    policyMinExperienceMonths: minExperienceMonths,
    requiredSkillHash,
    minExperienceMonths,
    result: 1n,
    employerRegistered: 1n,
    tokenAllowed: 1n,
    certificateWitnessHash,
    educationCommitment,
    employmentCommitment,
    requiredSkillBindingSquare: squareInField(requiredSkillHash),
    minimumExperienceBindingSquare: squareInField(minExperienceMonths),
    educationCommitmentBindingSquare: squareInField(educationCommitment),
    employmentCommitmentBindingSquare: squareInField(employmentCommitment)
  });

  const outPath = path.resolve(rootDir, args.out || defaultOut);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");

  const metadataPath = outPath.replace(/\.json$/i, ".meta.json");
  const metadata = {
    wallet,
    attestationId: attestationIdHex,
    education: {
      provider: education.provider,
      certHash: education.certHash,
      issuedAt: education.issuedAt.toString()
    },
    employment: {
      employer: employment.employer,
      token: employment.token,
      monthsMatched: employment.monthsMatched,
      monthCounts: employment.monthCounts,
      paymentCount: employment.paymentCount
    },
    publicSignals: {
      requiredSkillHash: requiredSkillHash.toString(),
      minExperienceMonths: minExperienceMonths.toString(),
      educationCommitment: record.educationCommitment,
      employmentCommitment: record.employmentCommitment,
      result: "1"
    },
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  console.log(`Wrote real witness input: ${path.relative(rootDir, outPath)}`);
  console.log(`Wrote metadata: ${path.relative(rootDir, metadataPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
