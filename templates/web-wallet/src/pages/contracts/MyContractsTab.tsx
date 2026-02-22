import { useState, useEffect } from 'react';
import { classifyScript, hexToBytes, decodeOpReturn } from 'bitok';
import type { BitokRpc, RawTransaction, ScriptType } from 'bitok';
import { findSpentOutputs } from '../../utils/txout';
import { Button } from '../../components/Button';
import {
  RefreshCw,
  Lock,
  Users,
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Unlock,
  ArrowRight,
} from 'lucide-react';
import styles from './MyContractsTab.module.css';

export interface ContractAction {
  type: 'claim-hashlock' | 'claim-htlc' | 'spend-multisig';
  scriptHex: string;
  txid: string;
  vout: number;
  amount: string;
  reqSigs?: number;
}

interface MyContractsTabProps {
  rpc: BitokRpc;
  address: string;
  onAction?: (action: ContractAction) => void;
}

export interface ContractRecord {
  txid: string;
  vout: number;
  scriptHex: string;
  scriptType: ScriptType;
  value: number;
  confirmations: number;
  time: number;
  role: 'creator' | 'recipient';
  opReturnText?: string;
  opReturnHex?: string;
  reqSigs?: number;
  spent: boolean;
}

type FilterType = 'all' | 'hashlock' | 'multisig' | 'nulldata';

const SCRIPT_TYPE_LABELS: Record<string, string> = {
  hashlock: 'Hashlock',
  'hashlock-sha256': 'Hashlock (SHA256)',
  multisig: 'Multisig',
  nulldata: 'OP_RETURN',
  'cat-covenant': 'CAT Covenant',
  'cat-hash': 'CAT Hash',
  'cat-script': 'CAT Script',
  arithmetic: 'Arithmetic',
  bitwise: 'Bitwise',
  'bitwise-sig': 'Bitwise + Sig',
  splice: 'Splice',
  nonstandard: 'Custom Script',
};

const CONTRACT_TYPES: ScriptType[] = [
  'hashlock',
  'hashlock-sha256',
  'multisig',
  'nulldata',
  'cat-covenant',
  'cat-hash',
  'cat-script',
  'arithmetic',
  'bitwise',
  'bitwise-sig',
  'splice',
  'nonstandard',
];

function isContractType(type: ScriptType): boolean {
  return CONTRACT_TYPES.includes(type);
}

export function MyContractsTab({ rpc, address, onAction }: MyContractsTabProps) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedTxid, setExpandedTxid] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState('');
  const [allTxids, setAllTxids] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);

  async function scanContracts() {
    setLoading(true);
    setError(null);
    setContracts([]);
    setScannedCount(0);
    setScanComplete(false);

    try {
      const txids = await rpc.getAddressTxids(address);
      const sorted = [...txids].reverse();
      setAllTxids(sorted);

      const found: ContractRecord[] = [];
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
          processTransaction(raw, address, found);
        }

        setScannedCount(Math.min(i + batchSize, sorted.length));
        setContracts([...found]);
      }

      const spendable = found.filter(c => c.scriptType !== 'nulldata');
      if (spendable.length > 0) {
        const spent = findSpentOutputs(allRawTxs, spendable);
        for (const c of found) {
          if (c.scriptType === 'nulldata') continue;
          c.spent = spent.has(`${c.txid}:${c.vout}`);
        }
        setContracts([...found]);
      }

      setScanComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan contracts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scanContracts();
  }, [address]);

  const filtered = contracts.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'hashlock') return c.scriptType === 'hashlock' || c.scriptType === 'hashlock-sha256';
    if (filter === 'multisig') return c.scriptType === 'multisig';
    if (filter === 'nulldata') return c.scriptType === 'nulldata';
    return true;
  });

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  function toggleExpand(key: string) {
    setExpandedTxid(prev => (prev === key ? null : key));
  }

  const hasHashlocks = contracts.some(c => c.scriptType === 'hashlock' || c.scriptType === 'hashlock-sha256');
  const hasMultisig = contracts.some(c => c.scriptType === 'multisig');
  const hasOpReturn = contracts.some(c => c.scriptType === 'nulldata');

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>My Contracts</div>
          <div className={styles.subtitle}>
            {scanComplete
              ? `Found ${contracts.length} contract${contracts.length !== 1 ? 's' : ''} in ${allTxids.length} transaction${allTxids.length !== 1 ? 's' : ''}`
              : loading
              ? `Scanning... ${scannedCount} / ${allTxids.length || '?'} transactions`
              : 'Scan your wallet transactions for contract outputs'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          loading={loading}
          onClick={scanContracts}
        >
          Scan
        </Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {contracts.length > 0 && (
        <div className={styles.filters}>
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} count={contracts.length}>
            All
          </FilterBtn>
          {hasHashlocks && (
            <FilterBtn
              active={filter === 'hashlock'}
              onClick={() => setFilter('hashlock')}
              count={contracts.filter(c => c.scriptType === 'hashlock' || c.scriptType === 'hashlock-sha256').length}
              icon={<Lock size={12} />}
            >
              Hashlock
            </FilterBtn>
          )}
          {hasMultisig && (
            <FilterBtn
              active={filter === 'multisig'}
              onClick={() => setFilter('multisig')}
              count={contracts.filter(c => c.scriptType === 'multisig').length}
              icon={<Users size={12} />}
            >
              Multisig
            </FilterBtn>
          )}
          {hasOpReturn && (
            <FilterBtn
              active={filter === 'nulldata'}
              onClick={() => setFilter('nulldata')}
              count={contracts.filter(c => c.scriptType === 'nulldata').length}
              icon={<FileText size={12} />}
            >
              OP_RETURN
            </FilterBtn>
          )}
        </div>
      )}

      {loading && contracts.length === 0 ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Scanning blockchain for contracts...</span>
          {allTxids.length > 0 && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(scannedCount / allTxids.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : filtered.length === 0 && scanComplete ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>
            {filter !== 'all' ? 'No matching contracts' : 'No contracts found'}
          </div>
          <div className={styles.emptyDesc}>
            {filter !== 'all'
              ? 'Try a different filter or scan again.'
              : 'Create and fund a contract from the Contracts page. Funded contracts will appear here automatically.'}
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(c => {
            const key = `${c.txid}:${c.vout}`;
            const isExpanded = expandedTxid === key;
            return (
              <ContractRow
                key={key}
                contract={c}
                expanded={isExpanded}
                onToggle={() => toggleExpand(key)}
                copiedField={copiedField}
                onCopy={copyToClipboard}
                onAction={onAction}
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
  found: ContractRecord[]
) {
  for (const out of raw.vout) {
    if (!out.scriptPubKey) continue;
    let scriptType: ScriptType;
    try {
      scriptType = classifyScript(hexToBytes(out.scriptPubKey));
    } catch {
      continue;
    }

    if (!isContractType(scriptType)) continue;
    if (scriptType === 'nonstandard') continue;

    const role: 'creator' | 'recipient' =
      out.address === walletAddress ? 'recipient' : 'creator';

    const record: ContractRecord = {
      txid: raw.txid,
      vout: out.n,
      scriptHex: out.scriptPubKey,
      scriptType,
      value: out.value,
      confirmations: raw.confirmations ?? 0,
      time: raw.blocktime ?? 0,
      role,
      spent: false,
    };

    if (scriptType === 'nulldata') {
      try {
        const decoded = decodeOpReturn(out.scriptPubKey);
        if (decoded) {
          record.opReturnText = decoded.dataText;
          record.opReturnHex = decoded.dataHex;
        }
      } catch {}
    }

    found.push(record);
  }
}

function ContractRow({
  contract: c,
  expanded,
  onToggle,
  copiedField,
  onCopy,
  onAction,
}: {
  contract: ContractRecord;
  expanded: boolean;
  onToggle: () => void;
  copiedField: string;
  onCopy: (text: string, field: string) => void;
  onAction?: (action: ContractAction) => void;
}) {
  const typeLabel = SCRIPT_TYPE_LABELS[c.scriptType] || c.scriptType;
  const date = c.time ? new Date(c.time * 1000) : null;
  const key = `${c.txid}:${c.vout}`;

  function CopyBtn({ text, field }: { text: string; field: string }) {
    const fieldKey = `${key}-${field}`;
    const copied = copiedField === fieldKey;
    return (
      <button
        className={`${styles.copyBtn} ${copied ? styles.copiedBtn : ''}`}
        onClick={e => {
          e.stopPropagation();
          onCopy(text, fieldKey);
        }}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    );
  }

  return (
    <div className={`${styles.contractRow} ${c.spent ? styles.contractRowSpent : ''}`}>
      <div className={styles.contractHeader} onClick={onToggle}>
        <div className={styles.contractIcon}>
          {c.scriptType === 'multisig' ? (
            <Users size={16} />
          ) : c.scriptType === 'nulldata' ? (
            <FileText size={16} />
          ) : (
            <Lock size={16} />
          )}
        </div>

        <div className={styles.contractMain}>
          <div className={styles.contractTitle}>
            {typeLabel}
            {c.spent && <span className={styles.spentBadge}>Spent</span>}
          </div>
          <div className={styles.contractSub}>
            <span className={styles.txidShort}>{c.txid.slice(0, 12)}...{c.txid.slice(-6)}</span>
            <span className={styles.dot}>:</span>
            <span>{c.vout}</span>
            {c.confirmations > 0 && (
              <>
                <span className={styles.dot}>&middot;</span>
                <span>{c.confirmations} conf</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.contractRight}>
          {c.scriptType !== 'nulldata' && (
            <div className={styles.contractAmount}>
              {c.value.toFixed(8)} BITOK
            </div>
          )}
          {date && (
            <div className={styles.contractDate}>{formatDate(date)}</div>
          )}
        </div>

        <div className={styles.expandIcon}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className={styles.contractDetails} onClick={e => e.stopPropagation()}>
          <DetailRow label="Transaction ID" value={c.txid} mono>
            <CopyBtn text={c.txid} field="txid" />
          </DetailRow>

          <DetailRow label="Output Index" value={String(c.vout)} />

          <DetailRow label="Script Type" value={typeLabel} />

          {c.scriptType !== 'nulldata' && (
            <DetailRow label="Locked Value" value={`${c.value.toFixed(8)} BITOK`} />
          )}

          <DetailRow label="Script Hex" value={c.scriptHex} mono>
            <CopyBtn text={c.scriptHex} field="script" />
          </DetailRow>

          {c.opReturnText && (
            <DetailRow label="Embedded Text" value={c.opReturnText}>
              <CopyBtn text={c.opReturnText} field="text" />
            </DetailRow>
          )}

          {c.opReturnHex && (
            <DetailRow label="Data Hex" value={c.opReturnHex} mono>
              <CopyBtn text={c.opReturnHex} field="datahex" />
            </DetailRow>
          )}

          {date && (
            <DetailRow label="Date" value={date.toLocaleString()} />
          )}

          <DetailRow label="Confirmations" value={String(c.confirmations)} />

          <div className={styles.detailActions}>
            {c.spent && (
              <div className={styles.spentNotice}>
                This output has already been spent.
              </div>
            )}
            {!c.spent && (c.scriptType === 'hashlock' || c.scriptType === 'hashlock-sha256') && onAction && (
              <button
                className={styles.actionBtn}
                onClick={e => {
                  e.stopPropagation();
                  onAction({
                    type: 'claim-hashlock',
                    scriptHex: c.scriptHex,
                    txid: c.txid,
                    vout: c.vout,
                    amount: c.value.toFixed(8),
                  });
                }}
              >
                <Unlock size={13} />
                Claim
                <ArrowRight size={12} />
              </button>
            )}
            {!c.spent && c.scriptType === 'multisig' && onAction && c.value > 0 && (
              <button
                className={styles.actionBtn}
                onClick={e => {
                  e.stopPropagation();
                  onAction({
                    type: 'spend-multisig',
                    scriptHex: c.scriptHex,
                    txid: c.txid,
                    vout: c.vout,
                    amount: c.value.toFixed(8),
                    reqSigs: c.reqSigs,
                  });
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

function FilterBtn({
  active,
  onClick,
  count,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`${styles.filterBtn} ${active ? styles.filterBtnActive : ''}`}
      onClick={onClick}
    >
      {icon && <span className={styles.filterIcon}>{icon}</span>}
      {children}
      <span className={styles.filterCount}>{count}</span>
    </button>
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
