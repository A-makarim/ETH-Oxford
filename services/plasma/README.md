# Plasma Employment Service Scaffold

## Endpoint
1. `GET /plasma/employment/:wallet`

## Purpose
1. Evaluate stablecoin salary-like payments.
2. Apply strict 3 consecutive calendar month rule.
3. Enforce employer registry and stablecoin allowlist filters.
4. Return deterministic employment fact commitment.

## Run
1. Install root dependencies: `npm install`
2. Start service: `npm run start:plasma`

## Required ENV
1. `PORT_PLASMA`
2. `PLASMA_RPC_URL` (for future RPC implementation)
3. `PLASMA_CHAIN_ID`
4. `STABLECOIN_ALLOWLIST`
5. `MOCK_EMPLOYER_REGISTRY`

## TODO for Agent B
1. Replace `mockTransfers` with live RPC log indexing on Plasma.
2. Add explorer/indexer fallback path when RPC fails.
3. Persist indexed history and add reorg handling.
4. Add unit tests for date boundary and employer tie-break behavior.

