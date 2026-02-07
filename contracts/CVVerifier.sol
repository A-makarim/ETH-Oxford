// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGroth16Verifier} from "./IGroth16Verifier.sol";

contract CVVerifier is Ownable {
    IGroth16Verifier public groth16Verifier;

    event CVProofVerified(address verifier, bytes32 proofHash, bool success);
    event VerifierUpdated(address verifier);

    error InvalidVerifier();

    constructor(address initialOwner, address verifierAddress) Ownable(initialOwner) {
        _setVerifier(verifierAddress);
    }

    function setVerifier(address verifierAddress) external onlyOwner {
        _setVerifier(verifierAddress);
    }

    function verifyCVProof(bytes calldata proof, uint256[] calldata publicSignals) external returns (bool success) {
        success = groth16Verifier.verifyProof(proof, publicSignals);
        bytes32 proofHash = keccak256(abi.encode(proof, publicSignals));
        emit CVProofVerified(msg.sender, proofHash, success);
    }

    function _setVerifier(address verifierAddress) internal {
        if (verifierAddress == address(0)) revert InvalidVerifier();
        groth16Verifier = IGroth16Verifier(verifierAddress);
        emit VerifierUpdated(verifierAddress);
    }
}

