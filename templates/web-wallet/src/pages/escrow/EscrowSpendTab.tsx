import { useState } from 'react';
import {
  TransactionBuilder,
  bitokToSatoshis,
  bytesToHex,
  hexToBytes,
  serializeTransaction,
  publicKeyToAddress,
  parseScript,
  classifyScript,
} from 'bitok';
import type { BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { decodeConfirmation, encodeConfirmation, isConfirmationString } from '../../utils/contractString';
import { isOutputSpentByTxid } from '../../utils/txout';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  Copy, Check, AlertCircle, CheckCircle, ArrowRight,
  Users, Plus, Trash2,
} from 'lucide-react';
import styles from './EscrowPage.module.css';

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

function extractPubkeysFromScript(scriptHex: string): string[] {
  try {
    const bytes = hexToBytes(scriptHex);
    if (classifyScript(bytes) !== 'multisig') return [];
    const tokens = parseScript(bytes);
    const pks: string[] = [];
    for (let i = 1; i < tokens.length - 2; i++) {
      const tok = tokens[i];
      if (tok.data && tok.data.length === 65) pks.push(bytesToHex(tok.data));
    }
    return pks;
  } catch {
    return [];
  }
}

type Step = 'paste' | 'setup' | 'collect';

interface EscrowSpendTabProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  prefillContract?: string;
}

export function EscrowSpendTab({ wallet, rpc, prefillContract }: EscrowSpendTabProps) {
  const [step, setStep] = useState<Step>('paste');
  const [confirmationInput, setConfirmationInput] = useState(prefillContract ?? '');
  const [parseError, setParseError] = useState('');

  const [txid, setTxid] = useState('');
  const [vout, setVout] = useState('0');
  const [scriptHex, setScriptHex] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('0.01');
  const [destination, setDestination] = useState(wallet.address);
  const [pubkeys, setPubkeys] = useState<string[]>([]);

  const [unsignedTxHex, setUnsignedTxHex] = useState('');
  const [signatures, setSignatures] = useState<string[]>(['']);
  const [copiedField, setCopiedField] = useState('');
  const [buildError, setBuildError] = useState('');
  const [broadcastError, setBroadcastError] = useState('');
  const [outputConfirmation, setOutputConfirmation] = useState('');

  const broadcast = useBroadcast(wallet, rpc);

  const [loadingSpent, setLoadingSpent] = useState(false);

  async function handleLoadConfirmation() {
    setParseError('');
    const input = confirmationInput.trim();
    if (!input) {
      setParseError('Paste a confirmation to continue.');
      return;
    }

    if (!isConfirmationString(input)) {
      setParseError('Not a valid confirmation. It should start with "BTOK".');
      return;
    }

    const payload = decodeConfirmation(input);
    if (!payload) {
      setParseError('Invalid confirmation. Could not decode.');
      return;
    }

    if (payload.fundingTxid && payload.fundingVout !== undefined) {
      setLoadingSpent(true);
      try {
        const spent = await isOutputSpentByTxid(rpc, payload.fundingTxid, payload.fundingVout);
        if (spent) {
          setParseError('This escrow output has already been spent. It cannot be spent again.');
          setLoadingSpent(false);
          return;
        }
      } catch {
      } finally {
        setLoadingSpent(false);
      }
    }

    setScriptHex(payload.scriptHex);
    setPubkeys(extractPubkeysFromScript(payload.scriptHex));
    if (payload.fundingTxid) setTxid(payload.fundingTxid);
    if (payload.fundingVout !== undefined) setVout(String(payload.fundingVout));
    if (payload.fundedAmount) setAmount(payload.fundedAmount);
    if (payload.destination) setDestination(payload.destination);
    if (payload.fee) setFee(payload.fee);

    if (payload.unsignedTxHex && payload.signatures?.length) {
      setUnsignedTxHex(payload.unsignedTxHex);
      setSignatures([...payload.signatures, '']);
      if (payload.destination) setDestination(payload.destination);
      setStep('collect');
      return;
    }

    setStep('setup');
  }

  function handleBuildTx() {
    setBuildError('');
    try {
      const hex = buildUnsignedTxHex(txid.trim(), parseInt(vout), amount, fee, destination.trim());
      setUnsignedTxHex(hex);

      let firstSig = '';
      if (wallet.wif) {
        firstSig = broadcast.signMultisigPartial(hex, scriptHex.trim(), wallet.wif);
      }
      setSignatures([firstSig]);
      generateOutputString(hex, destination.trim(), fee, [firstSig]);
      setStep('collect');
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to build transaction');
    }
  }

  function generateOutputString(txHex: string, dest: string, feeVal: string, sigs: string[]) {
    const validSigs = sigs.filter(s => s.trim());
    setOutputConfirmation(encodeConfirmation({
      scriptHex,
      fundingTxid: txid,
      fundingVout: parseInt(vout),
      fundedAmount: amount,
      unsignedTxHex: txHex,
      destination: dest,
      fee: feeVal,
      signatures: validSigs,
    }));
  }

  function handleSignMyPart() {
    setBuildError('');
    if (!wallet.wif) return;
    try {
      const mySig = broadcast.signMultisigPartial(unsignedTxHex, scriptHex.trim(), wallet.wif);
      const existingSigs = signatures.filter(s => s.trim());
      const allSigs = [...existingSigs, mySig];
      setSignatures([...allSigs, '']);
      generateOutputString(unsignedTxHex, destination, fee, allSigs);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to sign');
    }
  }

  async function handleBroadcast() {
    setBroadcastError('');
    const validSigs = signatures.map(s => s.trim()).filter(Boolean);
    if (validSigs.length < 2) {
      setBroadcastError(`Need 2 signatures, have ${validSigs.length}.`);
      return;
    }
    try {
      await broadcast.broadcastMultisig(unsignedTxHex, scriptHex.trim(), validSigs);
    } catch {
    }
  }

  function handleReset() {
    setStep('paste');
    setConfirmationInput('');
    setParseError('');
    setTxid('');
    setVout('0');
    setScriptHex('');
    setAmount('');
    setFee('0.01');
    setDestination(wallet.address);
    setPubkeys([]);
    setUnsignedTxHex('');
    setSignatures(['']);
    setBuildError('');
    setBroadcastError('');
    setOutputConfirmation('');
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

  function PartyInfo() {
    if (!pubkeys.length) return null;
    const labels = ['Buyer', 'Seller', 'Arbitrator'];
    return (
      <div className={styles.partyDetails}>
        <div className={styles.partyBadge}>
          <Users size={14} />
          <span>2-of-3 Escrow</span>
        </div>
        <div className={styles.partyList}>
          {pubkeys.map((pk, i) => {
            let addr = '';
            try { addr = publicKeyToAddress(hexToBytes(pk)); } catch { /* */ }
            return (
              <div key={i} className={styles.partyRow}>
                <span className={styles.partyLabel}>{labels[i] || `Key ${i + 1}`}</span>
                <span className={styles.partyAddr}>{addr || pk.slice(0, 20) + '...'}</span>
                {addr === wallet.address && <span className={styles.youBadge}>You</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (broadcast.txid) {
    return (
      <div className={styles.form}>
        <div className={styles.successBox}>
          <CheckCircle size={32} className={styles.successIcon} />
          <div className={styles.successTitle}>Escrow Released</div>
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

  if (step === 'paste') {
    return (
      <div className={styles.form}>
        <div className={styles.infoBox}>
          <span className={styles.infoTitle}>Spend from Escrow</span>
          <span className={styles.infoText}>
            Paste the confirmation shared by the buyer or another participant.
            It contains all the escrow details including the script, funding info, and any existing signatures.
          </span>
        </div>

        <Input
          label="Confirmation"
          value={confirmationInput}
          onChange={e => setConfirmationInput(e.target.value)}
          placeholder="BTOK2:..."
          mono
          hint="Paste the confirmation shared by the buyer or another signer"
        />

        {parseError && (
          <div className={styles.errorMsg}>
            <AlertCircle size={14} /> {parseError}
          </div>
        )}

        <div className={styles.actions}>
          <Button
            onClick={handleLoadConfirmation}
            loading={loadingSpent}
            icon={<ArrowRight size={14} />}
          >
            Load Confirmation
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'collect' && unsignedTxHex) {
    const validSigs = signatures.map(s => s.trim()).filter(Boolean);
    const hasEnough = validSigs.length >= 2;

    return (
      <div className={styles.form}>
        <div className={styles.stepBadge}>
          <span className={styles.stepNum}>Signatures</span>
          <span className={styles.stepTitle}>Collect & Broadcast</span>
        </div>

        <PartyInfo />

        <div className={styles.resultSection}>
          <span className={styles.resultLabel}>Spending Details</span>
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
              <span className={styles.resultKey}>Funding TXID</span>
              <span className={styles.resultValue}>{txid.slice(0, 16)}...{txid.slice(-8)}</span>
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
        </div>

        <div className={styles.signaturesSection}>
          <div className={styles.signaturesHeader}>
            <span className={styles.resultLabel}>Signatures</span>
            <span className={`${styles.sigCount} ${hasEnough ? styles.sigCountOk : styles.sigCountWarn}`}>
              {validSigs.length} / 2 required
            </span>
          </div>

          {signatures.map((sig, i) => (
            <div key={i} className={styles.sigRow}>
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
                  className={styles.removeSigBtn}
                  onClick={() => setSignatures(prev => prev.filter((_, idx) => idx !== i))}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <div className={styles.sigActions}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={13} />}
              onClick={() => setSignatures(prev => [...prev, ''])}
            >
              Add Signature Slot
            </Button>
            {wallet.wif && (
              <Button variant="ghost" size="sm" onClick={handleSignMyPart}>
                Sign My Part
              </Button>
            )}
          </div>
        </div>

        {outputConfirmation && !hasEnough && (
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Share Confirmation</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                Not enough signatures yet. Copy this updated confirmation (includes your signature) and share with the next signer.
              </span>
            </div>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultValue}>{outputConfirmation}</span>
              </div>
            </div>
            <CopyBtn text={outputConfirmation} field="output-confirmation" />
          </div>
        )}

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
          <Button variant="secondary" onClick={() => setStep('paste')}>Back</Button>
          <Button
            onClick={handleBroadcast}
            loading={broadcast.broadcasting}
            disabled={!hasEnough}
            icon={<ArrowRight size={14} />}
          >
            Broadcast ({validSigs.length}/2)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.stepBadge}>
        <span className={styles.stepNum}>Setup</span>
        <span className={styles.stepTitle}>Build Spending Transaction</span>
      </div>

      <PartyInfo />

      {!wallet.wif && (
        <div className={styles.errorMsg}>
          <AlertCircle size={14} /> Private key not available. Import your wallet to sign.
        </div>
      )}

      <div className={styles.resultSection}>
        <span className={styles.resultLabel}>Funding Details</span>
        <div className={styles.resultBox}>
          <div className={styles.resultRow}>
            <span className={styles.resultKey}>TXID</span>
            <span className={styles.resultValue}>{txid || '(not set)'}</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultKey}>Vout</span>
            <span className={styles.resultValue}>{vout}</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultKey}>Amount</span>
            <span className={styles.resultValue}>{amount || '(not set)'} BITOK</span>
          </div>
        </div>
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
        hint="Where to send the released funds (defaults to your wallet)"
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
