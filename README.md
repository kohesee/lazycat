# LazyCat

## Project goals

- Create a developer-focused rewards loop that converts active AI-agent work into capped Monad testnet rewards.
- Keep the product transparent: the system measures visible workspace and terminal signals, not hidden model reasoning.
- Build a working demo across extension, backend, web app, and smart contract with a realistic end-to-end flow.
- Demonstrate how attention, focus, and time spent with terminal agents can be represented as a verifiable on-chain claim.

## Product overview

LazyCat is a testnet-only hackathon project for rewarding focused developer time spent using AI coding agents such as Codex, Claude, Gemini CLI, aider, and similar terminal-based tools.

The system is designed around a simple principle:

- the VS Code extension detects active agent usage and focus state,
- the backend records capped earnings per wallet and day,
- the web app lets the user connect a wallet and claim,
- the smart contract verifies the signed voucher and pays out testnet MON.

The project intentionally avoids any hidden prompt extraction or private reasoning access. It uses visible signals only and relies on on-chain enforcement for replay protection and spend limits.

## Architecture

### Components

- Extension layer
  - Watches VS Code window focus, active terminal, agent process tree, and optional CPU activity.
  - Displays the ad panel and status bar for the user experience.
  - Emits the earning signal used by the backend.

- Backend layer
  - Runs a Bun + Hono API.
  - Stores daily wallet metrics in SQLite.
  - Validates wallet, caps, limits, and cooldowns.
  - Creates signed EIP-712 voucher claims.
  - Logs suspicious or abusive attempts.

- Shared rules layer
  - Centralizes chain settings, reward values, and caps.
  - Ensures consistent configuration across backend, frontend, and contracts.

- Web app layer
  - Connects the wallet.
  - Displays claim and status information.
  - Triggers the claim flow against the deployed contract.

- Smart contract layer
  - Enforces claim validity, nonce replay protection, cap checks, and payout execution.
  - Acts as the final source of truth for payout authorization.

- CLI layer
  - Wraps terminal agents with a lightweight sponsor-style interface.
  - Keeps the development workflow familiar while exposing the reward loop.

## Runtime flow

- The user opens VS Code and starts a supported terminal agent.
- The extension polls the active terminal and process tree.
- If the environment meets the focus and activity conditions, the system marks the session as earning.
- The CLI or extension sends a heartbeat to the backend using the wallet address.
- The backend validates rate limits, per-hour caps, and daily caps.
- The backend increments the wallet’s earned balance for the current day.
- When the user clicks claim, the backend creates an EIP-712 voucher using a signer key.
- The frontend submits the claim to the deployed contract with amount, nonce, day, and signature.
- The contract verifies the signer and the payload, then sends testnet MON to the wallet.

## Contract roles

### EarnEscrow

- Owns the payout logic and final verification for claims.
- Stores immutable daily cap and max ads-per-day values.
- Tracks claimed amounts by wallet and day.
- Tracks used nonces to prevent replay attacks.
- Verifies the signer address recovered from the EIP-712 signature.
- Transfers the payout to the caller only after all checks pass.

### Voucher signer

- A dedicated private key controlled by the backend operator.
- Signs claim vouchers to authorize payout requests.
- Must match the signer address configured in the contract.
- Must never be exposed in the browser, client app, or public repository.

### Wallet owner

- Connects MetaMask or a supported wallet.
- Sends claim requests against the contract.
- Receives the payout if the claim is valid and within system caps.

## Repo structure

- backend/
  - Hono-based API server
  - SQLite persistence
  - reward accounting and claim generation

- web/
  - React + Vite frontend
  - wallet connection and claim dashboard

- extension/
  - VS Code extension
  - focus tracking and ad panel integration

- cli/
  - terminal wrapper for coding agents
  - sponsor-style TUI experience

- shared/
  - shared configuration and EIP-712 typing code

- contracts/
  - Foundry smart contract project
  - payout logic and test suite

- scripts/
  - helper scripts for validation and replay tests

## Core features

- Focus-based earning logic for terminal agent work
- Per-wallet daily reward accounting in SQLite
- Hard caps for count and value exposure
- EIP-712 claim signatures for verifiable authorization
- On-chain claim enforcement through EarnEscrow
- VS Code status bar and sidebar experience
- Terminal wrapper for AI coding workflows
- Anti-abuse logging for fraud and replay attempts
- Monad testnet compatibility with developer-friendly deployment flow

## Tech stack

- Frontend: React, Vite, TypeScript
- Backend: Bun, Hono, SQLite
- Smart contract: Solidity, Foundry, OpenZeppelin
- Wallet and chain integration: viem, wagmi
- Extension: VS Code API
- TUI tooling: Node PTY
- Security model: EIP-712, nonce replay protection, signer validation

## Quick start

### Install dependencies

```bash
bun install
```

### Create environment files

```bash
Copy-Item backend/.env.example backend/.env
Copy-Item web/.env.example web/.env
```

### Start local services

```bash
bun run dev:backend
bun run dev:web
```

### Run the extension

- Open the extension folder in VS Code
- Press F5 to launch the Extension Development Host
- Start a supported agent in the integrated terminal
- Keep the LazyCat panel visible to enable the earning flow

## Environment setup

### Backend environment

Required variables in backend/.env:

- PORT=8787
- DB_PATH=./data/lazycat.db
- ALLOWED_ORIGIN=http://localhost:5173
- VOUCHER_SIGNER_KEY=0x...
- CONTRACT_ADDRESS=0x...
- CHAIN_ID=10143
- DAILY_CAP_WEI=1000000000000000000
- REWARD_PER_AD_WEI=50000000000000000
- MAX_ADS_PER_DAY=20
- MAX_ADS_PER_HOUR=6
- ADMIN_TOKEN=replace-with-long-random-token

### Web environment

Required variables in web/.env:

- VITE_API_URL=http://localhost:8787
- VITE_CONTRACT_ADDRESS=0x...
- VITE_CHAIN_ID=10143
- VITE_RPC_URL=https://testnet-rpc.monad.xyz
- VITE_EXPLORER_URL=https://testnet.monadvision.com

### Contract environment

Required values for contracts deployment:

- PRIVATE_KEY=0x...
- VOUCHER_SIGNER=0x...
- DAILY_CAP=1000000000000000000
- MAX_ADS_PER_DAY=20
- MONAD_RPC_URL=https://testnet-rpc.monad.xyz

Important:

- Never store private keys in frontend or browser code.
- Never commit secrets to Git.
- The contract signer key must match the backend signer key exactly.

## Documentation

- README.md
  - project overview and operational guide
- backend/src/index.ts
  - server orchestration and reward rules
- shared/src/rules.ts
  - chain ID, caps, and reward constants
- shared/src/eip712.ts
  - typed claim message definition
- contracts/src/EarnEscrow.sol
  - on-chain payout and verification logic
- extension/src/focus.ts
  - focus detection and earning state evaluation
- cli/src/cli.ts
  - agent wrapper and sponsor-style UI

## Current scope

This project is currently scoped as a Monad testnet-only hackathon demo.

- Testnet only
- Static sponsor-style UX
- Local or hosted backend deployment
- Wallet-based claiming flow
- No custodial balance management
- No real mainnet token economics
- No claim without deployed contract and valid signer setup

## Security boundaries

- The extension does not read prompts or hidden model output.
- Earning checks rely on visible app state and terminal activity.
- Ongoing abuse protection comes from backend validation and contract-level replay protection.
- The wallet signature and signer key are never exposed to the browser app.

## Summary

LazyCat is a proof-of-concept system that links developer attention, AI-agent activity, and on-chain reward claims. It is intentionally built as a testnet demo with transparent boundaries, explicit caps, and enforceable payout rules on Monad.

It is organized as a multi-layer product: extension for signal capture, backend for accounting, frontend for claims, and contract for secure payout execution.
