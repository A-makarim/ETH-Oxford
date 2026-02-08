import { parseAbi } from "viem";

export const cvVerifierAbi = parseAbi([
  "function verifyCVProof(bytes proof, uint256[] publicSignals) external returns (bool)",
  "event CVProofVerified(address verifier, bytes32 proofHash, bool success)"
]);
