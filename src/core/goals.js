import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function storePath() {
  return process.env.ANCHOR_GOALS_PATH || path.join(__dirname, '../../data/goals.json');
}

function load() {
  try {
    const p = storePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    // ignore a corrupt store
  }
  return {};
}

function save(db) {
  const p = storePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(db, null, 2));
}

function key(address) {
  return String(address || 'default').toLowerCase();
}

export function addGoal(address, name, target) {
  const db = load();
  const k = key(address);
  db[k] = db[k] || [];
  const goal = { name: String(name), target: Number(target), createdAt: new Date().toISOString() };
  db[k].push(goal);
  save(db);
  return goal;
}

export function listGoals(address) {
  return load()[key(address)] || [];
}
