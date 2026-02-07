import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const owner = deployer.address;

  const registryFactory = await ethers.getContractFactory("EmployerRegistry");
  const registry = await registryFactory.deploy(owner);
  await registry.waitForDeployment();

  const attestationFactory = await ethers.getContractFactory("AttestationStorage");
  const attestation = await attestationFactory.deploy(owner);
  await attestation.waitForDeployment();

  const verifierAddressFromEnv = process.env.GROTH16_VERIFIER_ADDRESS;
  let verifierAddress = verifierAddressFromEnv;

  if (!verifierAddress) {
    const mockFactory = await ethers.getContractFactory("MockGroth16Verifier");
    const mock = await mockFactory.deploy();
    await mock.waitForDeployment();
    verifierAddress = await mock.getAddress();
    console.log(`MockGroth16Verifier deployed: ${verifierAddress}`);
  }

  const cvVerifierFactory = await ethers.getContractFactory("CVVerifier");
  const cvVerifier = await cvVerifierFactory.deploy(owner, verifierAddress);
  await cvVerifier.waitForDeployment();

  const output = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    employerRegistry: await registry.getAddress(),
    attestationStorage: await attestation.getAddress(),
    groth16Verifier: verifierAddress,
    cvVerifier: await cvVerifier.getAddress(),
    deployedAt: new Date().toISOString()
  };

  mkdirSync(join(process.cwd(), "deployments", "testnet"), { recursive: true });
  const outputFile = join(process.cwd(), "deployments", "testnet", "addresses.latest.json");
  writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log("Deployment complete:");
  console.log(output);
  console.log(`Addresses written to ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

