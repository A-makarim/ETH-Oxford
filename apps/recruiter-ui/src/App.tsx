import { useMemo, useState } from "react";
import { BrowserProvider, Contract, getAddress } from "ethers";
import { cvVerifierAbi } from "./abis/cvVerifier";

type VerifyState = "idle" | "connecting" | "verifying" | "success" | "error";

function parseSignals(raw: string): bigint[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => BigInt(x));
}

export default function App() {
  const [wallet, setWallet] = useState<string>("");
  const [proofHex, setProofHex] = useState<string>("0x1234");
  const [publicSignalsRaw, setPublicSignalsRaw] = useState<string>("11,22,33,1");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [message, setMessage] = useState<string>("No verification yet.");
  const [verified, setVerified] = useState<boolean>(false);

  const contractAddress = useMemo(() => {
    const candidate = import.meta.env.VITE_CV_VERIFIER_ADDRESS || "";
    return candidate ? getAddress(candidate) : "";
  }, []);

  async function connectWallet(): Promise<void> {
    try {
      setVerifyState("connecting");
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error("No injected wallet found");
      }
      const provider = new BrowserProvider(ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setWallet(accounts[0] ?? "");
      setVerifyState("idle");
      setMessage("Wallet connected.");
    } catch (error) {
      setVerifyState("error");
      setMessage((error as Error).message);
    }
  }

  async function verifyProof(): Promise<void> {
    try {
      if (!contractAddress) {
        throw new Error("Missing VITE_CV_VERIFIER_ADDRESS");
      }

      setVerifyState("verifying");
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error("No injected wallet found");
      }

      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(contractAddress, cvVerifierAbi, signer);

      const publicSignals = parseSignals(publicSignalsRaw);
      const tx = await contract.verifyCVProof(proofHex, publicSignals);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      setVerifyState("success");
      setVerified(true);
      setMessage(`Proof verified on-chain. Tx: ${txHash}`);
    } catch (error) {
      setVerifyState("error");
      setVerified(false);
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>SovereignCV Recruiter Viewer</h1>
        <p>Verify privacy-preserving candidate proofs without viewing wallet or salary data.</p>
        <div className="actions">
          <button onClick={connectWallet} disabled={verifyState === "connecting"}>
            {wallet ? "Wallet Connected" : "Connect Wallet"}
          </button>
          <button onClick={verifyProof} disabled={!wallet || verifyState === "verifying"}>
            Verify CV
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="card">
          <h2>Candidate CV</h2>
          <p className={verified ? "line verified" : "line"}>
            BSc Computer Science - Verified on Flare
          </p>
          <p className={verified ? "line verified" : "line"}>
            Software Engineer (12 months) - Verified on Plasma
          </p>
          <p className="line muted">Private wallet and salary fields remain hidden.</p>
        </section>

        <section className="card">
          <h2>Proof Input</h2>
          <label>
            Proof Hex
            <input value={proofHex} onChange={(e) => setProofHex(e.target.value)} />
          </label>
          <label>
            Public Signals (comma-separated)
            <input value={publicSignalsRaw} onChange={(e) => setPublicSignalsRaw(e.target.value)} />
          </label>
          <p className="status">Status: {verifyState}</p>
          <p className="message">{message}</p>
        </section>
      </main>
    </div>
  );
}

