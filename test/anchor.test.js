import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.ANCHOR_GOALS_PATH = path.join(os.tmpdir(), `anchor-goals-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.ANCHOR_GOALS_PATH); } catch {}

import { parseIntent } from '../src/cli/nl.js';
import { roundUpChange, RWA_BREAKDOWN, project } from '../src/core/anchor.js';
import { addGoal, listGoals } from '../src/core/goals.js';
import { agentIdOf, toAtomic } from '../src/chain/agents.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log('  ok  ' + name);
  passed++;
}

// intent parsing
ok('save with amount', parseIntent('save 20').action === 'save' && parseIntent('save 20').amount === '20');
ok('save more', parseIntent('put away 3 more').action === 'save' && parseIntent('put away 3 more').amount === '3');
ok('balance', parseIntent("how's my money doing?").action === 'balance');
ok('rate', parseIntent("what's the rate?").action === 'rate');
ok('roundup', parseIntent('round up my 4.50 coffee').action === 'roundup' && parseIntent('round up my 4.50 coffee').spend === '4.50');
ok('withdraw amount', parseIntent('withdraw 5').action === 'withdraw' && parseIntent('withdraw 5').amount === '5');
ok('withdraw all', parseIntent('cash out everything').action === 'withdraw' && parseIntent('cash out everything').amount === 'all');
ok('set goal', parseIntent('set a goal to save 500 for a laptop').action === 'set_goal' && parseIntent('set a goal to save 500 for a laptop').target === '500');
ok('save for goal', parseIntent('save 500 for a laptop').action === 'set_goal' && parseIntent('save 500 for a laptop').name === 'laptop');
ok('project monthly', parseIntent('what if I save 50 a month for a year?').action === 'project' && parseIntent('what if I save 50 a month for a year?').monthly === '50' && parseIntent('what if I save 50 a month for a year?').months === '12');
ok('unknown falls back to help', parseIntent('tell me a joke').action === 'help');

// round-up math
ok('round up 4.50 -> 0.50', roundUpChange(4.5) === 0.5);
ok('round up whole -> 0', roundUpChange(10) === 0);
ok('round up 4.99 -> 0.01', roundUpChange(4.99) === 0.01);
ok('round up junk -> 0', roundUpChange('abc') === 0);

// yield breakdown mirrors pAlpha
ok('two holdings', RWA_BREAKDOWN.holdings.length === 2);
ok('net apy 12.9', RWA_BREAKDOWN.netApyPercent === 12.9);
ok('weights sum to 100', RWA_BREAKDOWN.holdings[0].weightPercent + RWA_BREAKDOWN.holdings[1].weightPercent === 100);

// goals
ok('goals intent', parseIntent('how close am I to my goals?').action === 'goals');
addGoal('0xabc', 'laptop', 500);
const stored = listGoals('0xabc');
ok('goal stored', stored.length === 1 && stored[0].name === 'laptop' && stored[0].target === 500);

// projection
const proj = project({ monthly: 100, months: 12 });
ok('project contributed', proj.contributed === 1200);
ok('project grows with yield', proj.projectedValue > 1200 && proj.interestEarned > 0);

// agent mode identity + amounts
const idA = agentIdOf('Scout 1');
ok('agent name normalized', idA.name === 'scout-1');
ok('agent id is bytes32', /^0x[0-9a-f]{64}$/.test(idA.id));
ok('agent id deterministic', agentIdOf('scout-1').id === idA.id);
ok('different agents differ', agentIdOf('trader-7').id !== idA.id);
assert.throws(() => agentIdOf('   '), /name/);
console.log('  ok  empty agent name rejected'); passed++;
ok('atomic conversion', toAtomic(5) === 5000000n && toAtomic('0.25') === 250000n);

try { fs.unlinkSync(process.env.ANCHOR_GOALS_PATH); } catch {}

console.log('\n' + passed + ' tests passed');
