import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, getAddress } from "ethers";

const employerRegistryAbi = ["function isEmployer(address employer) external view returns (bool)"] as const;

type ResolveParams = {
  candidates: Set<string>;
};

function resolveEmployerRegistryAddress(): string {
  const fromEnv = process.env.EMPLOYER_REGISTRY_ADDRESS;
  if (fromEnv && fromEnv.trim().length > 0) {
    return getAddress(fromEnv);
  }

  const deploymentFiles = [
    resolve(process.cwd(), "deployments", "testnet", "addresses.latest.json"),
    resolve(process.cwd(), "deployments", "testnet", "addresses.example.json")
  ];

  for (const file of deploymentFiles) {
    if (!existsSync(file)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
        employerRegistry?: string;
      };
      if (parsed.employerRegistry) {
        return getAddress(parsed.employerRegistry);
      }
    } catch {
      continue;
    }
  }

  throw new Error("missing_EMPLOYER_REGISTRY_ADDRESS");
}

function resolveProvider(): JsonRpcProvider {
  const rpcUrl = process.env.FLARE_RPC_URL || process.env.PLASMA_RPC_URL;
  if (!rpcUrl || rpcUrl.trim().length === 0) {
    throw new Error("missing_FLARE_RPC_URL");
  }

  return new JsonRpcProvider(rpcUrl);
}

export async function resolveRegisteredEmployers(params: ResolveParams): Promise<Set<string>> {
  if (params.candidates.size === 0) {
    return new Set();
  }

  const candidateAddresses = [...params.candidates].map((address) => getAddress(address));
  const provider = resolveProvider();
  const registry = new Contract(resolveEmployerRegistryAddress(), employerRegistryAbi, provider);

  const checks = await Promise.all(
    candidateAddresses.map(async (candidate) => {
      const isEmployer = await registry.isEmployer(candidate);
      return {
        candidate,
        isEmployer: Boolean(isEmployer)
      };
    })
  );

  const accepted = checks
    .filter((entry) => entry.isEmployer)
    .map((entry) => entry.candidate.toLowerCase());

  return new Set(accepted);
}
