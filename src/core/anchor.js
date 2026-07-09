import * as chain from '../chain/anchor.js';
import * as goals from './goals.js';

export const RWA_BREAKDOWN = {
  vault: 'pAlpha RealFi Ecosystem Vault (mirrored on testnet)',
  netApyPercent: 12.9,
  grossApyPercent: 14.0,
  performanceFeePercent: 10,
  holdings: [
    { name: 'Axil High Yield Consumer Credit', weightPercent: 70, apyPercent: 14.0, note: 'emerging-markets consumer credit, over-collateralized' },
    { name: 'Janus Henderson Anemoy Treasury (JTRSY)', weightPercent: 30, apyPercent: 3.65, note: 'short-duration US Treasuries, daily liquidity' },
  ],
};

function fallbackApyPercent() {
  return Number(process.env.ANCHOR_APY_BPS || '1290') / 100;
}

function maxAmount() {
  return Number(process.env.ANCHOR_MAX_AMOUNT || '10000');
}

function validPositiveAmount(amount, label) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Tell me a positive amount to ${label}, like "${label} 20".`);
  if (n > maxAmount()) throw new Error(`That amount is above the testnet safety limit of ${maxAmount()}.`);
  return n;
}

function projections(principalNum, apyPercent) {
  const yearly = principalNum * (apyPercent / 100);
  return {
    perDay: +(yearly / 365).toFixed(6),
    perMonth: +(yearly / 12).toFixed(4),
    perYear: +yearly.toFixed(4),
  };
}

export async function rate() {
  const apyPercent = chain.isDeployed() ? (await chain.getRate()).apyPercent : fallbackApyPercent();
  return { apyPercent, rwa: RWA_BREAKDOWN, deployed: chain.isDeployed() };
}

export async function summary(address) {
  const addr = address || process.env.ANCHOR_ADDRESS || chain.agentAddress();
  const pos = await chain.getPosition(addr);
  return { ...pos, projections: projections(Number(pos.principal), pos.apyPercent), rwa: RWA_BREAKDOWN };
}

export async function save(amount) {
  validPositiveAmount(amount, 'save');
  const res = await chain.deposit(chain.toAtomic(amount));
  const position = await chain.getPosition(res.address);
  return { action: 'save', amount: String(amount), ...res, position, explorerUrl: `${chain.explorer}/tx/${res.txHash}` };
}

export async function withdraw(amount) {
  let res;
  if (amount === 'all' || amount == null) {
    res = await chain.withdrawAll();
  } else {
    validPositiveAmount(amount, 'withdraw');
    res = await chain.withdraw(chain.toAtomic(amount));
  }
  const position = await chain.getPosition(res.address);
  const label = amount === 'all' || amount == null ? 'all' : String(amount);
  return { action: 'withdraw', amount: label, ...res, position, explorerUrl: `${chain.explorer}/tx/${res.txHash}` };
}

export function roundUpChange(spend) {
  const s = Number(spend);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return +(Math.ceil(s) - s).toFixed(2);
}

export async function saveRoundUp(spend) {
  const change = roundUpChange(spend);
  if (change <= 0) {
    return { action: 'roundup', spend: String(spend), change: 0, message: 'That is already a round number, no change to skim.' };
  }
  const saved = await save(change);
  return { ...saved, action: 'roundup', spend: String(spend), change };
}

export async function dailyBrief(address) {
  const s = await summary(address);
  return {
    ...s,
    brief: `You have ${s.total} in savings: ${s.principal} you put in and ${s.earned} earned. At ${s.apyPercent}% a year, that is about ${s.projections.perDay} a day.`,
  };
}

function pct(total, target) {
  if (!target) return 0;
  return Math.min(100, +((total / target) * 100).toFixed(1));
}

async function currentTotal(address) {
  if (!chain.isDeployed()) return 0;
  try {
    const p = await chain.getPosition(address);
    return Number(p.total);
  } catch {
    return 0;
  }
}

function goalOwner(address) {
  return address || process.env.ANCHOR_ADDRESS || chain.agentAddress();
}

export async function setGoal(name, target, address) {
  const n = Number(target);
  if (!name || !Number.isFinite(n) || n <= 0) {
    throw new Error('I need a name and a positive target, like "save 500 for a laptop".');
  }
  const owner = goalOwner(address);
  const goal = goals.addGoal(owner, name, n);
  const total = await currentTotal(owner);
  return { ...goal, saved: total, remaining: Math.max(0, n - total), progressPercent: pct(total, n) };
}

export async function getGoals(address) {
  const owner = goalOwner(address);
  const total = await currentTotal(owner);
  return goals.listGoals(owner).map((g) => ({
    ...g,
    saved: total,
    remaining: Math.max(0, g.target - total),
    progressPercent: pct(total, g.target),
  }));
}

export function project({ monthly, months }) {
  const m = Number(monthly);
  const n = Math.max(1, Math.round(Number(months) || 12));
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error('Tell me how much per month and for how many months, like "save 50 a month for 2 years".');
  }
  const rate = fallbackApyPercent() / 100 / 12;
  let fv = 0;
  for (let i = 0; i < n; i++) fv = fv * (1 + rate) + m;
  const contributed = m * n;
  return {
    monthly: m,
    months: n,
    apyPercent: fallbackApyPercent(),
    contributed: +contributed.toFixed(2),
    projectedValue: +fv.toFixed(2),
    interestEarned: +(fv - contributed).toFixed(2),
  };
}
