import React from 'react';
import {
  LayoutDashboard,
  Send,
  Download,
  History,
  Settings,
  Circle,
} from 'lucide-react';
import type { WalletView } from '../types/wallet';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
  activeView: WalletView;
  onNavigate: (view: WalletView) => void;
  connected: boolean;
  address?: string;
}

const NAV_ITEMS: { view: WalletView; icon: React.ReactNode; label: string }[] = [
  { view: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { view: 'send', icon: <Send size={18} />, label: 'Send' },
  { view: 'receive', icon: <Download size={18} />, label: 'Receive' },
  { view: 'history', icon: <History size={18} />, label: 'History' },
  { view: 'settings', icon: <Settings size={18} />, label: 'Settings' },
];

export function Layout({ children, activeView, onNavigate, connected }: LayoutProps) {
  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/bc.png" alt="Bitok" className={styles.brandIcon} />
          <div>
            <div className={styles.brandName}>Bitok</div>
            <div className={styles.brandSub}>Web Wallet</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ view, icon, label }) => (
            <button
              key={view}
              className={`${styles.navItem} ${activeView === view ? styles.navItemActive : ''}`}
              onClick={() => onNavigate(view)}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.statusBar}>
          <Circle
            size={8}
            className={connected ? styles.dotConnected : styles.dotDisconnected}
            fill="currentColor"
          />
          <span className={styles.statusText}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          {children}
        </div>
      </main>

      <nav className={styles.bottomNav}>
        {NAV_ITEMS.map(({ view, icon, label }) => (
          <button
            key={view}
            className={`${styles.bottomNavItem} ${activeView === view ? styles.bottomNavItemActive : ''}`}
            onClick={() => onNavigate(view)}
          >
            <span className={styles.navIcon}>{icon}</span>
            <span className={styles.bottomNavLabel}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
