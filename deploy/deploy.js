#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { toViemChain, getNetwork } from '../src/config/networks.js';
import { compileAnchor } from './compile.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

const NETWORK_KEY = 'pharos-atlantic';
const APY_BPS = BigInt(process.env.ANCHOR_APY_BPS || '1290'); // 12.9% net, mirrors pAlpha
const SEED_MINT = BigInt(process.env.ANCHOR_SEED_MINT || '100000000'); // 100 aUSD (6 decimals)

function requirePrivateKey() {
  const key = process.env.PRIVATE_KEY;
  if (!key || key.includes('YOUR_PRIVATE_KEY')) {
    console.error('Error: set PRIVATE_KEY (a testnet burner) before deploying.');
    process.exit(1);
  }
  return key.startsWith('0x') ? key : `0x${key}`;
}

function upsertEnv(vars) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) content = fs.readFileSync(ENV_PATH, 'utf8');
  else if (fs.existsSync(ENV_EXAMPLE_PATH)) content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');

  for (const [k, v] of Object.entries(vars)) {
    const line = `${k}=${v}`;
    if (new RegExp(`^${k}=.*`, 'm').test(content)) {
      content = content.replace(new RegExp(`^${k}=.*`, 'm'), line);
    } else {
      content += `\n${line}`;
    }
  }
  fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function deployOne(clients, label, abi, bytecode, args) {
  const { walletClient, publicClient } = clients;
  console.log(`\nDeploying ${label}...`);
  const hash = await walletClient.deployContract({ abi, bytecode, args });
  console.log(`  tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`${label} deployment failed`);
  }
  console.log(`  ${label}: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function main() {
  const net = getNetwork(NETWORK_KEY);
  const chain = toViemChain(NETWORK_KEY);

  console.log('Anchor testnet deploy');
  console.log('---------------------');
  console.log(`Chain:  ${net.name} (${net.chainId})`);
  console.log(`RPC:    ${chain.rpcUrls.default.http[0]}`);
  console.log(`APY:    ${Number(APY_BPS) / 100}%`);

  const account = privateKeyToAccount(requirePrivateKey());
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account, chain, transport: http() });
  const clients = { publicClient, walletClient };

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Wallet: ${account.address}`);
  console.log(`Gas:    ${balance} wei (${chain.nativeCurrency.symbol})`);
  if (balance === 0n) {
    console.warn(`\nWarning: wallet has zero ${chain.nativeCurrency.symbol}. Get testnet gas first or deploy will fail.`);
  }

  const { usd, vault } = compileAnchor();

  const usdAddress = await deployOne(clients, 'AnchorTestUSD', usd.abi, usd.bytecode, []);
  const vaultAddress = await deployOne(clients, 'AnchorVault', vault.abi, vault.bytecode, [usdAddress, APY_BPS]);

  if (SEED_MINT > 0n) {
    console.log(`\nMinting ${Number(SEED_MINT) / 1e6} aUSD to deployer...`);
    const mintHash = await walletClient.writeContract({
      address: usdAddress,
      abi: usd.abi,
      functionName: 'mint',
      args: [account.address, SEED_MINT],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log('  minted');
  }

  upsertEnv({
    PHAROS_NETWORK: NETWORK_KEY,
    ANCHOR_USD_ADDRESS: usdAddress,
    ANCHOR_VAULT_ADDRESS: vaultAddress,
  });

  const artifactDir = path.join(ROOT, 'deploy', 'artifacts');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, 'anchor.json'),
    JSON.stringify(
      { network: NETWORK_KEY, chainId: net.chainId, usd: usdAddress, vault: vaultAddress, apyBps: Number(APY_BPS) },
      null,
      2
    )
  );

  console.log('\nAnchor deployed to testnet');
  console.log(`  aUSD:     ${usdAddress}`);
  console.log(`  Vault:    ${vaultAddress}`);
  console.log(`  Explorer: ${net.explorer}/address/${vaultAddress}`);
  console.log('  Saved to .env and deploy/artifacts/anchor.json');
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
