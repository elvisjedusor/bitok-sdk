import { useState, useEffect } from 'react';
import { Wallet as WalletClass, isValidAddress, bitokToSatoshis, satoshisToBitok } from 'bitok';
import { Send, CircleCheck as CheckCircle, Circle as XCircle, CircleAlert as AlertCircle, ArrowLeft, Wallet } from 'lucide-react';
import { addPendingTx } from '../store/pendingTxStore';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet } from '../types/wallet';
import { BitokRpc } from 'bitok';
import { useBroadcast } from '../hooks/useBroadcast';
import { useMempool } from '../hooks/useMempool';
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
  const [confirmedBalance, setConfirmedBalance] = useState<number | null>(null);

  const broadcast = useBroadcast(wallet, rpc);
  const mempool = useMempool(rpc, wallet.address);

  useEffect(() => {
    rpc.getAddressBalance(wallet.address)
      .then(sat => setConfirmedBalance(satoshisToBitok(sat)))
      .catch(() => {});
  }, [rpc, wallet.address]);

  const availableBalance = confirmedBalance !== null
    ? Math.max(0, confirmedBalance - mempool.outgoingTotal)
    : null;

  const addressError = mode === 'address' && toAddress && !isValidAddress(toAddress) ? 'Invalid Bitok address' : '';
  const scriptError = mode === 'script' && scriptHex && !/^[0-9a-fA-F]+$/.test(scriptHex.trim()) ? 'Invalid script hex' : '';
  const amountNum = parseFloat(amount);
  const feeNum = parseFloat(fee);
  const amountError = amount && (isNaN(amountNum) || amountNum <= 0) ? 'Enter a valid amount' : '';
  const effectiveFee = isNaN(feeNum) ? parseFloat(DEFAULT_FEE) : feeNum;
  const totalSend = (isNaN(amountNum) ? 0 : amountNum) + effectiveFee;
  const exceedsBalance = availableBalance !== null && amount && !amountError && totalSend > availableBalance;

  const canSend = mode === 'address'
    ? (toAddress && !addressError && amount && !amountError && !exceedsBalance && wallet.wif)
    : (scriptHex.trim() && !scriptError && amount && !amountError && !exceedsBalance && wallet.wif);

  function handleMax() {
    if (availableBalance === null) return;
    const maxAmount = Math.max(0, availableBalance - effectiveFee);
    setAmount(maxAmount > 0 ? maxAmount.toFixed(8) : '0');
  }

  async function handleSend() {
    if (!wallet.wif || !canSend) return;
    setLoading(true);
    try {
      if (mode === 'address') {
        const w = WalletClass.fromWIF(wallet.wif);
        const amountSatoshis = bitokToSatoshis(amount);
        const feeSatoshis = bitokToSatoshis(isNaN(feeNum) ? DEFAULT_FEE : fee);
        const sentTxid = await w.send(rpc, toAddress, amountSatoshis, feeSatoshis);
        addPendingTx({
          txid: sentTxid,
          amount: amountNum,
          fee: isNaN(feeNum) ? parseFloat(DEFAULT_FEE) : feeNum,
          category: 'send',
          address: wallet.address,
          time: Math.floor(Date.now() / 1000),
        });
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
    rpc.getAddressBalance(wallet.address)
      .then(sat => setConfirmedBalance(satoshisToBitok(sat)))
      .catch(() => {});
    mempool.refresh();
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
    const isInputsSpent = /missing inputs/i.test(errMsg) || /inputs.*(spent|missing)/i.test(errMsg);
    const isInsufficientFunds = /insufficient funds/i.test(errMsg);
    const isRejected = /transaction rejected/i.test(errMsg);

    let title = 'Transaction Failed';
    let hint = '';
    if (isInputsSpent) {
      title = 'Inputs Already Spent';
      hint = 'The coins you tried to spend are no longer available. This can happen if this address was used in another wallet or node. Your balance will update on the next refresh.';
    } else if (isInsufficientFunds) {
      title = 'Insufficient Funds';
      hint = 'Your available balance is not enough to cover the amount plus the network fee.';
    } else if (isRejected) {
      hint = 'The network rejected this transaction. The inputs may have been spent from another wallet, or the fee may be too low.';
    }

    return (
      <div className={styles.root}>
        <div className={styles.resultCard}>
          <XCircle size={48} className={styles.errorIcon} />
          <h2 className={styles.resultTitle}>{title}</h2>
          <p className={styles.resultDesc}>{hint || errMsg}</p>
          {hint && errMsg && <p className={styles.resultDetail}>{errMsg}</p>}
          <div className={styles.resultActions}>
            <Button onClick={reset} variant="secondary" fullWidth>Try Again</Button>
          </div>
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

      {availableBalance !== null && (
        <div className={styles.balanceBanner}>
          <Wallet size={14} />
          <span>
            Available: <strong>{availableBalance.toFixed(8)} BITOK</strong>
            {mempool.outgoingTotal > 0 && (
              <span className={styles.balancePending}>
                {' '}(pending out: -{mempool.outgoingTotal.toFixed(4)})
              </span>
            )}
          </span>
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
            <div className={styles.amountField}>
              <Input
                label="Amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00000000"
                type="number"
                min="0"
                step="0.00000001"
                error={exceedsBalance ? `Exceeds available balance (${availableBalance?.toFixed(8)})` : amountError}
                suffix={<span>BITOK</span>}
              />
              {availableBalance !== null && (
                <button className={styles.maxBtn} onClick={handleMax} type="button">
                  MAX
                </button>
              )}
            </div>
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
                <span>{effectiveFee.toFixed(8)} BITOK</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total</span>
                <span>{totalSend.toFixed(8)} BITOK</span>
              </div>
              {availableBalance !== null && (
                <div className={`${styles.summaryRow} ${styles.summaryRemaining}`}>
                  <span>Remaining</span>
                  <span>{Math.max(0, availableBalance - totalSend).toFixed(8)} BITOK</span>
                </div>
              )}
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
