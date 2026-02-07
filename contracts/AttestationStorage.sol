// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AttestationStorage is Ownable {
    struct EducationAttestation {
        address subject;
        bytes32 certHash;
        string provider;
        uint64 issuedAt;
        bool exists;
    }

    mapping(bytes32 attestationId => EducationAttestation data) private _education;

    event EducationAttested(bytes32 attestationId, address subject, bytes32 certHash, string provider, uint64 issuedAt);

    error InvalidSubject();
    error InvalidProvider();
    error DuplicateAttestation();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function recordEducationAttestation(
        bytes32 attestationId,
        address subject,
        bytes32 certHash,
        string calldata provider,
        uint64 issuedAt
    ) external onlyOwner {
        if (subject == address(0)) revert InvalidSubject();
        if (bytes(provider).length == 0) revert InvalidProvider();
        if (_education[attestationId].exists) revert DuplicateAttestation();

        _education[attestationId] = EducationAttestation({
            subject: subject,
            certHash: certHash,
            provider: provider,
            issuedAt: issuedAt,
            exists: true
        });

        emit EducationAttested(attestationId, subject, certHash, provider, issuedAt);
    }

    function getEducationAttestation(bytes32 attestationId)
        external
        view
        returns (address subject, bytes32 certHash, string memory provider, uint64 issuedAt, bool exists)
    {
        EducationAttestation storage a = _education[attestationId];
        return (a.subject, a.certHash, a.provider, a.issuedAt, a.exists);
    }
}

