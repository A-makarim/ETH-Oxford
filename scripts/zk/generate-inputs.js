const fs = require("node:fs");
const path = require("node:path");
const { buildPoseidon } = require("circomlibjs");

const rootDir = path.resolve(__dirname, "..", "..");
const circuitsDir = path.join(rootDir, "circuits");
const inputsDir = path.join(circuitsDir, "inputs");
const sampleInputPath = path.join(circuitsDir, "input.sample.json");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function stringifyRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value.toString()]));
}

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const squareInField = (value) => {
    const element = F.e(value.toString());
    return F.toObject(F.mul(element, element));
  };

  const base = {
    walletHash: 12003400560078009n,
    salaryCommitment: 998877665544332211n,
    providerCode: 2n,
    educationSkillHash: 77110099n,
    educationIssuedAt: 1735689600n,
    educationExpiryAt: 1893456000n,
    educationAttestationId: 44556677n,
    employmentEmployerHash: 222333444555n,
    employmentTokenHash: 111222333444n,
    employmentMonth0: 24310n,
    employmentMonth1: 24311n,
    employmentMonth2: 24312n,
    month0TransferCount: 2n,
    month1TransferCount: 1n,
    month2TransferCount: 3n,
    employmentExperienceMonths: 18n,
    policyRequiredSkillHash: 77110099n,
    policyMinExperienceMonths: 12n,
    requiredSkillHash: 77110099n,
    minExperienceMonths: 12n,
    result: 1n,
    employerRegistered: 1n,
    tokenAllowed: 1n
  };

  const certificateWitnessHash = F.toObject(
    poseidon([
      base.walletHash,
      base.salaryCommitment,
      base.providerCode,
      base.educationSkillHash,
      base.educationIssuedAt,
      base.educationExpiryAt,
      base.educationAttestationId
    ])
  );

  const totalTransferCount = base.month0TransferCount + base.month1TransferCount + base.month2TransferCount;
  const educationCommitment = F.toObject(
    poseidon([
      base.walletHash,
      base.providerCode,
      certificateWitnessHash,
      base.educationAttestationId,
      base.educationIssuedAt
    ])
  );
  const employmentCommitment = F.toObject(
    poseidon([
      base.walletHash,
      base.employmentEmployerHash,
      base.employmentTokenHash,
      base.employmentMonth0,
      base.employmentMonth1,
      base.employmentMonth2,
      totalTransferCount,
      1n
    ])
  );
  const valid = stringifyRecord({
    ...base,
    certificateWitnessHash,
    educationCommitment,
    employmentCommitment,
    requiredSkillBindingSquare: squareInField(base.requiredSkillHash),
    minimumExperienceBindingSquare: squareInField(base.minExperienceMonths),
    educationCommitmentBindingSquare: squareInField(educationCommitment),
    employmentCommitmentBindingSquare: squareInField(employmentCommitment)
  });

  const missingMonth = (() => {
    const employmentMonth2 = base.employmentMonth2 + 2n;
    const recomputedEmploymentCommitment = F.toObject(
      poseidon([
        base.walletHash,
        base.employmentEmployerHash,
        base.employmentTokenHash,
        base.employmentMonth0,
        base.employmentMonth1,
        employmentMonth2,
        totalTransferCount,
        1n
      ])
    );
    return stringifyRecord({
      ...base,
      employmentMonth2,
      certificateWitnessHash,
      educationCommitment,
      employmentCommitment: recomputedEmploymentCommitment,
      requiredSkillBindingSquare: squareInField(base.requiredSkillHash),
      minimumExperienceBindingSquare: squareInField(base.minExperienceMonths),
      educationCommitmentBindingSquare: squareInField(educationCommitment),
      employmentCommitmentBindingSquare: squareInField(recomputedEmploymentCommitment)
    });
  })();

  const invalidCert = stringifyRecord({
    ...base,
    policyRequiredSkillHash: base.policyRequiredSkillHash + 7n,
    certificateWitnessHash,
    educationCommitment,
    employmentCommitment,
    requiredSkillBindingSquare: squareInField(base.requiredSkillHash),
    minimumExperienceBindingSquare: squareInField(base.minExperienceMonths),
    educationCommitmentBindingSquare: squareInField(educationCommitment),
    employmentCommitmentBindingSquare: squareInField(employmentCommitment)
  });

  writeJson(path.join(inputsDir, "valid.json"), valid);
  writeJson(path.join(inputsDir, "missing-month.json"), missingMonth);
  writeJson(path.join(inputsDir, "invalid-cert.json"), invalidCert);
  writeJson(sampleInputPath, valid);

  console.log("Wrote deterministic circuit inputs:");
  console.log(`- ${path.join("circuits", "inputs", "valid.json")}`);
  console.log(`- ${path.join("circuits", "inputs", "missing-month.json")}`);
  console.log(`- ${path.join("circuits", "inputs", "invalid-cert.json")}`);
  console.log(`- ${path.join("circuits", "input.sample.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
