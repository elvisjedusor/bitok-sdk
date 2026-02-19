import { useState } from 'react';
import { Wallet as WalletClass, isValidAddress, bitokToSatoshis } from 'bitok';
import { Send, CheckCircle, XCircle } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet } from '../types/wallet';
import { BitokRpc } from 'bitok';
import styles from './SendPage.module.css';

interface SendPageProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

type SendState = 'form' | 'confirm' | 'success' | 'error';

const DEFAULT_FEE = '0.01';

export function SendPage({ wallet, rpc }: SendPageProps) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(DEFAULT_FEE);
  const [state, setState] = useState<SendState>('form');
  const [txid, setTxid] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const addressError = toAddress && !isValidAddress(toAddress) ? 'Invalid Bitok address' : '';
  const amountNum = parseFloat(amount);
  const feeNum = parseFloat(fee);
  const amountError = amount && (isNaN(amountNum) || amountNum <= 0) ? 'Enter a valid amount' : '';
  const canSend = toAddress && !addressError && amount && !amountError && wallet.wif;

  async function handleSend() {
    if (!wallet.wif || !canSend) return;
    setLoading(true);
    try {
      const w = WalletClass.fromWIF(wallet.wif);
      const amountSatoshis = bitokToSatoshis(amount);
      const feeSatoshis = bitokToSatoshis(isNaN(feeNum) ? DEFAULT_FEE : fee);
      const sentTxid = await w.send(rpc, toAddress, amountSatoshis, feeSatoshis);
      setTxid(sentTxid);
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
    setAmount('');
    setFee('0.01');
    setTxid('');
    setErrMsg('');
    setState('form');
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
          <Button onClick={reset} fullWidth>Send Another</Button>
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
        <h1 className={styles.pageTitle}>Send Bitok</h1>
        <p className={styles.pageSubtitle}>Transfer funds to another address</p>
      </div>

      {!wallet.wif && (
        <div className={styles.warnBanner}>
          Private key not available. Import your wallet to send transactions.
        </div>
      )}

      <Card>
        <div className={styles.form}>
          <Input
            label="Recipient Address"
            value={toAddress}
            onChange={e => setToAddress(e.target.value)}
            placeholder="1BitokAddress..."
            mono
            error={addressError}
          />

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

          {toAddress && amount && !addressError && !amountError && (
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

          <Button
            fullWidth
            icon={<Send size={16} />}
            onClick={handleSend}
            loading={loading}
            disabled={!canSend}
          >
            Send Transaction
          </Button>
        </div>
      </Card>
    </div>
  );
}
