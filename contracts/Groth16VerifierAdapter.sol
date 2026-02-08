// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "./IGroth16Verifier.sol";

interface ISovereignCVGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[5] calldata pubSignals
    ) external view returns (bool);
}

contract Groth16VerifierAdapter is IGroth16Verifier {
    ISovereignCVGroth16Verifier public immutable verifier;

    error InvalidVerifier();
    error InvalidProofEncoding();
    error InvalidPublicSignalsLength(uint256 provided);

    constructor(address verifierAddress) {
        if (verifierAddress == address(0)) revert InvalidVerifier();
        verifier = ISovereignCVGroth16Verifier(verifierAddress);
    }

    function verifyProof(bytes calldata proof, uint256[] calldata publicSignals) external view returns (bool) {
        if (proof.length != 32 * 8) revert InvalidProofEncoding();
        if (publicSignals.length != 5) revert InvalidPublicSignalsLength(publicSignals.length);

        uint256[8] memory packed = abi.decode(proof, (uint256[8]));

        uint256[2] memory pA;
        pA[0] = packed[0];
        pA[1] = packed[1];

        uint256[2][2] memory pB;
        pB[0][0] = packed[2];
        pB[0][1] = packed[3];
        pB[1][0] = packed[4];
        pB[1][1] = packed[5];

        uint256[2] memory pC;
        pC[0] = packed[6];
        pC[1] = packed[7];

        uint256[5] memory verifierSignals;
        for (uint256 i = 0; i < verifierSignals.length; i++) {
            verifierSignals[i] = publicSignals[i];
        }

        return verifier.verifyProof(pA, pB, pC, verifierSignals);
    }
}
