import { useState } from 'react';
import { createEscrow, hexToBytes } from 'bitok';
import type { EscrowContract, BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { useBroadcast } from '../../hooks/useBroadcast';
import { encodeConfirmation } from '../../utils/contractString';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Copy, Check, AlertCircle, CheckCircle, Send, Shield } from 'lucide-react';
import styles from './EscrowPage.module.css';

type Step = 'keys' | 'fund' | 'done';

interface EscrowCreateTabProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

export function EscrowCreateTab({ wallet, rpc }: EscrowCreateTabProps) {
  const [step, setStep] = useState<Step>('keys');
  const [sellerKey, setSellerKey] = useState('');
  const [arbitratorKey, setArbitratorKey] = useState('');
  const [contract, setContract] = useState<EscrowContract | null>(null);
  const [error, setError] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fee, setFee] = useState('0.01');
  const [confirmationStr, setConfirmationStr] = useState('');
  const [copiedField, setCopiedField] = useState('');

  const broadcast = useBroadcast(wallet, rpc);

  function handleCreate() {
    setError('');
    if (!sellerKey.trim() || !arbitratorKey.trim()) {
      setError('Seller and arbitrator public keys are required');
      return;
    }
    try {
      const buyerBytes = hexToBytes(wallet.publicKeyHex);
      const sellerBytes = hexToBytes(sellerKey.trim());
      const arbBytes = hexToBytes(arbitratorKey.trim());
      const result = createEscrow(buyerBytes, sellerBytes, arbBytes);
      setContract(result);
      setStep('fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create escrow');
    }
  }

  async function handleFund() {
    if (!contract || !fundAmount.trim()) return;
    try {
      const txid = await broadcast.fundContract(contract.scriptPubKeyHex, fundAmount, fee);
      const encoded = encodeConfirmation({
        scriptHex: contract.scriptPubKeyHex,
        fundingTxid: txid,
        fundingVout: 0,
        fundedAmount: fundAmount,
      });
      setConfirmationStr(encoded);
      setStep('done');
    } catch {
    }
  }

  function handleReset() {
    setSellerKey('');
    setArbitratorKey('');
    setContract(null);
    setError('');
    setFundAmount('');
    setFee('0.01');
    setConfirmationStr('');
    setStep('keys');
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

  if (step === 'done') {
    return (
      <div className={styles.form}>
        <div className={styles.successBox}>
          <CheckCircle size={32} className={styles.successIcon} />
          <div className={styles.successTitle}>Escrow Funded</div>
          <p className={styles.successDesc}>
            Your 2-of-3 escrow has been funded and broadcast to the network.
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
                <span className={styles.resultKey}>Amount</span>
                <span className={styles.resultValue}>{fundAmount} BITOK</span>
              </div>
            </div>
            <CopyBtn text={broadcast.txid} field="txid" />
          </div>
        )}

        {confirmationStr && (
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Confirmation</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                Copy and share this confirmation with the seller and arbitrator. They paste it into the <strong>Spend</strong> tab to create and sign the spending transaction.
              </span>
            </div>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultValue}>{confirmationStr}</span>
              </div>
            </div>
            <CopyBtn text={confirmationStr} field="confirmation" />
          </div>
        )}

        <Button onClick={handleReset} fullWidth>Create Another</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.infoBox}>
        <span className={styles.infoTitle}>Create Escrow</span>
        <span className={styles.infoText}>
          You are the buyer. Enter the seller and arbitrator public keys, then fund the escrow.
          After funding, you get a confirmation to share with the other participants.
          Any 2-of-3 parties can release the funds.
        </span>
      </div>

      {step === 'keys' && (
        <>
          <Input
            label="Buyer Public Key (You)"
            value={wallet.publicKeyHex}
            readOnly
            mono
            hint="Auto-filled from your wallet"
          />
          <Input
            label="Seller Public Key"
            value={sellerKey}
            onChange={e => setSellerKey(e.target.value)}
            placeholder="04..."
            mono
            hint="Ask the seller for their public key (Settings > Wallet Info)"
          />
          <Input
            label="Arbitrator Public Key"
            value={arbitratorKey}
            onChange={e => setArbitratorKey(e.target.value)}
            placeholder="04..."
            mono
            hint="Ask the arbitrator for their public key"
          />
        </>
      )}

      {step === 'fund' && contract && (
        <>
          <div className={styles.resultSection}>
            <span className={styles.resultLabel}>Escrow Created</span>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Type</span>
                <span className={styles.resultValue}>2-of-3 Escrow</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultKey}>Script</span>
                <span className={styles.resultValue}>{contract.scriptPubKeyHex}</span>
              </div>
            </div>
          </div>

          <div className={styles.fundSection}>
            <span className={styles.resultLabel}>Fund Escrow</span>
            <div className={styles.infoBox}>
              <span className={styles.infoText}>
                Lock your BITOK into this escrow. After funding you will receive a confirmation to share with the other parties.
              </span>
            </div>

            {!wallet.wif && (
              <div className={styles.errorMsg}>
                <AlertCircle size={14} /> Private key not available. Import your wallet to fund.
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
        {step === 'fund' && (
          <Button variant="secondary" onClick={handleReset}>Back</Button>
        )}
        {step === 'keys' && (
          <Button onClick={handleCreate} icon={<Shield size={14} />}>
            Create Escrow
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
