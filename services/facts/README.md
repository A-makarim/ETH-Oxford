# Facts Aggregator Service

## Endpoint
1. `GET /facts/:wallet`
2. `GET /health`

## What It Does
1. Reads employment qualification and commitment from `services/plasma`.
2. Reads real education attestations from on-chain `AttestationStorage` events.
3. Computes deterministic commitments used by ZK witness generation.
4. Returns combined commitment as `keccak256(abi.encode(educationCommitment, employmentCommitment))`.

## Required Environment
1. `PORT_FACTS` (default `3003`)
2. `PLASMA_SERVICE_URL` (default `http://localhost:3002`)
3. `FLARE_RPC_URL`

## Optional Environment
1. `ATTESTATION_STORAGE_ADDRESS` (if omitted, loaded from `deployments/testnet/addresses.latest.json`)
2. `FACTS_ATTESTATION_START_BLOCK` (absolute block to start event scans)
3. `FACTS_ATTESTATION_LOOKBACK_BLOCKS` (default `350000`)
4. `FACTS_LOG_CHUNK_SIZE` (default `2000`)

## Run
1. Ensure `services/plasma` is running.
2. Start service: `npm run start:facts`
