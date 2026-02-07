import { Suspense, lazy, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain } from "wagmi";
import { useWalletClient } from "wagmi";
import { getAddress, isAddress } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { cvVerifierAbi } from "./abis/cvVerifier";

const ClaimGraph3D = lazy(() =>
  import("./components/ClaimGraph3D").then((module) => ({ default: module.ClaimGraph3D }))
);

export default function App() {
  const [activeNodeId, setActiveNodeId] = useState<string>("root");
  const [showCv, setShowCv] = useState<boolean>(false);
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [proofHex, setProofHex] = useState<string>("0x");
  const [publicSignalsRaw, setPublicSignalsRaw] = useState<string>("0");
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState<string>("No verification yet.");
  const [txHash, setTxHash] = useState<string>("");
  const [proofHash, setProofHash] = useState<string>("");

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || 114);
  const contractAddress = useMemo(() => {
    const raw = import.meta.env.VITE_CV_VERIFIER_ADDRESS;
    if (!raw || !isAddress(raw)) {
      return "";
    }
    return getAddress(raw);
  }, []);
  const chainMismatch =
    typeof expectedChainId === "number" && publicClient?.chain?.id !== expectedChainId;

  const highlights = useMemo(
    () => [
      { id: "education", label: "Education verified" },
      { id: "employment", label: "Employment verified" },
      { id: "proof", label: "Proof hash recorded on-chain" },
    ],
    []
  );

  function parseSignals(raw: string): bigint[] {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => BigInt(value));
  }

  async function handleVerify(): Promise<void> {
    try {
      if (!walletClient || !publicClient) {
        throw new Error("Wallet not connected.");
      }
      if (!contractAddress) {
        throw new Error("Missing VITE_CV_VERIFIER_ADDRESS.");
      }
      if (chainMismatch) {
        throw new Error("Wrong network. Switch to the configured chain.");
      }

      setVerifyState("verifying");
      setVerifyMessage("Submitting proof...");

      const publicSignals = parseSignals(publicSignalsRaw);
      const normalizedProof = proofHex.startsWith("0x") ? proofHex : `0x${proofHex}`;

      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: cvVerifierAbi,
        functionName: "verifyCVProof",
        args: [normalizedProof, publicSignals],
      });

      setTxHash(hash);

      const computedProofHash = keccak256(
        encodeAbiParameters(
          [{ type: "bytes" }, { type: "uint256[]" }],
          [normalizedProof, publicSignals]
        )
      );
      setProofHash(computedProofHash);

      await publicClient.waitForTransactionReceipt({ hash });

      setVerifyState("success");
      setVerifyMessage("Proof verified on-chain.");
    } catch (error) {
      setVerifyState("error");
      setVerifyMessage((error as Error).message || "Verification failed.");
    }
  }

  return (
    <main className={showCv ? "app-shell cv-open" : "app-shell"}>
      <section className="graph-stage">
        <ErrorBoundary
          fallback={
            <div className="graph-fallback">
              Graph failed to load. Check the console for details.
            </div>
          }
        >
          <Suspense fallback={<div className="graph-fallback">Loading graph...</div>}>
            <ClaimGraph3D activeNodeId={activeNodeId} onSelectNode={setActiveNodeId} />
          </Suspense>
        </ErrorBoundary>
      </section>
      <section className={hudCollapsed ? "hud-shell collapsed" : "hud-shell"}>
        <div className="hud">
          <div className="hud-card">
            <div className="hud-title">Wallet</div>
            {isConnected ? (
              <div className="wallet-row">
                <span className="wallet-address">{address}</span>
                <button className="hud-btn ghost" onClick={() => disconnect()}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                className="hud-btn"
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isPending}
              >
                {isPending ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
            {connectError && <p className="hud-error">{connectError.message}</p>}
            {chainMismatch && (
              <div className="chain-warning">
                <span>Wrong network.</span>
                <button
                  className="hud-btn ghost"
                  onClick={() => switchChain({ chainId: expectedChainId })}
                >
                  Switch
                </button>
              </div>
            )}
          </div>
          <div className="hud-card">
            <div className="hud-title">Proof</div>
            <label className="hud-label">
              Proof Hex
              <input
                className="hud-input"
                value={proofHex}
                onChange={(event) => setProofHex(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="hud-label">
              Public Signals
              <input
                className="hud-input"
                value={publicSignalsRaw}
                onChange={(event) => setPublicSignalsRaw(event.target.value)}
                placeholder="1,2,3"
              />
            </label>
            <button
              className="hud-btn"
              onClick={handleVerify}
              disabled={!isConnected || verifyState === "verifying" || chainMismatch}
            >
              {verifyState === "verifying" ? "Verifying..." : "Verify CV"}
            </button>
            <p className={verifyState === "error" ? "hud-error" : "hud-message"}>{verifyMessage}</p>
            {txHash && <p className="hud-meta">Tx: {txHash}</p>}
            {proofHash && <p className="hud-meta">Proof hash: {proofHash}</p>}
          </div>
          <div className="hud-card">
            <div className="hud-title">Highlights</div>
            <ul className="hud-list">
              {highlights.map((item) => (
                <li key={item.id} className={verifyState === "success" ? "hud-pill active" : "hud-pill"}>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <button
        className={hudCollapsed ? "hud-toggle collapsed" : "hud-toggle"}
        onClick={() => setHudCollapsed((prev) => !prev)}
        aria-label={hudCollapsed ? "Expand controls" : "Collapse controls"}
      >
        {hudCollapsed ? ">" : "<"}
      </button>
      <button
        className={showCv ? "cv-toggle open" : "cv-toggle"}
        onClick={() => setShowCv((prev) => !prev)}
        aria-label={showCv ? "Hide CV" : "Show CV"}
      >
        {showCv ? ">" : "<"}
      </button>
      <aside className={showCv ? "cv-drawer open" : "cv-drawer"} aria-hidden={!showCv}>
        <div className="cv-header">
          <span>Candidate CV</span>
        </div>
        <iframe
          className="cv-frame"
          src="/resume_daad.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH"
          title="Candidate CV"
        />
      </aside>
    </main>
  );
}
