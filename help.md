
---

# Build Brief: LazyCat Testnet Earn Loop (Monad Hackathon)

## Goal
Build a testnet-only demo where a user views a static sponsored banner, earns capped testnet MON credits per day, and claims them on Monad testnet through a signed voucher. This is a hackathon prototype. Do not build live ad serving, LLM exchange, GPU provider network, mainnet logic, or token economics.

## Hard constraints
- Testnet only. All MON is test MON. 
- Ads are static content.
- The contract is the final authority on daily caps and payouts. Never trust the client for caps.
- Never hardcode private keys. Read from environment variables. Add `.env.example` and `.gitignore` for `.env`.
- Keep dependencies minimal.

## Deliverables (in build order)

### 1. Repo structure
```
lazycat/
  contracts/      Foundry project
  backend/        TypeScript, Hono, SQLite
  web/            Vite + React, wagmi + viem
  README.md
```

### 2. Contract: `contracts/src/EarnEscrow.sol`
Solidity, OpenZeppelin (ECDSA, Ownable, Pausable, ReentrancyGuard).

Behavior:
- `receive()` accepts MON funding for the escrow.
- `claim(uint256 amount, uint256 nonce, uint256 day, bytes signature)`:
  - Recovers signer from an EIP-712 typed-data hash over `(address wallet, uint256 amount, uint256 nonce, uint256 day)`.
  - Requires the signer equals `voucherSigner` (set in constructor, updatable by owner).
  - Requires `day == block.timestamp / 1 days` or within the current day window. Reject past or future days.
  - Requires the nonce is unused for that wallet. Mark it used.
  - Enforces `claimedToday[wallet][day] + amount <= dailyCap`.
  - Transfers MON via `call`, with ReentrancyGuard.
- `dailyCap` and `voucherSigner` are settable by owner, emit events on change.
- `pause()` and `unpause()` for owner.
- Emit `Claimed(wallet, amount, nonce, day)`.

Foundry tests in `contracts/test/EarnEscrow.t.sol` must cover:
- Valid claim succeeds and pays out.
- Replayed nonce is rejected.
- Signature from a non-signer is rejected.
- Claim above daily cap is rejected.
- Claim for wrong day is rejected.
- Paused contract rejects claims.

### 3. Deploy script: `contracts/script/Deploy.s.sol`
Reads `PRIVATE_KEY`, `VOUCHER_SIGNER`, `DAILY_CAP` from env. Deploys `EarnEscrow`. Logs the address.

Use placeholders for RPC URL and chain ID in `README.md`. Tell the user to confirm both in Monad's official docs before running.

### 4. Backend: `backend/src`
Hono server with SQLite (via `better-sqlite3`).

Endpoints:
- `POST /view` body `{ wallet: string }`
  - Rate limit: max 1 view per wallet per 10 seconds.
  - Increments `views` for `(wallet, today)`.
  - Credits a fixed `VIEW_REWARD` (env var) up to a server-side `DAILY_CAP` (must match contract).
  - Returns `{ earnedToday, cap }`.
- `POST /claim` body `{ wallet: string }`
  - Computes unclaimed balance for today.
  - Generates a random unique nonce, signs the EIP-712 voucher with `VOUCHER_SIGNER_KEY` (env).
  - Marks the balance as pending in the DB so it can't be double-issued.
  - Returns `{ amount, nonce, day, signature }`.
- `GET /status?wallet=` returns today's earned, claimed, and cap.

Each rejected request (rate limit, over cap, duplicate claim) must be logged to a `fraud_log` table with reason and timestamp. Expose `GET /admin/fraud-log` protected by an `ADMIN_TOKEN` header.

Put the EIP-712 domain (name, version, chainId, verifyingContract) in a shared constants file. It must match the contract exactly.

### 5. Web app: `web/src`
Vite + React, wagmi + viem, MetaMask connector.

Single page with:
- Connect wallet button. Show the connected address.
- Static sponsored banner labeled "Sponsored (demo)" with placeholder copy.
- "View ad" button calls `POST /view`. Disable it for 10 seconds after each click (matches the backend rate limit).
- Earned today, cap, and claimed amounts from `GET /status`.
- "Claim" button calls `POST /claim`, then calls `claim()` on the contract with the voucher. Show the transaction hash and an explorer link.
- Persistent banner at the top: "Testnet — no real value."
- Clear error messages for: rate limited, cap reached, wallet not connected, wrong network, transaction rejected.

Read the contract address, chain ID, and RPC URL from `VITE_` env vars.

### 6. Demo support
- `scripts/replay-attack.ts`: takes a valid voucher and submits it twice. The second call must fail. Print the revert reason.
- `README.md` with: setup steps, env var list, deploy steps, how to run the demo, and the demo script below.

## Demo script the app must support
1. Connect wallet on Monad testnet.
2. Click "View ad" several times, watch earned today rise until the cap.
3. Click "Claim", approve the transaction, show the tx hash on the explorer.
4. Run `replay-attack.ts` and show the rejection.
5. Show the `fraud_log` entries from the admin endpoint.

## Definition of done
- `forge test` passes all contract tests.
- Contract deployed to Monad testnet and verified (or the verification step is documented).
- Backend runs locally with `npm run dev`.
- Web app runs locally and completes the full demo script against the deployed contract.
- `README.md` lets someone else reproduce the setup in under 30 minutes.

## Working instructions for you (the LLM)
- Build in the deliverable order above. Finish and test each piece before starting the next.
- Ask before adding any dependency not listed here.
- If Monad testnet RPC, chain ID, or faucet details are needed, leave clearly marked placeholders and do not guess values.
- Keep code simple and commented where the EIP-712 hashing and signature checks happen.
- After each step, summarize what was built and what's left.

---

Before you paste it, fill in the real Monad testnet RPC URL, chain ID, and faucet from the official docs, since I can't verify current values. Once the contract is written, bring the test output back here and we can debug the signature and domain matching, which is where these builds usually break.