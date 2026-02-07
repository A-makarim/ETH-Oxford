# SovereignCV Circuit Scaffold

Primary circuit:

- `verifySovereignCV.circom`

## Current State
1. Public inputs are wired to the intended verifier interface.
2. Result is constrained to `employmentSatisfied AND educationSatisfied`.
3. Detailed witness constraints for payment history and certificate validity are TODO.

## Suggested Commands
```bash
circom circuits/verifySovereignCV.circom --r1cs --wasm --sym -o circuits/build
snarkjs groth16 setup circuits/build/verifySovereignCV.r1cs powersOfTau28_hez_final_15.ptau circuits/build/verifySovereignCV_0000.zkey
snarkjs zkey contribute circuits/build/verifySovereignCV_0000.zkey circuits/build/verifySovereignCV_final.zkey --name="SovereignCV"
snarkjs zkey export verificationkey circuits/build/verifySovereignCV_final.zkey circuits/build/verification_key.json
snarkjs zkey export solidityverifier circuits/build/verifySovereignCV_final.zkey contracts/Groth16Verifier.sol
```

## TODO for Agent D
1. Replace placeholder booleans with full transfer/certificate constraints.
2. Define exact witness encoding and canonical input generation.
3. Add positive/negative test vectors and reproducible proving script.

