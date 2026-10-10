import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createConfig, http, WagmiProvider, useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import { parseAbi, parseEther, formatEther } from "viem";
import { RULES } from "../../shared/src/rules";
import "./style.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const explorer = import.meta.env.VITE_EXPLORER_URL ?? "https://testnet.monadvision.com";
const contract = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`;
const abi = parseAbi(["function claim(uint256 amount,uint256 nonce,uint256 day,bytes signature)"]);
const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http(import.meta.env.VITE_RPC_URL ?? "https://testnet-rpc.monad.xyz") },
});

function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: txHash, error: txError, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [status, setStatus] = useState<any>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function refresh() {
    if (!address) return;
    const response = await fetch(`${API}/status?wallet=${address}`);
    setStatus(await response.json());
  }
  useEffect(() => { void refresh(); }, [address, isSuccess]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function viewAd() {
    if (!address) return setError("Connect wallet first.");
    setError("");
    const response = await fetch(`${API}/view`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error === "rate_limited" ? "Ad cooldown active." : data.error);
    setCooldown(RULES.cooldownSeconds);
    await refresh();
  }
  async function claim() {
    if (!address) return setError("Connect wallet first.");
    if (chainId !== RULES.chainId) return setError("Wrong network. Switch to Monad testnet.");
    setClaiming(true); setError("");
    try {
      const response = await fetch(`${API}/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) });
      const voucher = await response.json();
      if (!response.ok) throw new Error(voucher.error);
      writeContract({ address: contract, abi, functionName: "claim", args: [BigInt(voucher.amount), BigInt(voucher.nonce), BigInt(voucher.day), voucher.signature] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Claim failed."); }
    finally { setClaiming(false); }
  }
  return <main>
    <div className="notice">TESTNET ONLY — MON has no real value.</div>
    <header><div><span className="eyebrow">KICKBACKS / MONAD</span><h1>Thinking time pays.</h1><p>Watch sponsored slots beside your coding agent. Claim testnet MON on-chain.</p></div>
      {isConnected ? <button onClick={() => disconnect()}>Disconnect {address?.slice(0, 6)}…</button> : <button onClick={() => connect({ connector: injected() })}>Connect wallet</button>}</header>
    <section className="ad"><span className="sponsored">SPONSORED · DEMO</span><h2>Ship your first Monad contract.</h2><p>Your agent thinks. Sponsor pays. Contract settles.</p><button onClick={viewAd} disabled={!isConnected || cooldown > 0}>{cooldown ? `Wait ${cooldown}s` : "View ad"}</button></section>
    {!isConnected ? <div className="card">Connect wallet to start earning.</div> : <>
      {chainId !== RULES.chainId && <div className="warning">Wrong network. <button onClick={() => switchChain({ chainId: RULES.chainId })}>Switch to Monad testnet</button></div>}
      <section className="stats"><div><small>EARNED TODAY</small><strong>{status ? formatEther(BigInt(status.earnedToday ?? 0)) : "0"} MON</strong></div><div><small>CLAIMED</small><strong>{status ? formatEther(BigInt(status.claimed ?? 0)) : "0"} MON</strong></div><div><small>AD VIEWS</small><strong>{status?.views ?? 0} / {status?.maxAdsPerDay ?? RULES.maxAdsPerDay}</strong></div></section>
      <button className="claim" onClick={claim} disabled={claiming || isPending || !status?.earnedToday || chainId !== RULES.chainId}>{claiming || isPending ? "Waiting..." : "Claim MON"}</button>
    </>}
    {(txHash || txError || error) && <div className="result">{error || txError?.message || (txHash && <>Transaction submitted: <a href={`${explorer}/tx/${txHash}`} target="_blank">{txHash.slice(0, 12)}…</a></>)}</div>}
    <footer>No prompts read. Signals come from VS Code focus, active terminal, and agent process. Contract caps payouts.</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<WagmiProvider config={config}><App /></WagmiProvider>);
