import { useState, useRef } from 'react';
import { Plus, Send, List } from 'lucide-react';
import type { BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import { Card } from '../../components/Card';
import { EscrowCreateTab } from './EscrowCreateTab';
import { EscrowSpendTab } from './EscrowSpendTab';
import { EscrowListTab } from './EscrowListTab';
import styles from './EscrowPage.module.css';

type Tab = 'create' | 'spend' | 'my-escrows';

interface EscrowPageProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
}

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: 'create', icon: <Plus size={14} />, label: 'Create' },
  { id: 'spend', icon: <Send size={14} />, label: 'Spend' },
  { id: 'my-escrows', icon: <List size={14} />, label: 'My Escrows' },
];

export function EscrowPage({ wallet, rpc }: EscrowPageProps) {
  const [tab, setTab] = useState<Tab>('create');
  const prefillConfirmationRef = useRef<string>('');

  function handleSpendFromList(confirmation: string) {
    prefillConfirmationRef.current = confirmation;
    setTab('spend');
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Escrow</h1>
        <p className={styles.pageSubtitle}>
          2-of-3 escrow between buyer, seller, and arbitrator
        </p>
      </div>

      <div className={styles.tabs}>
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => setTab(id)}
          >
            <span className={styles.tabIcon}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'create' && <EscrowCreateTab wallet={wallet} rpc={rpc} />}
        {tab === 'spend' && (
          <EscrowSpendTab
            wallet={wallet}
            rpc={rpc}
            prefillContract={prefillConfirmationRef.current || undefined}
          />
        )}
        {tab === 'my-escrows' && (
          <EscrowListTab wallet={wallet} rpc={rpc} onSpend={handleSpendFromList} />
        )}
      </Card>
    </div>
  );
}
