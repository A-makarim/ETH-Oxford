# SovereignCV

This repository contains the implementation for SovereignCV.

Primary coordination document:

- `SOVEREIGNCV_AGENT_TODOS.md`

## Quick Start
1. `npm install`
2. Copy `.env.example` to `.env` and fill required values.
3. Run contract tests: `npm run test:contracts`
4. Deploy contracts (Flare Coston2): `npm run deploy:testnet`

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
- ZK circuit file is scaffolded and should be extended with full witness constraints for production readiness.
