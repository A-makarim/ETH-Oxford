# Recruiter UI Scaffold

## Run
1. Install dependencies from repo root: `npm install`
2. Set `VITE_CV_VERIFIER_ADDRESS` in `.env`
3. Set `VITE_FACTS_BASE_URL` (default `http://localhost:3003`)
4. Ensure services are running: `fdc` + `plasma` + `facts`
5. Start: `npm run start:ui`

## Current Capabilities
1. Connect injected wallet.
2. Show predefined candidate CVs awaiting background checks.
3. Run one-click verification (`Verify CV`) through backend workflow:
   - submits certificate checks to Flare FDC
   - waits for attestation status
   - checks Plasma employment qualification
   - generates proof package
4. Finalize on-chain verification via `CVVerifier.verifyCVProof`.
5. Highlight CV lines and graph nodes by live verification status.

## TODO for Agent E
1. Replace static candidate list with backend-fed applicant queue.
2. Parse `CVProofVerified` event logs for explicit success/failure proof hash from receipt logs.
3. Add admin view to tune verification policy (skill hash / minimum experience) per job role.
