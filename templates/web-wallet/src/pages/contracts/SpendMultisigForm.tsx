import { useState, useEffect } from 'react';
import {
  TransactionBuilder,
  bitokToSatoshis,
  bytesToHex,
  hexToBytes,
  serializeTransaction,
  parseScript,
  classifyScript,
  publicKeyToAddress,
} from 'bitok';
import type { BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { isOutputSpentByTxid } from '../../utils/txout';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  Copy, Check, AlertCircle, CheckCircle, ArrowRight,
  Users, Plus, Trash2,
} from 'lucide-react';
import styles from './ContractsPage.module.css';

interface MultisigInfo {
  m: number;
  n: number;
  pubkeys: string[];
  addresses: string[];
}

interface SpendMultisigFormProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  prefill?: {
    scriptHex: string;
    txid: string;
    vout: number;
    amount: string;
    reqSigs?: number;
  } | null;
}

function parseMultisigScript(scriptHex: string): MultisigInfo | null {
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

function buildUnsignedTxHex(
  fundingTxid: string,
  fundingVout: number,
  fundedAmountBitok: string,
  feeBitok: string,
  destinationAddress: string
): string {
  const fundedSatoshis = bitokToSatoshis(fundedAmountBitok);
  const feeSatoshis = bitokToSatoshis(feeBitok);
  const spendAmount = fundedSatoshis - feeSatoshis;
  if (spendAmount <= 0n) throw new Error('Fee exceeds funded amount');

  const tx = new TransactionBuilder()
    .addInput(fundingTxid, fundingVout)
    .addOutputToAddress(destinationAddress, spendAmount)
    .build();

  return bytesToHex(serializeTransaction(tx));
}

type Step = 'input' | 'collect';

export function SpendMultisigForm({ wallet, rpc, prefill }: SpendMultisigFormProps) {
  const [step, setStep] = useState<Step>('input');

  const [txid, setTxid] = useState(prefill?.txid ?? '');
  const [vout, setVout] = useState(String(prefill?.vout ?? 0));
  const [scriptHex, setScriptHex] = useState(prefill?.scriptHex ?? '');
  const [amount, setAmount] = useState(prefill?.amount ?? '');
  const [fee, setFee] = useState('0.01');
  const [destination, setDestination] = useState(wallet.address);

  const [multisigInfo, setMultisigInfo] = useState<MultisigInfo | null>(null);

  const [unsignedTxHex, setUnsignedTxHex] = useState('');
  const [signatures, setSignatures] = useState<string[]>(['']);
  const [copiedField, setCopiedField] = useState('');
  const [buildError, setBuildError] = useState('');
  const [broadcastError, setBroadcastError] = useState('');

  const broadcast = useBroadcast(wallet, rpc);

  useEffect(() => {
    if (prefill) {
      setTxid(prefill.txid);
      setVout(String(prefill.vout));
      setScriptHex(prefill.scriptHex);
      setAmount(prefill.amount);
    }
  }, [prefill]);

  useEffect(() => {
    if (scriptHex.trim().length > 10) {
      const info = parseMultisigScript(scriptHex.trim());
      setMultisigInfo(info);
    } else {
      setMultisigInfo(null);
    }
  }, [scriptHex]);

  async function handleBuildTx() {
    setBuildError('');
    try {
      const spent = await isOutputSpentByTxid(rpc, txid.trim(), parseInt(vout));
      if (spent) {
        setBuildError('This output has already been spent. It cannot be spent again.');
        return;
      }
    } catch {
    }
    try {
      const hex = buildUnsignedTxHex(txid.trim(), parseInt(vout), amount, fee, destination.trim());
      setUnsignedTxHex(hex);

      let firstSig = '';
      if (wallet.wif) {
        firstSig = broadcast.signMultisigPartial(hex, scriptHex.trim(), wallet.wif);
      }
      setSignatures([firstSig]);
      setStep('collect');
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to build transaction');
    }
  }

  function handleSignOnly() {
    setBuildError('');
    if (!wallet.wif) return;
    try {
      const mySig = broadcast.signMultisigPartial(unsignedTxHex, scriptHex.trim(), wallet.wif);
      const existingSigs = signatures.filter(s => s.trim());
      const allSigs = [...existingSigs, mySig];
      setSignatures([...allSigs, '']);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to sign');
    }
  }

  async function handleBroadcast() {
    setBroadcastError('');
    const validSigs = signatures.map(s => s.trim()).filter(Boolean);
    const reqSigs = multisigInfo?.m ?? 2;
    if (validSigs.length < reqSigs) {
      setBroadcastError(`Need ${reqSigs} signature${reqSigs > 1 ? 's' : ''}, have ${validSigs.length}.`);
      return;
    }
    try {
      await broadcast.broadcastMultisig(unsignedTxHex, scriptHex.trim(), validSigs);
    } catch {
    }
  }

  function handleReset() {
    setStep('input');
    setTxid(prefill?.txid ?? '');
    setVout(String(prefill?.vout ?? 0));
    setScriptHex(prefill?.scriptHex ?? '');
    setAmount(prefill?.amount ?? '');
    setFee('0.01');
    setDestination(wallet.address);
    setUnsignedTxHex('');
    setSignatures(['']);
    setBuildError('');
    setBroadcastError('');
    broadcast.reset();
  }

  async function copyText(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  function CopyBtn({ text, field }: { text: string; field: string }) {
    const copied = copiedField === field;
    return (
      <button
        className={`${styles.copyBtn} ${copied ? styles.copiedBtn : ''}`}
        onClick={() => copyText(text, field)}
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
          <div className={styles.successTitle}>Transaction Broadcast</div>
          <p className={styles.successDesc}>
            The spending transaction has been broadcast to the network.
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
          <CopyBtn text={broadcast.txid} field="final-txid" />
        </div>
        <Button onClick={handleReset} fullWidth>Spend Another</Button>
      </div>
    );
  }

  if (step === 'collect' && unsignedTxHex) {
    const validSigs = signatures.map(s => s.trim()).filter(Boolean);
    const reqSigs = multisigInfo?.m ?? 2;
    const hasEnough = validSigs.length >= reqSigs;

    return (
      <div className={styles.form}>
        <div className={styles.stepBadge}>
          <span className={styles.stepNum}>Signatures</span>
          <span className={styles.stepTitle}>Collect & Broadcast</span>
        </div>

        {multisigInfo && (
          <div className={styles.multisigDetails}>
            <div className={styles.multisigBadge}>
              <Users size={14} />
              <span>{multisigInfo.m}-of-{multisigInfo.n} Multisig</span>
            </div>
            <div className={styles.multisigParties}>
              {multisigInfo.pubkeys.map((pk, i) => {
                const addr = multisigInfo.addresses[i];
                return (
                  <div key={i} className={styles.multisigParty}>
                    <span className={styles.multisigPartyLabel}>Key {i + 1}</span>
                    <span className={styles.multisigPartyAddr}>
                      {addr || pk.slice(0, 20) + '...'}
                    </span>
                    {addr === wallet.address && (
                      <span className={styles.youBadge}>You</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Spending Details</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Funding TXID</span>
              <span className={styles.resultValue}>{txid}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Vout</span>
              <span className={styles.resultValue}>{vout}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Amount</span>
              <span className={styles.resultValue}>{amount} BITOK</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Destination</span>
              <span className={styles.resultValue}>{destination}</span>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Fee</span>
              <span className={styles.resultValue}>{fee} BITOK</span>
            </div>
          </div>
          <CopyBtn text={txid} field="txid" />
        </div>

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Unsigned Tx Hex</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultValue}>{unsignedTxHex}</span>
            </div>
          </div>
          <CopyBtn text={unsignedTxHex} field="unsigned-tx" />
        </div>

        <div className={styles.signaturesSection}>
          <div className={styles.signaturesHeader}>
            <span className={styles.resultLabel}>Signatures</span>
            <span className={`${styles.sigCount} ${hasEnough ? styles.sigCountOk : styles.sigCountWarn}`}>
              {validSigs.length} / {reqSigs} required
            </span>
          </div>

          {signatures.map((sig, i) => (
            <div key={i} className={styles.coSignerRow}>
              <Input
                label={sig && i < validSigs.length ? `Signature ${i + 1}` : `Signature Slot ${i + 1}`}
                value={sig}
                onChange={e => {
                  const next = [...signatures];
                  next[i] = e.target.value;
                  setSignatures(next);
                }}
                placeholder="Paste signature hex..."
                mono
                readOnly={!!(sig && i < validSigs.length)}
                hint={sig && i < validSigs.length ? 'Already signed' : 'Paste a signature hex from a co-signer'}
              />
              {signatures.length > 1 && (
                <button
                  className={styles.removeCoSignerBtn}
                  onClick={() => setSignatures(prev => prev.filter((_, idx) => idx !== i))}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <div className={styles.copyRow}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={13} />}
              onClick={() => setSignatures(prev => [...prev, ''])}
            >
              Add Signature Slot
            </Button>
            {wallet.wif && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOnly}
              >
                Sign My Part
              </Button>
            )}
          </div>
        </div>

        {(broadcastError || broadcast.error) && (
          <div className={styles.errorMsg}>
            <AlertCircle size={14} /> {broadcastError || broadcast.error}
          </div>
        )}
        {buildError && (
          <div className={styles.errorMsg}>
            <AlertCircle size={14} /> {buildError}
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setStep('input')}>Back</Button>
          <Button
            onClick={handleBroadcast}
            loading={broadcast.broadcasting}
            disabled={!hasEnough}
            icon={<ArrowRight size={14} />}
          >
            Broadcast ({validSigs.length}/{reqSigs})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>Spend from Multisig</span>
        <span className={styles.infoText}>
          Enter the script hex, funding transaction details, and destination address to build a spending transaction.
        </span>
      </div>

      {multisigInfo && (
        <div className={styles.multisigDetails}>
          <div className={styles.multisigBadge}>
            <Users size={14} />
            <span>{multisigInfo.m}-of-{multisigInfo.n} Multisig</span>
          </div>
          <div className={styles.multisigParties}>
            {multisigInfo.pubkeys.map((pk, i) => {
              const addr = multisigInfo.addresses[i];
              return (
                <div key={i} className={styles.multisigParty}>
                  <span className={styles.multisigPartyLabel}>Key {i + 1}</span>
                  <span className={styles.multisigPartyAddr}>
                    {addr || pk.slice(0, 20) + '...'}
                  </span>
                  {addr === wallet.address && (
                    <span className={styles.youBadge}>You</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!wallet.wif && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> Private key not available. Import your wallet to sign.
        </div>
      )}

      <Input
        label="Script Hex"
        value={scriptHex}
        onChange={e => setScriptHex(e.target.value)}
        placeholder="5221...52ae"
        mono
        hint="The multisig script from contract creation"
      />

      <Input
        label="Funding TXID"
        value={txid}
        onChange={e => setTxid(e.target.value)}
        placeholder="Transaction ID that funded the multisig"
        mono
      />

      <div className={styles.row}>
        <Input
          label="Vout"
          value={vout}
          onChange={e => setVout(e.target.value)}
          placeholder="0"
          type="number"
          min="0"
        />
        <Input
          label="Amount"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00000000"
          type="number"
          min="0"
          step="0.00000001"
          suffix={<span>BITOK</span>}
        />
      </div>

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

      <Input
        label="Send To Address"
        value={destination}
        onChange={e => setDestination(e.target.value)}
        placeholder="Destination address"
        mono
        hint="Where to send the unlocked funds (defaults to your wallet)"
      />

      {buildError && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> {buildError}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={handleReset}>Reset</Button>
        <Button
          onClick={handleBuildTx}
          disabled={!txid.trim() || !scriptHex.trim() || !amount.trim() || !destination.trim()}
          icon={<ArrowRight size={14} />}
        >
          Build & Sign
        </Button>
      </div>
    </div>
  );
}
