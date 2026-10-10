import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createConfig,
  http,
  WagmiProvider,
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import { parseAbi, formatEther } from "viem";
import { RULES } from "../../shared/src/rules";
import catLogo from "../../assets/Pixelated Purple Cat Smile.png";
import "./style.css";

const API = import.meta.env.VITE_API_URL ?? "https://lazycat-api.onrender.com";
const explorer = import.meta.env.VITE_EXPLORER_URL ?? "https://testnet.monadvision.com";
const contract = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined;
const abi = parseAbi(["function claim(uint256 amount,uint256 nonce,uint256 day,bytes signature)"]);
const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http(import.meta.env.VITE_RPC_URL ?? "https://testnet-rpc.monad.xyz") },
});
const queryClient = new QueryClient();

type WalletStatus = {
  earnedToday: string;
  pending: string;
  claimed: string;
  views: number;
  cap: string;
  maxAdsPerDay: number;
};

const sponsorCards = [
  { name: "◈ Cursor · The AI Code Editor", line: "Turn ideas into working software faster." },
  { name: "◇ Sentry · Ship with confidence", line: "Catch issues before users do." },
  { name: "✦ Supabase · Your backend", line: "Postgres, auth, storage, ready to build." },
  { name: "◎ Vercel · Ship it", line: "Deploy frontend changes at the speed of git." },
  { name: "▣ Raycast · Command your tools", line: "Shortcuts, workflows, and your dev life in one place." },
];

function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: txHash, error: txError, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const wrongNetwork = isConnected && chainId !== RULES.chainId;

  async function refresh() {
    if (!address) return;
    try {
      const response = await fetch(`${API}/status?wallet=${address}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load wallet status.");
      setStatus(data as WalletStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the LazyCat service.");
    }
  }

  useEffect(() => { void refresh(); }, [address, isSuccess]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function viewAd() {
    if (!address) {
      setError("Connect your wallet to start the demo.");
      return;
    }
    setError("");
    try {
      const response = await fetch(`${API}/view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const data = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          rate_limited: "Cooldown active. Take a breath, then ride again.",
          ad_cap_reached: "That’s your 20-ad daily limit. Nice run.",
          hourly_cap_reached: "You’ve reached the hourly limit. Come back in a bit.",
          cap_reached: "You’ve reached today’s reward cap.",
        };
        throw new Error(messages[data.error] ?? data.error ?? "Could not record this ad view.");
      }
      setCooldown(RULES.cooldownSeconds);
      setAdIndex((value) => (value + 1) % sponsorCards.length);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the LazyCat service.");
    }
  }

  async function claim() {
    if (!address) return setError("Connect wallet first.");
    if (chainId !== RULES.chainId) return setError("Switch to Monad testnet before claiming.");
    if (!contract) return setError("This web build is missing its claim contract address.");
    setClaiming(true);
    setError("");
    try {
      const response = await fetch(`${API}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const voucher = await response.json();
      if (!response.ok) throw new Error(voucher.error === "nothing_to_claim" ? "Nothing to claim yet. Make another pass." : voucher.error);
      writeContract({
        address: contract,
        abi,
        functionName: "claim",
        args: [BigInt(voucher.amount), BigInt(voucher.nonce), BigInt(voucher.day), voucher.signature],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Claim failed.");
    } finally {
      setClaiming(false);
    }
  }

  const currentAd = sponsorCards[adIndex];
  const earned = status ? formatEther(BigInt(status.earnedToday ?? 0)) : "0.00";
  const claimed = status ? formatEther(BigInt(status.claimed ?? 0)) : "0.00";
  const connectWallet = () => connect({ connector: injected() });

  return <div className="site-shell">
    <div className="topline">
      <span><i className="live-dot" /> Monad testnet // live demo</span>
      <span>TESTNET MON HAS NO REAL VALUE <b>·</b> CHAIN 10143</span>
    </div>

    <nav className="nav-wrap" aria-label="Main navigation">
      <a className="brand" href="#top" aria-label="LazyCat home">
        <span className="brand-mark"><img src={catLogo} alt="" /></span>
        <span>LAZYCAT<small>LAZY CRYPTO ATTENTION TOKEN</small></span>
      </a>
      <div className="nav-links"><a href="#install">Install</a><a href="#how-it-works">How it works</a><a href="#pit-stop">Pit stop</a></div>
      <div className="nav-actions">
        <span className="network-chip"><i /> MONAD TESTNET</span>
        {isConnected
          ? <button className="wallet-button connected" onClick={() => disconnect()}><i />{address?.slice(0, 6)}…{address?.slice(-4)} <span>×</span></button>
          : <button className="wallet-button" onClick={connectWallet}>Connect wallet <span>↗</span></button>}
      </div>
    </nav>

    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span> ATTENTION IS THE ENGINE</div>
          <h1>Make your<br />focus <em>pay.</em></h1>
          <p className="hero-lede">Your coding agent is in the zone. LazyCat turns those focused moments into tiny, transparent testnet rewards.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#pit-stop">Take a pit stop <span>↓</span></a>
            <a className="text-link" href="#how-it-works">How the ride works <span>↗</span></a>
          </div>
          <div className="hero-proof"><span className="proof-icon">⌘</span><span>Built for the agentic workflow</span><span className="proof-divider" /><span>No prompts. No private thinking.</span></div>
        </div>

        <div className="hero-art" aria-label="LazyCat pixel art mascot">
          <div className="art-label art-label-top"><span>LAZYCAT // 001</span><span>FLOW STATE</span></div>
          <div className="speed-lines" />
          <div className="road-scene"><div className="road-edge road-edge-left" /><div className="road-edge road-edge-right" /><div className="road-dash" /><div className="road-dash" /><div className="road-dash" /></div>
          <div className="cat-orbit orbit-one" /><div className="cat-orbit orbit-two" />
          <img className="hero-cat" src={catLogo} alt="Smiling pixelated purple cat mascot" />
          <div className="art-tag tag-left"><span className="tag-symbol">✳</span><span>FOCUS<br /><b>DETECTED</b></span></div>
          <div className="art-tag tag-right"><span className="tag-symbol">↗</span><span>UP TO<br /><b>1 MON / DAY</b></span></div>
          <div className="art-label art-label-bottom"><span>STAY IN FLOW</span><span>EST. 2025 <b>✦</b></span></div>
        </div>
        <div className="hero-stamp"><span>FUEL</span><b>YOUR<br />FLOW</b><span>NO PROMPTS READ</span></div>
      </section>

      <div className="ticker" aria-label="LazyCat reward limits">
        <div className="ticker-track"><span>0.05 MON / AD</span><b>✳</b><span>20 ADS / DAY</span><b>✳</b><span>1 MON DAILY CAP</span><b>✳</b><span>MONAD TESTNET</span><b>✳</b><span>0.05 MON / AD</span><b>✳</b><span>20 ADS / DAY</span><b>✳</b><span>1 MON DAILY CAP</span><b>✳</b><span>MONAD TESTNET</span><b>✳</b></div>
      </div>

      <section className="launchpad section-wrap" id="install">
        <div className="launchpad-copy">
          <div className="eyebrow"><span>00</span> ZERO-FRICTION SETUP</div>
          <h2>Install once.<br /><em>Stay in flow.</em></h2>
          <p>One command adds LazyCat around your everyday coding agent. No new editor. No new dashboard to babysit. Your terminal stays yours.</p>
          <div className="launch-badges"><span>NODE 22+</span><span>WINDOWS / MAC / LINUX</span><span>MONAD TESTNET</span></div>
        </div>
        <div className="install-card">
          <div className="install-card-top"><span><i className="live-dot" /> QUICKSTART</span><span>01 — 04</span></div>
          <pre><code>{`npm install -g https://github.com/kohesee/lazycat.git
lazycat setup
lazycat wallet 0xYourWallet
. $PROFILE
codex`}</code></pre>
          <div className="install-card-foot"><span>Works with Codex + Claude Code</span><a href="#pit-stop">Try the demo ↗</a></div>
        </div>
      </section>

      <section className="how section-wrap" id="how-it-works">
        <div className="section-heading"><div><div className="eyebrow"><span>02</span> THE SHORT VERSION</div><h2>Three steps.<br /><em>One smooth ride.</em></h2></div><p>LazyCat keeps rewards small, visible, and verifiable. Your wallet stays yours. Settlement happens on-chain.</p></div>
        <div className="steps-grid">
          <article className="step-card"><div className="step-top"><span>01 / GET IN GEAR</span><b>↗</b></div><div className="step-icon terminal-icon"><span>›_</span></div><h3>Open your agent</h3><p>Work in VS Code with Claude Code, Codex, Gemini CLI, aider, or another terminal agent.</p><div className="step-foot">YOUR WORKFLOW, UNCHANGED</div></article>
          <article className="step-card step-featured"><div className="step-top"><span>02 / STAY IN FLOW</span><b>✳</b></div><div className="step-icon focus-icon"><span className="focus-ring" /><span className="focus-core">✦</span></div><h3>Focus. See a sponsor.</h3><p>The extension uses focus, terminal, and agent-process signals. It never reads prompts or terminal content.</p><div className="step-foot">0.05 MON PER AD · TESTNET</div></article>
          <article className="step-card"><div className="step-top"><span>03 / CLAIM ON-CHAIN</span><b>↗</b></div><div className="step-icon claim-icon"><span>MON</span></div><h3>Claim on-chain</h3><p>Connect your wallet, claim a signed voucher, and settle it through the Monad testnet contract.</p><div className="step-foot">REPLAY-SAFE · CAPPED</div></article>
        </div>
      </section>

      <section className="pit-stop section-wrap" id="pit-stop">
        <div className="pit-heading"><div><div className="eyebrow"><span>03</span> YOUR WALLET // YOUR CALL</div><h2>Make a <em>pit stop.</em></h2><p>Try the sponsor slot and see the demo limits. Rewards here are testnet-only.</p></div><div className="pit-badge"><span>MONAD</span><b>TESTNET</b><small>CHAIN 10143</small></div></div>
        <div className="cockpit">
          <div className="cockpit-main">
            <div className="cockpit-top"><span><i className="live-dot" /> SPONSORED PIT STOP</span><span>DEMO SLOT 0{adIndex + 1} / 0{ sponsorCards.length }</span></div>
            <div className="sponsor-content"><div className="sponsor-mark">LC<span>✳</span></div><div><div className="sponsor-kicker">LAZYCAT TEST SPONSOR <span>·</span> MONAD</div><h3>{currentAd.name}</h3><p>{currentAd.line}</p></div></div>
            <div className="sponsor-bottom"><span>AD VIEW: 0.05 MON <i>·</i> 10 SEC COOLDOWN</span><button className="button button-primary view-button" onClick={viewAd} disabled={!isConnected || cooldown > 0 || wrongNetwork}>{cooldown ? `Cooldown ${cooldown}s` : "View sponsor ad"}<span>↗</span></button></div>
          </div>
          <div className="cockpit-side">
            <div className="wallet-state-head"><span>WALLET DASH</span><span className="dash-dot" /></div>
            {!isConnected ? <div className="connect-state"><div className="empty-wheel">✳</div><h3>Ready when you are.</h3><p>Connect a wallet to see your daily run and try the sponsor slot.</p><button className="button button-outline" onClick={connectWallet}>Connect wallet <span>↗</span></button></div> : <>
              <div className="wallet-address">CONNECTED WALLET <b>{address?.slice(0, 6)}…{address?.slice(-4)}</b></div>
              {wrongNetwork && <div className="network-warning">Wrong network <button onClick={() => switchChain({ chainId: RULES.chainId })}>Switch to Monad ↗</button></div>}
              <div className="wallet-stats"><div><span>EARNED TODAY</span><b>{earned}<small> MON</small></b></div><div><span>CLAIMED TODAY</span><b>{claimed}<small> MON</small></b></div><div><span>AD VIEWS</span><b>{status?.views ?? 0}<small> / {status?.maxAdsPerDay ?? RULES.maxAdsPerDay}</small></b></div></div>
              <div className="daily-meter"><div><span>DAILY REWARD LIMIT</span><b>1.00 MON</b></div><div className="meter-track"><span style={{ width: `${Math.min(100, status ? (Number(status.earnedToday) / Number(status.cap)) * 100 : 0)}%` }} /></div></div>
              <button className="button button-claim" onClick={claim} disabled={claiming || isPending || !status?.earnedToday || BigInt(status?.earnedToday ?? 0) <= BigInt(status?.claimed ?? 0) || wrongNetwork}>{claiming || isPending ? "Preparing claim…" : "Claim testnet MON"}<span>↗</span></button>
            </>}
            {(error || txError || txHash) && <div className={txHash && isSuccess ? "toast success" : "toast"}>{error || txError?.shortMessage || (txHash ? <>{isSuccess ? "Claim confirmed · " : "Claim submitted · "}<a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></> : "")}</div>}
          </div>
        </div>
        <div className="limit-row"><span><b>20</b> ADS PER DAY</span><span><b>6</b> ADS PER HOUR</span><span><b>1</b> MON DAILY CAP</span><span className="limit-note">Transparent caps. Contract-enforced claims.</span></div>
      </section>

      <section className="truth-strip section-wrap"><div className="truth-icon">◎</div><div><span>THE STRAIGHT-UP VERSION</span><p>No model-output injection. No secret prompt reading. LazyCat rewards focused agent time using visible activity signals, with payout rules enforced by a smart contract.</p></div><a href="https://github.com/kohesee/lazycat" target="_blank" rel="noreferrer">Explore the project <span>↗</span></a></section>
    </main>

    <section className="proof section-wrap">
      <div className="proof-heading">
        <div className="eyebrow"><span>04</span> BUILT FOR TRUST</div>
        <h2>Small rules.<br /><em>Clear receipts.</em></h2>
      </div>
      <div className="proof-grid">
        <article><span className="proof-number">01</span><h3>On-chain when it matters</h3><p>Rewards settle through an EIP-712 voucher and a verified Monad testnet escrow contract.</p><a href={`${explorer}/address/0x5eA4fc4c032bC14BaD00a401dF353400A37e881c`} target="_blank" rel="noreferrer">View contract ↗</a></article>
        <article><span className="proof-number">02</span><h3>Limits are the feature</h3><p>10-second cooldown, 6 ads per hour, 20 ads per day, and a 1 MON daily ceiling keep the loop sane.</p><a href="#pit-stop">See your limits ↗</a></article>
        <article><span className="proof-number">03</span><h3>Your work stays private</h3><p>LazyCat does not read prompts, terminal content, model output, or hidden reasoning. Only activity signals.</p><a href="#how-it-works">Read the flow ↗</a></article>
      </div>
    </section>

    <footer className="footer section-wrap"><a className="brand" href="#top"><span className="brand-mark"><img src={catLogo} alt="" /></span><span>LAZYCAT<small>LAZY CRYPTO ATTENTION TOKEN</small></span></a><span>BUILT ON MONAD TESTNET <b>✳</b> MADE FOR FLOW</span><a href="#top">BACK TO TOP ↑</a></footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>,
);
