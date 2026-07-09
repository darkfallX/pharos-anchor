# Anchor

The savings account for people and AI agents on Pharos testnet.

Live demo: https://pharos-anchor.onrender.com/app

You talk to Anchor in plain words. You say "save 20" and it puts faucet test dollars into a Pharos vault that mirrors a real-world-asset yield strategy. You can check your savings, add more, round up spare change, or take money out, all through ordinary sentences. No forms, no wallet addresses to copy, no DeFi knowledge needed.

And it is not just for people. Any AI agent can use Anchor as its treasury: park idle testnet funds into the RWA-yield mirror between tasks, recall them the moment the next task needs funds. One POST to park, one to recall, every position onchain and publicly verifiable per agent id.

Anchor's yield model mirrors the Pharos pAlpha RealFi Ecosystem Vault: 70% short-term emerging-market consumer credit and 30% short-duration US Treasuries, blended to about 12.9% net a year. On Atlantic testnet this is a demo vault with faucet aUSD, not a production mainnet investment product.

## Quickstart

```
npm install
cp .env.example .env        # then set a testnet PRIVATE_KEY (a burner with Atlantic GAS)
npm run deploy              # puts the vault + a faucet dollar on testnet, saves the addresses
npm start                   # runs the agent
```

Open `http://127.0.0.1:4030/app` for the chat, or call the API directly.

On Windows PowerShell, set the env vars first, then start:

```powershell
$env:PHAROS_NETWORK='pharos-atlantic'
$env:PRIVATE_KEY='0xyourtestnetkey'
npm start
```

Optional public-deployment safety lives in `.env.example`: `ANCHOR_MAX_AMOUNT` caps single write amounts, `ANCHOR_ACTION_SECRET` protects user write actions, and `ANCHOR_AGENT_SECRET` protects Agent Mode park/recall calls when set.

## Talk to it

| You say | Anchor does |
| --- | --- |
| save 20 | deposits 20 into the yield vault |
| put away 3 more | adds to your savings |
| how's my money doing? | balance, what you put in, what you earned, the daily rate |
| what's the rate? | explains the yield and the assets behind it |
| round up my 4.50 coffee | saves the 0.50 change |
| withdraw 5 | sends 5 back to you |
| cash out everything | withdraws principal plus earned yield |

Every save and withdraw is a real Pharos Atlantic testnet transaction and returns a block-explorer receipt.

## How the yield works

Anchor's vault mirrors the real Pharos pAlpha RealFi Ecosystem Vault:

- 70% Axil High Yield Consumer Credit, targeting 14% APY (over-collateralized emerging-market consumer credit)
- 30% Janus Henderson Anemoy Treasury (JTRSY), 3.65% APY (short-duration US Treasuries, daily liquidity)
- blended to roughly 12.9% net a year

## Agent Mode

Agents hold idle testnet balances between tasks. Anchor puts them to work in the yield mirror.

```
POST /agent/park     { "agent": "scout-1", "amount": 5 }
GET  /agent/position?agent=scout-1
POST /agent/recall   { "agent": "scout-1", "amount": "all" }
```

Every call returns a transaction receipt. `GET /agent/leaderboard` ranks the top-earning agents. Positions live in the AnchorAgentVault contract keyed by agent id, so anyone can verify any agent's balance onchain.

MCP-capable agents (Claude Code, OpenClaw, Codex) can use Anchor as native tools:

```
npm run mcp    # stdio server: anchor_park, anchor_recall, anchor_position
```

Watch two agents park, accrue demo yield, and recall with real testnet transactions:

```
npm run demo:agents
```

## API

- `POST /ask` `{ "text": "save 20" }` main entry point, returns a plain-English reply plus data and a receipt
- `POST /save` `{ "amount": 20 }`
- `POST /withdraw` `{ "amount": 5 }` or `{ "amount": "all" }`
- `POST /roundup` `{ "spend": 4.50 }`
- `GET /position` current savings, principal, earned
- `GET /rate` current APY and the RWA breakdown
- `GET /brief` a short daily savings summary
- `GET /health` network and deployment status

## Deployed (Pharos Atlantic testnet)

- Savings vault: `0xe1370ba133a08edf82052004762373dc1ad8102f`
- Agent vault (Agent Mode): `0xf0ae011f9df754301d8d67e8590222a2307000f0`
- Test dollar (aUSD, open faucet): `0x5d6d0ff224c7940d1918f1dedaf5c4cd75fae677`
- Explorer: https://pharos-testnet.socialscan.io

The demo runs on testnet with an open faucet dollar so anyone can try it without sourcing USDC. A production version should connect to live, audited RWA venues before making mainnet yield claims.

## Uploading to Anvita Flow

The official structure check requires the package folder name to match the `name` field in `SKILL.md`. This repo is named `pharos-anchor`, and `SKILL.md` uses `name: pharos-anchor`, so zip the full folder, not just the files inside it.

Set the public unit price to `Free` while Anvita earnings and x402 settlement are in beta. Paid pricing can be enabled later from the Service Agent dashboard.

## Tests

```
npm test
```

## About

Built for the Pharos AI Agent Carnival, Phase 2, as a Service Agent for Anvita Flow.

License: MIT-0.
