import { useState, useEffect, useCallback } from 'react';
import type { BitokRpc, RawTransaction } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { isOutputSpentByTxid } from '../../utils/txout';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Copy, Check, AlertCircle, CheckCircle, Unlock, RotateCcw, Loader } from 'lucide-react';
import styles from './ContractsPage.module.css';

type ClaimMode = 'hashlock' | 'htlc-claim' | 'htlc-refund';

interface ClaimPrefill {
  scriptHex: string;
  txid: string;
  vout: number;
  amount: string;
}

interface ClaimRedeemFormProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  prefill?: ClaimPrefill | null;
}

type LocktimeMode = 'block' | 'timestamp';

export function ClaimRedeemForm({ wallet, rpc, prefill }: ClaimRedeemFormProps) {
  const [mode, setMode] = useState<ClaimMode>('hashlock');
  const [scriptHex, setScriptHex] = useState(prefill?.scriptHex ?? '');
  const [fundingTxid, setFundingTxid] = useState(prefill?.txid ?? '');
  const [fundingVout, setFundingVout] = useState(String(prefill?.vout ?? 0));
  const [fundedAmount, setFundedAmount] = useState(prefill?.amount ?? '');
  const [secret, setSecret] = useState('');
  const [locktimeMode, setLocktimeMode] = useState<LocktimeMode>('block');
  const [locktime, setLocktime] = useState('');
  const [fee, setFee] = useState('0.01');
  const [copiedField, setCopiedField] = useState('');
  const [error, setError] = useState('');
  const [fetchingTx, setFetchingTx] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const broadcast = useBroadcast(wallet, rpc);

  useEffect(() => {
    if (!prefill) return;
    setScriptHex(prefill.scriptHex);
    setFundingTxid(prefill.txid);
    setFundingVout(String(prefill.vout));
    setFundedAmount(prefill.amount);
  }, [prefill]);

  const fetchTxDetails = useCallback(async () => {
    if (!fundingTxid.trim() || fundingTxid.trim().length < 60) return;
    setFetchingTx(true);
    setFetchError('');
    try {
      const raw = await rpc.getRawTransaction(fundingTxid.trim(), 1) as RawTransaction;
      const voutIdx = parseInt(fundingVout) || 0;
      const out = raw.vout?.[voutIdx];
      if (!out) {
        setFetchError(`Output ${voutIdx} not found in transaction`);
        return;
      }
      if (out.scriptPubKey && !scriptHex) setScriptHex(out.scriptPubKey);
      if (out.value !== undefined && !fundedAmount) setFundedAmount(out.value.toFixed(8));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch transaction');
    } finally {
      setFetchingTx(false);
    }
  }, [fundingTxid, fundingVout, rpc, scriptHex, fundedAmount]);

  useEffect(() => {
    if (fundingTxid.trim().length === 64 && (!scriptHex || !fundedAmount)) {
      fetchTxDetails();
    }
  }, [fundingTxid, fundingVout]);

  function handleModeSwitch(newMode: ClaimMode) {
    setMode(newMode);
    setError('');
    broadcast.reset();
  }

  function handleReset() {
    setScriptHex('');
    setFundingTxid('');
    setFundingVout('0');
    setFundedAmount('');
    setSecret('');
    setLocktimeMode('block');
    setLocktime('');
    setFee('0.01');
    setError('');
    setFetchError('');
    broadcast.reset();
  }

  async function handleClaim() {
    setError('');
    if (!wallet.wif) {
      setError('Private key not available. Import your wallet to claim funds.');
      return;
    }
    if (!scriptHex.trim() || !fundingTxid.trim() || !fundedAmount.trim()) {
      setError('Contract script, funding TXID, and funded amount are required.');
      return;
    }

    try {
      const spent = await isOutputSpentByTxid(rpc, fundingTxid.trim(), parseInt(fundingVout));
      if (spent) {
        setError('This output has already been spent. It cannot be claimed again.');
        return;
      }
    } catch {
    }

    try {
      if (mode === 'hashlock') {
        if (!secret.trim()) { setError('Secret (preimage) is required to claim.'); return; }
        await broadcast.claimHashlock(
          scriptHex.trim(), fundingTxid.trim(), parseInt(fundingVout),
          fundedAmount.trim(), secret, fee, wallet.address
        );
      } else if (mode === 'htlc-claim') {
        if (!secret.trim()) { setError('Secret (preimage) is required to claim.'); return; }
        await broadcast.claimHTLC(
          scriptHex.trim(), fundingTxid.trim(), parseInt(fundingVout),
          fundedAmount.trim(), secret, fee, wallet.address
        );
      } else if (mode === 'htlc-refund') {
        if (!locktime.trim()) { setError('Locktime is required for refund.'); return; }
        await broadcast.refundHTLC(
          scriptHex.trim(), fundingTxid.trim(), parseInt(fundingVout),
          fundedAmount.trim(), parseInt(locktime), fee, wallet.address
        );
      }
    } catch {
      // handled by broadcast hook
    }
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

  if (broadcast.txid) {
    return (
      <div className={styles.form}>
        <div className={styles.successBox}>
          <CheckCircle size={32} className={styles.successIcon} />
          <div className={styles.successTitle}>
            {mode === 'htlc-refund' ? 'Refund Broadcast' : 'Funds Claimed'}
          </div>
          <p className={styles.successDesc}>
            {mode === 'htlc-refund'
              ? 'Your HTLC refund transaction has been broadcast to the network.'
              : 'Your claim transaction has been broadcast to the network.'}
          </p>
        </div>

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Transaction</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>TXID</span>
              <span className={styles.resultValue}>{broadcast.txid}</span>
            </div>
          </div>
          <CopyBtn text={broadcast.txid} field="txid" />
        </div>

        <Button onClick={handleReset} fullWidth>Claim Another</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.selectGroup}>
        <span className={styles.selectLabel}>Action</span>
        <div className={styles.selectToggle}>
          <button
            className={`${styles.selectBtn} ${mode === 'hashlock' ? styles.selectBtnActive : ''}`}
            onClick={() => handleModeSwitch('hashlock')}
          >Hashlock</button>
          <button
            className={`${styles.selectBtn} ${mode === 'htlc-claim' ? styles.selectBtnActive : ''}`}
            onClick={() => handleModeSwitch('htlc-claim')}
          >HTLC Claim</button>
          <button
            className={`${styles.selectBtn} ${mode === 'htlc-refund' ? styles.selectBtnActive : ''}`}
            onClick={() => handleModeSwitch('htlc-refund')}
          >HTLC Refund</button>
        </div>
      </div>

      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>
          {mode === 'hashlock' && 'Claim Hashlock Contract'}
          {mode === 'htlc-claim' && 'Claim HTLC (Receiver Path)'}
          {mode === 'htlc-refund' && 'Refund HTLC (Sender Path)'}
        </span>
        <span className={styles.infoText}>
          {mode === 'hashlock' && 'Paste the funding TXID — script and amount auto-load. Enter the secret to unlock.'}
          {mode === 'htlc-claim' && 'Paste the funding TXID — script and amount auto-load. Claim with the secret before locktime expires.'}
          {mode === 'htlc-refund' && 'Paste the funding TXID — script and amount auto-load. Reclaim after the locktime has passed.'}
        </span>
      </div>

      {!wallet.wif && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> Private key not available. Import your wallet to claim or refund.
        </div>
      )}

      <div className={styles.fetchRow}>
        <Input
          label="Funding TXID"
          value={fundingTxid}
          onChange={e => setFundingTxid(e.target.value)}
          placeholder="Paste the 64-character transaction ID"
          mono
          hint="Script and amount auto-load when you paste the full TXID"
        />
        {fetchingTx && (
          <div className={styles.fetchStatus}>
            <Loader size={13} className={styles.spinning} />
            <span>Fetching...</span>
          </div>
        )}
      </div>

      {fetchError && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> {fetchError}
        </div>
      )}

      <Input
        label="Output Index (Vout)"
        value={fundingVout}
        onChange={e => setFundingVout(e.target.value)}
        onBlur={fetchTxDetails}
        placeholder="0"
        type="number"
        min="0"
        hint="Which output index holds the contract (usually 0)"
      />

      <Input
        label="Contract Script Hex"
        value={scriptHex}
        onChange={e => setScriptHex(e.target.value)}
        placeholder="Auto-loaded from TXID, or paste manually"
        mono
        hint="The scriptPubKey — loaded automatically when you paste the TXID"
      />

      <Input
        label="Funded Amount"
        value={fundedAmount}
        onChange={e => setFundedAmount(e.target.value)}
        placeholder="0.00000000"
        type="number"
        min="0"
        step="0.00000001"
        suffix={<span>BITOK</span>}
        hint="Auto-loaded from transaction"
      />

      <Input
        label="Network Fee"
        value={fee}
        onChange={e => setFee(e.target.value)}
        placeholder="0.01"
        type="number"
        min="0"
        step="0.001"
        suffix={<span>BITOK</span>}
      />

      {(mode === 'hashlock' || mode === 'htlc-claim') && (
        <Input
          label="Secret (Preimage)"
          value={secret}
          onChange={e => setSecret(e.target.value)}
          placeholder="The secret phrase shared by the contract creator"
          hint="The original text secret used when creating the contract"
        />
      )}

      {mode === 'htlc-refund' && (
        <div>
          <div className={styles.locktimeToggle}>
            <span className={styles.locktimeToggleLabel}>Locktime type</span>
            <div className={styles.selectToggle}>
              <button
                className={`${styles.selectBtn} ${locktimeMode === 'block' ? styles.selectBtnActive : ''}`}
                onClick={() => { setLocktimeMode('block'); setLocktime(''); }}
              >Block Height</button>
              <button
                className={`${styles.selectBtn} ${locktimeMode === 'timestamp' ? styles.selectBtnActive : ''}`}
                onClick={() => { setLocktimeMode('timestamp'); setLocktime(''); }}
              >Unix Timestamp</button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {locktimeMode === 'block' ? (
              <Input
                label="Block Height"
                value={locktime}
                onChange={e => setLocktime(e.target.value)}
                placeholder="e.g. 150000"
                type="number"
                min="1"
                hint="The block height set when the HTLC was created. Must have been reached."
              />
            ) : (
              <Input
                label="Unix Timestamp"
                value={locktime}
                onChange={e => setLocktime(e.target.value)}
                placeholder="e.g. 1700000000"
                type="number"
                min="500000000"
                hint="The unix timestamp set when the HTLC was created. Must have passed."
              />
            )}
          </div>
        </div>
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
        {(scriptHex || fundingTxid || secret) && (
          <Button variant="secondary" onClick={handleReset}>Reset</Button>
        )}
        <Button
          onClick={handleClaim}
          loading={broadcast.broadcasting}
          disabled={!wallet.wif}
          icon={mode === 'htlc-refund' ? <RotateCcw size={14} /> : <Unlock size={14} />}
        >
          {mode === 'htlc-refund' ? 'Refund' : 'Claim Funds'}
        </Button>
      </div>
    </div>
  );
}
