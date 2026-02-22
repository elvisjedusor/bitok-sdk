import { useState, useEffect, useMemo } from 'react';
import { BitokRpc } from 'bitok';
import { Layout } from './components/Layout';
import { SetupPage } from './pages/SetupPage';
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
  removeWallet,
  loadRpcSettings,
  saveRpcSettings,
  loadDevMode,
  saveDevMode,
} from './store/walletStore';

export default function App() {
  const [wallet, setWallet] = useState<StoredWallet | null>(loadWallet);
  const [rpcSettings, setRpcSettings] = useState<RpcSettings>(loadRpcSettings);
  const [view, setView] = useState<WalletView>(wallet ? 'dashboard' : 'setup');
  const [connected, setConnected] = useState(false);
  const [devMode, setDevMode] = useState(loadDevMode);
  const [pendingContractAction, setPendingContractAction] = useState<ContractAction | null>(null);

  const rpc = useMemo(() => {
    return new BitokRpc({ ...rpcSettings, timeout: 5000 });
  }, [rpcSettings]);

  useEffect(() => {
    if (!wallet) return;
    rpc.getInfo().then(() => setConnected(true)).catch(() => setConnected(false));
  }, [rpc, wallet]);

  function handleWalletCreated(w: StoredWallet) {
    saveWallet(w);
    setWallet(w);
    setView('dashboard');
  }

  function handleRpcUpdate(settings: RpcSettings) {
    saveRpcSettings(settings);
    setRpcSettings(settings);
    setConnected(false);
  }

  function handleForgetWallet() {
    removeWallet();
    setWallet(null);
    setView('setup');
    setConnected(false);
  }

  function handleDevModeToggle(enabled: boolean) {
    saveDevMode(enabled);
    setDevMode(enabled);
    if (!enabled && ['contracts', 'my-contracts', 'script-builder', 'script-debugger', 'tx-builder', 'decode', 'explorer'].includes(view)) {
      setView('dashboard');
    }
  }

  if (!wallet) {
    return <SetupPage onWalletCreated={handleWalletCreated} />;
  }

  return (
    <Layout
      activeView={view}
      onNavigate={setView}
      connected={connected}
      address={wallet.address}
      devMode={devMode}
    >
      {view === 'dashboard' && (
        <DashboardPage
          wallet={wallet}
          rpc={rpc}
          onNavigate={(v) => setView(v)}
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
          rpcSettings={rpcSettings}
          onRpcUpdate={handleRpcUpdate}
          onForgetWallet={handleForgetWallet}
          devMode={devMode}
          onDevModeToggle={handleDevModeToggle}
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
            setView(v);
          }}
        />
      )}
    </Layout>
  );
}
