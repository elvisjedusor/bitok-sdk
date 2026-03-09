import { useState, useEffect, useRef, useCallback } from 'react';
import { BitokRpc } from 'bitok';
import type { RawTransaction } from 'bitok';
import { ArrowUpRight, ArrowDownLeft, Zap, RefreshCw, Clock } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { TxHistoryItem } from '../types/wallet';
import { clearConfirmedPending } from '../store/pendingTxStore';
import type { PendingTx } from '../store/pendingTxStore';
import { useMempool } from '../hooks/useMempool';
import { cachedGetAddressTxids, cachedGetRawTransaction } from '../utils/cachedRpc';
import styles from './HistoryPage.module.css';

interface HistoryPageProps {
  rpc: BitokRpc;
  address: string;
}

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 120_000;

export function HistoryPage({ rpc, address }: HistoryPageProps) {
  const [txs, setTxs] = useState<TxHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [allTxids, setAllTxids] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingRef = useRef(false);

  const mempool = useMempool(rpc, address);

  async function fetchPageItems(txids: string[], walletAddr: string): Promise<TxHistoryItem[]> {
    return Promise.all(txids.map(txid => resolveItemWithRpc(rpc, txid, walletAddr)));
  }

  const fetchTxids = useCallback(async (showSpinner: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const txids = await cachedGetAddressTxids(rpc, address);
      const sorted = [...txids].reverse();
      const confirmedSet = new Set(txids);
      clearConfirmedPending(address, confirmedSet);
      setAllTxids(sorted);
      const items = await fetchPageItems(sorted.slice(0, PAGE_SIZE), address);
      items.sort((a, b) => b.time - a.time);
      setTxs(items);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      fetchingRef.current = false;
      setRefreshing(false);
    }
  }, [rpc, address]);

  async function loadMore() {
    const start = page * PAGE_SIZE;
    const slice = allTxids.slice(start, start + PAGE_SIZE);
    if (!slice.length) return;
    setLoadingMore(true);
    try {
      const items = await fetchPageItems(slice, address);
      items.sort((a, b) => b.time - a.time);
      setTxs(prev => [...prev, ...items]);
      setPage(p => p + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchTxids(txs.length === 0);
    const interval = setInterval(() => fetchTxids(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTxids]);

  function handleRefresh() {
    fetchTxids(true);
    mempool.refresh();
  }

  const pendingTxs = mempool.pendingTxs;

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Transaction History</h1>
          <p className={styles.pageSubtitle}>Recent wallet activity from your node</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={refreshing || mempool.loading} onClick={handleRefresh}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className={styles.errorBanner}>{error}</div>
      )}

      {pendingTxs.length > 0 && (
        <Card>
          <div className={styles.pendingSection}>
            <div className={styles.pendingSectionHeader}>
              <Clock size={13} />
              <span>Unconfirmed — in mempool</span>
            </div>
            <div className={styles.txList}>
              {pendingTxs.map(tx => (
                <PendingRow key={tx.txid} tx={tx} />
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        {refreshing && txs.length === 0 ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading transactions...</span>
          </div>
        ) : txs.length === 0 && pendingTxs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>{'\ud83d\udced'}</div>
            <div className={styles.emptyTitle}>No transactions yet</div>
            <div className={styles.emptyDesc}>Transactions will appear here once your node is connected.</div>
          </div>
        ) : txs.length === 0 ? null : (
          <div className={styles.txList}>
            {txs.map(tx => (
              <TxRow key={tx.txid} tx={tx} />
            ))}
          </div>
        )}
      </Card>

      {txs.length < allTxids.length && (
        <div className={styles.loadMore}>
          <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

async function resolveItemWithRpc(rpc: BitokRpc, txid: string, walletAddress: string): Promise<TxHistoryItem> {
  const raw = await cachedGetRawTransaction(rpc, txid, 1) as RawTransaction;
  const isCoinbase = raw.vin.some(v => v.coinbase !== undefined);

  if (isCoinbase) {
    const amount = raw.vout.filter(o => o.address === walletAddress).reduce((s, o) => s + o.value, 0);
    return { txid, amount, confirmations: raw.confirmations ?? 0, time: raw.blocktime ?? 0, category: 'generate', address: walletAddress };
  }

  const prevTxs = await Promise.all(
    raw.vin
      .filter(v => v.txid)
      .map(v => (cachedGetRawTransaction(rpc, v.txid!, 1) as Promise<RawTransaction>).catch(() => null))
  );

  const spendableVins = raw.vin.filter(v => v.txid);
  const isSend = prevTxs.some((prev, i) => {
    if (!prev) return false;
    const voutIndex = spendableVins[i]?.vout ?? 0;
    const prevOut = (prev as RawTransaction).vout[voutIndex];
    return prevOut?.address === walletAddress;
  });

  const sentToOthers = raw.vout.filter(o => o.address !== walletAddress).reduce((s, o) => s + o.value, 0);
  const receivedAmount = raw.vout.filter(o => o.address === walletAddress).reduce((s, o) => s + o.value, 0);

  if (isSend) {
    return { txid, amount: sentToOthers, confirmations: raw.confirmations ?? 0, time: raw.blocktime ?? 0, category: 'send', address: walletAddress };
  }

  return { txid, amount: receivedAmount, confirmations: raw.confirmations ?? 0, time: raw.blocktime ?? 0, category: 'receive', address: walletAddress };
}

function TxRow({ tx }: { tx: TxHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const isReceive = tx.category === 'receive' || tx.category === 'generate';
  const sign = isReceive ? '+' : '-';
  const absAmount = Math.abs(tx.amount);
  const date = new Date(tx.time * 1000);

  return (
    <div className={styles.txRow} onClick={() => setExpanded(!expanded)}>
      <div className={styles.txIcon}>
        {tx.category === 'generate'
          ? <Zap size={16} className={styles.iconGenerate} />
          : isReceive
          ? <ArrowDownLeft size={16} className={styles.iconReceive} />
          : <ArrowUpRight size={16} className={styles.iconSend} />}
      </div>

      <div className={styles.txMain}>
        <div className={styles.txTitle}>
          {tx.category === 'generate' ? 'Mined' : isReceive ? 'Received' : 'Sent'}
        </div>
        <div className={styles.txSub}>
          <span className={styles.txid}>{tx.txid.slice(0, 16)}...</span>
          <span>.</span>
          <span>{tx.confirmations} conf</span>
        </div>
      </div>

      <div className={styles.txRight}>
        <div className={`${styles.txAmount} ${isReceive ? styles.amountPositive : styles.amountNegative}`}>
          {sign}{absAmount.toFixed(8)}
        </div>
        <div className={styles.txDate}>{formatDate(date)}</div>
      </div>

      {expanded && (
        <div className={styles.txDetails} onClick={e => e.stopPropagation()}>
          <Detail label="Transaction ID" value={tx.txid} mono />
          <Detail label="Address" value={tx.address} mono />
          {tx.fee !== undefined && <Detail label="Fee" value={`${tx.fee.toFixed(8)} BITOK`} />}
          <Detail label="Confirmations" value={tx.confirmations.toString()} />
          <Detail label="Date" value={date.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={`${styles.detailValue} ${mono ? styles.detailMono : ''}`}>{value}</span>
    </div>
  );
}

function PendingRow({ tx }: { tx: PendingTx }) {
  const isReceive = tx.category === 'receive';
  const sign = isReceive ? '+' : '-';
  const date = new Date(tx.time * 1000);

  return (
    <div className={`${styles.txRow} ${styles.txRowPending}`}>
      <div className={styles.txIcon}>
        <Clock size={16} className={styles.iconPending} />
      </div>
      <div className={styles.txMain}>
        <div className={styles.txTitle}>
          {isReceive ? 'Receiving' : 'Sending'}
          <span className={styles.pendingBadge}>In Mempool</span>
        </div>
        <div className={styles.txSub}>
          <span className={styles.txid}>{tx.txid.slice(0, 16)}...</span>
          <span>.</span>
          <span>0 conf</span>
        </div>
      </div>
      <div className={styles.txRight}>
        <div className={`${styles.txAmount} ${isReceive ? styles.amountPositive : styles.amountNegative} ${styles.amountPending}`}>
          {sign}{tx.amount.toFixed(8)}
        </div>
        <div className={styles.txDate}>{formatDate(date)}</div>
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
