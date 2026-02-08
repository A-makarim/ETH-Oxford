pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";

template IsZero() {
    signal input in;
    signal output out;
    signal inv;

    inv <-- in != 0 ? 1 / in : 0;
    out <== 1 - (in * inv);
    in * out === 0;
}

template IsEqual() {
    signal input a;
    signal input b;
    signal output out;

    component isZero = IsZero();
    isZero.in <== a - b;
    out <== isZero.out;
}

template AssertBit() {
    signal input in;
    in * (in - 1) === 0;
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];

    var acc = 0;
    var bitValue = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        acc += out[i] * bitValue;
        bitValue = bitValue + bitValue;
    }
    acc === in;
}

template LessThan(n) {
    signal input in[2];
    signal output out;

    component bits = Num2Bits(n + 1);
    bits.in <== in[0] + (1 << n) - in[1];
    out <== 1 - bits.out[n];
}

template VerifySovereignCV() {
    // Private witness values.
    signal input walletHash;
    signal input salaryCommitment;
    signal input certificateWitnessHash;
    signal input providerCode;
    signal input educationSkillHash;
    signal input educationIssuedAt;
    signal input educationExpiryAt;
    signal input educationAttestationId;

    signal input employmentEmployerHash;
    signal input employmentTokenHash;
    signal input employmentMonth0;
    signal input employmentMonth1;
    signal input employmentMonth2;
    signal input month0TransferCount;
    signal input month1TransferCount;
    signal input month2TransferCount;
    signal input employmentExperienceMonths;
    signal input policyRequiredSkillHash;
    signal input policyMinExperienceMonths;
    signal input requiredSkillBindingSquare;
    signal input minimumExperienceBindingSquare;
    signal input educationCommitmentBindingSquare;
    signal input employmentCommitmentBindingSquare;
    signal input employerRegistered;
    signal input tokenAllowed;

    // Public verifier signals.
    signal input requiredSkillHash;
    signal input minExperienceMonths;
    signal input educationCommitment;
    signal input employmentCommitment;
    signal input result;

    component employerRegisteredBit = AssertBit();
    employerRegisteredBit.in <== employerRegistered;
    component tokenAllowedBit = AssertBit();
    tokenAllowedBit.in <== tokenAllowed;
    result * (result - 1) === 0;

    component walletHashIsZero = IsZero();
    walletHashIsZero.in <== walletHash;
    signal walletHashNonZero;
    walletHashNonZero <== 1 - walletHashIsZero.out;
    walletHashNonZero === 1;

    requiredSkillHash === policyRequiredSkillHash;
    minExperienceMonths === policyMinExperienceMonths;
    requiredSkillHash * requiredSkillHash === requiredSkillBindingSquare;
    minExperienceMonths * minExperienceMonths === minimumExperienceBindingSquare;

    // Range checks to keep arithmetic bounded.
    component providerCodeBits = Num2Bits(3);
    providerCodeBits.in <== providerCode;
    component month0Bits = Num2Bits(32);
    month0Bits.in <== employmentMonth0;
    component month1Bits = Num2Bits(32);
    month1Bits.in <== employmentMonth1;
    component month2Bits = Num2Bits(32);
    month2Bits.in <== employmentMonth2;
    component c0Bits = Num2Bits(16);
    c0Bits.in <== month0TransferCount;
    component c1Bits = Num2Bits(16);
    c1Bits.in <== month1TransferCount;
    component c2Bits = Num2Bits(16);
    c2Bits.in <== month2TransferCount;
    component expBits = Num2Bits(16);
    expBits.in <== employmentExperienceMonths;
    component policyMinExpBits = Num2Bits(16);
    policyMinExpBits.in <== policyMinExperienceMonths;
    component issuedBits = Num2Bits(64);
    issuedBits.in <== educationIssuedAt;
    component expiryBits = Num2Bits(64);
    expiryBits.in <== educationExpiryAt;

    // Provider must be one of the supported values [1,4].
    component providerEq1 = IsEqual();
    providerEq1.a <== providerCode;
    providerEq1.b <== 1;
    component providerEq2 = IsEqual();
    providerEq2.a <== providerCode;
    providerEq2.b <== 2;
    component providerEq3 = IsEqual();
    providerEq3.a <== providerCode;
    providerEq3.b <== 3;
    component providerEq4 = IsEqual();
    providerEq4.a <== providerCode;
    providerEq4.b <== 4;

    signal providerValid;
    providerValid <== providerEq1.out + providerEq2.out + providerEq3.out + providerEq4.out;
    providerValid === 1;

    // Certificate must exist, match requested skill, and not be expired.
    component issuedIsZero = IsZero();
    issuedIsZero.in <== educationIssuedAt;
    signal issuedNonZero;
    issuedNonZero <== 1 - issuedIsZero.out;
    issuedNonZero === 1;

    component expiryBeforeIssued = LessThan(64);
    expiryBeforeIssued.in[0] <== educationExpiryAt;
    expiryBeforeIssued.in[1] <== educationIssuedAt;
    signal notExpired;
    notExpired <== 1 - expiryBeforeIssued.out;
    notExpired === 1;

    component skillMatches = IsEqual();
    skillMatches.a <== educationSkillHash;
    skillMatches.b <== policyRequiredSkillHash;
    skillMatches.out === 1;

    // Bind certificate witness hash to private certificate fields.
    component certificateWitnessHashCalc = Poseidon(7);
    certificateWitnessHashCalc.inputs[0] <== walletHash;
    certificateWitnessHashCalc.inputs[1] <== salaryCommitment;
    certificateWitnessHashCalc.inputs[2] <== providerCode;
    certificateWitnessHashCalc.inputs[3] <== educationSkillHash;
    certificateWitnessHashCalc.inputs[4] <== educationIssuedAt;
    certificateWitnessHashCalc.inputs[5] <== educationExpiryAt;
    certificateWitnessHashCalc.inputs[6] <== educationAttestationId;
    certificateWitnessHashCalc.out === certificateWitnessHash;

    // Employment months must be consecutive and each month must include incoming transfers.
    component month0IsZero = IsZero();
    month0IsZero.in <== month0TransferCount;
    signal month0HasTransfer;
    month0HasTransfer <== 1 - month0IsZero.out;
    month0HasTransfer === 1;

    component month1IsZero = IsZero();
    month1IsZero.in <== month1TransferCount;
    signal month1HasTransfer;
    month1HasTransfer <== 1 - month1IsZero.out;
    month1HasTransfer === 1;

    component month2IsZero = IsZero();
    month2IsZero.in <== month2TransferCount;
    signal month2HasTransfer;
    month2HasTransfer <== 1 - month2IsZero.out;
    month2HasTransfer === 1;

    component month1Consecutive = IsEqual();
    month1Consecutive.a <== employmentMonth1;
    month1Consecutive.b <== employmentMonth0 + 1;
    month1Consecutive.out === 1;

    component month2Consecutive = IsEqual();
    month2Consecutive.a <== employmentMonth2;
    month2Consecutive.b <== employmentMonth1 + 1;
    month2Consecutive.out === 1;

    component experienceBelowMinimum = LessThan(16);
    experienceBelowMinimum.in[0] <== employmentExperienceMonths;
    experienceBelowMinimum.in[1] <== policyMinExperienceMonths;
    signal experienceSatisfied;
    experienceSatisfied <== 1 - experienceBelowMinimum.out;
    experienceSatisfied === 1;

    signal educationSatisfied;
    signal educationGateA;
    educationGateA <== providerValid * issuedNonZero;
    signal educationGateB;
    educationGateB <== notExpired * skillMatches.out;
    educationSatisfied <== educationGateA * educationGateB;
    educationSatisfied * (educationSatisfied - 1) === 0;
    educationSatisfied === 1;

    signal employmentSatisfied;
    signal employmentGateA;
    employmentGateA <== employerRegistered * tokenAllowed;
    signal employmentGateB;
    employmentGateB <== month0HasTransfer * month1HasTransfer;
    signal employmentGateC;
    employmentGateC <== month2HasTransfer * month1Consecutive.out;
    signal employmentGateD;
    employmentGateD <== month2Consecutive.out * experienceSatisfied;
    signal employmentGateAB;
    employmentGateAB <== employmentGateA * employmentGateB;
    signal employmentGateCD;
    employmentGateCD <== employmentGateC * employmentGateD;
    employmentSatisfied <== employmentGateAB * employmentGateCD;
    employmentSatisfied * (employmentSatisfied - 1) === 0;
    employmentSatisfied === 1;

    signal totalTransferCount;
    totalTransferCount <== month0TransferCount + month1TransferCount + month2TransferCount;
    component totalTransferCountBits = Num2Bits(17);
    totalTransferCountBits.in <== totalTransferCount;

    // Public commitment binding.
    component educationCommitmentCalc = Poseidon(5);
    educationCommitmentCalc.inputs[0] <== walletHash;
    educationCommitmentCalc.inputs[1] <== providerCode;
    educationCommitmentCalc.inputs[2] <== certificateWitnessHash;
    educationCommitmentCalc.inputs[3] <== educationAttestationId;
    educationCommitmentCalc.inputs[4] <== educationIssuedAt;

    educationCommitment === educationCommitmentCalc.out;
    educationCommitment * educationCommitment === educationCommitmentBindingSquare;

    component employmentCommitmentCalc = Poseidon(8);
    employmentCommitmentCalc.inputs[0] <== walletHash;
    employmentCommitmentCalc.inputs[1] <== employmentEmployerHash;
    employmentCommitmentCalc.inputs[2] <== employmentTokenHash;
    employmentCommitmentCalc.inputs[3] <== employmentMonth0;
    employmentCommitmentCalc.inputs[4] <== employmentMonth1;
    employmentCommitmentCalc.inputs[5] <== employmentMonth2;
    employmentCommitmentCalc.inputs[6] <== totalTransferCount;
    employmentCommitmentCalc.inputs[7] <== employmentSatisfied;

    employmentCommitment === employmentCommitmentCalc.out;
    employmentCommitment * employmentCommitment === employmentCommitmentBindingSquare;

    signal computedResult;
    computedResult <== educationSatisfied * employmentSatisfied;

    signal resultBindingPublic;
    resultBindingPublic <== result * result;
    signal resultBindingPrivate;
    resultBindingPrivate <== computedResult * computedResult;
    resultBindingPublic === resultBindingPrivate;

    result === 1;
}

component main { public [requiredSkillHash, minExperienceMonths, educationCommitment, employmentCommitment, result] } =
    VerifySovereignCV();
