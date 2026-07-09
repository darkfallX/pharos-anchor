#!/usr/bin/env node
import * as agents from '../src/core/agents.js';

const TOOLS = [
  {
    name: 'anchor_park',
    description: 'Park idle testnet aUSD for an AI agent into the Anchor RWA-yield mirror (about 12.9% APY) on Pharos testnet. The balance accrues between tasks and can be recalled at any time.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'the agent name, e.g. "scout-1"' },
        amount: { type: 'number', description: 'amount to park, e.g. 5' },
      },
      required: ['agent', 'amount'],
    },
  },
  {
    name: 'anchor_recall',
    description: 'Recall parked funds for an AI agent, principal plus earned yield. Pass amount or "all".',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'the agent name' },
        amount: { description: 'amount to recall, or "all"' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'anchor_position',
    description: "Check an agent's parked balance, earned yield, and projections. Positions are on-chain and publicly verifiable.",
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', description: 'the agent name' } },
      required: ['agent'],
    },
  },
];

async function callTool(name, args) {
  if (name === 'anchor_park') return agents.park({ agent: args.agent, amount: args.amount });
  if (name === 'anchor_recall') return agents.recall({ agent: args.agent, amount: args.amount ?? 'all' });
  if (name === 'anchor_position') return agents.position(args.agent);
  throw new Error(`unknown tool: ${name}`);
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }) + '\n');
}

let buffer = '';
process.stdin.on('data', async (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const { id, method, params } = msg;
    try {
      if (method === 'initialize') {
        reply(id, {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'pharos-anchor', version: '1.0.0' },
        });
      } else if (method === 'tools/list') {
        reply(id, { tools: TOOLS });
      } else if (method === 'tools/call') {
        const result = await callTool(params.name, params.arguments || {});
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } else if (id !== undefined) {
        reply(id, {});
      }
    } catch (err) {
      if (id !== undefined) replyError(id, err.message);
    }
  }
});
