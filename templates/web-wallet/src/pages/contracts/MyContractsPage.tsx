import type { BitokRpc } from 'bitok';
import { MyContractsTab } from './MyContractsTab';
import type { ContractAction } from './MyContractsTab';
import type { WalletView } from '../../types/wallet';
import styles from './ContractsPage.module.css';

interface MyContractsPageProps {
  rpc: BitokRpc;
  address: string;
  onNavigate: (view: WalletView, action?: ContractAction) => void;
}

export function MyContractsPage({ rpc, address, onNavigate }: MyContractsPageProps) {
  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Contracts</h1>
        <p className={styles.pageSubtitle}>Browse contract outputs found in your wallet transactions</p>
      </div>
      <MyContractsTab
        rpc={rpc}
        address={address}
        onAction={action => onNavigate('contracts', action)}
      />
    </div>
  );
}
