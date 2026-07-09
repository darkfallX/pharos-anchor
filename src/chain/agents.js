import { createPublicClient, createWalletClient, http, keccak256, toBytes, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { toViemChain, getActiveNetworkKey, getNetwork } from '../config/networks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const chain = toViemChain(getActiveNetworkKey());
const net = getNetwork(getActiveNetworkKey());

export const AGENT_VAULT_ADDRESS = process.env.ANCHOR_AGENT_VAULT_ADDRESS || null;
export const USD_ADDRESS = process.env.ANCHOR_USD_ADDRESS || null;
export const explorer = net.explorer;

const USD_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'mint', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [] },
];

const VAULT_ABI = [
  { name: 'apyBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalPrincipal', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'agentCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'positionOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [
      { name: 'principal', type: 'uint256' },
      { name: 'earned', type: 'uint256' },
      { name: 'currentApyBps', type: 'uint256' },
      { name: 'lastUpdate', type: 'uint64' },
    ],
  },
  { name: 'park', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'agentId', type: 'bytes32' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'recall', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'agentId', type: 'bytes32' }, { name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [] },
  { name: 'recallAll', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'agentId', type: 'bytes32' }, { name: 'to', type: 'address' }], outputs: [] },
];

export function isDeployed() {
  return Boolean(AGENT_VAULT_ADDRESS && USD_ADDRESS);
}

export function agentIdOf(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!normalized) throw new Error('agent needs a name, like "scout-1"');
  return { name: normalized, id: keccak256(toBytes(normalized)) };
}

export const toAtomic = (x) => parseUnits(String(x), 6);
export const fromAtomic = (x) => formatUnits(BigInt(x), 6);

const publicClient = () => createPublicClient({ chain, transport: http() });

// the public Atlantic RPC rate-limits bursts; wait it out instead of failing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, label) {
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err.message || err);
      const rateLimited = /limit exceeded|too fast|rate|429/i.test(msg);
      if (!rateLimited || attempt >= 4) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 15000);
    }
  }
}

function wallet() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error('PRIVATE_KEY not set, the service needs a testnet key to sign.');
  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
  return { account, client: createWalletClient({ account, chain, transport: http() }) };
}

function requireDeployed() {
  if (!isDeployed()) throw new Error('Agent vault is not deployed yet. Run: npm run deploy:agents');
}

export async function positionOf(name) {
  requireDeployed();
  const { id, name: n } = agentIdOf(name);
  const [principal, earned, apyBps, lastUpdate] = await publicClient().readContract({
    address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'positionOf', args: [id],
  });
  return {
    agent: n,
    agentId: id,
    parked: fromAtomic(principal),
    earned: fromAtomic(earned),
    total: fromAtomic(principal + earned),
    apyPercent: Number(apyBps) / 100,
    lastUpdate: Number(lastUpdate),
  };
}

export async function vaultStats() {
  requireDeployed();
  const pc = publicClient();
  const [total, count, apyBps] = await Promise.all([
    pc.readContract({ address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalPrincipal' }),
    pc.readContract({ address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'agentCount' }),
    pc.readContract({ address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'apyBps' }),
  ]);
  return { totalParked: fromAtomic(total), agents: Number(count), apyPercent: Number(apyBps) / 100 };
}

async function ensureFunds(address, neededAtomic) {
  const bal = await withRetry(() => publicClient().readContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'balanceOf', args: [address] }));
  if (bal < neededAtomic) {
    const { client } = wallet();
    const hash = await withRetry(() => client.writeContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'mint', args: [address, neededAtomic - bal] }));
    await withRetry(() => publicClient().waitForTransactionReceipt({ hash }));
    await sleep(800);
  }
}

async function approveIfNeeded(neededAtomic) {
  const { account, client } = wallet();
  const allowance = await withRetry(() => publicClient().readContract({
    address: USD_ADDRESS, abi: USD_ABI, functionName: 'allowance', args: [account.address, AGENT_VAULT_ADDRESS],
  }));
  if (allowance < neededAtomic) {
    const hash = await withRetry(() => client.writeContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'approve', args: [AGENT_VAULT_ADDRESS, neededAtomic * 1000n] }));
    await withRetry(() => publicClient().waitForTransactionReceipt({ hash }));
    await sleep(800);
  }
}

export async function park(name, amountAtomic) {
  requireDeployed();
  const { id, name: n } = agentIdOf(name);
  const { account, client } = wallet();
  await ensureFunds(account.address, amountAtomic);
  await approveIfNeeded(amountAtomic);
  const hash = await withRetry(() => client.writeContract({ address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'park', args: [id, amountAtomic] }));
  await withRetry(() => publicClient().waitForTransactionReceipt({ hash }));
  return { agent: n, txHash: hash };
}

export async function recall(name, amountAtomic) {
  requireDeployed();
  const { id, name: n } = agentIdOf(name);
  const { account, client } = wallet();
  const fn = amountAtomic === 'all'
    ? { functionName: 'recallAll', args: [id, account.address] }
    : { functionName: 'recall', args: [id, amountAtomic, account.address] };
  const hash = await withRetry(() => client.writeContract({ address: AGENT_VAULT_ADDRESS, abi: VAULT_ABI, ...fn }));
  await withRetry(() => publicClient().waitForTransactionReceipt({ hash }));
  return { agent: n, txHash: hash };
}
