import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CalldataVector = {
  proofBytes: string;
  publicSignals: string[];
};

function loadCalldataVector(): CalldataVector {
  const vectorPath = join(process.cwd(), "circuits", "vectors", "valid", "calldata.json");
  if (!existsSync(vectorPath)) {
    throw new Error(
      `Missing ${vectorPath}. Run: npm run zk:inputs && npm run zk:build && npm run zk:prove`
    );
  }
  return JSON.parse(readFileSync(vectorPath, "utf8")) as CalldataVector;
}

async function deployVerifierStack() {
  const rawVerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const rawVerifier = await rawVerifierFactory.deploy();

  const adapterFactory = await ethers.getContractFactory("Groth16VerifierAdapter");
  const adapter = await adapterFactory.deploy(await rawVerifier.getAddress());

  return { rawVerifier, adapter };
}

describe("CVVerifier", () => {
  const vector = loadCalldataVector();
  const publicSignals = vector.publicSignals.map((signal) => BigInt(signal));

  it("runs verification through the Groth16 adapter and emits event", async () => {
    const [owner, recruiter] = await ethers.getSigners();
    const { adapter } = await deployVerifierStack();

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await adapter.getAddress());
    const expected = await adapter.verifyProof(vector.proofBytes, publicSignals);

    await expect(cvVerifier.connect(recruiter).verifyCVProof(vector.proofBytes, publicSignals))
      .to.emit(cvVerifier, "CVProofVerified")
      .withArgs(recruiter.address, anyValue, expected);
  });

  it("returns false when public signals are tampered", async () => {
    const [owner, recruiter] = await ethers.getSigners();
    const { adapter } = await deployVerifierStack();

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await adapter.getAddress());

    const tamperedSignals = [...publicSignals];
    tamperedSignals[tamperedSignals.length - 1] = tamperedSignals[tamperedSignals.length - 1] ^ 1n;

    await expect(cvVerifier.connect(recruiter).verifyCVProof(vector.proofBytes, tamperedSignals))
      .to.emit(cvVerifier, "CVProofVerified")
      .withArgs(recruiter.address, anyValue, false);
  });

  it("allows owner to rotate verifier", async () => {
    const [owner, other] = await ethers.getSigners();
    const { adapter: adapterA } = await deployVerifierStack();
    const { adapter: adapterB } = await deployVerifierStack();

    const cvFactory = await ethers.getContractFactory("CVVerifier");
    const cvVerifier = await cvFactory.deploy(owner.address, await adapterA.getAddress());

    await expect(cvVerifier.connect(other).setVerifier(await adapterB.getAddress())).to.be.revertedWithCustomError(
      cvVerifier,
      "OwnableUnauthorizedAccount"
    );

    await cvVerifier.setVerifier(await adapterB.getAddress());
    expect(await cvVerifier.groth16Verifier()).to.equal(await adapterB.getAddress());
  });
});
