import { useState, useEffect } from 'react';
import {
  classifyScript,
  hexToBytes,
  parseScript,
  bytesToHex,
  publicKeyToAddress,
} from 'bitok';
import type { BitokRpc, RawTransaction } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { encodeConfirmation } from '../../utils/contractString';
import { findSpentOutputs } from '../../utils/txout';
import { Button } from '../../components/Button';
import {
  RefreshCw,
  Shield,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import styles from './EscrowListTab.module.css';

interface EscrowRecord {
  txid: string;
  vout: number;
  scriptHex: string;
  value: number;
  confirmations: number;
  time: number;
  pubkeys: string[];
  addresses: string[];
  myRole: string;
  spent: boolean;
}

interface EscrowListTabProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  onSpend?: (contractStr: string) => void;
}

function parseMultisigScript(scriptHex: string): {
  m: number;
  n: number;
  pubkeys: string[];
  addresses: string[];
} | null {
  try {
    const bytes = hexToBytes(scriptHex);
    const type = classifyScript(bytes);
    if (type !== 'multisig') return null;
    const tokens = parseScript(bytes);
    if (tokens.length < 4) return null;

    const mToken = tokens[0];
    const nToken = tokens[tokens.length - 2];
    if (!mToken.opcode || !nToken.opcode) return null;

    const OP_1 = 0x51;
    const m = mToken.opcode - OP_1 + 1;
    const n = nToken.opcode - OP_1 + 1;

    const pubkeys: string[] = [];
    const addresses: string[] = [];
    for (let i = 1; i < tokens.length - 2; i++) {
      const tok = tokens[i];
      if (tok.data && tok.data.length === 65) {
        pubkeys.push(bytesToHex(tok.data));
        try {
          addresses.push(publicKeyToAddress(tok.data));
        } catch {
          addresses.push('');
        }
      }
    }

    if (pubkeys.length !== n) return null;
    return { m, n, pubkeys, addresses };
  } catch {
    return null;
  }
}

function generateConfirmation(escrow: EscrowRecord): string {
  return encodeConfirmation({
    scriptHex: escrow.scriptHex,
    fundingTxid: escrow.txid,
    fundingVout: escrow.vout,
    fundedAmount: escrow.value.toFixed(8),
  });
}

function determineRole(walletAddress: string, addresses: string[]): string {
  const idx = addresses.indexOf(walletAddress);
  if (idx === 0) return 'Buyer';
  if (idx === 1) return 'Seller';
  if (idx === 2) return 'Arbitrator';
  return 'Participant';
}

export function EscrowListTab({ wallet, rpc, onSpend }: EscrowListTabProps) {
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState('');
  const [allTxids, setAllTxids] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);

  async function scanEscrows() {
    setLoading(true);
    setError(null);
    setEscrows([]);
    setScannedCount(0);
    setScanComplete(false);

    try {
      const txids = await rpc.getAddressTxids(wallet.address);
      const sorted = [...txids].reverse();
      setAllTxids(sorted);

      const found: EscrowRecord[] = [];
      const allRawTxs: RawTransaction[] = [];
      const batchSize = 10;

      for (let i = 0; i < sorted.length; i += batchSize) {
        const batch = sorted.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(txid =>
            (rpc.getRawTransaction(txid, 1) as Promise<RawTransaction>).catch(() => null)
          )
        );

        for (const raw of results) {
          if (!raw) continue;
          allRawTxs.push(raw);
          processTransaction(raw, wallet.address, wallet.publicKeyHex, found);
        }

        setScannedCount(Math.min(i + batchSize, sorted.length));
        setEscrows([...found]);
      }

      if (found.length > 0) {
        const spent = findSpentOutputs(allRawTxs, found);
        for (const e of found) {
          e.spent = spent.has(`${e.txid}:${e.vout}`);
        }
        setEscrows([...found]);
      }

      setScanComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan escrows');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scanEscrows();
  }, [wallet.address]);

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  function toggleExpand(key: string) {
    setExpandedKey(prev => (prev === key ? null : key));
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>My Escrows</div>
          <div className={styles.subtitle}>
            {scanComplete
              ? `Found ${escrows.length} escrow${escrows.length !== 1 ? 's' : ''} in ${allTxids.length} transaction${allTxids.length !== 1 ? 's' : ''}`
              : loading
              ? `Scanning... ${scannedCount} / ${allTxids.length || '?'} transactions`
              : 'Scan blockchain for 2-of-3 escrows where you participate'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          loading={loading}
          onClick={scanEscrows}
        >
          Scan
        </Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && escrows.length === 0 ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Scanning blockchain for escrows...</span>
          {allTxids.length > 0 && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(scannedCount / allTxids.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : escrows.length === 0 && scanComplete ? (
        <div className={styles.empty}>
          <Shield size={32} strokeWidth={1.5} style={{ color: 'var(--color-neutral-600)' }} />
          <div className={styles.emptyTitle}>No Escrows Found</div>
          <div className={styles.emptyDesc}>
            No 2-of-3 multisig outputs found where your key participates.
            Create an escrow from the Create tab, or ask a counterparty to share a confirmation.
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {escrows.map(e => {
            const key = `${e.txid}:${e.vout}`;
            return (
              <EscrowRow
                key={key}
                escrow={e}
                expanded={expandedKey === key}
                onToggle={() => toggleExpand(key)}
                copiedField={copiedField}
                onCopy={copyToClipboard}
                walletAddress={wallet.address}
                onSpend={onSpend}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function processTransaction(
  raw: RawTransaction,
  walletAddress: string,
  walletPubKeyHex: string,
  found: EscrowRecord[]
) {
  for (const out of raw.vout) {
    if (!out.scriptPubKey) continue;

    const info = parseMultisigScript(out.scriptPubKey);
    if (!info) continue;
    if (info.m !== 2 || info.n !== 3) continue;

    const participates =
      info.pubkeys.includes(walletPubKeyHex) ||
      info.addresses.includes(walletAddress);

    if (!participates) continue;

    found.push({
      txid: raw.txid,
      vout: out.n,
      scriptHex: out.scriptPubKey,
      value: out.value,
      confirmations: raw.confirmations ?? 0,
      time: raw.blocktime ?? 0,
      pubkeys: info.pubkeys,
      addresses: info.addresses,
      myRole: determineRole(walletAddress, info.addresses),
      spent: false,
    });
  }
}

function EscrowRow({
  escrow: e,
  expanded,
  onToggle,
  copiedField,
  onCopy,
  walletAddress,
  onSpend,
}: {
  escrow: EscrowRecord;
  expanded: boolean;
  onToggle: () => void;
  copiedField: string;
  onCopy: (text: string, field: string) => void;
  walletAddress: string;
  onSpend?: (contractStr: string) => void;
}) {
  const key = `${e.txid}:${e.vout}`;
  const date = e.time ? new Date(e.time * 1000) : null;
  const labels = ['Buyer', 'Seller', 'Arbitrator'];

  function CopyBtn({ text, field }: { text: string; field: string }) {
    const fieldKey = `${key}-${field}`;
    const copied = copiedField === fieldKey;
    return (
      <button
        className={`${styles.copyBtn} ${copied ? styles.copiedBtn : ''}`}
        onClick={ev => {
          ev.stopPropagation();
          onCopy(text, fieldKey);
        }}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    );
  }

  const confirmation = generateConfirmation(e);

  return (
    <div className={`${styles.escrowRow} ${e.spent ? styles.escrowRowSpent : ''}`}>
      <div className={styles.escrowHeader} onClick={onToggle}>
        <div className={styles.escrowIcon}>
          <Shield size={16} />
        </div>

        <div className={styles.escrowMain}>
          <div className={styles.escrowTitle}>
            2-of-3 Escrow
            <span className={styles.roleBadge}>{e.myRole}</span>
            {e.spent && <span className={styles.spentBadge}>Spent</span>}
          </div>
          <div className={styles.escrowSub}>
            <span className={styles.txidShort}>{e.txid.slice(0, 12)}...{e.txid.slice(-6)}</span>
            <span className={styles.dot}>:</span>
            <span>{e.vout}</span>
            {e.confirmations > 0 && (
              <>
                <span className={styles.dot}>&middot;</span>
                <span>{e.confirmations} conf</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.escrowRight}>
          <div className={styles.escrowAmount}>{e.value.toFixed(8)} BITOK</div>
          {date && <div className={styles.escrowDate}>{formatDate(date)}</div>}
        </div>

        <div className={styles.expandIcon}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.escrowDetails} onClick={ev => ev.stopPropagation()}>
          <DetailRow label="Transaction ID" value={e.txid} mono>
            <CopyBtn text={e.txid} field="txid" />
          </DetailRow>
          <DetailRow label="Output Index" value={String(e.vout)} />
          <DetailRow label="Locked Value" value={`${e.value.toFixed(8)} BITOK`} />
          {date && <DetailRow label="Date" value={date.toLocaleString()} />}
          <DetailRow label="Confirmations" value={String(e.confirmations)} />

          <div className={styles.partiesSection}>
            <div className={styles.partiesLabel}>Participants</div>
            {e.addresses.map((addr, i) => (
              <div key={i} className={styles.partyRow}>
                <span className={styles.partyLabel}>{labels[i]}</span>
                <span className={styles.partyAddr}>{addr || e.pubkeys[i].slice(0, 20) + '...'}</span>
                {addr === walletAddress && <span className={styles.youBadge}>You</span>}
              </div>
            ))}
          </div>

          <div className={styles.contractSection}>
            <div className={styles.contractLabel}>Confirmation</div>
            <div className={styles.contractBox}>{confirmation}</div>
            <CopyBtn text={confirmation} field="confirmation" />
          </div>

          <div className={styles.detailActions}>
            {e.spent && (
              <div className={styles.spentNotice}>
                This output has already been spent.
              </div>
            )}
            {!e.spent && e.value > 0 && onSpend && (
              <button
                className={styles.actionBtn}
                onClick={ev => {
                  ev.stopPropagation();
                  onSpend(confirmation);
                }}
              >
                <ArrowRight size={13} />
                Spend
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <div className={styles.detailValueWrap}>
        <span className={`${styles.detailValue} ${mono ? styles.mono : ''}`}>{value}</span>
        {children}
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
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
