// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "./IGroth16Verifier.sol";

contract MockGroth16Verifier is IGroth16Verifier {
    bool public result = true;

    function setResult(bool nextResult) external {
        result = nextResult;
    }

    function verifyProof(bytes calldata, uint256[] calldata publicSignals) external view returns (bool) {
        if (!result) {
            return false;
        }
        if (publicSignals.length == 0) {
            return false;
        }
        return publicSignals[publicSignals.length - 1] == 1;
    }
}

