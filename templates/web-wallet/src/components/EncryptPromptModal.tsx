import { useState } from 'react';
import { Lock, ShieldAlert, Eye, EyeOff, X } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { encryptWIF } from '../utils/crypto';
import type { StoredWallet } from '../types/wallet';
import styles from './EncryptPromptModal.module.css';

interface EncryptPromptModalProps {
  wallet: StoredWallet;
  onEncrypted: (updated: StoredWallet) => void;
  onDismiss: () => void;
}

export function EncryptPromptModal({ wallet, onEncrypted, onDismiss }: EncryptPromptModalProps) {
  const [step, setStep] = useState<'prompt' | 'set'>('prompt');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEncrypt() {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const encryptedWIF = await encryptWIF(wallet.wif!, password);
      onEncrypted({ ...wallet, encryptedWIF, wif: undefined });
    } catch {
      setError('Encryption failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>

        {step === 'prompt' ? (
          <>
            <div className={styles.iconWrap}>
              <ShieldAlert size={28} />
            </div>
            <h2 className={styles.title}>Your wallet is not protected</h2>
            <p className={styles.desc}>
              Your private key is currently stored in plaintext in your browser's localStorage.
              Any malicious browser extension or XSS attack can read it directly.
            </p>
            <p className={styles.desc}>
              Adding a password encrypts the key with AES-256. Even if localStorage is read, the key cannot be used without your password.
            </p>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={onDismiss}>Keep unencrypted</Button>
              <Button onClick={() => setStep('set')} icon={<Lock size={15} />}>Add a password</Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.iconWrapGood}>
              <Lock size={28} />
            </div>
            <h2 className={styles.title}>Set a wallet password</h2>
            <p className={styles.desc}>
              Choose a strong password. You will need it every time you open this wallet.
              There is no recovery option — if you forget it, you will need your raw WIF key.
            </p>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              suffix={
                <button className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />
            <Input
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              placeholder="Repeat password"
              error={error}
            />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('prompt')}>Back</Button>
              <Button onClick={handleEncrypt} disabled={!password || loading} loading={loading} icon={<Lock size={15} />}>
                Encrypt & Save
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
