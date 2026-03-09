const PENDING_KEY = 'bitok_pending_txs';

export interface PendingTx {
  txid: string;
  amount: number;
  fee: number;
  category: 'send' | 'receive' | 'generate';
  address: string;
  time: number;
}

function load(): PendingTx[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(txs: PendingTx[]): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(txs));
}

export function addPendingTx(tx: PendingTx): void {
  const existing = load();
  if (existing.some(t => t.txid === tx.txid)) return;
  save([tx, ...existing]);
}

export function removePendingTx(txid: string): void {
  save(load().filter(t => t.txid !== txid));
}

export function getPendingTxs(address: string): PendingTx[] {
  return load().filter(t => t.address === address);
}

export function clearConfirmedPending(address: string, confirmedTxids: Set<string>): void {
  const remaining = load().filter(t => t.address !== address || !confirmedTxids.has(t.txid));
  save(remaining);
}

export function clearAllPendingForAddress(address: string): void {
  save(load().filter(t => t.address !== address));
}
