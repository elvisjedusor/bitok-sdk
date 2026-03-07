import { useState } from 'react';
import { Eye, EyeOff, Lock, LogOut } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { decryptWIF } from '../utils/crypto';
import type { StoredWallet } from '../types/wallet';
import styles from './UnlockPage.module.css';

interface UnlockPageProps {
  wallet: StoredWallet;
  onUnlocked: (wif: string) => void;
  onForget: () => void;
}

export function UnlockPage({ wallet, onUnlocked, onForget }: UnlockPageProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  async function handleUnlock() {
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      const wif = await decryptWIF(wallet.encryptedWIF!, password);
      onUnlocked(wif);
    } catch {
      setError('Incorrect password. Please try again.');
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleUnlock();
  }

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <div className={styles.lockIcon}>
          <Lock size={32} />
        </div>
        <h1 className={styles.title}>Unlock Wallet</h1>
        <p className={styles.subtitle}>
          Enter your password to decrypt and access{' '}
          <span className={styles.walletLabel}>{wallet.label}</span>
        </p>
        <div className={styles.addressHint}>
          {wallet.address.slice(0, 12)}...{wallet.address.slice(-8)}
        </div>

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your wallet password"
          error={error}
          autoFocus
          suffix={
            <button className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />

        <Button onClick={handleUnlock} disabled={!password || loading} loading={loading} fullWidth>
          Unlock
        </Button>

        <div className={styles.forgetSection}>
          {!confirmForget ? (
            <button className={styles.forgetLink} onClick={() => setConfirmForget(true)}>
              <LogOut size={13} />
              Forget this wallet
            </button>
          ) : (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>This will remove all local wallet data.</span>
              <div className={styles.confirmActions}>
                <button className={styles.confirmYes} onClick={onForget}>Remove</button>
                <button className={styles.confirmNo} onClick={() => setConfirmForget(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
