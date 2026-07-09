# Phase 2 submission checklist

Pharos AI Agent Carnival, Round 2. Anchor as a Service Agent on Anvita Flow.

## Key dates (2026)
- July 8, 7:00 PM HKT (noon Lagos): skill uploads open on the Anvita developer platform
- July 10, 6:00 PM HKT (11:00 AM Lagos): submission deadline
- July 10 onward: users discover and invoke the agent, invocations count toward the leaderboard

## Before July 8
- [x] Working agent, deployed and tested on testnet
- [x] Chat demo at `/app`
- [x] SKILL.md and agent-card.json ready
- [ ] Push the repo to GitHub (https://github.com/darkfallX/pharos-anchor)
- [ ] Record the demo video (chat, a real save, the onchain receipt, the balance growing)

## July 8 (uploads open)
- [ ] Apply for Anvita Flow early access if not already in (tally.so/r/44LEGX)
- [ ] Upload the skill package to the Anvita developer console
  - Zip the whole `pharos-anchor/` folder, not the files inside it
  - Confirm `SKILL.md` starts with `name: pharos-anchor`
- [ ] Create the Service Agent from the skill, set the Agent Card from agent-card.json
- [ ] Set public pricing to `Free` while Anvita earnings/x402 settlement are in beta
- [ ] Confirm the agent is discoverable in the marketplace

## By July 10, 6 PM HKT
- [ ] Submit the form (link shared by the organizers) with:
  - [ ] GitHub repo link
  - [ ] Video tutorial link
  - [ ] Service Agent details

## Notes
- The Anvita payment/top-up module is still in testing, so paid collection is off for now. Anchor should be published as Free during this window; its value does not depend on charging.
- Keep the testnet PRIVATE_KEY out of git. `.env` is gitignored.
