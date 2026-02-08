# Plasma Employment Service

## Endpoint
1. `GET /plasma/employment/:wallet`
2. `GET /health`

## What It Does
1. Indexes incoming ERC20 `Transfer` logs for the wallet from Plasma RPC.
2. Filters by stablecoin allowlist and registered employers.
3. Applies strict 3-consecutive-UTC-month employment qualification logic.
4. Computes deterministic employment fact commitment.
5. Uses fallback indexer/explorer adapter when RPC path fails.
6. Persists indexed wallet history to disk and re-queries a reorg window.
7. Returns selected employer token and per-month transfer counts for ZK witness generation.

## Required Environment
1. `PORT_PLASMA` (default `3002`)
2. `PLASMA_RPC_URL`
3. `STABLECOIN_ALLOWLIST` (comma-separated token addresses)

## Optional Environment
1. `PLASMA_CHAIN_ID` (if set, service enforces RPC chain-id match)
2. `EMPLOYER_REGISTRY_ADDRESS` (on-chain employer registry contract; if omitted, service reads from `deployments/testnet/addresses.latest.json`)
3. `EMPLOYER_REGISTRY_RPC_URL` (RPC used to read `EmployerRegistry`; defaults to `FLARE_RPC_URL`, then `PLASMA_RPC_URL`)
4. `PLASMA_FALLBACK_URL` (fallback indexer URL; supports `{wallet}` placeholder)
5. `PLASMA_START_BLOCK` (absolute start block for indexing)
6. `PLASMA_LOOKBACK_BLOCKS` (default lookback if start block omitted)
7. `PLASMA_LOG_CHUNK_SIZE` (RPC log pagination size)
8. `PLASMA_REORG_DEPTH` (re-query window depth for reorg safety)
9. `PLASMA_INDEX_CACHE_PATH` (default `services/plasma/.plasma-index-cache.json`)
10. `PLASMA_RULE_MODE` (`strict_3_months` default, or `demo_one_payment` for demo-only relaxed rule)

## Fallback Adapter Contract
1. Service calls `PLASMA_FALLBACK_URL` with query params `wallet` and `tokens`.
2. Expected JSON: either `TransferEvent[]` or `{ "transfers": TransferEvent[] }`.
3. Each transfer requires: `txHash`, `blockNumber`, `logIndex`, `from`, `to`, `token`, `amount`, `timestamp`.

## Tests
1. Positive and negative wallet fixtures.
2. UTC month-boundary checks.
3. Employer tie-break determinism.
4. Deterministic commitment across reruns.
5. Fallback source path when RPC fails.

Run tests:
1. `npm run test --workspace services/plasma`
