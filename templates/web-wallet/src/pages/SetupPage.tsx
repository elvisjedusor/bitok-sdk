import { useState } from 'react';
import { Wallet as WalletClass } from 'bitok';
import { Eye, EyeOff, Plus, Import, AlertTriangle } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet } from '../types/wallet';
import styles from './SetupPage.module.css';

interface SetupPageProps {
  onWalletCreated: (wallet: StoredWallet) => void;
}

type Mode = 'choose' | 'create' | 'import';

export function SetupPage({ onWalletCreated }: SetupPageProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [wif, setWif] = useState('');
  const [label, setLabel] = useState('My Wallet');
  const [showKey, setShowKey] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState<{ address: string; wif: string; publicKey: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  function handleGenerate() {
    const w = WalletClass.generate();
    setGeneratedWallet(w.exportBackup());
    setMode('create');
  }

  function handleCreate() {
    if (!generatedWallet || !confirmed) return;
    const stored: StoredWallet = {
      address: generatedWallet.address,
      publicKeyHex: generatedWallet.publicKey,
      wif: generatedWallet.wif,
      label: label || 'My Wallet',
      createdAt: Date.now(),
    };
    onWalletCreated(stored);
  }

  function handleImport() {
    setError('');
    try {
      const w = WalletClass.fromWIF(wif.trim());
      const stored: StoredWallet = {
        address: w.address,
        publicKeyHex: w.publicKeyHex,
        wif: w.privateKeyWIF,
        label: label || 'Imported Wallet',
        createdAt: Date.now(),
      };
      onWalletCreated(stored);
    } catch {
      setError('Invalid WIF key. Please check and try again.');
    }
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
              <div className={styles.optionIcon}>
                <Plus size={24} />
              </div>
              <div>
                <div className={styles.optionTitle}>Create New Wallet</div>
                <div className={styles.optionDesc}>Generate a fresh key pair</div>
              </div>
            </button>

            <button className={styles.optionCard} onClick={() => setMode('import')}>
              <div className={styles.optionIcon}>
                <Import size={24} />
              </div>
              <div>
                <div className={styles.optionTitle}>Import Existing</div>
                <div className={styles.optionDesc}>Restore from WIF private key</div>
              </div>
            </button>
          </div>

          <div className={styles.notice}>
            <AlertTriangle size={14} />
            <span>This wallet stores keys in browser localStorage. Use for testing only.</span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create' && generatedWallet) {
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

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className={styles.checkbox}
            />
            <span>I have saved my private key in a safe place</span>
          </label>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setMode('choose')}>Back</Button>
            <Button onClick={handleCreate} disabled={!confirmed}>Open Wallet</Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'import') {
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
            error={error}
            suffix={
              <button className={styles.eyeBtn} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />

          <Input label="Wallet Label" value={label} onChange={e => setLabel(e.target.value)} />

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setMode('choose')}>Back</Button>
            <Button onClick={handleImport} disabled={!wif.trim()}>Import</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
