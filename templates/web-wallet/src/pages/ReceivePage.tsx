import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { StoredWallet } from '../types/wallet';
import styles from './ReceivePage.module.css';

interface ReceivePageProps {
  wallet: StoredWallet;
}

export function ReceivePage({ wallet }: ReceivePageProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function copyAddress() {
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, wallet.address, {
      width: 200,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#f8fafc',
      },
    });
  }, [wallet.address]);

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Receive Bitok</h1>
        <p className={styles.pageSubtitle}>Share your address to receive funds</p>
      </div>

      <Card>
        <div className={styles.receiveLayout}>
          <div className={styles.qrWrapper}>
            <canvas ref={canvasRef} className={styles.qrCanvas} />
            <p className={styles.qrNote}>Scan to receive BITOK</p>
          </div>

          <div className={styles.addressSection}>
            <div className={styles.addressLabel}>Your Bitok Address</div>
            <div className={styles.addressBox}>
              <span className={styles.addressText}>{wallet.address}</span>
            </div>

            <div className={styles.addressActions}>
              <Button
                variant="primary"
                icon={copied ? <Check size={15} /> : <Copy size={15} />}
                onClick={copyAddress}
                fullWidth
              >
                {copied ? 'Copied!' : 'Copy Address'}
              </Button>
            </div>

            <div className={styles.infoGrid}>
              {/* <div className={styles.infoItem}>
                <div className={styles.infoLabel}>Public Key</div>
                <div className={styles.infoValue}>{wallet.publicKeyHex.slice(0, 20)}...</div>
              </div> */}
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>Label</div>
                <div className={styles.infoValue}>{wallet.label}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="How to receive" subtitle="Steps to accept a payment">
        <ol className={styles.steps}>
          <li>Share the address above with the sender</li>
          <li>The sender broadcasts a transaction to the Bitok network</li>
          <li>Wait for the transaction to appear in your history</li>
          <li>Funds are spendable after confirmation</li>
        </ol>
      </Card>
    </div>
  );
}
