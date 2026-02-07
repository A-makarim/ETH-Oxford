pragma circom 2.1.9;

// Scaffold circuit for MVP wiring.
// Agent D should replace placeholder boolean witness inputs with full
// constraints over payment/certificate witness data.
template VerifySovereignCV() {
    // Private witness data (not public outputs).
    signal input walletHash;
    signal input salaryCommitment;
    signal input certificateWitnessHash;
    signal input employmentSatisfied;
    signal input educationSatisfied;

    // Public signals expected by verifier/UI.
    signal input requiredSkillHash;
    signal input minExperienceMonths;
    signal input educationCommitment;
    signal input employmentCommitment;
    signal input result;

    // Booleans must be 0/1.
    employmentSatisfied * (employmentSatisfied - 1) === 0;
    educationSatisfied * (educationSatisfied - 1) === 0;
    result * (result - 1) === 0;

    // Current scaffold: result must be logical AND of both checks.
    signal computed;
    computed <== employmentSatisfied * educationSatisfied;
    computed === result;

    // Keep private signals in witness path.
    walletHash * 0 === 0;
    salaryCommitment * 0 === 0;
    certificateWitnessHash * 0 === 0;

    // Keep public policy fields referenced.
    requiredSkillHash * 0 === 0;
    minExperienceMonths * 0 === 0;
    educationCommitment * 0 === 0;
    employmentCommitment * 0 === 0;
}

component main { public [requiredSkillHash, minExperienceMonths, educationCommitment, employmentCommitment, result] } =
    VerifySovereignCV();

