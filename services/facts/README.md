# Facts Aggregator Service Scaffold

## Endpoint
1. `GET /facts/:wallet`

## Purpose
1. Combine education and employment qualifications.
2. Return commitments needed by ZK witness generation and frontend display.

## Run
1. Ensure `services/plasma` is running.
2. Start service: `npm run start:facts`

## Required ENV
1. `PORT_FACTS`
2. `PLASMA_SERVICE_URL`
3. `MOCK_EDUCATION_WALLETS`

## TODO for Agent F
1. Replace mock education qualification source with attestation-backed lookup.
2. Add provenance fields and response signatures.
3. Add caching and retry for downstream service failures.

