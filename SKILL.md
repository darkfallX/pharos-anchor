---
name: pharos-anchor
description: The testnet savings account for people and AI agents on Pharos. People talk to it in plain words ("save 20", "how's my money") and it moves faucet aUSD into an on-chain vault that mirrors the Pharos pAlpha RealFi yield mix (about 12.9% net a year). Agents call it to park idle balances between tasks and recall them on demand, with every position tracked on-chain per agent id and publicly verifiable. HTTP API and MCP server included.
version: 1.0.0
license: MIT-0
homepage: https://github.com/darkfallX/pharos-anchor
author: Praise Ezekwe (darkfallX)
metadata:
  category: savings-yield
  network: pharos-atlantic
---

# Anchor

Anchor is a savings agent. A user tells it, in plain words, to put money aside, and Anchor moves faucet test dollars into a Pharos testnet vault that mirrors real-world-asset yield. The user can check on their savings, add more, round up spare change, or take money out, all through ordinary sentences. No forms, no wallet addresses to copy, no DeFi knowledge needed.

The yield model mirrors the Pharos pAlpha RealFi Ecosystem Vault: 70% short-term emerging-market consumer credit and 30% short-duration US Treasuries, blended to about 12.9% net a year. On testnet, the yield is simulated by the demo vault and every movement still produces a public receipt.

## When to use this skill

Use Anchor whenever a user wants to:
- put money into savings and earn yield ("save 20", "put 50 away", "invest 15")
- check how their savings are doing ("how's my money", "what have I earned")
- understand the rate or where the yield comes from ("what's the rate", "how does this earn")
- round up a purchase and save the change ("round up my 4.50 coffee")
- take money out ("withdraw 5", "cash out everything")
- set and track savings goals ("save 500 for a laptop", "how close am I")
- project future savings ("what if I save 50 a month for a year")

## What a user can say

| The user says | Anchor does |
| --- | --- |
| "save 20" | deposits 20 into the RWA yield vault |
| "put away 3 more" | adds 3 to the existing savings |
| "how's my money doing?" | reports balance, what was put in, what has been earned, and the daily rate |
| "what's the rate?" | explains the yield and the real-world assets behind it |
| "round up my 4.50 coffee" | rounds up to the next dollar and saves the 0.50 change |
| "withdraw 5" | sends 5 back to the user |
| "cash out everything" | withdraws all principal plus earned yield |
| "set a goal to save 500 for a laptop" | creates a savings goal and tracks progress |
| "how close am I to my goals?" | shows each goal and how far along the savings are |
| "what if I save 50 a month for a year?" | projects the future value with yield |

## How it works

Anchor runs as a small HTTP service. A hosting runtime or an assistant maps a user's sentence to one call:

- `POST /ask` with `{ "text": "save 20" }` is the main entry point. Anchor reads the intent, does the action on-chain, and returns a plain-English reply plus the data and a receipt link.

It also exposes direct endpoints for a runtime that prefers structured calls:

- `POST /save` with `{ "amount": 20 }`
- `POST /withdraw` with `{ "amount": 5 }` or `{ "amount": "all" }`
- `POST /roundup` with `{ "spend": 4.50 }`
- `GET /position` returns the current savings, principal, and earned yield
- `GET /rate` returns the current APY and the real-world-asset breakdown
- `POST /goal` with `{ "name": "laptop", "target": 500 }` creates a savings goal
- `GET /goals` lists goals with progress toward each
- `POST /project` with `{ "monthly": 50, "months": 12 }` projects future value with yield
- `GET /brief` returns a short daily savings summary
- `GET /health` reports network and deployment status

Every save and withdraw is a real Pharos Atlantic testnet transaction and returns a block-explorer receipt anyone can check.

## The yield, in detail

Anchor's vault mirrors the real Pharos pAlpha RealFi Ecosystem Vault:

- 70% Axil High Yield Consumer Credit, targeting 14% APY, over-collateralized emerging-market consumer credit
- 30% Janus Henderson Anemoy Treasury (JTRSY), 3.65% APY, short-duration US Treasuries with daily liquidity
- blended to roughly 12.9% net a year after fees

## Agent Mode: the savings account for AI agents

Every agent in the Pharos economy can have idle testnet funds between tasks. Anchor gives any agent a treasury: park the idle balance into the RWA-yield mirror with one call, recall it the moment the next task needs funds. Positions live on-chain per agent id in the AnchorAgentVault contract, so anyone can verify what any agent has parked and earned. No account creation, no keys to manage, an agent is just a name.

Integration is three lines:

```
POST /agent/park     { "agent": "scout-1", "amount": 5 }
GET  /agent/position?agent=scout-1
POST /agent/recall   { "agent": "scout-1", "amount": "all" }
```

Every response includes a transaction receipt link. `GET /agent/leaderboard` ranks the top-earning agents and shows vault totals.

MCP-capable agents (Claude Code, OpenClaw, Codex) can skip HTTP entirely: `npm run mcp` starts a stdio server exposing `anchor_park`, `anchor_recall`, and `anchor_position` as native tools.

Run `npm run demo:agents` to watch two simulated agents park, earn, and recall with real on-chain transactions.

## Setup

Anchor runs on the Pharos Atlantic testnet.

1. `npm install`
2. Copy `.env.example` to `.env` and set a testnet `PRIVATE_KEY` (a burner) that has some Atlantic GAS.
3. `npm run deploy` puts the vault and a faucet test-dollar on testnet and writes their addresses into `.env`.
4. `npm run deploy:agents` deploys the AnchorAgentVault for Agent Mode.
5. `npm start` runs the agent. Open `/app` for the chat, or call `POST /ask`.

Config lives in `.env`:

- `PHAROS_NETWORK=pharos-atlantic`
- `ANCHOR_VAULT_ADDRESS`, `ANCHOR_USD_ADDRESS` (filled in by deploy)
- `ANCHOR_APY_BPS=1290` (12.9%)
- `ANCHOR_MAX_AMOUNT=10000` caps single testnet write amounts
- `ANCHOR_ACTION_SECRET` protects user write actions when set
- `ANCHOR_AGENT_SECRET` protects Agent Mode park/recall calls when set

## Notes and limits

- This runs on testnet with a demo yield vault and an open faucet dollar, so anyone can try it without sourcing USDC. It is a stand-in for real mainnet vault integrations.
- A production version should connect to live, audited RWA venues before making mainnet yield claims.
- Deposits and withdrawals move testnet value and produce verifiable on-chain receipts.
