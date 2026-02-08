# HireFlow (SovereignCV)

HireFlow is a recruiter-facing background verification app built on:
1. Flare FDC for Web2 education attestation
2. Plasma payment history for employment qualification
3. Circom + Groth16 for privacy-preserving proof generation
4. On-chain CV verification via `CVVerifier`

The system is implemented as a monorepo with Solidity contracts, three backend services, and a React recruiter UI.
Verification paths use live RPC/verifier integrations (no mock verification backend).

## Current Implementation (What Works Today)
1. End-to-end verification workflow:
   - submit certificate checks to Flare FDC
   - poll FDC status until attested/failed
   - evaluate Plasma employment qualification
   - generate ZK proof package from live evidence
   - finalize on-chain through `CVVerifier.verifyCVProof`
2. Recruiter UI flow:
   - landing page + upload modal
   - parse candidate PDFs (wallet + experience + certificate URLs)
   - live verification timeline (Flare/Plasma/ZK/on-chain)
   - 3D graph + CV line status + success/failure popup
3. Real service endpoints for observability:
   - health checks
   - facts/commitments
   - verification job state + event stream
   - FDC request and attestation tx hashes
4. Testnet deploy pipeline writes addresses to `deployments/testnet/addresses.latest.json`.

## Repository Layout
1. `contracts/`: Solidity contracts
2. `scripts/`: deployment + ZK utility scripts
3. `test/`: contract tests
4. `circuits/`: Circom circuit, witness/proof artifacts, vectors
5. `services/fdc/`: Flare FDC education verification service
6. `services/plasma/`: Plasma employment qualification service
7. `services/facts/`: orchestration service for facts + proof workflow
8. `apps/recruiter-ui/`: recruiter web app (Vite + React + wagmi)
9. `deployments/testnet/`: deployed addresses snapshot

## Architecture Overview
1. Contracts (Flare Coston2)
   - `EmployerRegistry.sol`: approved employer wallet registry
   - `AttestationStorage.sol`: stores education attestation facts
   - `CVVerifier.sol`: emits proof verification outcome hash
   - `Groth16Verifier.sol` + `Groth16VerifierAdapter.sol`
2. Flare service (`services/fdc`)
   - normalizes provider input (`edx`, `coursera`, `udemy`, `datacamp`)
   - creates Web2Json verifier request
   - submits `requestAttestation` on Flare
   - polls DA proof endpoints and writes attestation on-chain
3. Plasma service (`services/plasma`)
   - indexes allowlisted ERC20 incoming transfers
   - enforces employer registry and rule mode
   - returns `factCommitment` and qualification details
4. Facts service (`services/facts`)
   - orchestrates end-to-end verification jobs
   - aggregates education + employment evidence
   - generates proof package (`proofBytes`, `publicSignals`, `proofHash`)
5. Recruiter UI (`apps/recruiter-ui`)
   - PDF-driven applicant ingestion
   - one-click verify button
   - live timeline and graph updates

## API Surface
1. FDC service (`:3001`)
   - `POST /fdc/education/submit`
   - `GET /fdc/education/status/:requestId`
   - `GET /health`
2. Plasma service (`:3002`)
   - `GET /plasma/employment/:wallet`
   - `GET /health`
3. Facts service (`:3003`)
   - `GET /facts/:wallet`
   - `POST /facts/:wallet/proof/generate`
   - `GET /facts/:wallet/proof/latest`
   - `POST /verification/start`
   - `GET /verification/:jobId`
   - `GET /health`

## Prerequisites
1. Node.js 22+
2. npm 10+
3. Funded deployer wallet on Flare Coston2
4. Flare FDC verifier API key

## Environment Setup
1. Copy `.env.example` to `.env`
2. Fill required values:
   - `DEPLOYER_PRIVATE_KEY`
   - `FLARE_RPC_URL`
   - `PLASMA_RPC_URL`
   - `STABLECOIN_ALLOWLIST`
   - `FLARE_FDC_API_KEY`
3. After deploy, update:
   - `EMPLOYER_REGISTRY_ADDRESS`
   - `ATTESTATION_STORAGE_ADDRESS`
   - `CV_VERIFIER_ADDRESS`
   - `VITE_CV_VERIFIER_ADDRESS`

## Local Run
1. Install dependencies:
   - `npm install`
2. Compile and test contracts:
   - `npm run test:contracts`
3. Deploy to Coston2:
   - `npm run deploy:testnet`
4. Build ZK artifacts:
   - `npm run zk:build`
5. Start full stack:
   - `npm run start:stack`
6. UI:
   - `http://localhost:5173`

If you prefer separate processes:
1. `npm run start:fdc`
2. `npm run start:plasma`
3. `npm run start:facts`
4. `npm run start:ui`

## Verification Workflow
1. Open UI and upload one or more candidate PDFs
2. Select candidate and click `Verify CV`
3. Facts service starts a verification job:
   - submits certificates to FDC service
   - polls attestation status
   - runs Plasma qualification check
   - generates ZK proof package
4. Recruiter wallet signs on-chain verification tx
5. UI marks proof status and graph nodes accordingly

## Demo Utilities
1. Sample PDFs are available at:
   - `apps/recruiter-ui/public/examples/asad-malik-sovereigncv.pdf`
   - `apps/recruiter-ui/public/examples/demo-applicant-sovereigncv.pdf`
2. Relaxed demo employment rule:
   - set `PLASMA_RULE_MODE=demo_one_payment`
   - strict production-like rule is `strict_3_months`

## Observability and Evidence Capture
1. Verification job stream:
   - `GET /verification/:jobId`
2. FDC evidence fields:
   - `fdcRequestTxHash`
   - `attestationId`
   - `txHash` (attestation write tx)
3. Plasma evidence fields:
   - `qualifies`
   - `monthsMatched`
   - `paymentCount`
   - `factCommitment`
4. ZK evidence fields:
   - `proofHash`
   - `publicSignals`

## Troubleshooting
1. UI shows `Failed to fetch`
   - confirm services:
     - `Invoke-RestMethod http://localhost:3001/health`
     - `Invoke-RestMethod http://localhost:3002/health`
     - `Invoke-RestMethod http://localhost:3003/health`
2. `npm run start:stack` exits due to port conflict
   - check listeners:
     - `Get-NetTCPConnection -LocalPort 3001,3002,3003,5173 -State Listen | Select-Object LocalPort,OwningProcess`
3. PDF parse errors
   - use text-based PDFs (not scanned image-only PDFs)
   - ensure PDF includes wallet, experience lines, and supported certificate URLs
4. Flare submit rejected
   - verify provider URL format and API key
   - inspect `GET /fdc/education/status/:requestId` reason

## Security Notes
1. Never commit `.env` or private keys
2. Use dedicated test wallets for demos
3. Only share public addresses, tx hashes, attestation IDs, and proof hashes in recordings/submissions
