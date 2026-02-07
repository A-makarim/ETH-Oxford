# SovereignCV Integration Checklist

## Environment
1. Populate `.env` from `.env.example`.
2. Confirm Flare and Plasma RPC endpoints respond.
3. Confirm verifier API key is present for FDC.

## Deploy
1. Run `npm run deploy:testnet`.
2. Copy addresses from `deployments/testnet/addresses.latest.json`.
3. Update service/frontend env vars with deployed addresses.

## Services
1. Start `npm run start:fdc`.
2. Start `npm run start:plasma`.
3. Start `npm run start:facts`.
4. Validate `/health` on each service.

## Recruiter UI
1. Start `npm run start:ui`.
2. Connect wallet on testnet.
3. Submit proof and confirm verification tx succeeds.

## Evidence for Submission
1. FDC request and attestation tx hash.
2. Plasma employment endpoint output for qualifying wallet.
3. Proof verification tx hash and event.
4. UI screenshot with highlighted verified lines.

