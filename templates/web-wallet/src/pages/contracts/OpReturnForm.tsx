import { useState } from 'react';
import { embedText, embedHex, embedJSON, decodeOpReturn } from 'bitok';
import type { OpReturnData, BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Input';
import { Input } from '../../components/Input';
import { Copy, Check, AlertCircle, CheckCircle, Send } from 'lucide-react';
import styles from './ContractsPage.module.css';

type InputMode = 'text' | 'hex' | 'json' | 'decode';
type Step = 'create' | 'fund' | 'success';

const MAX_DATA_BYTES = 9941;

interface OpReturnFormProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

function getByteSize(input: string, mode: InputMode): number {
  if (!input) return 0;
  if (mode === 'text' || mode === 'json') {
    return new TextEncoder().encode(input).length;
  }
  if (mode === 'hex') {
    const clean = input.replace(/\s/g, '');
    return Math.ceil(clean.length / 2);
  }
  return 0;
}

export function OpReturnForm({ wallet, rpc }: OpReturnFormProps) {
  const [mode, setMode] = useState<InputMode>('text');
  const [step, setStep] = useState<Step>('create');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<OpReturnData | null>(null);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [fee, setFee] = useState('0.01');

  const broadcast = useBroadcast(wallet, rpc);

  function handleCreate() {
    setError('');
    setResult(null);
    try {
      if (!input.trim()) {
        setError('Input is required');
        return;
      }
      if (mode !== 'decode') {
        const bytes = getByteSize(input, mode);
        if (bytes > MAX_DATA_BYTES) {
          setError(`Data too large: ${bytes.toLocaleString()} bytes (max ${MAX_DATA_BYTES.toLocaleString()})`);
          return;
        }
      }
      let data: OpReturnData | null = null;
      switch (mode) {
        case 'text':
          data = embedText(input);
          break;
        case 'hex':
          data = embedHex(input.trim());
          break;
        case 'json':
          JSON.parse(input);
          data = embedJSON(JSON.parse(input));
          break;
        case 'decode':
          data = decodeOpReturn(input.trim());
          if (!data) {
            setError('Not a valid OP_RETURN script (must start with 0x6a)');
            return;
          }
          break;
      }
      setResult(data);
      if (mode !== 'decode') {
        setStep('fund');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process');
    }
  }

  async function handleBroadcast() {
    if (!result) return;
    try {
      await broadcast.broadcastOpReturn(result.scriptPubKeyHex, fee);
      setStep('success');
    } catch {
      // error handled by broadcast hook
    }
  }

  function handleReset() {
    setInput('');
    setResult(null);
    setError('');
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
          <div className={styles.successTitle}>Data Embedded On-Chain</div>
          <p className={styles.successDesc}>
            Your OP_RETURN data has been broadcast to the network.
          </p>
        </div>

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Transaction</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>TXID</span>
              <span className={styles.resultValue}>{broadcast.txid}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Data Size</span>
              <span className={styles.resultValue}>{result.byteSize} bytes</span>
            </div>
            {result.dataText && (
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Text</span>
                <span className={styles.resultValue}>{result.dataText}</span>
              </div>
            )}
          </div>
          {broadcast.txid && <CopyBtn text={broadcast.txid} field="txid" />}
        </div>

        <Button onClick={handleReset} fullWidth>Embed Another</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.selectGroup}>
        <span className={styles.selectLabel}>Mode</span>
        <div className={styles.selectToggle}>
          {(['text', 'hex', 'json', 'decode'] as InputMode[]).map(m => (
            <button
              key={m}
              className={`${styles.selectBtn} ${mode === m ? styles.selectBtnActive : ''}`}
              onClick={() => { setMode(m); setResult(null); setError(''); setInput(''); setStep('create'); broadcast.reset(); }}
            >
              {m === 'text' ? 'Text' : m === 'hex' ? 'Hex' : m === 'json' ? 'JSON' : 'Decode'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>OP_RETURN Data Embedding</span>
        <span className={styles.infoText}>
          {mode === 'decode'
            ? 'Decode an existing OP_RETURN script hex back into its data payload.'
            : 'Embeds arbitrary data on-chain in a provably unspendable output. Used for timestamping, metadata, and protocol markers.'}
        </span>
      </div>

      {step === 'create' && (
        <>
          {mode === 'json' ? (
            <Textarea
              label="JSON Data"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='{"key": "value"}'
              rows={5}
              mono
            />
          ) : (
            <Textarea
              label={mode === 'text' ? 'Text to embed' : mode === 'hex' ? 'Hex data' : 'Script hex to decode'}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                mode === 'text' ? 'Enter text to store on-chain...'
                : mode === 'hex' ? 'abcdef0123456789...'
                : '6a...'
              }
              rows={3}
              mono={mode !== 'text'}
            />
          )}
          {mode !== 'decode' && (
            <div className={styles.byteCounter}>
              <span className={getByteSize(input, mode) > MAX_DATA_BYTES ? styles.byteCountOver : ''}>
                {getByteSize(input, mode).toLocaleString()}
              </span>
              <span className={styles.byteCountSep}>/</span>
              <span>{MAX_DATA_BYTES.toLocaleString()} bytes</span>
            </div>
          )}
        </>
      )}

      {step === 'fund' && result && (
        <>
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>OP_RETURN Output</span>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Script Hex</span>
                <span className={styles.resultValue}>{result.scriptPubKeyHex}</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Data Hex</span>
                <span className={styles.resultValue}>{result.dataHex || '(empty)'}</span>
              </div>
              {result.dataText !== undefined && (
                <div className={styles.resultRow}>
                  <span className={styles.resultKey}>Text</span>
                  <span className={styles.resultValue}>{result.dataText || '(empty)'}</span>
                </div>
              )}
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Size</span>
                <span className={styles.resultValue}>{result.byteSize} bytes</span>
              </div>
            </div>
            <CopyBtn text={result.scriptPubKeyHex} field="script" />
          </div>

          <div className={styles.fundSection}>
            <span className={styles.resultLabel}>Broadcast</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                OP_RETURN outputs carry no value. You only pay the network fee to embed data on-chain.
              </span>
            </div>

            {!wallet.wif && (
              <div className={styles.errorMsg}>
                <AlertCircle size={14} /> Private key not available. Import your wallet to broadcast.
              </div>
            )}

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
          </div>
        </>
      )}

      {mode === 'decode' && result && (
        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Decoded Data</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Data Hex</span>
              <span className={styles.resultValue}>{result.dataHex || '(empty)'}</span>
            </div>
            {result.dataText !== undefined && (
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Text</span>
                <span className={styles.resultValue}>{result.dataText || '(empty)'}</span>
              </div>
            )}
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Size</span>
              <span className={styles.resultValue}>{result.byteSize} bytes</span>
            </div>
          </div>
          <CopyBtn text={result.dataHex} field="data" />
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
        {(step === 'fund' || result) && (
          <Button variant="secondary" onClick={handleReset}>Reset</Button>
        )}
        {step === 'create' && (
          <Button onClick={handleCreate}>
            {mode === 'decode' ? 'Decode' : 'Create OP_RETURN'}
          </Button>
        )}
        {step === 'fund' && (
          <Button
            onClick={handleBroadcast}
            loading={broadcast.broadcasting}
            disabled={!wallet.wif}
            icon={<Send size={14} />}
          >
            Broadcast
          </Button>
        )}
      </div>
    </div>
  );
}
