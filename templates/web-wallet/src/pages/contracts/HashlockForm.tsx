import { useState } from 'react';
import { createHashlockFromSecret, createHTLC } from 'bitok';
import type { HashlockContract, HTLCContract, BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Copy, Check, AlertCircle, CheckCircle, Send } from 'lucide-react';
import styles from './ContractsPage.module.css';

type Mode = 'hashlock' | 'htlc';
type Step = 'create' | 'fund' | 'success';

interface HashlockFormProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getMinDatetime(): string {
  return toDatetimeLocal(new Date());
}

type LocktimeMode = 'datetime' | 'block';

export function HashlockForm({ wallet, rpc }: HashlockFormProps) {
  const [mode, setMode] = useState<Mode>('hashlock');
  const [step, setStep] = useState<Step>('create');
  const [secret, setSecret] = useState('');
  const [receiver, setReceiver] = useState('');
  const [hashType, setHashType] = useState<'hash160' | 'sha256'>('hash160');
  const [refundAddr, setRefundAddr] = useState('');
  const [locktimeMode, setLocktimeMode] = useState<LocktimeMode>('datetime');
  const [locktimeDate, setLocktimeDate] = useState('');
  const [locktimeValue, setLocktimeValue] = useState('');
  const [result, setResult] = useState<HashlockContract | HTLCContract | null>(null);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fee, setFee] = useState('0.01');

  const broadcast = useBroadcast(wallet, rpc);

  function handleLocktimeDateChange(val: string) {
    setLocktimeDate(val);
    if (val) {
      const unix = Math.floor(new Date(val).getTime() / 1000);
      setLocktimeValue(String(unix));
    } else {
      setLocktimeValue('');
    }
  }

  function handleLocktimeModeSwitch(newMode: LocktimeMode) {
    setLocktimeMode(newMode);
    setLocktimeDate('');
    setLocktimeValue('');
  }

  function getLocktimeNumber(): number {
    return parseInt(locktimeValue) || 0;
  }

  function handleCreate() {
    setError('');
    setResult(null);
    try {
      if (mode === 'hashlock') {
        if (!secret.trim() || !receiver.trim()) {
          setError('Secret and receiver address are required');
          return;
        }
        const contract = createHashlockFromSecret(secret, receiver, hashType);
        setResult(contract);
        setStep('fund');
      } else {
        if (!secret.trim() || !receiver.trim() || !refundAddr.trim() || !locktimeValue.trim()) {
          setError('All fields are required for HTLC');
          return;
        }
        const lt = getLocktimeNumber();
        if (lt <= 0) {
          setError(locktimeMode === 'block' ? 'Block height must be a positive number' : 'Please select a valid date/time');
          return;
        }
        const encoder = new TextEncoder();
        const preimage = encoder.encode(secret);
        const contract = createHTLC(preimage, receiver, refundAddr, lt);
        setResult(contract);
        setStep('fund');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contract');
    }
  }

  async function handleFund() {
    if (!result || !fundAmount.trim()) return;
    try {
      await broadcast.fundContract(result.scriptPubKeyHex, fundAmount, fee);
      setStep('success');
    } catch {
      // error state handled by broadcast hook
    }
  }

  function handleReset() {
    setSecret('');
    setReceiver('');
    setRefundAddr('');
    setLocktimeMode('datetime');
    setLocktimeDate('');
    setLocktimeValue('');
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
          <div className={styles.successTitle}>Contract Funded</div>
          <p className={styles.successDesc}>
            Your {mode === 'hashlock' ? 'hashlock' : 'HTLC'} contract has been funded and broadcast to the network.
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
          {broadcast.txid && <CopyBtn text={broadcast.txid} field="txid" />}
        </div>

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Share with Receiver</span>
          <div className={styles.infoBox}>
            <span className={styles.infoText}>
              Send these details to the receiver so they can claim the funds using the "Claim" tab.
            </span>
          </div>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Script Hex</span>
              <span className={styles.resultValue}>{result.scriptPubKeyHex}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Funding TXID</span>
              <span className={styles.resultValue}>{broadcast.txid}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Output Index</span>
              <span className={styles.resultValue}>0</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Amount</span>
              <span className={styles.resultValue}>{fundAmount} BITOK</span>
            </div>
            {mode === 'htlc' && 'locktime' in result && (
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Locktime</span>
                <span className={styles.resultValue}>
                  {(result as HTLCContract).locktime < 500000000
                    ? `Block #${(result as HTLCContract).locktime}`
                    : new Date((result as HTLCContract).locktime * 1000).toLocaleString()}
                </span>
              </div>
            )}
          </div>
          <CopyBtn text={result.scriptPubKeyHex} field="script" />
        </div>

        <Button onClick={handleReset} fullWidth>Create Another</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.selectGroup}>
        <span className={styles.selectLabel}>Type</span>
        <div className={styles.selectToggle}>
          <button
            className={`${styles.selectBtn} ${mode === 'hashlock' ? styles.selectBtnActive : ''}`}
            onClick={() => { setMode('hashlock'); setResult(null); setError(''); setStep('create'); }}
          >Hashlock</button>
          <button
            className={`${styles.selectBtn} ${mode === 'htlc' ? styles.selectBtnActive : ''}`}
            onClick={() => { setMode('htlc'); setResult(null); setError(''); setStep('create'); }}
          >HTLC</button>
        </div>
      </div>

      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>
          {mode === 'hashlock' ? 'Hashlock Contract' : 'Hash Time-Lock Contract (HTLC)'}
        </span>
        <span className={styles.infoText}>
          {mode === 'hashlock'
            ? 'Locks funds behind a secret. The receiver must reveal the preimage (secret) and sign with their key to spend.'
            : 'Combines a hashlock with a time-based refund. Receiver claims with the secret, or sender reclaims after the locktime expires.'}
        </span>
      </div>

      {step === 'create' && (
        <>
          <Input
            label="Secret (Preimage)"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Enter a secret phrase..."
          />

          <Input
            label="Receiver Address"
            value={receiver}
            onChange={e => setReceiver(e.target.value)}
            placeholder="Bitok address that can claim"
            mono
          />

          {mode === 'hashlock' && (
            <div className={styles.selectGroup}>
              <span className={styles.selectLabel}>Hash</span>
              <div className={styles.selectToggle}>
                <button
                  className={`${styles.selectBtn} ${hashType === 'hash160' ? styles.selectBtnActive : ''}`}
                  onClick={() => setHashType('hash160')}
                >HASH160</button>
                <button
                  className={`${styles.selectBtn} ${hashType === 'sha256' ? styles.selectBtnActive : ''}`}
                  onClick={() => setHashType('sha256')}
                >SHA256</button>
              </div>
            </div>
          )}

          {mode === 'htlc' && (
            <>
              <Input
                label="Refund Address"
                value={refundAddr}
                onChange={e => setRefundAddr(e.target.value)}
                placeholder="Your address for refund path"
                mono
                hint={`Your address: ${wallet.address.slice(0, 16)}...`}
              />

              <div>
                <div className={styles.locktimeToggle}>
                  <span className={styles.locktimeToggleLabel}>Lock until</span>
                  <div className={styles.selectToggle}>
                    <button
                      className={`${styles.selectBtn} ${locktimeMode === 'datetime' ? styles.selectBtnActive : ''}`}
                      onClick={() => handleLocktimeModeSwitch('datetime')}
                    >Date / Time</button>
                    <button
                      className={`${styles.selectBtn} ${locktimeMode === 'block' ? styles.selectBtnActive : ''}`}
                      onClick={() => handleLocktimeModeSwitch('block')}
                    >Block Height</button>
                  </div>
                </div>

                {locktimeMode === 'datetime' ? (
                  <div style={{ marginTop: 12 }}>
                    <Input
                      label="Expiry Date & Time"
                      value={locktimeDate}
                      onChange={e => handleLocktimeDateChange(e.target.value)}
                      type="datetime-local"
                      min={getMinDatetime()}
                      hint={locktimeValue ? `Unix timestamp: ${locktimeValue}` : undefined}
                    />
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <Input
                      label="Block Height"
                      value={locktimeValue}
                      onChange={e => setLocktimeValue(e.target.value)}
                      type="number"
                      placeholder="e.g. 150000"
                      min="1"
                      hint="The block number after which the sender can reclaim funds. Must be less than 500,000,000."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {step === 'fund' && result && (
        <>
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Contract Created</span>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Script Hex</span>
                <span className={styles.resultValue}>{result.scriptPubKeyHex}</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Hash</span>
                <span className={styles.resultValue}>{result.hashHex}</span>
              </div>
              {mode === 'htlc' && 'locktime' in result && (
                <div className={styles.resultRow}>
                  <span className={styles.resultKey}>Locktime</span>
                  <span className={styles.resultValue}>
                    {new Date((result as HTLCContract).locktime * 1000).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <CopyBtn text={result.scriptPubKeyHex} field="script" />
          </div>

          <div className={styles.fundSection}>
            <span className={styles.resultLabel}>Fund Contract</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                Send BITOK to lock in this contract. The funds will be spendable only by the receiver who knows the secret.
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
          <Button onClick={handleCreate}>
            {mode === 'hashlock' ? 'Create Hashlock' : 'Create HTLC'}
          </Button>
        )}
        {step === 'fund' && (
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
