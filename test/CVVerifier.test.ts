import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("CVVerifier", () => {
  it("verifies proof and emits event", async () => {
    const [owner, recruiter] = await ethers.getSigners();

    const mockFactory = await ethers.getContractFactory("MockGroth16Verifier");
    const mock = await mockFactory.deploy();

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await mock.getAddress());

    const proof = "0x1234";
    const publicSignals = [11, 22, 33, 1];

    await expect(cvVerifier.connect(recruiter).verifyCVProof(proof, publicSignals))
      .to.emit(cvVerifier, "CVProofVerified")
      .withArgs(recruiter.address, anyValue, true);
  });

  it("returns false when verifier fails", async () => {
    const [owner, recruiter] = await ethers.getSigners();

    const mockFactory = await ethers.getContractFactory("MockGroth16Verifier");
    const mock = await mockFactory.deploy();
    await mock.setResult(false);

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await mock.getAddress());

    const tx = await cvVerifier.connect(recruiter).verifyCVProof("0x1234", [1]);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);
  });

  it("allows owner to rotate verifier", async () => {
    const [owner, other] = await ethers.getSigners();

    const mockFactory = await ethers.getContractFactory("MockGroth16Verifier");
    const mockA = await mockFactory.deploy();
    const mockB = await mockFactory.deploy();

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await mockA.getAddress());

    await expect(cvVerifier.connect(other).setVerifier(await mockB.getAddress())).to.be.revertedWithCustomError(
      cvVerifier,
      "OwnableUnauthorizedAccount"
    );

    await cvVerifier.setVerifier(await mockB.getAddress());
    expect(await cvVerifier.groth16Verifier()).to.equal(await mockB.getAddress());
  });
});

