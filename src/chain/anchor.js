import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { toViemChain, getActiveNetworkKey, getNetwork } from '../config/networks.js';

dotenv.config();

const NETWORK = getActiveNetworkKey();
const chain = toViemChain(NETWORK);
const net = getNetwork(NETWORK);

export const USD_ADDRESS = process.env.ANCHOR_USD_ADDRESS || null;
export const VAULT_ADDRESS = process.env.ANCHOR_VAULT_ADDRESS || null;
export const explorer = net.explorer;
export const networkName = net.name;

const USD_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'mint', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [] },
];

const VAULT_ABI = [
  { name: 'apyBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalPrincipal', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'position',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'principal', type: 'uint256' },
      { name: 'earned', type: 'uint256' },
      { name: 'currentApyBps', type: 'uint256' },
      { name: 'lastUpdate', type: 'uint64' },
    ],
  },
  { name: 'deposit', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'withdrawAll', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
];

export function isDeployed() {
  return Boolean(USD_ADDRESS && VAULT_ADDRESS);
}
export function hasWallet() {
  return Boolean(process.env.PRIVATE_KEY);
}
export function toAtomic(x) {
  return parseUnits(String(x), 6);
}
export function fromAtomic(x) {
  return formatUnits(BigInt(x), 6);
}

function publicClient() {
  return createPublicClient({ chain, transport: http() });
}

function wallet() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error('PRIVATE_KEY not set, the agent needs a testnet key to sign transactions.');
  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
  return { account, client: createWalletClient({ account, chain, transport: http() }) };
}

function requireDeployed() {
  if (!isDeployed()) throw new Error('Anchor is not set up onchain yet. Run: npm run deploy');
}

export function agentAddress() {
  return wallet().account.address;
}

export async function getRate() {
  requireDeployed();
  const bps = await publicClient().readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'apyBps' });
  return { apyBps: Number(bps), apyPercent: Number(bps) / 100 };
}

export async function getPosition(address) {
  requireDeployed();
  const [principal, earned, apyBps, lastUpdate] = await publicClient().readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'position',
    args: [address],
  });
  return {
    address,
    principal: fromAtomic(principal),
    earned: fromAtomic(earned),
    total: fromAtomic(principal + earned),
    apyPercent: Number(apyBps) / 100,
    lastUpdate: Number(lastUpdate),
  };
}

export async function getUsdBalance(address) {
  requireDeployed();
  return publicClient().readContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'balanceOf', args: [address] });
}

async function faucet(to, amountAtomic) {
  const { client } = wallet();
  const hash = await client.writeContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'mint', args: [to, amountAtomic] });
  await publicClient().waitForTransactionReceipt({ hash });
  return hash;
}

async function ensureBalance(address, neededAtomic) {
  const bal = await getUsdBalance(address);
  if (bal < neededAtomic) await faucet(address, neededAtomic - bal);
}

async function approveIfNeeded(neededAtomic) {
  const { account, client } = wallet();
  const allowance = await publicClient().readContract({
    address: USD_ADDRESS,
    abi: USD_ABI,
    functionName: 'allowance',
    args: [account.address, VAULT_ADDRESS],
  });
  if (allowance < neededAtomic) {
    const hash = await client.writeContract({ address: USD_ADDRESS, abi: USD_ABI, functionName: 'approve', args: [VAULT_ADDRESS, neededAtomic] });
    await publicClient().waitForTransactionReceipt({ hash });
  }
}

export async function deposit(amountAtomic) {
  requireDeployed();
  const { account, client } = wallet();
  await ensureBalance(account.address, amountAtomic);
  await approveIfNeeded(amountAtomic);
  const hash = await client.writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'deposit', args: [amountAtomic] });
  await publicClient().waitForTransactionReceipt({ hash });
  return { txHash: hash, address: account.address };
}

export async function withdraw(amountAtomic) {
  requireDeployed();
  const { account, client } = wallet();
  const hash = await client.writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdraw', args: [amountAtomic] });
  await publicClient().waitForTransactionReceipt({ hash });
  return { txHash: hash, address: account.address };
}

export async function withdrawAll() {
  requireDeployed();
  const { account, client } = wallet();
  const hash = await client.writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdrawAll', args: [] });
  await publicClient().waitForTransactionReceipt({ hash });
  return { txHash: hash, address: account.address };
}
