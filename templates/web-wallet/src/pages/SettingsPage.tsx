import { useState } from 'react';
import { BitokRpc } from 'bitok';
import { Server, Shield, Trash2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { StoredWallet, RpcSettings } from '../types/wallet';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  wallet: StoredWallet;
  rpcSettings: RpcSettings;
  onRpcUpdate: (settings: RpcSettings) => void;
  onForgetWallet: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsPage({ wallet, rpcSettings, onRpcUpdate, onForgetWallet }: SettingsPageProps) {
  const [rpc, setRpc] = useState<RpcSettings>({ ...rpcSettings });
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState('');
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

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
          <InfoRow label="Address" value={wallet.address} mono />
          <InfoRow label="Public Key" value={`${wallet.publicKeyHex.slice(0, 32)}...`} mono />
          {wallet.wif && (
            <div className={styles.privKeyRow}>
              <span className={styles.infoLabel}>Private Key (WIF)</span>
              <div className={styles.privKeyValue}>
                <span className={styles.infoValueMono}>
                  {showPrivKey ? wallet.wif : '•'.repeat(52)}
                </span>
                <button className={styles.eyeBtn} onClick={() => setShowPrivKey(!showPrivKey)}>
                  {showPrivKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          )}
          <InfoRow label="Created" value={new Date(wallet.createdAt).toLocaleString()} />
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.infoValueMono : ''}`}>{value}</span>
    </div>
  );
}
