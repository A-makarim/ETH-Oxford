import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 114);
const rpcUrl =
  import.meta.env.VITE_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";

const sovereignChain = defineChain({
  id: chainId,
  name: "SovereignCV",
  network: "sovereigncv",
  nativeCurrency: {
    name: "Coston2 Flare",
    symbol: "C2FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
});

export const wagmiConfig = createConfig({
  chains: [sovereignChain],
  connectors: [injected()],
  transports: {
    [sovereignChain.id]: http(rpcUrl),
  },
});
