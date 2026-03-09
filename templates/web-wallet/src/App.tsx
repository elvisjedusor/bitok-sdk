import { useState, useEffect, useMemo } from 'react';
import { BitokRpc } from 'bitok';
import { Layout } from './components/Layout';
import { SetupPage } from './pages/SetupPage';
import { UnlockPage } from './pages/UnlockPage';
import { EncryptPromptModal } from './components/EncryptPromptModal';
import { DashboardPage } from './pages/DashboardPage';
import { SendPage } from './pages/SendPage';
import { ReceivePage } from './pages/ReceivePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { EscrowPage } from './pages/escrow/EscrowPage';
import { ContractsPage } from './pages/contracts/ContractsPage';
import { MyContractsPage } from './pages/contracts/MyContractsPage';
import type { ContractAction } from './pages/contracts/MyContractsTab';
import type { WalletView, StoredWallet, RpcSettings } from './types/wallet';
import {
  loadWallet,
  saveWallet,
  saveLegacyWallet,
  isLegacyWallet,
  removeWallet,
  loadRpcSettings,
  saveRpcSettings,
  loadDevMode,
  saveDevMode,
} from './store/walletStore';

export default function App() {
  const [wallet, setWallet] = useState<StoredWallet | null>(loadWallet);
  const [rpcSettings, setRpcSettings] = useState<RpcSettings>(loadRpcSettings);
  const [view, setView] = useState<WalletView>('dashboard');
  const [connected, setConnected] = useState(false);
  const [devMode, setDevMode] = useState(loadDevMode);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [pendingContractAction, setPendingContractAction] = useState<ContractAction | null>(null);
  const [showEncryptPrompt, setShowEncryptPrompt] = useState(false);

  const isLegacy = wallet ? isLegacyWallet(wallet) : false;
  const unlocked = wallet?.wif != null;

  useEffect(() => {
    if (isLegacy && unlocked) {
      setShowEncryptPrompt(true);
    }
  }, [isLegacy, unlocked]);

  const rpc = useMemo(() => {
    return new BitokRpc({ ...rpcSettings, timeout: 5000 });
  }, [rpcSettings]);

  useEffect(() => {
    if (!unlocked) return;
    rpc.getInfo().then(() => setConnected(true)).catch(() => setConnected(false));
  }, [rpc, unlocked]);

  function navigate(v: WalletView) {
    if (v === 'dashboard') setDashboardRefreshKey(k => k + 1);
    setView(v);
  }

  function handleWalletCreated(w: StoredWallet) {
    if (w.encryptedWIF) {
      saveWallet(w);
    } else {
      saveLegacyWallet(w);
    }
    setWallet(w);
    navigate('dashboard');
  }

  function handleUnlocked(wif: string) {
    setWallet(prev => prev ? { ...prev, wif } : prev);
    navigate('dashboard');
  }

  function handleEncrypted(updated: StoredWallet) {
    saveWallet(updated);
    setWallet({ ...updated, wif: wallet?.wif });
    setShowEncryptPrompt(false);
  }

  function handleRpcUpdate(settings: RpcSettings) {
    saveRpcSettings(settings);
    setRpcSettings(settings);
    setConnected(false);
  }

  function handleForgetWallet() {
    removeWallet();
    setWallet(null);
    setView('dashboard');
    setConnected(false);
  }

  function handleDevModeToggle(enabled: boolean) {
    saveDevMode(enabled);
    setDevMode(enabled);
    if (!enabled && ['contracts', 'my-contracts', 'script-builder', 'script-debugger', 'tx-builder', 'decode', 'explorer'].includes(view)) {
      navigate('dashboard');
    }
  }

  if (!wallet) {
    return <SetupPage onWalletCreated={handleWalletCreated} />;
  }

  if (!unlocked) {
    return <UnlockPage wallet={wallet} onUnlocked={handleUnlocked} onForget={handleForgetWallet} />;
  }

  return (
    <>
      <Layout
        activeView={view}
        onNavigate={navigate}
        connected={connected}
        address={wallet.address}
        devMode={devMode}
      >
        {view === 'dashboard' && (
          <DashboardPage
            wallet={wallet}
            rpc={rpc}
            onNavigate={(v) => navigate(v)}
            refreshKey={dashboardRefreshKey}
          />
        )}
        {view === 'send' && (
          <SendPage
            wallet={wallet}
            rpc={rpc}
          />
        )}
        {view === 'receive' && (
          <ReceivePage wallet={wallet} />
        )}
        {view === 'escrow' && (
          <EscrowPage wallet={wallet} rpc={rpc} />
        )}
        {view === 'history' && (
          <HistoryPage rpc={rpc} address={wallet.address} />
        )}
        {view === 'settings' && (
          <SettingsPage
            wallet={wallet}
            rpc={rpc}
            rpcSettings={rpcSettings}
            onRpcUpdate={handleRpcUpdate}
            onForgetWallet={handleForgetWallet}
            devMode={devMode}
            onDevModeToggle={handleDevModeToggle}
            onWalletUpdated={(updated) => setWallet(updated)}
            onResyncComplete={() => setDashboardRefreshKey(k => k + 1)}
          />
        )}
        {view === 'contracts' && (
          <ContractsPage
            wallet={wallet}
            rpc={rpc}
            pendingAction={pendingContractAction}
            onActionConsumed={() => setPendingContractAction(null)}
          />
        )}
        {view === 'my-contracts' && (
          <MyContractsPage
            rpc={rpc}
            address={wallet.address}
            onNavigate={(v, action) => {
              if (action) setPendingContractAction(action);
              navigate(v);
            }}
          />
        )}
      </Layout>

      {showEncryptPrompt && wallet.wif && (
        <EncryptPromptModal
          wallet={wallet}
          onEncrypted={handleEncrypted}
          onDismiss={() => setShowEncryptPrompt(false)}
        />
      )}
    </>
  );
}
