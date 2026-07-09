import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as chain from '../chain/agents.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function indexPath() {
  return process.env.ANCHOR_AGENTS_INDEX || path.join(__dirname, '../../data/agents-index.json');
}

function loadIndex() {
  try {
    const p = indexPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    // corrupt index rebuilds itself from subsequent activity
  }
  return {};
}

function saveIndex(idx) {
  const p = indexPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(idx, null, 2));
}

function touchIndex(agent, action, amount) {
  const idx = loadIndex();
  const rec = idx[agent] || { agent, firstSeen: new Date().toISOString(), parks: 0, recalls: 0 };
  if (action === 'park') rec.parks += 1;
  if (action === 'recall') rec.recalls += 1;
  rec.lastAction = { action, amount: String(amount), at: new Date().toISOString() };
  idx[agent] = rec;
  saveIndex(idx);
}

function validAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('amount must be a positive number, like 5 or 0.25');
  if (n > 1e9) throw new Error('amount is unreasonably large for the testnet demo');
  return n;
}

export async function park({ agent, amount }) {
  const n = validAmount(amount);
  const res = await chain.park(agent, chain.toAtomic(n));
  touchIndex(res.agent, 'park', n);
  await sleep(1200); // let the RPC settle so the position read reflects the tx
  const position = await chain.positionOf(res.agent);
  return {
    ok: true,
    action: 'park',
    ...res,
    amount: String(n),
    position,
    explorerUrl: `${chain.explorer}/tx/${res.txHash}`,
    message: `Parked ${n} for ${res.agent}. It now has ${position.total} earning ${position.apyPercent}% a year in real-world assets.`,
  };
}

export async function recall({ agent, amount }) {
  const all = amount === 'all' || amount === undefined || amount === null;
  const before = await chain.positionOf(agent);
  if (Number(before.total) <= 0) throw new Error(`${before.agent} has nothing parked.`);
  const res = await chain.recall(agent, all ? 'all' : chain.toAtomic(validAmount(amount)));
  touchIndex(res.agent, 'recall', all ? before.total : amount);
  await sleep(1200); // let the RPC settle so the position read reflects the tx
  const position = await chain.positionOf(res.agent);
  return {
    ok: true,
    action: 'recall',
    ...res,
    amount: all ? before.total : String(amount),
    position,
    explorerUrl: `${chain.explorer}/tx/${res.txHash}`,
    message: `Recalled ${all ? 'everything (' + before.total + ')' : amount} for ${res.agent}. ${position.total} still parked.`,
  };
}

export async function position(agent) {
  const pos = await chain.positionOf(agent);
  const yearly = Number(pos.parked) * (pos.apyPercent / 100);
  return {
    ...pos,
    projections: {
      perDay: +(yearly / 365).toFixed(6),
      perMonth: +(yearly / 12).toFixed(4),
      perYear: +yearly.toFixed(4),
    },
    verify: `${chain.explorer}/address/${chain.AGENT_VAULT_ADDRESS}`,
  };
}

export async function leaderboard(top = 10) {
  const idx = loadIndex();
  const names = Object.keys(idx).slice(0, 100);
  const rows = [];
  for (const name of names) {
    try {
      const pos = await chain.positionOf(name);
      rows.push({ agent: name, parked: pos.parked, earned: pos.earned, total: pos.total, parks: idx[name].parks, lastAction: idx[name].lastAction });
    } catch {
      // skip unreadable rows rather than failing the board
    }
  }
  rows.sort((a, b) => Number(b.total) - Number(a.total));
  const stats = await chain.vaultStats().catch(() => null);
  return { stats, agents: rows.slice(0, top) };
}
