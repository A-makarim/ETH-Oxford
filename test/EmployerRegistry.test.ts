import { expect } from "chai";
import { ethers } from "hardhat";

describe("EmployerRegistry", () => {
  it("allows owner to add and remove employers", async () => {
    const [owner, employer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("EmployerRegistry");
    const registry = await factory.deploy(owner.address);

    await expect(registry.addEmployer(employer.address))
      .to.emit(registry, "EmployerAdded")
      .withArgs(employer.address);

    expect(await registry.isEmployer(employer.address)).to.equal(true);

    await expect(registry.removeEmployer(employer.address))
      .to.emit(registry, "EmployerRemoved")
      .withArgs(employer.address);

    expect(await registry.isEmployer(employer.address)).to.equal(false);
  });

  it("rejects non-owner writes", async () => {
    const [owner, employer, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("EmployerRegistry");
    const registry = await factory.deploy(owner.address);

    await expect(registry.connect(other).addEmployer(employer.address)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
  });

  it("rejects duplicate add and remove missing employer", async () => {
    const [owner, employer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("EmployerRegistry");
    const registry = await factory.deploy(owner.address);

    await registry.addEmployer(employer.address);
    await expect(registry.addEmployer(employer.address)).to.be.revertedWithCustomError(registry, "EmployerAlreadyExists");
    await registry.removeEmployer(employer.address);
    await expect(registry.removeEmployer(employer.address)).to.be.revertedWithCustomError(registry, "EmployerNotFound");
  });
});

