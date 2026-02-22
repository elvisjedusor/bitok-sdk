import { useState, useEffect } from 'react';
import { Lock, Users, FileText, Plus, Unlock, ArrowRight } from 'lucide-react';
import type { BitokRpc } from 'bitok';
import type { StoredWallet } from '../../types/wallet';
import type { ContractAction } from './MyContractsTab';
import { Card } from '../../components/Card';
import { HashlockForm } from './HashlockForm';
import { MultisigForm } from './MultisigForm';
import { SpendMultisigForm } from './SpendMultisigForm';
import { OpReturnForm } from './OpReturnForm';
import { ClaimRedeemForm } from './ClaimRedeemForm';
import styles from './ContractsPage.module.css';

type TopTab = 'hashlock' | 'multisig' | 'opreturn';
type HashlockSub = 'create' | 'claim';
type MultisigSub = 'create' | 'spend';

interface ContractsPageProps {
  wallet: StoredWallet;
  rpc: BitokRpc;
  pendingAction?: ContractAction | null;
  onActionConsumed?: () => void;
}

const TOP_TABS: { id: TopTab; icon: React.ReactNode; label: string }[] = [
  { id: 'hashlock', icon: <Lock size={14} />, label: 'Hashlock / HTLC' },
  { id: 'multisig', icon: <Users size={14} />, label: 'Multisig (m-of-n)' },
  { id: 'opreturn', icon: <FileText size={14} />, label: 'OP_RETURN' },
];

export function ContractsPage({ wallet, rpc, pendingAction, onActionConsumed }: ContractsPageProps) {
  const [topTab, setTopTab] = useState<TopTab>('hashlock');
  const [hashlockSub, setHashlockSub] = useState<HashlockSub>('create');
  const [multisigSub, setMultisigSub] = useState<MultisigSub>('create');
  const [prefill, setPrefill] = useState<ContractAction | null>(null);

  useEffect(() => {
    if (!pendingAction) return;
    setPrefill(pendingAction);
    if (pendingAction.type === 'spend-multisig') {
      setTopTab('multisig');
      setMultisigSub('spend');
    } else if (pendingAction.type === 'claim-hashlock' || pendingAction.type === 'claim-htlc') {
      setTopTab('hashlock');
      setHashlockSub('claim');
    }
    onActionConsumed?.();
  }, [pendingAction]);

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Contract Templates</h1>
        <p className={styles.pageSubtitle}>Build, fund, and interact with Bitok smart contracts</p>
      </div>

      <div className={styles.tabs}>
        {TOP_TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            className={`${styles.tab} ${topTab === id ? styles.tabActive : ''}`}
            onClick={() => setTopTab(id)}
          >
            <span className={styles.tabIcon}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {topTab === 'hashlock' && (
        <>
          <div className={styles.subTabs}>
            <button
              className={`${styles.subTab} ${hashlockSub === 'create' ? styles.subTabActive : ''}`}
              onClick={() => setHashlockSub('create')}
            >
              <Plus size={13} />
              Create
            </button>
            <button
              className={`${styles.subTab} ${hashlockSub === 'claim' ? styles.subTabActive : ''}`}
              onClick={() => setHashlockSub('claim')}
            >
              <Unlock size={13} />
              Claim
            </button>
          </div>
          <Card>
            {hashlockSub === 'create' && <HashlockForm wallet={wallet} rpc={rpc} />}
            {hashlockSub === 'claim' && (
              <ClaimRedeemForm
                wallet={wallet}
                rpc={rpc}
                prefill={
                  prefill && (prefill.type === 'claim-hashlock' || prefill.type === 'claim-htlc')
                    ? { scriptHex: prefill.scriptHex, txid: prefill.txid, vout: prefill.vout, amount: prefill.amount }
                    : null
                }
              />
            )}
          </Card>
        </>
      )}

      {topTab === 'multisig' && (
        <>
          <div className={styles.subTabs}>
            <button
              className={`${styles.subTab} ${multisigSub === 'create' ? styles.subTabActive : ''}`}
              onClick={() => setMultisigSub('create')}
            >
              <Plus size={13} />
              Create
            </button>
            <button
              className={`${styles.subTab} ${multisigSub === 'spend' ? styles.subTabActive : ''}`}
              onClick={() => setMultisigSub('spend')}
            >
              <ArrowRight size={13} />
              Spend
            </button>
          </div>
          <Card>
            {multisigSub === 'create' && <MultisigForm wallet={wallet} rpc={rpc} />}
            {multisigSub === 'spend' && (
              <SpendMultisigForm
                wallet={wallet}
                rpc={rpc}
                prefill={
                  prefill?.type === 'spend-multisig'
                    ? { scriptHex: prefill.scriptHex, txid: prefill.txid, vout: prefill.vout, amount: prefill.amount, reqSigs: prefill.reqSigs }
                    : null
                }
              />
            )}
          </Card>
        </>
      )}

      {topTab === 'opreturn' && (
        <Card>
          <OpReturnForm wallet={wallet} rpc={rpc} />
        </Card>
      )}
    </div>
  );
}
