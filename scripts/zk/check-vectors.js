const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const snarkjs = require("snarkjs");

const rootDir = path.resolve(__dirname, "..", "..");
const inputDir = path.join(rootDir, "circuits", "inputs");
const validOutDir = path.join(rootDir, "circuits", "vectors", "valid");

function run(cmd, args, expectedStatus = 0) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });

  if (result.status !== expectedStatus) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`Command failed (${cmd} ${args.join(" ")}), expected ${expectedStatus}, got ${result.status}\n${output}`);
  }

  return result;
}

function assertWitnessFails(inputPath, label) {
  const witnessOutPath = path.join(rootDir, "circuits", "vectors", `${label}.wtns`);
  const generator = path.join(rootDir, "circuits", "artifacts", "verifySovereignCV_js", "generate_witness.js");
  const wasm = path.join(rootDir, "circuits", "artifacts", "verifySovereignCV_js", "verifySovereignCV.wasm");

  const result = spawnSync("node", [generator, wasm, inputPath, witnessOutPath], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });

  if (result.status === 0) {
    throw new Error(`Expected witness generation to fail for ${label}, but it succeeded`);
  }
}

async function main() {
  run("node", ["scripts/zk/generate-proof.js", "--input", "circuits/inputs/valid.json", "--out", "circuits/vectors/valid"]);

  const vk = JSON.parse(fs.readFileSync(path.join(rootDir, "circuits", "artifacts", "verification_key.json"), "utf8"));
  const proof = JSON.parse(fs.readFileSync(path.join(validOutDir, "proof.json"), "utf8"));
  const publicSignals = JSON.parse(fs.readFileSync(path.join(validOutDir, "public.json"), "utf8"));

  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  if (!valid) {
    throw new Error("Valid witness proof did not verify");
  }

  const tamperedSignals = [...publicSignals];
  tamperedSignals[tamperedSignals.length - 1] = (
    BigInt(tamperedSignals[tamperedSignals.length - 1]) ^ 1n
  ).toString();
  const tamperedValid = await snarkjs.groth16.verify(vk, tamperedSignals, proof);
  if (tamperedValid) {
    throw new Error("Tampered public signal unexpectedly verified");
  }

  assertWitnessFails(path.join(inputDir, "missing-month.json"), "missing-month");
  assertWitnessFails(path.join(inputDir, "invalid-cert.json"), "invalid-cert");

  console.log("ZK vector checks passed:");
  console.log("- valid witness verifies");
  console.log("- tampered public signal fails");
  console.log("- missing-month witness fails");
  console.log("- invalid-cert witness fails");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
