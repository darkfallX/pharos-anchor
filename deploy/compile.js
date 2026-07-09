import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS = path.join(__dirname, '..', 'contracts');

export function compileAnchor() {
  const sources = {
    'AnchorTestUSD.sol': { content: fs.readFileSync(path.join(CONTRACTS, 'AnchorTestUSD.sol'), 'utf8') },
    'AnchorVault.sol': { content: fs.readFileSync(path.join(CONTRACTS, 'AnchorVault.sol'), 'utf8') },
    'AnchorAgentVault.sol': { content: fs.readFileSync(path.join(CONTRACTS, 'AnchorAgentVault.sol'), 'utf8') },
  };

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };

  const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (compiled.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));

  const usd = compiled.contracts['AnchorTestUSD.sol'].AnchorTestUSD;
  const vault = compiled.contracts['AnchorVault.sol'].AnchorVault;
  const agents = compiled.contracts['AnchorAgentVault.sol'].AnchorAgentVault;

  return {
    usd: { abi: usd.abi, bytecode: `0x${usd.evm.bytecode.object}` },
    vault: { abi: vault.abi, bytecode: `0x${vault.evm.bytecode.object}` },
    agents: { abi: agents.abi, bytecode: `0x${agents.evm.bytecode.object}` },
  };
}

if (process.argv[1] && process.argv[1].endsWith('compile.js')) {
  const { usd, vault, agents } = compileAnchor();
  console.log(`AnchorTestUSD:    ${usd.bytecode.length} chars, ${usd.abi.length} abi entries`);
  console.log(`AnchorVault:      ${vault.bytecode.length} chars, ${vault.abi.length} abi entries`);
  console.log(`AnchorAgentVault: ${agents.bytecode.length} chars, ${agents.abi.length} abi entries`);
  console.log('Compile OK');
}
