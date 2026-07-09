import path from 'path';
import { fileURLToPath } from 'url';
import * as anchor from '../core/anchor.js';
import * as chain from '../chain/anchor.js';
import { parseIntent } from '../cli/nl.js';
import * as agent from '../core/agent.js';
import * as agents from '../core/agents.js';
import { isDeployed as agentVaultDeployed, AGENT_VAULT_ADDRESS } from '../chain/agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerRoutes(app) {
  app.get('/health', healthHandler);
  app.get('/rate', rateHandler);
  app.get('/position', positionHandler);
  app.post('/save', saveHandler);
  app.post('/withdraw', withdrawHandler);
  app.post('/roundup', roundupHandler);
  app.post('/goal', goalHandler);
  app.get('/goals', goalsHandler);
  app.post('/project', projectHandler);
  app.get('/brief', briefHandler);
  app.post('/ask', askHandler);
  app.get('/app', appHandler);
  app.post('/agent/park', agentParkHandler);
  app.post('/agent/recall', agentRecallHandler);
  app.get('/agent/position', agentPositionHandler);
  app.get('/agent/leaderboard', agentLeaderboardHandler);
}

function requestSecret(req) {
  return req.get('x-anchor-action-secret')
    || req.get('x-anchor-agent-secret')
    || req.body?.secret
    || req.query?.secret
    || '';
}

function requireConfiguredSecret(req, res, envName, label) {
  const configured = process.env[envName];
  if (!configured) return true;
  if (requestSecret(req) === configured) return true;
  res.status(401).json({ error: `${label} secret required` });
  return false;
}

async function agentParkHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_AGENT_SECRET', 'Agent write')) return;
    const { agent: name, amount } = req.body;
    if (!name) return res.status(400).json({ error: 'agent is required, e.g. { "agent": "scout-1", "amount": 5 }' });
    res.json(await agents.park({ agent: name, amount }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function agentRecallHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_AGENT_SECRET', 'Agent recall')) return;
    const { agent: name, amount } = req.body;
    if (!name) return res.status(400).json({ error: 'agent is required, e.g. { "agent": "scout-1", "amount": "all" }' });
    res.json(await agents.recall({ agent: name, amount }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function agentPositionHandler(req, res) {
  try {
    if (!req.query.agent) return res.status(400).json({ error: 'agent query param required' });
    res.json(await agents.position(req.query.agent));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function agentLeaderboardHandler(req, res) {
  try {
    res.json(await agents.leaderboard(parseInt(req.query.top || '10', 10)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function healthHandler(_req, res) {
  res.json({
    status: 'ok',
    agent: 'pharos-anchor',
    network: chain.networkName,
    deployed: chain.isDeployed(),
    hasWallet: chain.hasWallet(),
    vault: chain.VAULT_ADDRESS,
    usd: chain.USD_ADDRESS,
    agentVault: AGENT_VAULT_ADDRESS,
    agentMode: agentVaultDeployed(),
    safety: {
      actionSecret: Boolean(process.env.ANCHOR_ACTION_SECRET),
      agentSecret: Boolean(process.env.ANCHOR_AGENT_SECRET),
      maxAmount: process.env.ANCHOR_MAX_AMOUNT || '10000',
    },
    llm: agent.hasLLM(),
    llmProvider: agent.provider(),
    timestamp: new Date().toISOString(),
  });
}

async function rateHandler(_req, res) {
  try {
    res.json(await anchor.rate());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function positionHandler(req, res) {
  try {
    res.json(await anchor.summary(req.query.address));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function saveHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_ACTION_SECRET', 'Action')) return;
    res.json(await anchor.save(req.body.amount));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function withdrawHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_ACTION_SECRET', 'Action')) return;
    res.json(await anchor.withdraw(req.body.amount));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function roundupHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_ACTION_SECRET', 'Action')) return;
    res.json(await anchor.saveRoundUp(req.body.spend));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function goalHandler(req, res) {
  try {
    if (!requireConfiguredSecret(req, res, 'ANCHOR_ACTION_SECRET', 'Action')) return;
    res.json(await anchor.setGoal(req.body.name, req.body.target));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function goalsHandler(req, res) {
  try {
    res.json({ goals: await anchor.getGoals(req.query.address) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function projectHandler(req, res) {
  try {
    res.json(anchor.project({ monthly: req.body.monthly, months: req.body.months }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function briefHandler(req, res) {
  try {
    res.json(await anchor.dailyBrief(req.query.address));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function askHandler(req, res) {
  const { text, history } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!requireConfiguredSecret(req, res, 'ANCHOR_ACTION_SECRET', 'Action')) return;

  if (agent.hasLLM()) {
    try {
      const reply = await agent.runAgent(text, history);
      return res.json({ message: reply, llm: true });
    } catch (err) {
      console.error('[ask] llm failed, using fallback:', err.message);
    }
  }

  const intent = parseIntent(text);
  try {
    const { message, data } = await dispatch(intent);
    res.json({ interpreted: intent, message, data });
  } catch (err) {
    res.json({ interpreted: intent, message: err.message, data: null, error: true });
  }
}

async function dispatch(intent) {
  switch (intent.action) {
    case 'save': {
      const r = await anchor.save(intent.amount);
      return {
        data: r,
        message: `Done. I put ${r.amount} into your savings. You now have ${r.position.total} growing at ${r.position.apyPercent}% a year. Receipt: ${r.explorerUrl}`,
      };
    }
    case 'withdraw': {
      const r = await anchor.withdraw(intent.amount);
      const what = r.amount === 'all' ? 'everything' : r.amount;
      return {
        data: r,
        message: `Sent ${what} back to you. You have ${r.position.total} left in savings. Receipt: ${r.explorerUrl}`,
      };
    }
    case 'roundup': {
      const r = await anchor.saveRoundUp(intent.spend);
      if (!r.change) return { data: r, message: r.message };
      return {
        data: r,
        message: `That ${r.spend} rounds up to the next dollar. I skimmed ${r.change} into savings. You now have ${r.position.total}. Receipt: ${r.explorerUrl}`,
      };
    }
    case 'rate': {
      const r = await anchor.rate();
      return {
        data: r,
        message: `Your testnet savings accrue at about ${r.apyPercent}% a year in this demo. The model mirrors real-world assets: 70% emerging-market consumer credit and 30% short-term US Treasuries, the same mix as the Pharos pAlpha vault.`,
      };
    }
    case 'set_goal': {
      const g = await anchor.setGoal(intent.name, intent.target);
      return {
        data: { goal: g },
        message: `Goal created: ${g.name}. Target ${g.target}. You have ${g.saved} saved toward it, so ${g.remaining} remains.`,
      };
    }
    case 'project': {
      const p = anchor.project({ monthly: intent.monthly, months: intent.months });
      return {
        data: p,
        message: `If you save ${p.monthly} a month for ${p.months} months, you would contribute ${p.contributed} and project to about ${p.projectedValue}, including ${p.interestEarned} in demo yield.`,
      };
    }
    case 'balance':
    case 'brief': {
      const s = await anchor.summary();
      return {
        data: s,
        message: `You have ${s.total} in savings: ${s.principal} you put in and ${s.earned} earned. At ${s.apyPercent}% a year that is about ${s.projections.perDay} a day, ${s.projections.perMonth} a month.`,
      };
    }
    case 'goals': {
      const gs = await anchor.getGoals();
      if (!gs.length) {
        return { data: { goals: [] }, message: 'You have not set any savings goals yet. Try: "set a goal to save 500 for a laptop".' };
      }
      const lines = gs.map((g) => `${g.name}: ${g.saved} of ${g.target} (${g.progressPercent}%)`).join('; ');
      return { data: { goals: gs }, message: `Your goals, ${lines}.` };
    }
    default:
      return { data: null, message: intent.explanation };
  }
}

function appHandler(_req, res) {
  res.sendFile(path.join(__dirname, '../../public/anchor.html'), (err) => {
    if (err) res.status(404).json({ error: 'Anchor app not built yet' });
  });
}
