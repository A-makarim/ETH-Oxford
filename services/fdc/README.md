# FDC Service Scaffold

## Endpoints
1. `POST /fdc/education/submit`
2. `GET /fdc/education/status/:requestId`

## Purpose
1. Normalize Udemy/Coursera certificate references.
2. Queue Flare FDC Web2Json verification.
3. Track request lifecycle and expose status.
4. Provide hook point to record verified attestations on `AttestationStorage.sol`.

## Run
1. Ensure root dependencies are installed: `npm install`
2. Start service: `npm run start:fdc`

## Required ENV
1. `PORT_FDC`
2. `FLARE_FDC_API_KEY`
3. `FDC_BASE_URL`

## TODO for Agent A
1. Replace scaffold `queueWeb2JsonVerification` with real verifier API integration.
2. Add callback/event polling from verifier finalization.
3. Perform actual contract write to `AttestationStorage.recordEducationAttestation`.
4. Persist status in durable storage (not in-memory map).

