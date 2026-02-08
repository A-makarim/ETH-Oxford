# Facts Aggregator Service

## Endpoint
1. `GET /facts/:wallet`
2. `GET /health`
3. `POST /facts/:wallet/proof/generate`
4. `GET /facts/:wallet/proof/latest`
5. `POST /verification/start`
6. `GET /verification/:jobId`

## What It Does
1. Reads employment qualification and commitment from `services/plasma`.
2. Reads real education attestations from on-chain `AttestationStorage` events.
3. Computes deterministic commitments used by ZK witness generation.
4. Returns combined commitment as `keccak256(abi.encode(educationCommitment, employmentCommitment))`.
5. Generates Groth16 proof packages using real chain evidence via `scripts/zk/generate-inputs-real.js`.
6. Stores the latest proof package per wallet at `services/facts/.proof-packages/<wallet>.json`.
7. Orchestrates end-to-end CV verification jobs that call Flare FDC + Plasma and then generate a proof package.

## Required Environment
1. `PORT_FACTS` (default `3003`)
2. `PLASMA_SERVICE_URL` (default `http://localhost:3002`)
3. `FLARE_RPC_URL`
4. `PLASMA_RPC_URL`
5. `EMPLOYER_REGISTRY_ADDRESS`
6. `STABLECOIN_ALLOWLIST`
7. `FDC_SERVICE_URL` (default `http://localhost:3001`)

## Optional Environment
1. `ATTESTATION_STORAGE_ADDRESS` (if omitted, loaded from `deployments/testnet/addresses.latest.json`)
2. `FACTS_ATTESTATION_START_BLOCK` (absolute block to start event scans)
3. `FACTS_ATTESTATION_LOOKBACK_BLOCKS` (default `5000`)
4. `FACTS_LOG_CHUNK_SIZE` (default `30`)
5. `ZK_REQUIRED_SKILL_HASH`
6. `ZK_EDUCATION_SKILL_HASH` (fallback for proof generation if request omits `educationSkillHash`)
7. `ZK_MIN_EXPERIENCE_MONTHS`
8. `ZK_SALARY_COMMITMENT`
9. `ZK_EDUCATION_EXPIRY_AT`
10. `ZK_EMPLOYMENT_EXPERIENCE_MONTHS`
11. `VERIFICATION_JOB_TIMEOUT_MS` (default `720000`)
12. `VERIFICATION_JOB_POLL_MS` (default `8000`)

## Run
1. Ensure `services/plasma` is running.
2. Start service: `npm run start:facts`

## Proof Generation API
### `POST /facts/:wallet/proof/generate`
Body fields are optional if supplied through env defaults:
1. `requiredSkillHash` (decimal string)
2. `minExperienceMonths` (number)
3. `salaryCommitment` (decimal string)
4. `educationExpiryAt` (unix seconds)
5. `employmentExperienceMonths` (number)
6. `educationSkillHash` (decimal string)
7. `attestationId` (optional override)

Response includes:
1. `proofBytes`
2. `publicSignals`
3. `proofHash`
4. `metadata` (education + employment evidence snapshot)
