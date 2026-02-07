# FDC Education Service

## Endpoints
1. `POST /fdc/education/submit`
2. `GET /fdc/education/status/:requestId`
3. `GET /health`

## What It Does
1. Normalizes Udemy/Coursera input into canonical certificate source URLs.
2. Fetches a source snapshot and computes deterministic `certHash` from canonical JSON.
3. Calls Flare verifier `POST /verifier/web2/Web2Json/prepareRequest`.
4. Submits the encoded request on-chain to `FdcHub.requestAttestation` with live fee lookup.
5. Polls `ctn2-data-availability` proof endpoint until proof is available.
6. Writes verified fact to `AttestationStorage.recordEducationAttestation(...)`.
7. Persists request lifecycle state to disk (`.fdc-requests.json` by default).

## Required Environment
1. `FLARE_RPC_URL`: Flare JSON-RPC URL (Coston2 for hackathon flow).
2. `DEPLOYER_PRIVATE_KEY`: EOA used for FDC request tx + attestation write tx.
3. `ATTESTATION_STORAGE_ADDRESS`: deployed `AttestationStorage` contract address.
4. `FLARE_FDC_API_KEY`: verifier API key for Flare verifier endpoint.

## Optional Environment
1. `PORT_FDC` (default `3001`).
2. `FDC_BASE_URL` (default `https://fdc-verifiers-testnet.flare.network`).
3. `FDC_DA_BASE_URL` (default `https://ctn2-data-availability.flare.network`).
4. `FDC_STATUS_TIMEOUT_MS` (default `600000`).
5. `FDC_POLL_INTERVAL_MS` (default `10000`).
6. `FDC_POLL_INITIAL_BACKOFF_MS` (default `5000`).
7. `FDC_POLL_MAX_BACKOFF_MS` (default `60000`).
8. `FDC_SOURCE_FETCH_TIMEOUT_MS` (default `12000`).
9. `FDC_STORE_PATH` (default `services/fdc/.fdc-requests.json`).

## Retry and Status Strategy
1. Submit path sets record to `pending`, then `accepted` after successful verifier+on-chain request.
2. Poller uses exponential backoff: `initial * 2^(attempt-1)`, capped by `FDC_POLL_MAX_BACKOFF_MS`.
3. While no DA proof is available, status remains `pending` (internally `accepted`).
4. If DA returns a terminal error, status becomes `failed`.
5. If timeout window is exceeded, status becomes `timeout`.
6. On proof availability, service writes attestation on-chain and sets status `verified`.

## Run
1. Install root deps: `npm install`
2. Start service: `npm run start:fdc`

## Notes
1. If `ATTESTATION_STORAGE_ADDRESS` is omitted, the service falls back to `deployments/testnet/addresses.latest.json` (or `addresses.example.json`).
2. Status API maps internal `accepted` to external `pending` to match frozen API contract.
