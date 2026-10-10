# LazyCat: Attention Rewards for Monad

Testnet-only hackathon demo. VS Code extension displays sponsor-style devtool placements beside Claude Code, Codex, Gemini CLI, aider, and other terminal agents. Focused agent time earns capped testnet MON. User claims through an EIP-712 voucher and `EarnEscrow`; contract is payout authority.

Included Cursor, Sentry, Supabase, Vercel, and Raycast creatives are original demo placements, not paid endorsements or partnership claims.

## Honest product boundary

Ads do **not** appear inside model output or hidden "thinking". VS Code APIs cannot read LLM tokens or private reasoning. Extension shows ads in VS Code status bar and sidebar. Earning signal uses window focus, active terminal, agent process tree, and optional CPU activity. Extension never reads prompts or terminal content. A determined client can fake signals; on-chain replay, amount, daily-value, and daily-ad caps remain enforced.

## Rules

- Monad testnet only, chain ID `10143`
- 20 ads/day, 6 ads/hour, 10-second cooldown
- 0.05 MON/ad, 1 MON/day
- Contract accepts one claim per signed nonce and max 20 claims/day
- Static demo sponsor; no mainnet, custodial balances, token economics, or real ad marketplace

## Requirements

Bun 1.3+, Foundry, MetaMask, testnet MON. Windows extension debugging needs VS Code. Monad testnet RPC currently responds at `https://testnet-rpc.monad.xyz` with chain ID `10143`; confirm current faucet and explorer details from official Monad docs before deployment.

## Install

```powershell
bun install
Copy-Item backend\.env.example backend\.env
Copy-Item web\.env.example web\.env
```

Edit env files. Never put private keys in web or extension env. `VOUCHER_SIGNER_KEY` must match deployed contract signer. `CONTRACT_ADDRESS` must be deployed address.

## Contract

Install OpenZeppelin and forge standard library:

```powershell
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
forge test
```

Deploy:

```powershell
$env:PRIVATE_KEY="0x..."
$env:VOUCHER_SIGNER="0x..."
$env:DAILY_CAP="1000000000000000000"
$env:MAX_ADS_PER_DAY="20"
$env:MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
forge script script/Deploy.s.sol:Deploy --rpc-url $env:MONAD_RPC_URL --broadcast --legacy
```

Fund deployed escrow with testnet MON. Copy address into backend `.env` and web `.env`.

Deployment secrets stay local. Never paste private keys into chat, source code, frontend env, or Git:

```powershell
$env:PRIVATE_KEY="0x<deployer-key>"
$env:VOUCHER_SIGNER="0x<signer-address>"
$env:DAILY_CAP="1000000000000000000"
$env:MAX_ADS_PER_DAY="20"
$env:MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
forge script script/Deploy.s.sol:Deploy --rpc-url $env:MONAD_RPC_URL --broadcast --legacy
```

## Run

Terminal 1:

```powershell
bun run dev:backend
```

Terminal 2:

```powershell
bun run dev:web
```

Extension:

```powershell
cd extension
bun install
bun run typecheck
bun run build
```

Open `extension` in VS Code, press F5, start `claude` or `codex` in integrated terminal, open LazyCat sidebar. Status bar displays detection. Keep panel visible for earning. Web app connects wallet and handles claim.

## CLI TUI prototype

For Claude Code, Codex CLI, and similar terminal agents, use the PTY wrapper. It launches the real agent, forwards keyboard input, preserves its TUI, and paints a rotating sponsored line on the terminal's bottom row:

```powershell
cd cli
bun install
bun run build
node dist/cli.js codex
```

Examples:

```powershell
node dist/cli.js claude
node dist/cli.js codex --help
```

Optional wallet heartbeat:

```powershell
$env:LAZY_CAT_WALLET="0xYourWallet"
node dist/cli.js codex
```

### One-time CLI setup

The CLI can permanently wrap normal `codex` and `claude` commands in PowerShell. It adds a marked block to the PowerShell profile; it does not replace binaries or read prompts.

From this repository:

```powershell
cd D:\Study\hackathons\monadBlitz2\lazycat
bun run --cwd cli build
node cli\dist\cli.js setup
node cli\dist\cli.js wallet 0xYourWallet
node cli\dist\cli.js doctor
. $PROFILE
```

After setup, normal commands automatically show LazyCat:

```powershell
codex
claude
```

Run the original CLI without the ad wrapper:

```powershell
lazycat passthrough codex
lazycat passthrough claude
```

Disable or re-enable automatic wrapping:

```powershell
lazycat disable
lazycat enable
```

For the published package, the same flow starts with:

```powershell
npm install -g lazycat-cli
lazycat setup
lazycat wallet 0xYourWallet
```

`lazycat setup` asks for consent before changing the profile. `lazycat doctor` checks installed agents, wallet configuration, backend URL, and profile state.

GitHub source install now uses the deployed demo API by default:

```powershell
npm install -g https://github.com/kohesee/lazycat.git
lazycat setup
lazycat wallet 0xYourWallet
. $PROFILE
codex
```

No backend command is needed. The CLI sends heartbeats to `https://lazycat-api.onrender.com`, already deployed on Monad testnet. Override API only when using your own deployment:

```powershell
lazycat api https://your-lazycat-api.example.com
```

The npm/GitHub package never contains the voucher signer private key. It stores only wallet address and public API URL.

### GitHub one-stop install

GitHub source install uses the same package entry point and TUI as the npm package. It builds the CLI during install; no Bun, backend checkout, or separate web server is needed for the wrapper itself:

```powershell
npm install -g https://github.com/kohesee/lazycat.git
lazycat setup
lazycat wallet 0xYourWallet
lazycat api https://your-hosted-lazycat-api.example.com
lazycat web https://your-hosted-lazycat-web.example.com
lazycat doctor
. $PROFILE
```

Then ordinary commands launch through LazyCat:

```powershell
codex
claude
```

The TUI reserves two bottom rows: one for the sponsor creative and one for live state:

```text
LAZYCAT · earning API online · 0.05 MON earned · 1 ads · claim: https://...
◇ SENTRY / SHIP WITH CONFIDENCE ...
```

`lazycat claim` opens the configured web claim page. The TUI never stores a private key and cannot sign a wallet claim by itself.

The repository package defaults to `http://localhost:8787` because no public API is bundled. To meet the true “install once, no backend” demo promise, deploy the backend and web app and pass those public URLs during setup. Never expose `VOUCHER_SIGNER_KEY` in this package.

### Fast API hosting on Render

This repository includes [`render.yaml`](./render.yaml) and [`Dockerfile`](./Dockerfile). Render must use Docker because backend uses `bun:sqlite`; do not select a native Node runtime.

1. Push repository to GitHub.
2. Open Render, choose **New + > Blueprint**, select `kohesee/lazycat`, and apply `render.yaml`.
3. Set `ALLOWED_ORIGIN` to your deployed web URL, for example `https://lazycat-web.onrender.com`.
4. Set `VOUCHER_SIGNER_KEY` to the private key whose address is the deployed contract signer. Paste it only in Render's secret environment variable field.
5. Deploy. Test:

```powershell
curl https://YOUR-API.onrender.com/health
```

Expected response:

```json
{"ok":true,"chainId":10143}
```

Then configure clients:

```powershell
lazycat api https://YOUR-API.onrender.com
lazycat web https://YOUR-WEB.onrender.com/#pit-stop
```

Render's free service can sleep and has ephemeral storage, so SQLite counters can reset after restart. This is acceptable for a short hackathon demo, not production. Never put `VOUCHER_SIGNER_KEY` in GitHub, web env, CLI config, or browser code.

### Judging evidence

- **Monad usage:** deployed `EarnEscrow` contract on Monad testnet, chain ID `10143`; voucher claims emit on-chain `Claimed` events.
- **Working product:** web claim dashboard, VS Code companion panel, and terminal PTY wrapper share the same capped reward API.
- **User experience:** one-time `lazycat setup` wraps normal `codex` and `claude` commands; TUI shows sponsor creative, ad count, earned MON, claimable MON, wallet, API state, and claim URL.
- **Security:** EIP-712 signer recovery, nonce replay protection, wallet validation, cooldown, hourly/day ad caps, daily MON cap, pause, reentrancy guard, fraud log, and no client private keys.
- **Transparency:** sponsor creatives are demo placements, not paid partnerships; ads never read prompts, model output, or private reasoning.
- **Reproducibility:** GitHub install builds the CLI from source and packages the same launcher path used by npm.

The linked Notion rubric was not machine-readable during preparation. Criteria above are verifiable project evidence, not invented claims about unavailable rubric text.

This is terminal rendering, not model-output injection. ANSI/TUI redraw behavior varies by agent and terminal. If banner flickers, use the VS Code `Agent Rewards` editor-side companion view instead:

```text
Ctrl+Shift+P
LazyCat: Open Ad Beside Agent
```

For Copilot/Codex VS Code webviews, editor-side companion is closest supported integration; external extensions cannot write inside another extension's private webview.

## Security notes

Contract uses EIP-712 domain separation, signer recovery, per-wallet nonce replay protection, immutable daily value/ad caps, pause, reentrancy guard, and pull payout. Backend uses prepared SQLite statements, wallet validation, rate limits, fraud log, CORS allowlist, and timing-safe admin token comparison. Backend pending balances need reconciliation if a user rejects a transaction; for hackathon demo, restart with a new day or manually reconcile DB before reuse.

## Demo

1. Connect MetaMask to Monad testnet.
2. View sponsored slot until status rises.
3. Click Claim and approve transaction.
4. Open explorer link and show `Claimed`.
5. Submit same voucher twice with `scripts/replay-attack.ts`; second attempt reverts `nonce used`.
6. Query `GET /admin/fraud-log` with `x-admin-token`.
