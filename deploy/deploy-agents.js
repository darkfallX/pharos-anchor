#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { toViemChain, getNetwork } from '../src/config/networks.js';
import { compileAnchor } from './compile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const NETWORK_KEY = 'pharos-atlantic';
const APY_BPS = BigInt(process.env.ANCHOR_APY_BPS || '1290');

function requirePrivateKey() {
  const key = process.env.PRIVATE_KEY;
  if (!key || key.includes('YOUR_PRIVATE_KEY')) {
    console.error('Error: set PRIVATE_KEY (a testnet burner) before deploying.');
    process.exit(1);
  }
  return key.startsWith('0x') ? key : `0x${key}`;
}

function upsertEnv(vars) {
  const ENV_PATH = path.join(ROOT, '.env');
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  for (const [k, v] of Object.entries(vars)) {
    const line = `${k}=${v}`;
    if (new RegExp(`^${k}=.*`, 'm').test(content)) content = content.replace(new RegExp(`^${k}=.*`, 'm'), line);
    else content += `\n${line}`;
  }
  fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function main() {
  const usdAddress = process.env.ANCHOR_USD_ADDRESS;
  if (!usdAddress) {
    console.error('Error: ANCHOR_USD_ADDRESS not set. Run npm run deploy first.');
    process.exit(1);
  }

  const net = getNetwork(NETWORK_KEY);
  const chain = toViemChain(NETWORK_KEY);
  const account = privateKeyToAccount(requirePrivateKey());
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account, chain, transport: http() });

  console.log('AnchorAgentVault deploy');
  console.log(`  Chain: ${net.name} (${net.chainId})`);
  console.log(`  aUSD:  ${usdAddress}`);
  console.log(`  APY:   ${Number(APY_BPS) / 100}%`);

  const { agents } = compileAnchor();
  const hash = await walletClient.deployContract({ abi: agents.abi, bytecode: agents.bytecode, args: [usdAddress, APY_BPS] });
  console.log(`  tx:    ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('deployment failed');

  const address = receipt.contractAddress;
  upsertEnv({ ANCHOR_AGENT_VAULT_ADDRESS: address });

  const artifactDir = path.join(ROOT, 'deploy', 'artifacts');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, 'agent-vault.json'),
    JSON.stringify({ network: NETWORK_KEY, chainId: net.chainId, address, usd: usdAddress, apyBps: Number(APY_BPS), txHash: hash }, null, 2)
  );

  console.log('\nAnchorAgentVault deployed');
  console.log(`  Address:  ${address}`);
  console.log(`  Explorer: ${net.explorer}/address/${address}`);
  console.log('  Saved to .env and deploy/artifacts/agent-vault.json');
}

main().catch((err) => { console.error('\nDeploy failed:', err.message || err); process.exit(1); });
