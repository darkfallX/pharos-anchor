#!/usr/bin/env node
import * as agents from '../src/core/agents.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (who, msg) => console.log(`  [${who}] ${msg}`);

async function main() {
  console.log('\nAnchor Agent Mode demo, real transactions on Pharos Atlantic\n');

  say('scout-1', 'Finished my research task. I have 6.00 idle until tomorrow.');
  say('scout-1', 'Parking it with Anchor so it earns while I sleep...');
  const p1 = await agents.park({ agent: 'scout-1', amount: 6 });
  say('anchor', p1.message);
  say('anchor', 'receipt: ' + p1.explorerUrl);

  console.log('');
  say('trader-7', 'Between positions. Parking 500 rather than letting it sit.');
  const p2 = await agents.park({ agent: 'trader-7', amount: 500 });
  say('anchor', p2.message);
  say('anchor', 'receipt: ' + p2.explorerUrl);

  console.log('');
  say('trader-7', 'Let the yield accrue for a moment...');
  await sleep(9000);

  const pos = await agents.position('trader-7');
  say('anchor', `trader-7 position: parked ${pos.parked}, earned ${pos.earned} already, ${pos.apyPercent}% APY.`);
  say('anchor', `anyone can verify this onchain: ${pos.verify}`);

  console.log('');
  say('scout-1', 'New task came in. I need my money back.');
  const r1 = await agents.recall({ agent: 'scout-1', amount: 'all' });
  say('anchor', r1.message);
  say('anchor', 'receipt: ' + r1.explorerUrl);

  console.log('');
  const board = await agents.leaderboard(5);
  console.log('  Leaderboard (top parked agents):');
  board.agents.forEach((a, i) => console.log(`    ${i + 1}. ${a.agent}  parked ${a.parked}  earned ${a.earned}`));
  if (board.stats) console.log(`  Vault: ${board.stats.agents} agents, ${board.stats.totalParked} parked, ${board.stats.apyPercent}% APY\n`);
}

main().catch((err) => { console.error('demo failed:', err.message); process.exit(1); });
