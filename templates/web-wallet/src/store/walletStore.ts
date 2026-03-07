import type { StoredWallet, RpcSettings } from '../types/wallet';

const WALLET_KEY = 'bitok_wallet';
const RPC_KEY = 'bitok_rpc';
const DEVMODE_KEY = 'bitok_devmode';

const DEFAULT_RPC: RpcSettings = {
  host: import.meta.env.VITE_RPC_HOST || '127.0.0.1',
  port: parseInt(import.meta.env.VITE_RPC_PORT) || 8332,
  user: import.meta.env.VITE_RPC_USER || 'rpcuser',
  password: import.meta.env.VITE_RPC_PASS || 'rpcpassword',
  protocol: (import.meta.env.VITE_RPC_PROTOCOL as 'http' | 'https') || 'http',
};

export function loadWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isLegacyWallet(wallet: StoredWallet): boolean {
  return !wallet.encryptedWIF && !!wallet.wif;
}

export function saveWallet(wallet: StoredWallet): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { wif: _wif, ...persisted } = wallet;
  localStorage.setItem(WALLET_KEY, JSON.stringify(persisted));
}

export function saveLegacyWallet(wallet: StoredWallet): void {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
}

export function removeWallet(): void {
  localStorage.removeItem(WALLET_KEY);
}

export function loadRpcSettings(): RpcSettings {
  try {
    const raw = localStorage.getItem(RPC_KEY);
    return raw ? { ...DEFAULT_RPC, ...JSON.parse(raw) } : DEFAULT_RPC;
  } catch {
    return DEFAULT_RPC;
  }
}

export function saveRpcSettings(settings: RpcSettings): void {
  localStorage.setItem(RPC_KEY, JSON.stringify(settings));
}

export function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEVMODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveDevMode(enabled: boolean): void {
  localStorage.setItem(DEVMODE_KEY, enabled ? 'true' : 'false');
}

export { DEFAULT_RPC };
