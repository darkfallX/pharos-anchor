import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { registerRoutes } from './routes.js';
import * as chain from '../chain/anchor.js';
import { getChainMeta } from '../config/networks.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '4030', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RATE_WINDOW_MS = parseInt(process.env.ANCHOR_RATE_WINDOW_MS || '60000', 10);
const READ_LIMIT = parseInt(process.env.ANCHOR_READ_RATE_LIMIT || '120', 10);
const WRITE_LIMIT = parseInt(process.env.ANCHOR_WRITE_RATE_LIMIT || '40', 10);

const buckets = new Map();

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
}

function rateLimit(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const write = req.method !== 'GET';
  const limit = write ? WRITE_LIMIT : READ_LIMIT;
  const now = Date.now();
  const key = `${clientKey(req)}:${write ? 'w' : 'r'}`;
  const bucket = buckets.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  if (bucket.count > limit) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
  next();
}

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(rateLimit);

app.get('/', (_req, res) => {
  res.json({
    agent: 'pharos-anchor',
    tagline: 'A savings agent for the Pharos AI economy. Tell it to save, it puts your money into real-world-asset yield.',
    network: chain.networkName,
    deployed: chain.isDeployed(),
    app: '/app',
    endpoints: {
      health: 'GET /health',
      rate: 'GET /rate',
      position: 'GET /position',
      save: 'POST /save { amount }',
      withdraw: 'POST /withdraw { amount }',
      roundup: 'POST /roundup { spend }',
      brief: 'GET /brief',
      ask: 'POST /ask { text }',
      agentPark: 'POST /agent/park { agent, amount }',
      agentRecall: 'POST /agent/recall { agent, amount|"all" }',
      agentPosition: 'GET /agent/position?agent=name',
      agentLeaderboard: 'GET /agent/leaderboard',
    },
    agentMode: 'Any AI agent can park idle testnet aUSD here between tasks and accrue demo RWA-yield. One POST to park, one to recall, every position verifiable onchain.',
  });
});

registerRoutes(app);
app.use('/public', express.static(path.join(__dirname, '../../public')));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error('[express]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  app.listen(PORT, HOST, () => {
    const meta = getChainMeta();
    console.log('Pharos Anchor, savings agent');
    console.log(`  Network:  ${meta.name} (${meta.chainId})`);
    console.log(`  Listen:   http://${HOST}:${PORT}`);
    console.log(`  App:      http://127.0.0.1:${PORT}/app`);
    console.log(`  Deployed: ${chain.isDeployed()}`);
    console.log(`  Wallet:   ${chain.hasWallet() ? 'set' : 'missing (set PRIVATE_KEY to enable saving)'}`);
  });
}

export default app;
