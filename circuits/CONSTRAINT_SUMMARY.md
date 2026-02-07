# Constraint Summary (Agent D)

## Public Input Vector

`[requiredSkillHash, minExperienceMonths, educationCommitment, employmentCommitment, result]`

## Private Witness Inputs

- identity/privacy: `walletHash`, `salaryCommitment`
- public policy mirrors:
  - `policyRequiredSkillHash`
  - `policyMinExperienceMonths`
- public binding helpers:
  - `requiredSkillBindingSquare`
  - `minimumExperienceBindingSquare`
  - `educationCommitmentBindingSquare`
  - `employmentCommitmentBindingSquare`
- education witness:
  - `certificateWitnessHash`
  - `providerCode`
  - `educationSkillHash`
  - `educationIssuedAt`
  - `educationExpiryAt`
  - `educationAttestationId`
- employment witness:
  - `employmentEmployerHash`
  - `employmentTokenHash`
  - `employmentMonth0`
  - `employmentMonth1`
  - `employmentMonth2`
  - `month0TransferCount`
  - `month1TransferCount`
  - `month2TransferCount`
  - `employmentExperienceMonths`
  - `employerRegistered`
  - `tokenAllowed`

## Education Assertions

1. `providerCode` is exactly one of `{1,2,3,4}`.
2. `educationIssuedAt > 0`.
3. `educationExpiryAt >= educationIssuedAt`.
4. `educationSkillHash == requiredSkillHash`.
5. `certificateWitnessHash == Poseidon(walletHash, salaryCommitment, providerCode, educationSkillHash, educationIssuedAt, educationExpiryAt, educationAttestationId)`.
6. `educationCommitment == Poseidon(walletHash, providerCode, certificateWitnessHash, educationAttestationId, educationIssuedAt)`.
7. Public/policy bindings:
   - `requiredSkillHash == policyRequiredSkillHash`
   - `requiredSkillHash^2 == requiredSkillBindingSquare`
   - `educationCommitment^2 == educationCommitmentBindingSquare`

## Employment Assertions

1. `employerRegistered` and `tokenAllowed` are boolean and equal to `1`.
2. `month0TransferCount > 0`, `month1TransferCount > 0`, `month2TransferCount > 0`.
3. Consecutive months:
   - `employmentMonth1 == employmentMonth0 + 1`
   - `employmentMonth2 == employmentMonth1 + 1`
4. Experience threshold:
   - `employmentExperienceMonths >= minExperienceMonths`
5. `totalTransferCount = month0TransferCount + month1TransferCount + month2TransferCount`.
6. `employmentCommitment == Poseidon(walletHash, employmentEmployerHash, employmentTokenHash, employmentMonth0, employmentMonth1, employmentMonth2, totalTransferCount, employmentSatisfied)`.
7. Public/policy bindings:
   - `minExperienceMonths == policyMinExperienceMonths`
   - `minExperienceMonths^2 == minimumExperienceBindingSquare`
   - `employmentCommitment^2 == employmentCommitmentBindingSquare`

## Result Constraint

1. `educationSatisfied` and `employmentSatisfied` are boolean.
2. Both are constrained to `1`.
3. `result = educationSatisfied * employmentSatisfied`.
4. `result` is boolean and constrained to `1`.

## Negative Case Behavior

- Missing month witness fails because consecutive-month constraints are unsatisfied.
- Invalid certificate witness fails because skill match and/or certificate validity constraints are unsatisfied.
- Tampering any public signal after proof generation invalidates verification against `verification_key.json` and on-chain verifier.
