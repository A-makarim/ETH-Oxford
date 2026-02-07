# Recruiter UI Scaffold

## Run
1. Install dependencies from repo root: `npm install`
2. Set `VITE_CV_VERIFIER_ADDRESS` in `.env`
3. Start: `npm run start:ui`

## Current Capabilities
1. Connect injected wallet.
2. Submit proof/public signals to `CVVerifier.verifyCVProof`.
3. Show status and tx hash.
4. Highlight CV lines when verification succeeds.

## TODO for Agent E
1. Replace raw wallet connect with wagmi/rainbowkit flow.
2. Add chain mismatch handling with explicit switch prompt.
3. Parse verifier event and render proof hash/badge timeline.
4. Integrate real candidate data model rather than static CV lines.

