export type WalletView =
  | 'setup'
  | 'dashboard'
  | 'send'
  | 'receive'
  | 'escrow'
  | 'history'
  | 'settings'
  | 'contracts'
  | 'my-contracts'
  | 'script-builder'
  | 'script-debugger'
  | 'tx-builder'
  | 'decode'
  | 'explorer';

export interface StoredWallet {
  address: string;
  publicKeyHex: string;
  encryptedWIF?: string;
  label: string;
  createdAt: number;
  wif?: string;
}

export interface RpcSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  protocol: 'http' | 'https';
}

export interface AppState {
  wallet: StoredWallet | null;
  rpcSettings: RpcSettings;
  connected: boolean;
}

export interface TxHistoryItem {
  txid: string;
  amount: number;
  confirmations: number;
  time: number;
  category: 'send' | 'receive' | 'generate';
  address: string;
  fee?: number;
}
