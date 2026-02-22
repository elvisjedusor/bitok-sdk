import { useState } from 'react';
import { Wallet as WalletClass, isValidAddress, bitokToSatoshis } from 'bitok';
import { Send, CheckCircle, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet } from '../types/wallet';
import { BitokRpc } from 'bitok';
import { useBroadcast } from '../hooks/useBroadcast';
import styles from './SendPage.module.css';

interface SendPageProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  initialScriptHex?: string;
  onBack?: () => void;
}

type SendState = 'form' | 'success' | 'error';

const DEFAULT_FEE = '0.01';

export function SendPage({ wallet, rpc, initialScriptHex, onBack }: SendPageProps) {
  const [toAddress, setToAddress] = useState('');
  const [scriptHex, setScriptHex] = useState(initialScriptHex ?? '');
  const [mode, setMode] = useState<'address' | 'script'>(initialScriptHex ? 'script' : 'address');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(DEFAULT_FEE);
  const [state, setState] = useState<SendState>('form');
  const [txid, setTxid] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const broadcast = useBroadcast(wallet, rpc);

  const addressError = mode === 'address' && toAddress && !isValidAddress(toAddress) ? 'Invalid Bitok address' : '';
  const scriptError = mode === 'script' && scriptHex && !/^[0-9a-fA-F]+$/.test(scriptHex.trim()) ? 'Invalid script hex' : '';
  const amountNum = parseFloat(amount);
  const feeNum = parseFloat(fee);
  const amountError = amount && (isNaN(amountNum) || amountNum <= 0) ? 'Enter a valid amount' : '';

  const canSend = mode === 'address'
    ? (toAddress && !addressError && amount && !amountError && wallet.wif)
    : (scriptHex.trim() && !scriptError && amount && !amountError && wallet.wif);

  async function handleSend() {
    if (!wallet.wif || !canSend) return;
    setLoading(true);
    try {
      if (mode === 'address') {
        const w = WalletClass.fromWIF(wallet.wif);
        const amountSatoshis = bitokToSatoshis(amount);
        const feeSatoshis = bitokToSatoshis(isNaN(feeNum) ? DEFAULT_FEE : fee);
        const sentTxid = await w.send(rpc, toAddress, amountSatoshis, feeSatoshis);
        setTxid(sentTxid);
      } else {
        const sentTxid = await broadcast.fundContract(scriptHex.trim(), amount, fee);
        setTxid(sentTxid);
      }
      setState('success');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Transaction failed');
      setState('error');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setToAddress('');
    if (!initialScriptHex) setScriptHex('');
    setAmount('');
    setFee(DEFAULT_FEE);
    setTxid('');
    setErrMsg('');
    setState('form');
    broadcast.reset();
  }

  if (state === 'success') {
    return (
      <div className={styles.root}>
        <div className={styles.resultCard}>
          <CheckCircle size={48} className={styles.successIcon} />
          <h2 className={styles.resultTitle}>Transaction Sent!</h2>
          <p className={styles.resultDesc}>Your transaction has been broadcast to the network.</p>
          <div className={styles.txidBox}>
            <div className={styles.txidLabel}>Transaction ID</div>
            <div className={styles.txidValue}>{txid}</div>
          </div>
          <div className={styles.resultActions}>
            {onBack && (
              <Button onClick={onBack} variant="secondary" fullWidth>Back to Contract</Button>
            )}
            <Button onClick={reset} fullWidth>Send Another</Button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={styles.root}>
        <div className={styles.resultCard}>
          <XCircle size={48} className={styles.errorIcon} />
          <h2 className={styles.resultTitle}>Transaction Failed</h2>
          <p className={styles.resultDesc}>{errMsg}</p>
          <Button onClick={reset} variant="secondary" fullWidth>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <h1 className={styles.pageTitle}>
          {mode === 'script' && initialScriptHex ? 'Fund Contract' : 'Send Bitok'}
        </h1>
        <p className={styles.pageSubtitle}>
          {mode === 'script' && initialScriptHex
            ? 'Send funds directly to a contract script'
            : 'Transfer funds to another address or contract'}
        </p>
      </div>

      {!wallet.wif && (
        <div className={styles.warnBanner}>
          Private key not available. Import your wallet to send transactions.
        </div>
      )}

      <Card>
        <div className={styles.form}>
          {!initialScriptHex && (
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${mode === 'address' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('address')}
              >
                Address
              </button>
              <button
                className={`${styles.modeBtn} ${mode === 'script' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('script')}
              >
                Contract Script
              </button>
            </div>
          )}

          {mode === 'address' ? (
            <Input
              label="Recipient Address"
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
              placeholder="1BitokAddress..."
              mono
              error={addressError}
            />
          ) : (
            <>
              <Input
                label="Contract Script Hex (scriptPubKeyHex)"
                value={scriptHex}
                onChange={e => setScriptHex(e.target.value)}
                readOnly={!!initialScriptHex}
                placeholder="5121...ae"
                mono
                error={scriptError}
                hint={initialScriptHex ? 'Pre-filled from contract creation' : 'Paste the scriptPubKeyHex from the contract creation result'}
              />
              <div className={styles.scriptNote}>
                <AlertCircle size={12} />
                <span>In Bitok, contract scripts are bare. Funds are sent directly to the script bytes, not to a hash address.</span>
              </div>
            </>
          )}

          <div className={styles.row}>
            <Input
              label="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00000000"
              type="number"
              min="0"
              step="0.00000001"
              error={amountError}
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

          {((mode === 'address' && toAddress && amount && !addressError && !amountError) ||
            (mode === 'script' && scriptHex.trim() && amount && !scriptError && !amountError)) && (
            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Amount</span>
                <span>{amountNum.toFixed(8)} BITOK</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Network Fee</span>
                <span>{(isNaN(feeNum) ? parseFloat(DEFAULT_FEE) : feeNum).toFixed(8)} BITOK</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total</span>
                <span>{(amountNum + (isNaN(feeNum) ? parseFloat(DEFAULT_FEE) : feeNum)).toFixed(8)} BITOK</span>
              </div>
            </div>
          )}

          {broadcast.error && (
            <div className={styles.broadcastError}>
              <AlertCircle size={14} /> {broadcast.error}
            </div>
          )}

          <Button
            fullWidth
            icon={<Send size={16} />}
            onClick={handleSend}
            loading={loading || broadcast.broadcasting}
            disabled={!canSend}
          >
            {mode === 'script' ? 'Fund Contract' : 'Send Transaction'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
