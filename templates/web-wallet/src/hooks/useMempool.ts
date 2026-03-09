import { useState, useEffect, useCallback, useRef } from 'react';
import type { BitokRpc, RawTransaction } from 'bitok';
import { getPendingTxs } from '../store/pendingTxStore';
import type { PendingTx } from '../store/pendingTxStore';
import { cachedGetMempool, cachedGetRawTransaction } from '../utils/cachedRpc';

interface MempoolTxInfo {
  txid: string;
  receivedAmount: number;
  sentAmount: number;
  isSend: boolean;
  isReceive: boolean;
  time: number;
}

export interface MempoolState {
  mempoolTxs: MempoolTxInfo[];
  pendingTxs: PendingTx[];
  outgoingTotal: number;
  incomingTotal: number;
  loading: boolean;
}

const MEMPOOL_POLL_MS = 120_000;
const BATCH_SIZE = 20;

async function scanMempoolForAddress(rpc: BitokRpc, address: string): Promise<MempoolTxInfo[]> {
  const mempoolTxids = await cachedGetMempool(rpc);
  if (mempoolTxids.length === 0) return [];

  const results: MempoolTxInfo[] = [];

  for (let i = 0; i < mempoolTxids.length; i += BATCH_SIZE) {
    const batch = mempoolTxids.slice(i, i + BATCH_SIZE);
    const txDetails = await Promise.all(
      batch.map(txid =>
        cachedGetRawTransaction(rpc, txid, 1).catch(() => null)
      )
    );

    for (const rawTx of txDetails) {
      if (!rawTx || typeof rawTx === 'string') continue;
      const tx = rawTx as RawTransaction;

      const hasOutput = tx.vout.some(o => o.address === address);
      const hasInput = tx.vin.some(v => v.txid !== undefined);

      if (!hasOutput && !hasInput) continue;

      let isSpender = false;
      if (hasInput) {
        const inputChecks = await Promise.all(
          tx.vin
            .filter(v => v.txid)
            .map(async v => {
              try {
                const prevTx = await cachedGetRawTransaction(rpc, v.txid!, 1) as RawTransaction;
                return prevTx.vout[v.vout ?? 0]?.address === address;
              } catch {
                return false;
              }
            })
        );
        isSpender = inputChecks.some(Boolean);
      }

      if (!hasOutput && !isSpender) continue;

      const receivedAmount = tx.vout
        .filter(o => o.address === address)
        .reduce((sum, o) => sum + o.value, 0);

      let sentAmount = 0;
      if (isSpender) {
        sentAmount = tx.vout
          .filter(o => o.address !== address)
          .reduce((sum, o) => sum + o.value, 0);
      }

      results.push({
        txid: tx.txid,
        receivedAmount,
        sentAmount,
        isSend: isSpender,
        isReceive: hasOutput && !isSpender,
        time: Math.floor(Date.now() / 1000),
      });
    }
  }

  return results;
}

export function useMempool(rpc: BitokRpc, address: string) {
  const [state, setState] = useState<MempoolState>({
    mempoolTxs: [],
    pendingTxs: [],
    outgoingTotal: 0,
    incomingTotal: 0,
    loading: false,
  });
  const mountedRef = useRef(true);

  const hasDataRef = useRef(false);

  const scan = useCallback(async () => {
    if (!hasDataRef.current) {
      setState(prev => ({ ...prev, loading: true }));
    }
    try {
      const mempoolTxs = await scanMempoolForAddress(rpc, address);
      if (!mountedRef.current) return;

      const localPending = getPendingTxs(address);
      const mempoolTxidSet = new Set(mempoolTxs.map(t => t.txid));

      const merged: PendingTx[] = [];

      for (const mtx of mempoolTxs) {
        const local = localPending.find(p => p.txid === mtx.txid);
        if (local) {
          merged.push(local);
        } else {
          merged.push({
            txid: mtx.txid,
            amount: mtx.isSend ? mtx.sentAmount : mtx.receivedAmount,
            fee: 0,
            category: mtx.isSend ? 'send' : 'receive',
            address,
            time: mtx.time,
          });
        }
      }

      for (const lp of localPending) {
        if (!mempoolTxidSet.has(lp.txid)) {
          const age = Date.now() / 1000 - lp.time;
          if (age < 120) {
            merged.push(lp);
          }
        }
      }

      const outgoingTotal = mempoolTxs
        .filter(t => t.isSend)
        .reduce((sum: number, t) => sum + t.sentAmount, 0);

      const incomingTotal = mempoolTxs
        .filter(t => t.isReceive)
        .reduce((sum: number, t) => sum + t.receivedAmount, 0);

      hasDataRef.current = true;
      setState({
        mempoolTxs,
        pendingTxs: merged,
        outgoingTotal,
        incomingTotal,
        loading: false,
      });
    } catch {
      if (!mountedRef.current) return;
      const localPending = getPendingTxs(address);
      const outgoingTotal = localPending
        .filter(t => t.category === 'send')
        .reduce((sum: number, t) => sum + t.amount + t.fee, 0);

      setState(prev => ({
        ...prev,
        pendingTxs: localPending,
        outgoingTotal,
        loading: false,
      }));
    }
  }, [rpc, address]);

  useEffect(() => {
    mountedRef.current = true;
    scan();
    const interval = setInterval(scan, MEMPOOL_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [scan]);

  return { ...state, refresh: scan };
}
