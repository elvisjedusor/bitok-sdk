import { useState } from 'react';
import { BitokRpc } from 'bitok';
import { Server, Shield, Trash2, CircleCheck as CheckCircle, Circle as XCircle, Eye, EyeOff, Code as Code2, Copy, Check, KeyRound, Lock } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet, RpcSettings } from '../types/wallet';
import { decryptWIF, encryptWIF } from '../utils/crypto';
import { saveWallet } from '../store/walletStore';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  wallet: StoredWallet;
  rpcSettings: RpcSettings;
  onRpcUpdate: (settings: RpcSettings) => void;
  onForgetWallet: () => void;
  devMode: boolean;
  onDevModeToggle: (enabled: boolean) => void;
  onWalletUpdated: (wallet: StoredWallet) => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsPage({ wallet, rpcSettings, onRpcUpdate, onForgetWallet, devMode, onDevModeToggle, onWalletUpdated }: SettingsPageProps) {
  const [rpc, setRpc] = useState<RpcSettings>({ ...rpcSettings });
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  const isEncrypted = !!wallet.encryptedWIF;

  function handleRpcChange(field: keyof RpcSettings, value: string | number) {
    setRpc(prev => ({ ...prev, [field]: value }));
    setTestState('idle');
  }

  function handleSave() {
    onRpcUpdate(rpc);
  }

  async function handleTest() {
    setTestState('testing');
    setTestError('');
    try {
      const client = new BitokRpc({ ...rpc, timeout: 5000 });
      await client.getInfo();
      setTestState('ok');
    } catch (err) {
      setTestState('fail');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Node connection and wallet preferences</p>
      </div>

      <Card title="Node Connection" subtitle="Configure your Bitok RPC endpoint" action={<Server size={18} className={styles.cardIcon} />}>
        <div className={styles.form}>
          <div className={styles.row}>
            <Input
              label="Host"
              value={rpc.host}
              onChange={e => handleRpcChange('host', e.target.value)}
              placeholder="127.0.0.1"
            />
            <Input
              label="Port"
              value={rpc.port.toString()}
              onChange={e => handleRpcChange('port', parseInt(e.target.value) || 8332)}
              type="number"
              placeholder="8332"
            />
          </div>
          <div className={styles.row}>
            <Input
              label="RPC User"
              value={rpc.user}
              onChange={e => handleRpcChange('user', e.target.value)}
              placeholder="rpcuser"
            />
            <Input
              label="RPC Password"
              value={rpc.password}
              onChange={e => handleRpcChange('password', e.target.value)}
              type="password"
              placeholder="rpcpassword"
            />
          </div>
          <div className={styles.protocolRow}>
            <span className={styles.labelText}>Protocol</span>
            <div className={styles.toggleGroup}>
              <button
                className={`${styles.toggleBtn} ${rpc.protocol === 'http' ? styles.toggleActive : ''}`}
                onClick={() => handleRpcChange('protocol', 'http')}
              >HTTP</button>
              <button
                className={`${styles.toggleBtn} ${rpc.protocol === 'https' ? styles.toggleActive : ''}`}
                onClick={() => handleRpcChange('protocol', 'https')}
              >HTTPS</button>
            </div>
          </div>

          {testState === 'ok' && (
            <div className={styles.testResult + ' ' + styles.testOk}>
              <CheckCircle size={14} /> Connected successfully
            </div>
          )}
          {testState === 'fail' && (
            <div className={styles.testResult + ' ' + styles.testFail}>
              <XCircle size={14} /> {testError || 'Connection failed'}
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" loading={testState === 'testing'} onClick={handleTest}>
              Test Connection
            </Button>
            <Button onClick={handleSave}>Save Settings</Button>
          </div>
        </div>
      </Card>

      <Card title="Wallet Info" subtitle="Your address and key details" action={<Shield size={18} className={styles.cardIcon} />}>
        <div className={styles.infoGrid}>
          <InfoRow label="Label" value={wallet.label} />
          <InfoRow label="Address" value={wallet.address} mono copyable copiedField={copiedField} onCopy={setCopiedField} />
          <InfoRow label="Public Key" value={wallet.publicKeyHex} mono copyable copiedField={copiedField} onCopy={setCopiedField} />
          {wallet.wif && (
            <PrivateKeyRow
              wallet={wallet}
              isEncrypted={isEncrypted}
              copiedField={copiedField}
              onCopy={setCopiedField}
            />
          )}
          <InfoRow label="Created" value={new Date(wallet.createdAt).toLocaleString()} />
        </div>
      </Card>

      {isEncrypted && (
        <ChangePasswordCard wallet={wallet} onWalletUpdated={onWalletUpdated} />
      )}

      <Card title="Developer Mode" subtitle="Access advanced scripting and contract tools" action={<Code2 size={18} className={styles.cardIcon} />}>
        <div className={styles.devModeSection}>
          <div className={styles.devModeRow}>
            <div className={styles.devModeInfo}>
              <span className={styles.devModeLabel}>Enable Developer Tools</span>
              <span className={styles.devModeDesc}>
                Adds Script Developing tools.
              </span>
            </div>
            <button
              className={`${styles.devToggle} ${devMode ? styles.devToggleOn : ''}`}
              onClick={() => onDevModeToggle(!devMode)}
              role="switch"
              aria-checked={devMode}
            >
              <span className={styles.devToggleThumb} />
            </button>
          </div>
        </div>
      </Card>

      <Card title="Danger Zone" subtitle="Irreversible wallet actions">
        <div className={styles.dangerSection}>
          <p className={styles.dangerText}>
            Removing your wallet from this browser will delete all stored data.
            Make sure you have your private key backed up before proceeding.
          </p>
          {!confirmForget ? (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirmForget(true)}>
              Remove Wallet
            </Button>
          ) : (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>Are you sure? This cannot be undone.</span>
              <Button variant="danger" onClick={onForgetWallet}>Yes, Remove</Button>
              <Button variant="secondary" onClick={() => setConfirmForget(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PrivateKeyRow({ wallet, isEncrypted, copiedField, onCopy }: {
  wallet: StoredWallet;
  isEncrypted: boolean;
  copiedField: string;
  onCopy: (f: string) => void;
}) {
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [askPassword, setAskPassword] = useState(false);

  async function handleReveal() {
    if (!isEncrypted) {
      setShowPrivKey(true);
      return;
    }
    setAskPassword(true);
    setConfirmError('');
    setConfirmPassword('');
  }

  async function handleConfirmPassword() {
    if (!wallet.encryptedWIF) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await decryptWIF(wallet.encryptedWIF, confirmPassword);
      setShowPrivKey(true);
      setAskPassword(false);
      setConfirmPassword('');
    } catch {
      setConfirmError('Incorrect password');
    } finally {
      setConfirming(false);
    }
  }

  function handleHide() {
    setShowPrivKey(false);
    setAskPassword(false);
    setConfirmPassword('');
    setConfirmError('');
  }

  return (
    <div className={styles.privKeySection}>
      <div className={styles.privKeyRow}>
        <span className={styles.infoLabel}>Private Key (WIF)</span>
        <div className={styles.privKeyValue}>
          {showPrivKey ? (
            <>
              <span className={styles.infoValueMono}>{wallet.wif}</span>
              {wallet.wif && (
                <CopyButton value={wallet.wif} field="wif" copiedField={copiedField} onCopy={onCopy} />
              )}
              <button className={styles.eyeBtn} onClick={handleHide}>
                <EyeOff size={13} />
              </button>
            </>
          ) : (
            <>
              <span className={styles.infoValueMono}>{'\u2022'.repeat(52)}</span>
              <button className={styles.eyeBtn} onClick={handleReveal}>
                <Eye size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {askPassword && !showPrivKey && (
        <div className={styles.privKeyConfirm}>
          <p className={styles.privKeyConfirmHint}>Enter your wallet password to reveal the private key</p>
          <div className={styles.privKeyConfirmRow}>
            <Input
              label=""
              type="password"
              placeholder="Wallet password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setConfirmError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleConfirmPassword()}
              error={confirmError}
            />
            <Button loading={confirming} onClick={handleConfirmPassword}>Reveal</Button>
            <Button variant="secondary" onClick={() => { setAskPassword(false); setConfirmPassword(''); setConfirmError(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePasswordCard({ wallet, onWalletUpdated }: {
  wallet: StoredWallet;
  onWalletUpdated: (wallet: StoredWallet) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleChangePassword() {
    setError('');
    setSuccess(false);

    if (!newPassword) {
      setError('New password cannot be empty');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }
    if (!wallet.encryptedWIF) return;

    setSaving(true);
    try {
      const wif = await decryptWIF(wallet.encryptedWIF, currentPassword);
      const newEncryptedWIF = await encryptWIF(wif, newPassword);
      const updated: StoredWallet = { ...wallet, encryptedWIF: newEncryptedWIF, wif };
      saveWallet(updated);
      onWalletUpdated(updated);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setError('Current password is incorrect');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Change Password" subtitle="Re-encrypt your wallet with a new password" action={<Lock size={18} />}>
      <div className={styles.form}>
        <Input
          label="Current Password"
          type="password"
          placeholder="Enter current password"
          value={currentPassword}
          onChange={e => { setCurrentPassword(e.target.value); setError(''); setSuccess(false); }}
        />
        <Input
          label="New Password"
          type="password"
          placeholder="Enter new password"
          value={newPassword}
          onChange={e => { setNewPassword(e.target.value); setError(''); setSuccess(false); }}
        />
        <Input
          label="Confirm New Password"
          type="password"
          placeholder="Repeat new password"
          value={confirmNewPassword}
          onChange={e => { setConfirmNewPassword(e.target.value); setError(''); setSuccess(false); }}
          onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
          error={error}
        />
        {success && (
          <div className={styles.testResult + ' ' + styles.testOk}>
            <CheckCircle size={14} /> Password changed successfully
          </div>
        )}
        <div className={styles.actions}>
          <Button icon={<KeyRound size={15} />} loading={saving} onClick={handleChangePassword}>
            Change Password
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CopyButton({ value, field, copiedField, onCopy }: { value: string; field: string; copiedField: string; onCopy: (f: string) => void }) {
  const copied = copiedField === field;
  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    onCopy(field);
    setTimeout(() => onCopy(''), 2000);
  }
  return (
    <button className={`${styles.copyBtn} ${copied ? styles.copiedBtn : ''}`} onClick={handleCopy}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function InfoRow({ label, value, mono, copyable, copiedField, onCopy }: { label: string; value: string; mono?: boolean; copyable?: boolean; copiedField?: string; onCopy?: (f: string) => void }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <div className={styles.infoValueRow}>
        <span className={`${styles.infoValue} ${mono ? styles.infoValueMono : ''}`}>{value}</span>
        {copyable && onCopy && copiedField !== undefined && (
          <CopyButton value={value} field={label} copiedField={copiedField} onCopy={onCopy} />
        )}
      </div>
    </div>
  );
}
