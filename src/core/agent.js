import * as anchor from './anchor.js';

const SYSTEM = `You are Anchor, a warm, smart, and genuinely helpful savings assistant on the Pharos network.
You help people save money in plain language and earn real-world-asset yield (about 12.9% a year, from short-term consumer credit and US Treasuries, mirroring the Pharos pAlpha vault).

How to behave:
- Be friendly and human. If someone greets you ("hi", "good morning"), greet them back warmly and ask how you can help with their savings.
- Keep replies short and clear. Plain English, no jargon, no lectures.
- When the user wants to do something (save, withdraw, round up, check balance, ask the rate), CALL THE MATCHING TOOL. Never claim you did something without calling the tool.
- Amounts are in test dollars on the Pharos testnet.
- Never invent numbers. Only state balances, earnings, or rates that came from a tool result.
- After a save or withdraw, tell them the new balance and include the receipt link from the tool result so they can verify it.
- If a tool returns an error, apologize briefly and say what went wrong in plain words.
- You can also set savings goals, show progress toward them, and project how savings grow over time. Use the matching tool.
- You can chat a little, but gently keep things about saving and growing their money.`;

const TOOLS = [
  { name: 'get_savings', description: "Get the user's current savings: total, principal, earned yield, and the rate.", properties: {}, required: [] },
  { name: 'get_rate', description: 'Get the current yearly rate (APY) and the real-world assets behind the yield.', properties: {}, required: [] },
  { name: 'save_money', description: 'Deposit an amount of money into the savings vault.', properties: { amount: { type: 'number', description: 'the amount to save, e.g. 20' } }, required: ['amount'] },
  { name: 'withdraw_money', description: "Withdraw money. Pass a number, or the word 'all' to take everything.", properties: { amount: { type: 'string', description: "amount as a number like '5', or 'all'" } }, required: ['amount'] },
  { name: 'round_up', description: 'Round a purchase up to the next whole dollar and save the change.', properties: { spend: { type: 'number', description: 'the purchase amount, e.g. 4.50' } }, required: ['spend'] },
  { name: 'set_goal', description: 'Create a savings goal with a name and a target amount.', properties: { name: { type: 'string', description: 'what the goal is for, e.g. "new laptop"' }, target: { type: 'number', description: 'the target amount, e.g. 500' } }, required: ['name', 'target'] },
  { name: 'get_goals', description: "List the user's savings goals and how close they are to each one.", properties: {}, required: [] },
  { name: 'project_savings', description: 'Project how much the user would have if they save a set amount each month for a number of months, with yield.', properties: { monthly: { type: 'number', description: 'amount saved each month' }, months: { type: 'number', description: 'number of months, default 12' } }, required: ['monthly'] },
];

async function executeTool(name, args) {
  try {
    if (name === 'get_savings') {
      const s = await anchor.summary();
      return { total: s.total, principal: s.principal, earned: s.earned, apyPercent: s.apyPercent, perDay: s.projections.perDay, perMonth: s.projections.perMonth };
    }
    if (name === 'get_rate') {
      const r = await anchor.rate();
      return { apyPercent: r.apyPercent, holdings: r.rwa.holdings };
    }
    if (name === 'save_money') {
      const r = await anchor.save(args.amount);
      return { saved: r.amount, newTotal: r.position.total, receipt: r.explorerUrl };
    }
    if (name === 'withdraw_money') {
      const amt = String(args.amount).toLowerCase() === 'all' ? 'all' : Number(args.amount);
      const r = await anchor.withdraw(amt);
      return { withdrew: r.amount, newTotal: r.position.total, receipt: r.explorerUrl };
    }
    if (name === 'round_up') {
      const r = await anchor.saveRoundUp(args.spend);
      if (!r.change) return { message: r.message };
      return { roundedUp: r.change, newTotal: r.position.total, receipt: r.explorerUrl };
    }
    if (name === 'set_goal') {
      const g = await anchor.setGoal(args.name, args.target);
      return { goal: g.name, target: g.target, saved: g.saved, remaining: g.remaining, progressPercent: g.progressPercent };
    }
    if (name === 'get_goals') {
      const gs = await anchor.getGoals();
      return { goals: gs.map((g) => ({ name: g.name, target: g.target, saved: g.saved, remaining: g.remaining, progressPercent: g.progressPercent })) };
    }
    if (name === 'project_savings') {
      return anchor.project({ monthly: args.monthly, months: args.months });
    }
    return { error: 'unknown tool' };
  } catch (err) {
    return { error: err.message };
  }
}

export function provider() {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER;
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  return null;
}

export function hasLLM() {
  return Boolean(provider());
}

export async function runAgent(text, history = []) {
  const p = provider();
  if (p === 'openrouter') return runOpenRouter(text, history);
  if (p === 'openai') return runOpenAI(text, history);
  if (p === 'anthropic') return runAnthropic(text, history);
  if (p === 'gemini') return runGemini(text, history);
  throw new Error('No LLM configured');
}

function cleanHistory(history) {
  return (history || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
}

async function runOpenAI(text, history) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const tools = TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.properties, required: t.required } },
  }));
  const messages = [{ role: 'system', content: SYSTEM }, ...cleanHistory(history), { role: 'user', content: text }];

  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.6 }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const msg = data.choices[0].message;
    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let a = {};
        try { a = JSON.parse(tc.function.arguments || '{}'); } catch {}
        const result = await executeTool(tc.function.name, a);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return msg.content || '';
  }
  return 'Sorry, I got a little tangled up there. Mind trying again?';
}

async function runOpenRouter(text, history) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free';
  const tools = TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.properties, required: t.required } },
  }));
  const messages = [{ role: 'system', content: SYSTEM }, ...cleanHistory(history), { role: 'user', content: text }];

  for (let i = 0; i < 4; i++) {
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://github.com/darkfallX/pharos-anchor',
          'X-Title': 'Pharos Anchor',
        },
        body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.6 }),
      });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(`OpenRouter: ${data.error.message || JSON.stringify(data.error)}`);
    const msg = data.choices[0].message;
    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let a = {};
        try { a = JSON.parse(tc.function.arguments || '{}'); } catch {}
        const result = await executeTool(tc.function.name, a);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return msg.content || '';
  }
  return 'Sorry, I got a little tangled up there. Mind trying again?';
}

async function runAnthropic(text, history) {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: { type: 'object', properties: t.properties, required: t.required } }));
  const messages = [...cleanHistory(history), { role: 'user', content: text }];

  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system: SYSTEM, max_tokens: 1024, temperature: 0.6, messages, tools }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const toolUses = data.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length) {
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {});
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  return 'Sorry, I got a little tangled up there. Mind trying again?';
}

async function runGemini(text, history) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const tools = [{
    function_declarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: { type: 'object', properties: t.properties, required: t.required } })),
  }];
  const contents = [
    ...cleanHistory(history).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text }] },
  ];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents, tools }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length) {
      contents.push({ role: 'model', parts });
      const responseParts = [];
      for (const c of calls) {
        const result = await executeTool(c.functionCall.name, c.functionCall.args || {});
        responseParts.push({ functionResponse: { name: c.functionCall.name, response: result } });
      }
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }
    return parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
  }
  return 'Sorry, I got a little tangled up there. Mind trying again?';
}
