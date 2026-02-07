import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    coston2: {
      url: process.env.FLARE_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      accounts: privateKey ? [privateKey] : []
    }
  }
};

export default config;

