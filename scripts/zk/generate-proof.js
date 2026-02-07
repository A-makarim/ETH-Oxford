const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { AbiCoder } = require("ethers");

const rootDir = path.resolve(__dirname, "..", "..");
const defaultInput = path.join("circuits", "inputs", "valid.json");
const defaultOut = path.join("circuits", "vectors", "valid");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = defaultInput;
  let outDir = defaultOut;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--input") {
      inputPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--out") {
      outDir = args[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    inputPath: path.resolve(rootDir, inputPath),
    outDir: path.resolve(rootDir, outDir)
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function toDecString(value) {
  return BigInt(value).toString();
}

function packProof(proof) {
  const a0 = toDecString(proof.pi_a[0]);
  const a1 = toDecString(proof.pi_a[1]);
  const b01 = toDecString(proof.pi_b[0][1]);
  const b00 = toDecString(proof.pi_b[0][0]);
  const b11 = toDecString(proof.pi_b[1][1]);
  const b10 = toDecString(proof.pi_b[1][0]);
  const c0 = toDecString(proof.pi_c[0]);
  const c1 = toDecString(proof.pi_c[1]);

  const verifierA = [a0, a1];
  const verifierB = [
    [b01, b00],
    [b11, b10]
  ];
  const verifierC = [c0, c1];
  const packedProof = [a0, a1, b01, b00, b11, b10, c0, c1];
  return { verifierA, verifierB, verifierC, packedProof };
}

function main() {
  const { inputPath, outDir } = parseArgs();
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const witnessGeneratorPath = path.join(
    rootDir,
    "circuits",
    "artifacts",
    "verifySovereignCV_js",
    "generate_witness.js"
  );
  const wasmPath = path.join(rootDir, "circuits", "artifacts", "verifySovereignCV_js", "verifySovereignCV.wasm");
  const zkeyPath = path.join(rootDir, "circuits", "artifacts", "verifySovereignCV_final.zkey");
  const vkPath = path.join(rootDir, "circuits", "artifacts", "verification_key.json");

  if (!fs.existsSync(witnessGeneratorPath) || !fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath) || !fs.existsSync(vkPath)) {
    throw new Error("Missing Groth16 artifacts. Run `npm run zk:build` first.");
  }

  fs.mkdirSync(outDir, { recursive: true });

  const witnessPath = path.join(outDir, "witness.wtns");
  const proofPath = path.join(outDir, "proof.json");
  const publicSignalsPath = path.join(outDir, "public.json");
  const calldataPath = path.join(outDir, "calldata.json");

  run("node", [witnessGeneratorPath, wasmPath, inputPath, witnessPath]);
  run("npx", ["snarkjs", "groth16", "prove", zkeyPath, witnessPath, proofPath, publicSignalsPath]);
  run("npx", ["snarkjs", "groth16", "verify", vkPath, publicSignalsPath, proofPath]);

  const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicSignals = (JSON.parse(fs.readFileSync(publicSignalsPath, "utf-8"))).map(toDecString);
  const { verifierA, verifierB, verifierC, packedProof } = packProof(proof);
  const abiCoder = AbiCoder.defaultAbiCoder();
  const proofBytes = abiCoder.encode(
    ["uint256[8]"],
    [packedProof.map((part) => BigInt(part))]
  );

  writeJson(calldataPath, {
    proofBytes,
    publicSignals,
    packedProof,
    groth16VerifierArgs: {
      a: verifierA,
      b: verifierB,
      c: verifierC,
      publicSignals
    }
  });

  fs.copyFileSync(inputPath, path.join(outDir, "input.json"));
  console.log(`Proof and calldata written to ${path.relative(rootDir, outDir)}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
