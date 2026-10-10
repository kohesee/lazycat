# LazyCat: Lazy Crypto Attention Token

Testnet-only hackathon demo. VS Code extension displays sponsored slots beside Claude Code, Codex, Gemini CLI, aider, and other terminal agents. Focused agent time earns capped testnet MON. User claims through an EIP-712 voucher and `EarnEscrow`; contract is payout authority.

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

Open `extension` in VS Code, press F5, start `claude` or `codex` in integrated terminal, open Kickbacks sidebar. Status bar displays detection. Keep panel visible for earning. Web app connects wallet and handles claim.

## Security notes

Contract uses EIP-712 domain separation, signer recovery, per-wallet nonce replay protection, immutable daily value/ad caps, pause, reentrancy guard, and pull payout. Backend uses prepared SQLite statements, wallet validation, rate limits, fraud log, CORS allowlist, and timing-safe admin token comparison. Backend pending balances need reconciliation if a user rejects a transaction; for hackathon demo, restart with a new day or manually reconcile DB before reuse.

## Demo

1. Connect MetaMask to Monad testnet.
2. View sponsored slot until status rises.
3. Click Claim and approve transaction.
4. Open explorer link and show `Claimed`.
5. Submit same voucher twice with `scripts/replay-attack.ts`; second attempt reverts `nonce used`.
6. Query `GET /admin/fraud-log` with `x-admin-token`.
