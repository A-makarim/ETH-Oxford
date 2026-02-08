import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ContractSpec = {
  name: string;
  source: string;
};

const contracts: ContractSpec[] = [
  { name: "EmployerRegistry", source: "EmployerRegistry.sol/EmployerRegistry.json" },
  { name: "AttestationStorage", source: "AttestationStorage.sol/AttestationStorage.json" },
  { name: "CVVerifier", source: "CVVerifier.sol/CVVerifier.json" }
];

function main() {
  const artifactsDir = join(process.cwd(), "artifacts", "contracts");
  const outDir = join(process.cwd(), "deployments", "testnet", "abi");
  mkdirSync(outDir, { recursive: true });

  contracts.forEach((contract) => {
    const artifactPath = join(artifactsDir, contract.source);
    const raw = readFileSync(artifactPath, "utf-8");
    const artifact = JSON.parse(raw);
    const outputPath = join(outDir, `${contract.name}.json`);
    writeFileSync(
      outputPath,
      JSON.stringify({ contractName: contract.name, abi: artifact.abi }, null, 2)
    );
  });

  console.log(`Exported ABI files to ${outDir}`);
}

main();
