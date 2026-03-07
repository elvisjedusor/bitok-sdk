import { useState } from 'react';
import { Wallet as WalletClass } from 'bitok';
import { Eye, EyeOff, Plus, Import, TriangleAlert as AlertTriangle, Lock, ShieldOff } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { encryptWIF } from '../utils/crypto';
import type { StoredWallet } from '../types/wallet';
import styles from './SetupPage.module.css';

interface SetupPageProps {
  onWalletCreated: (wallet: StoredWallet) => void;
}

type Mode = 'choose' | 'create' | 'import';
type PasswordStep = 'ask' | 'set' | 'skip';

export function SetupPage({ onWalletCreated }: SetupPageProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [wif, setWif] = useState('');
  const [label, setLabel] = useState('My Wallet');
  const [showKey, setShowKey] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState<{ address: string; wif: string; publicKey: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [passwordStep, setPasswordStep] = useState<PasswordStep>('ask');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleGenerate() {
    const w = WalletClass.generate();
    setGeneratedWallet(w.exportBackup());
    setPasswordStep('ask');
    setMode('create');
  }

  async function handleFinish(rawWif: string, walletLabel: string, isImport = false) {
    if (passwordStep === 'set') {
      setError('');
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== passwordConfirm) { setError('Passwords do not match.'); return; }
      setLoading(true);
      try {
        const encryptedWIF = await encryptWIF(rawWif, password);
        onWalletCreated({
          address: isImport ? WalletClass.fromWIF(rawWif).address : generatedWallet!.address,
          publicKeyHex: isImport ? WalletClass.fromWIF(rawWif).publicKeyHex : generatedWallet!.publicKey,
          encryptedWIF,
          label: walletLabel || (isImport ? 'Imported Wallet' : 'My Wallet'),
          createdAt: Date.now(),
        });
      } catch {
        setError('Encryption failed. Please try again.');
        setLoading(false);
      }
    } else {
      onWalletCreated({
        address: isImport ? WalletClass.fromWIF(rawWif).address : generatedWallet!.address,
        publicKeyHex: isImport ? WalletClass.fromWIF(rawWif).publicKeyHex : generatedWallet!.publicKey,
        wif: rawWif,
        label: walletLabel || (isImport ? 'Imported Wallet' : 'My Wallet'),
        createdAt: Date.now(),
      });
    }
  }

  async function handleCreate() {
    if (!generatedWallet || !confirmed) return;
    await handleFinish(generatedWallet.wif, label);
  }

  async function handleImport() {
    setError('');
    if (!wif.trim()) return;
    setLoading(true);
    try {
      WalletClass.fromWIF(wif.trim());
    } catch {
      setError('Invalid WIF key. Please check and try again.');
      setLoading(false);
      return;
    }
    await handleFinish(wif.trim(), label, true);
  }

  if (mode === 'choose') {
    return (
      <div className={styles.root}>
        <div className={styles.container}>
          <div className={styles.hero}>
            <img src="/bc.png" alt="Bitok" className={styles.heroIcon} />
            <h1 className={styles.title}>Bitok Web Wallet</h1>
            <p className={styles.subtitle}>
              A lightweight, browser-based wallet for the Bitok network.
              Your keys never leave your device.
            </p>
          </div>

          <div className={styles.options}>
            <button className={styles.optionCard} onClick={handleGenerate}>
              <div className={styles.optionIcon}><Plus size={24} /></div>
              <div>
                <div className={styles.optionTitle}>Create New Wallet</div>
                <div className={styles.optionDesc}>Generate a fresh key pair</div>
              </div>
            </button>

            <button className={styles.optionCard} onClick={() => { setPasswordStep('ask'); setMode('import'); }}>
              <div className={styles.optionIcon}><Import size={24} /></div>
              <div>
                <div className={styles.optionTitle}>Import Existing</div>
                <div className={styles.optionDesc}>Restore from WIF private key</div>
              </div>
            </button>
          </div>

    
        </div>
      </div>
    );
  }

  if (mode === 'create' && generatedWallet) {
    if (passwordStep === 'ask') {
      return (
        <div className={styles.root}>
          <div className={styles.container}>
            <h2 className={styles.stepTitle}>Protect Your Wallet</h2>
            <p className={styles.stepDesc}>
              Do you want to encrypt your private key with a password?
            </p>

            <div className={styles.securityCard}>
              <div className={styles.securityOption} onClick={() => setPasswordStep('set')}>
                <div className={styles.securityIconGood}><Lock size={22} /></div>
                <div>
                  <div className={styles.securityTitle}>Yes, use a password</div>
                  <div className={styles.securityDesc}>
                    Your private key is encrypted — even if malware reads localStorage, it cannot steal your funds without the password.
                  </div>
                </div>
              </div>

              <div className={styles.securityOption} onClick={() => setPasswordStep('skip')}>
                <div className={styles.securityIconWarn}><ShieldOff size={22} /></div>
                <div>
                  <div className={styles.securityTitle}>Skip, store unencrypted</div>
                  <div className={styles.securityDesc}>
                    Your private key is stored in plaintext. Any malicious browser extension or XSS attack can read it directly from localStorage.
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setMode('choose')}>Back</Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.root}>
        <div className={styles.container}>
          <h2 className={styles.stepTitle}>Save Your Keys</h2>
          <p className={styles.stepDesc}>
            Write down or securely store your private key. You cannot recover it if lost.
          </p>

          <div className={styles.keyBox}>
            <div className={styles.keyLabel}>Address</div>
            <div className={styles.keyValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              {generatedWallet.address}
            </div>
          </div>

          <div className={styles.keyBox}>
            <div className={styles.keyBoxHeader}>
              <div className={styles.keyLabel}>Private Key (WIF)</div>
              <button className={styles.toggleBtn} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className={styles.keyValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              {showKey ? generatedWallet.wif : '•'.repeat(52)}
            </div>
          </div>

          <div className={styles.warning}>
            <AlertTriangle size={14} />
            <span>Never share your private key. Anyone with it can access your funds.</span>
          </div>

          <Input label="Wallet Label" value={label} onChange={e => setLabel(e.target.value)} />

          {passwordStep === 'set' && (
            <div className={styles.passwordSection}>
              <div className={styles.passwordHeader}><Lock size={14} /><span>Encrypt with password</span></div>
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
            </div>
          )}

          {passwordStep === 'skip' && (
            <div className={styles.skipWarning}>
              <AlertTriangle size={14} />
              <span>Your private key will be stored unencrypted in localStorage.</span>
            </div>
          )}

          <label className={styles.checkLabel}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className={styles.checkbox} />
            <span>I have saved my private key in a safe place</span>
          </label>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setPasswordStep('ask')}>Back</Button>
            <Button onClick={handleCreate} disabled={!confirmed || loading} loading={loading}>Open Wallet</Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'import') {
    if (passwordStep === 'ask') {
      return (
        <div className={styles.root}>
          <div className={styles.container}>
            <h2 className={styles.stepTitle}>Protect Your Wallet</h2>
            <p className={styles.stepDesc}>Do you want to encrypt your private key with a password?</p>

            <div className={styles.securityCard}>
              <div className={styles.securityOption} onClick={() => setPasswordStep('set')}>
                <div className={styles.securityIconGood}><Lock size={22} /></div>
                <div>
                  <div className={styles.securityTitle}>Yes, use a password</div>
                  <div className={styles.securityDesc}>
                    Your private key is encrypted — even if malware reads localStorage, it cannot steal your funds without the password.
                  </div>
                </div>
              </div>

              <div className={styles.securityOption} onClick={() => setPasswordStep('skip')}>
                <div className={styles.securityIconWarn}><ShieldOff size={22} /></div>
                <div>
                  <div className={styles.securityTitle}>Skip, store unencrypted</div>
                  <div className={styles.securityDesc}>
                    Your private key is stored in plaintext. Any malicious browser extension or XSS attack can read it directly from localStorage.
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setMode('choose')}>Back</Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.root}>
        <div className={styles.container}>
          <h2 className={styles.stepTitle}>Import Wallet</h2>
          <p className={styles.stepDesc}>Enter your WIF-encoded private key to restore your wallet.</p>

          <Input
            label="Private Key (WIF)"
            type={showKey ? 'text' : 'password'}
            value={wif}
            onChange={e => setWif(e.target.value)}
            mono
            placeholder="5HueCGU8rMjxECyDialwujzDmLpRmw9..."
            error={passwordStep === 'skip' || passwordStep === 'set' ? error : ''}
            suffix={
              <button className={styles.eyeBtn} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />

          <Input label="Wallet Label" value={label} onChange={e => setLabel(e.target.value)} />

          {passwordStep === 'set' && (
            <div className={styles.passwordSection}>
              <div className={styles.passwordHeader}><Lock size={14} /><span>Encrypt with password</span></div>
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
            </div>
          )}

          {passwordStep === 'skip' && (
            <div className={styles.skipWarning}>
              <AlertTriangle size={14} />
              <span>Your private key will be stored unencrypted in localStorage.</span>
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setPasswordStep('ask')}>Back</Button>
            <Button onClick={handleImport} disabled={!wif.trim() || loading} loading={loading}>Import</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
