import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Send,
  Download,
  History,
  Settings,
  Circle,
  FileCode2,
  Bug,
  Hammer,
  ScrollText,
  Search,
  Globe,
  List,
  Shield,
  X,
} from 'lucide-react';
import type { WalletView } from '../types/wallet';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
  activeView: WalletView;
  onNavigate: (view: WalletView) => void;
  connected: boolean;
  address?: string;
  devMode?: boolean;
}

const WALLET_NAV: { view: WalletView; icon: React.ReactNode; label: string }[] = [
  { view: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { view: 'send', icon: <Send size={18} />, label: 'Send' },
  { view: 'receive', icon: <Download size={18} />, label: 'Receive' },
  { view: 'escrow', icon: <Shield size={18} />, label: 'Escrow' },
  { view: 'history', icon: <History size={18} />, label: 'History' },
  { view: 'settings', icon: <Settings size={18} />, label: 'Settings' },
];

const DEV_NAV: { view: WalletView; icon: React.ReactNode; label: string }[] = [
  { view: 'contracts', icon: <ScrollText size={18} />, label: 'Contracts' },
  { view: 'my-contracts', icon: <List size={18} />, label: 'My Contracts' },
  // { view: 'script-builder', icon: <FileCode2 size={18} />, label: 'Script Builder' },
  // { view: 'script-debugger', icon: <Bug size={18} />, label: 'Debugger' },
  // { view: 'tx-builder', icon: <Hammer size={18} />, label: 'TX Builder' },
  // { view: 'decode', icon: <Search size={18} />, label: 'Decode' },
  // { view: 'explorer', icon: <Globe size={18} />, label: 'Explorer' },
];

export function Layout({ children, activeView, onNavigate, connected, devMode }: LayoutProps) {
  const [devSheetOpen, setDevSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isDevView = DEV_NAV.some(d => d.view === activeView);

  useEffect(() => {
    if (!devSheetOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setDevSheetOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [devSheetOpen]);

  function handleDevNavClick(view: WalletView) {
    onNavigate(view);
    setDevSheetOpen(false);
  }

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/bc.png" alt="Bitok" className={styles.brandIcon} />
          <div>
            <div className={styles.brandName}>Bitok</div>
            <div className={styles.brandSub}>{devMode ? 'Developer' : 'Web Wallet'}</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {WALLET_NAV.map(({ view, icon, label }) => (
            <button
              key={view}
              className={`${styles.navItem} ${activeView === view ? styles.navItemActive : ''}`}
              onClick={() => onNavigate(view)}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
            </button>
          ))}

          {devMode && (
            <>
              <div className={styles.navDivider}>
                <span className={styles.navDividerText}>Developer Tools</span>
              </div>
              {DEV_NAV.map(({ view, icon, label }) => (
                <button
                  key={view}
                  className={`${styles.navItem} ${styles.navItemDev} ${activeView === view ? styles.navItemDevActive : ''}`}
                  onClick={() => onNavigate(view)}
                >
                  <span className={styles.navIcon}>{icon}</span>
                  <span className={styles.navLabel}>{label}</span>
                </button>
              ))}
            </>
          )}
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
        {WALLET_NAV.map(({ view, icon, label }) => (
          <button
            key={view}
            className={`${styles.bottomNavItem} ${activeView === view && !devSheetOpen ? styles.bottomNavItemActive : ''}`}
            onClick={() => { onNavigate(view); setDevSheetOpen(false); }}
          >
            <span className={styles.navIcon}>{icon}</span>
            <span className={styles.bottomNavLabel}>{label}</span>
          </button>
        ))}
        {devMode && (
          <button
            className={`${styles.bottomNavItem} ${isDevView || devSheetOpen ? styles.bottomNavItemActive : ''}`}
            onClick={() => setDevSheetOpen(!devSheetOpen)}
          >
            <span className={styles.navIcon}><FileCode2 size={18} /></span>
            <span className={styles.bottomNavLabel}>Dev</span>
          </button>
        )}
      </nav>

      {devMode && devSheetOpen && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setDevSheetOpen(false)} />
          <div className={styles.devSheet} ref={sheetRef}>
            <div className={styles.devSheetHeader}>
              <span className={styles.devSheetTitle}>Developer Tools</span>
              <button className={styles.devSheetClose} onClick={() => setDevSheetOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.devSheetGrid}>
              {DEV_NAV.map(({ view, icon, label }) => (
                <button
                  key={view}
                  className={`${styles.devSheetItem} ${activeView === view ? styles.devSheetItemActive : ''}`}
                  onClick={() => handleDevNavClick(view)}
                >
                  <span className={styles.devSheetItemIcon}>{icon}</span>
                  <span className={styles.devSheetItemLabel}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
