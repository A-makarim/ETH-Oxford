import { expect } from "chai";
import { ethers } from "hardhat";

describe("AttestationStorage", () => {
  it("stores and returns education attestation", async () => {
    const [owner, subject] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AttestationStorage");
    const storageContract = await factory.deploy(owner.address);

    const attestationId = ethers.id("attestation-1");
    const certHash = ethers.id("cert-hash");
    const provider = "udemy";
    const issuedAt = 1_738_886_400;

    await expect(
      storageContract.recordEducationAttestation(attestationId, subject.address, certHash, provider, issuedAt)
    )
      .to.emit(storageContract, "EducationAttested")
      .withArgs(attestationId, subject.address, certHash, provider, issuedAt);

    const [savedSubject, savedCertHash, savedProvider, savedIssuedAt, exists] =
      await storageContract.getEducationAttestation(attestationId);

    expect(savedSubject).to.equal(subject.address);
    expect(savedCertHash).to.equal(certHash);
    expect(savedProvider).to.equal(provider);
    expect(savedIssuedAt).to.equal(issuedAt);
    expect(exists).to.equal(true);
  });

  it("rejects duplicate attestation ids", async () => {
    const [owner, subject] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AttestationStorage");
    const storageContract = await factory.deploy(owner.address);

    const attestationId = ethers.id("attestation-duplicate");
    const certHash = ethers.id("cert");

    await storageContract.recordEducationAttestation(attestationId, subject.address, certHash, "coursera", 1);
    await expect(
      storageContract.recordEducationAttestation(attestationId, subject.address, certHash, "coursera", 1)
    ).to.be.revertedWithCustomError(storageContract, "DuplicateAttestation");
  });

  it("allows only owner to write", async () => {
    const [owner, subject, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AttestationStorage");
    const storageContract = await factory.deploy(owner.address);

    await expect(
      storageContract
        .connect(other)
        .recordEducationAttestation(ethers.id("x"), subject.address, ethers.id("y"), "udemy", 1)
    ).to.be.revertedWithCustomError(storageContract, "OwnableUnauthorizedAccount");
  });
});

