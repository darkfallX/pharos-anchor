import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineChain } from 'viem';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const NETWORKS_PATH = path.join(__dirname, '../../networks.json');

let _cache = null;

export function loadNetworksConfig() {
  if (_cache) return _cache;
  _cache = JSON.parse(fs.readFileSync(NETWORKS_PATH, 'utf8'));
  return _cache;
}

export function getActiveNetworkKey() {
  return process.env.PHAROS_NETWORK || loadNetworksConfig().defaultNetwork;
}

export function getNetwork(key = getActiveNetworkKey()) {
  const net = loadNetworksConfig().networks[key];
  if (!net) {
    throw new Error(`Unknown network "${key}". Available: ${Object.keys(loadNetworksConfig().networks).join(', ')}`);
  }
  return { key, ...net };
}

export function toViemChain(key = getActiveNetworkKey()) {
  const net = getNetwork(key);
  const rpc = process.env.PHAROS_RPC || net.rpcUrl;
  return defineChain({
    id: net.chainId,
    name: net.name,
    network: key,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: [rpc] }, public: { http: [rpc] } },
    blockExplorers: net.explorer ? { default: { name: net.name, url: net.explorer } } : undefined,
  });
}

export function getChainMeta(key = getActiveNetworkKey()) {
  const net = getNetwork(key);
  return {
    key,
    chainId: net.chainId,
    name: net.name,
    rpc: process.env.PHAROS_RPC || net.rpcUrl,
    explorer: net.explorer || null,
  };
}
