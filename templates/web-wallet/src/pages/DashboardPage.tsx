import { useState, useEffect } from 'react';
import { BitokRpc, satoshisToBitok } from 'bitok';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Copy, Check, WifiOff, Clock } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { StoredWallet } from '../types/wallet';
import { getPendingTxs, clearConfirmedPending } from '../store/pendingTxStore';
import type { PendingTx } from '../store/pendingTxStore';
import styles from './DashboardPage.module.css';

interface DashboardPageProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  onNavigate: (view: 'send' | 'receive') => void;
  refreshKey?: number;
}

interface NodeInfo {
  balance: number;
  blocks: number;
  connections: number;
  difficulty: number;
}

const POLL_INTERVAL_MS = 30_000;

export function DashboardPage({ wallet, rpc, onNavigate, refreshKey }: DashboardPageProps) {
  const [info, setInfo] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [pendingTxs, setPendingTxs] = useState<PendingTx[]>(() => getPendingTxs(wallet.address));

  async function fetchInfo() {
    setLoading(true);
    setError(null);
    try {
      const [nodeInfo, balanceSatoshis, txids] = await Promise.all([
        rpc.getInfo(),
        rpc.getAddressBalance(wallet.address),
        rpc.getAddressTxids(wallet.address).catch(() => [] as string[]),
      ]);
      const confirmedSet = new Set(txids);
      clearConfirmedPending(wallet.address, confirmedSet);
      const remaining = getPendingTxs(wallet.address);
      setPendingTxs(remaining);
      setInfo({
        balance: satoshisToBitok(balanceSatoshis),
        blocks: nodeInfo.blocks,
        connections: nodeInfo.connections,
        difficulty: nodeInfo.difficulty,
      });
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to node');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rpc, wallet.address, refreshKey]);

  function copyAddress() {
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const shortAddress = `${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)}`;

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{wallet.label}</h1>
          <p className={styles.pageSubtitle}>Bitok Network Dashboard</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          loading={loading}
          onClick={fetchInfo}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <WifiOff size={16} />
          <div>
            <strong>Node Unreachable</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      <Card>
        <div className={styles.balanceCard}>
          <div className={styles.balanceLabel}>Wallet Balance</div>
          <div className={styles.balanceAmount}>
            {info !== null ? (
              <>
                <span className={styles.balanceNumber}>{info.balance.toFixed(4)}</span>
                <span className={styles.balanceCurrency}>BITOK</span>
              </>
            ) : (
              <span className={styles.balancePlaceholder}>—</span>
            )}
          </div>
          {pendingTxs.length > 0 && (
            <div className={styles.pendingList}>
              {pendingTxs.map(tx => {
                const isSend = tx.category === 'send';
                const sign = isSend ? '−' : '+';
                return (
                  <div key={tx.txid} className={styles.pendingRow}>
                    <Clock size={11} className={styles.pendingIcon} />
                    <span className={styles.pendingLabel}>Unconfirmed</span>
                    <span className={`${styles.pendingAmount} ${isSend ? styles.pendingAmountSend : styles.pendingAmountReceive}`}>
                      {sign}{tx.amount.toFixed(4)} BITOK
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <button className={styles.addressRow} onClick={copyAddress}>
            <span className={styles.addressText}>{shortAddress}</span>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>

        <div className={styles.quickActions}>
          <Button
            variant="primary"
            icon={<ArrowUpRight size={16} />}
            onClick={() => onNavigate('send')}
          >
            Send
          </Button>
          <Button
            variant="secondary"
            icon={<ArrowDownLeft size={16} />}
            onClick={() => onNavigate('receive')}
          >
            Receive
          </Button>
        </div>
      </Card>

      <div className={styles.statsGrid}>
        <StatCard
          label="Block Height"
          value={info?.blocks?.toLocaleString() ?? '—'}
          icon="⛓"
        />
        <StatCard
          label="Connections"
          value={info?.connections?.toString() ?? '—'}
          icon={info && info.connections > 0 ? '🌐' : '⚪'}
          status={info && info.connections > 0 ? 'ok' : info !== null ? 'warn' : undefined}
        />
        <StatCard
          label="Difficulty"
          value={info ? formatDifficulty(info.difficulty) : '—'}
          icon="⚡"
        />
        <StatCard
          label="Node Status"
          value={info !== null ? 'Online' : error ? 'Offline' : '—'}
          icon={info !== null ? '✓' : '✗'}
          status={info !== null ? 'ok' : error ? 'error' : undefined}
        />
      </div>

      {lastRefresh && (
        <p className={styles.lastRefresh}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, status }: { label: string; value: string; icon: string; status?: 'ok' | 'warn' | 'error' }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={`${styles.statValue} ${status ? styles[`status-${status}`] : ''}`}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function formatDifficulty(d: number): string {
  if (d >= 1e12) return `${(d / 1e12).toFixed(0)}T`;
  if (d >= 1e9) return `${(d / 1e9).toFixed(0)}G`;
  if (d >= 1e6) return `${(d / 1e6).toFixed(0)}M`;
  if (d >= 1e3) return `${(d / 1e3).toFixed(0)}K`;
  return d.toFixed(0);
}
