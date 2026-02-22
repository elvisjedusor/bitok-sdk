import type { BitokRpc, RawTransaction } from 'bitok';

export function findSpentOutputs(
  allTransactions: RawTransaction[],
  outputs: Array<{ txid: string; vout: number }>
): Set<string> {
  const spent = new Set<string>();
  const outputKeys = new Set(outputs.map(o => `${o.txid}:${o.vout}`));

  for (const tx of allTransactions) {
    for (const inp of tx.vin) {
      if (!inp.txid) continue;
      const key = `${inp.txid}:${inp.vout}`;
      if (outputKeys.has(key)) spent.add(key);
    }
  }

  return spent;
}

export async function isOutputSpentByTxid(
  rpc: BitokRpc,
  txid: string,
  vout: number
): Promise<boolean> {
  try {
    const raw = await rpc.getRawTransaction(txid, 1) as RawTransaction;
    const out = raw.vout.find(o => o.n === vout);
    if (!out) return false;

    const address = out.address;
    if (address) {
      const utxos = await rpc.getAddressUtxos(address);
      return !utxos.some(u => u.txid === txid && u.vout === vout);
    }

    return false;
  } catch {
    return false;
  }
}
