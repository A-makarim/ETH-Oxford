# SovereignCV

This repository contains the implementation for SovereignCV.

Primary coordination document:

- `SOVEREIGNCV_AGENT_TODOS.md`

## Quick Start
1. `npm install`
2. Copy `.env.example` to `.env` and fill required values.
3. Run contract tests: `npm run test:contracts`
4. Deploy contracts (Flare Coston2): `npm run deploy:testnet`
5. Build ZK artifacts: `npm run zk:inputs && npm run zk:build && npm run zk:check`
6. Start services:
   - `npm run start:fdc`
   - `npm run start:plasma`
   - `npm run start:facts`
7. Start recruiter UI: `npm run start:ui`
8. Or launch all together: `npm run start:stack`

## Layout
- `contracts/`: Solidity contracts
- `scripts/`: deployment scripts
- `test/`: hardhat tests
- `circuits/`: circom circuit and notes
- `services/fdc/`: education verification service
- `services/plasma/`: employment verification service
- `services/facts/`: aggregated facts endpoint service
- `apps/recruiter-ui/`: recruiter-facing React app scaffold
- `interfaces/`: shared TS interfaces

## Notes
- Flare verifier endpoints may require API keys.
- Plasma indexing runs against RPC logs with fallback adapter support and deterministic qualification logic.
- Facts service can generate proof packages from live evidence: `POST /facts/:wallet/proof/generate`.

## Troubleshooting
- If UI shows `Failed to fetch`, verify services are up:
  - `Invoke-RestMethod http://localhost:3001/health`
  - `Invoke-RestMethod http://localhost:3002/health`
  - `Invoke-RestMethod http://localhost:3003/health`
- If ports are busy, stop old listeners before `npm run start:stack`:
  - `Get-NetTCPConnection -LocalPort 3001,3002,3003,5173 -State Listen | Select-Object LocalPort,OwningProcess`
