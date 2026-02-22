import { useState, useEffect } from 'react';
import { createMultisigWallet } from 'bitok';
import type { MultisigWallet, BitokRpc } from 'bitok';
import { hexToBytes } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Copy, Check, AlertCircle, CheckCircle, Send, Lock as LockIcon } from 'lucide-react';
import styles from './ContractsPage.module.css';

type Step = 'create' | 'fund' | 'success';

interface MultisigFormProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

export function MultisigForm({ wallet, rpc }: MultisigFormProps) {
  const [step, setStep] = useState<Step>('create');
  const [n, setN] = useState(3);
  const [m, setM] = useState(2);
  const [pubKeys, setPubKeys] = useState<string[]>(['', '', '']);
  const [result, setResult] = useState<MultisigWallet | null>(null);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fee, setFee] = useState('0.01');

  const broadcast = useBroadcast(wallet, rpc);

  useEffect(() => {
    const newKeys: string[] = [];
    for (let i = 0; i < n; i++) {
      newKeys.push(pubKeys[i] || '');
    }
    setPubKeys(newKeys);
    if (m > n) setM(n);
  }, [n]);

  function updateKey(index: number, value: string) {
    const next = [...pubKeys];
    next[index] = value;
    setPubKeys(next);
  }

  function handleNChange(val: number) {
    setN(Math.max(2, Math.min(20, val)));
  }

  function handleMChange(val: number) {
    setM(Math.max(1, Math.min(n, val)));
  }

  function handleCreate() {
    setError('');
    setResult(null);
    try {
      const filled = pubKeys.filter(k => k.trim().length > 0);
      if (filled.length !== n) {
        setError(`All ${n} public keys must be filled`);
        return;
      }
      const keyBytes = filled.map(k => hexToBytes(k.trim()));
      const mWallet = createMultisigWallet(m, keyBytes);
      setResult(mWallet);
      setStep('fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create multisig');
    }
  }

  async function handleFund() {
    if (!result || !fundAmount.trim()) return;
    try {
      await broadcast.fundContract(result.scriptPubKeyHex, fundAmount, fee);
      setStep('success');
    } catch {
    }
  }

  function handleReset() {
    setPubKeys(Array(n).fill(''));
    setResult(null);
    setError('');
    setFundAmount('');
    setFee('0.01');
    setStep('create');
    broadcast.reset();
  }

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  function CopyBtn({ text, field }: { text: string; field: string }) {
    const copied = copiedField === field;
    return (
      <button
        className={`${styles.copyBtn} ${copied ? styles.copiedBtn : ''}`}
        onClick={() => copyToClipboard(text, field)}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    );
  }

  if (step === 'success' && result) {
    return (
      <div className={styles.form}>
        <div className={styles.successBox}>
          <CheckCircle size={32} className={styles.successIcon} />
          <div className={styles.successTitle}>
            {broadcast.txid ? 'Multisig Funded' : 'Multisig Created'}
          </div>
          <p className={styles.successDesc}>
            Your {m}-of-{n} multisig contract has been {broadcast.txid ? 'funded and broadcast' : 'created'}.
          </p>
        </div>

        {broadcast.txid && (
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Transaction</span>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>TXID</span>
                <span className={styles.resultValue}>{broadcast.txid}</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Amount Sent</span>
                <span className={styles.resultValue}>{fundAmount} BITOK</span>
              </div>
            </div>
            <CopyBtn text={broadcast.txid} field="txid" />
          </div>
        )}

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Details</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Threshold</span>
              <span className={styles.resultValue}>{result.m}-of-{result.n}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Script Hex</span>
              <span className={styles.resultValue}>{result.scriptPubKeyHex}</span>
            </div>
          </div>
          <CopyBtn text={result.scriptPubKeyHex} field="script" />
        </div>

        <Button onClick={handleReset} fullWidth>Create Another</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>Multisig Wallet (m-of-n)</span>
        <span className={styles.infoText}>
          Requires m-of-n signatures to spend. Paste all participant public keys. Find your own public key in Settings &gt; Wallet Info.
        </span>
      </div>

      {step === 'create' && (
        <>
          <div className={styles.thresholdRow}>
            <div className={styles.thresholdField}>
              <label className={styles.thresholdLabel}>Required Signatures (m)</label>
              <div className={styles.stepperGroup}>
                <button className={styles.stepperBtn} onClick={() => handleMChange(m - 1)} disabled={m <= 1}>-</button>
                <span className={styles.stepperValue}>{m}</span>
                <button className={styles.stepperBtn} onClick={() => handleMChange(m + 1)} disabled={m >= n}>+</button>
              </div>
            </div>
            <span className={styles.thresholdOf}>of</span>
            <div className={styles.thresholdField}>
              <label className={styles.thresholdLabel}>Total Participants (n)</label>
              <div className={styles.stepperGroup}>
                <button className={styles.stepperBtn} onClick={() => handleNChange(n - 1)} disabled={n <= 2}>-</button>
                <span className={styles.stepperValue}>{n}</span>
                <button className={styles.stepperBtn} onClick={() => handleNChange(n + 1)} disabled={n >= 20}>+</button>
              </div>
            </div>
          </div>

          {pubKeys.map((key, i) => (
            <Input
              key={i}
              label={`Participant ${i + 1} Public Key`}
              value={key}
              onChange={e => updateKey(i, e.target.value)}
              placeholder="04..."
              mono
              hint="Find in Settings > Wallet Info"
            />
          ))}
        </>
      )}

      {step === 'fund' && result && (
        <>
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Multisig Created</span>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Threshold</span>
                <span className={styles.resultValue}>{result.m}-of-{result.n}</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Script Hex</span>
                <span className={styles.resultValue}>{result.scriptPubKeyHex}</span>
              </div>
            </div>
            <CopyBtn text={result.scriptPubKeyHex} field="script" />
          </div>

          <div className={styles.fundSection}>
            <span className={styles.resultLabel}>Fund Contract</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                Send BITOK to lock funds in this contract. Spending requires {result.m} of {result.n} signatures.
              </span>
            </div>

            {!wallet.wif && (
              <div className={styles.errorMsg}>
                <AlertCircle size={14} /> Private key not available. Import your wallet to fund contracts.
              </div>
            )}

            <div className={styles.row}>
              <Input
                label="Amount"
                value={fundAmount}
                onChange={e => setFundAmount(e.target.value)}
                placeholder="0.00000000"
                type="number"
                min="0"
                step="0.00000001"
                suffix={<span>BITOK</span>}
              />
              <Input
                label="Fee"
                value={fee}
                onChange={e => setFee(e.target.value)}
                placeholder="0.01"
                type="number"
                min="0"
                step="0.001"
                suffix={<span>BITOK</span>}
              />
            </div>
          </div>
        </>
      )}

      {error && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {broadcast.error && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> {broadcast.error}
        </div>
      )}

      <div className={styles.actions}>
        {(step === 'fund' || result) && (
          <Button variant="secondary" onClick={handleReset}>Reset</Button>
        )}
        {step === 'create' && (
          <Button onClick={handleCreate} icon={<LockIcon size={14} />}>
            Create Multisig
          </Button>
        )}
        {step === 'fund' && result && (
          <Button
            onClick={handleFund}
            loading={broadcast.broadcasting}
            disabled={!wallet.wif || !fundAmount.trim()}
            icon={<Send size={14} />}
          >
            Fund & Broadcast
          </Button>
        )}
      </div>
    </div>
  );
}
