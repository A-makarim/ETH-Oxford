const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..", "..");
const circuitsDir = path.join(rootDir, "circuits");
const artifactsDir = path.join(circuitsDir, "artifacts");
const contractOutPath = path.join(rootDir, "contracts", "Groth16Verifier.sol");

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

function clearPreviousArtifacts() {
  const pathsToRemove = [
    path.join(artifactsDir, "verifySovereignCV.r1cs"),
    path.join(artifactsDir, "verifySovereignCV.sym"),
    path.join(artifactsDir, "pot16_0000.ptau"),
    path.join(artifactsDir, "pot16_final.ptau"),
    path.join(artifactsDir, "verifySovereignCV_final.zkey"),
    path.join(artifactsDir, "verification_key.json"),
    path.join(artifactsDir, "verifySovereignCV_js")
  ];
  for (const itemPath of pathsToRemove) {
    if (fs.existsSync(itemPath)) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    }
  }
}

function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  clearPreviousArtifacts();

  run("npx", [
    "circom2",
    "circuits/verifySovereignCV.circom",
    "--r1cs",
    "--wasm",
    "--sym",
    "-l",
    "node_modules",
    "-o",
    "circuits/artifacts"
  ]);

  run("npx", ["snarkjs", "powersoftau", "new", "bn128", "16", "circuits/artifacts/pot16_0000.ptau", "-v"]);
  run("npx", [
    "snarkjs",
    "powersoftau",
    "prepare",
    "phase2",
    "circuits/artifacts/pot16_0000.ptau",
    "circuits/artifacts/pot16_final.ptau"
  ]);

  run("npx", [
    "snarkjs",
    "groth16",
    "setup",
    "circuits/artifacts/verifySovereignCV.r1cs",
    "circuits/artifacts/pot16_final.ptau",
    "circuits/artifacts/verifySovereignCV_final.zkey",
  ]);
  run("npx", [
    "snarkjs",
    "zkey",
    "export",
    "verificationkey",
    "circuits/artifacts/verifySovereignCV_final.zkey",
    "circuits/artifacts/verification_key.json"
  ]);
  run("npx", [
    "snarkjs",
    "zkey",
    "export",
    "solidityverifier",
    "circuits/artifacts/verifySovereignCV_final.zkey",
    "contracts/Groth16Verifier.sol"
  ]);

  if (!fs.existsSync(contractOutPath)) {
    throw new Error("Expected contracts/Groth16Verifier.sol to be generated");
  }

  console.log("Groth16 artifacts generated under circuits/artifacts and contracts/Groth16Verifier.sol");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
