// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EducationCertificateIssuer
 * @notice Issues on-chain education certificates that can be verified via FDC EVMTransaction
 * @dev This is BETTER than Web2Json because:
 *      1. Certificates are immutably on-chain
 *      2. EVMTransaction attestation is WORKING on Coston2
 *      3. More trustworthy than scraping  web pages
 */
contract EducationCertificateIssuer is Ownable {
    struct Certificate {
        address subject;
        string provider; // "coursera", "udemy", "edx", "datacamp"
        string courseId;
        bytes32 certHash;
        uint64 issuedAt;
        bool exists;
    }

    mapping(bytes32 certificateId => Certificate certificate) public certificates;

    event CertificateIssued(
        bytes32 indexed certificateId,
        address indexed subject,
        string provider,
        string courseId,
        bytes32 certHash,
        uint64 issuedAt
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Issue a new education certificate (owner-only for MVP)
     * @param certificateId Unique certificate identifier
     * @param subject Wallet address of certificate recipient
     * @param provider Education provider name
     * @param courseId Course/certificate identifier
     * @param certHash Hash of certificate metadata
     */
    function issueCertificate(
        bytes32 certificateId,
        address subject,
        string calldata provider,
        string calldata courseId,
        bytes32 certHash
    ) external onlyOwner {
        require(subject != address(0), "Invalid subject");
        require(bytes(provider).length > 0, "Invalid provider");
        require(!certificates[certificateId].exists, "Certificate already issued");

        certificates[certificateId] = Certificate({
            subject: subject,
            provider: provider,
            courseId: courseId,
            certHash: certHash,
            issuedAt: uint64(block.timestamp),
            exists: true
        });

        emit CertificateIssued(certificateId, subject, provider, courseId, certHash, uint64(block.timestamp));
    }

    /**
     * @notice Get certificate details
     */
    function getCertificate(
        bytes32 certificateId
    )
        external
        view
        returns (
            address subject,
            string memory provider,
            string memory courseId,
            bytes32 certHash,
            uint64 issuedAt,
            bool exists
        )
    {
        Certificate storage cert = certificates[certificateId];
        return (cert.subject, cert.provider, cert.courseId, cert.certHash, cert.issuedAt, cert.exists);
    }
}
