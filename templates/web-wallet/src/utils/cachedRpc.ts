import type { BitokRpc, RawTransaction } from 'bitok';
import { getCached, setCache } from './rpcCache';

export async function cachedGetInfo(rpc: BitokRpc) {
  const key = 'getInfo';
  const hit = getCached<Awaited<ReturnType<BitokRpc['getInfo']>>>(key, 'getInfo');
  if (hit) return hit;
  const result = await rpc.getInfo();
  setCache(key, result);
  return result;
}

export async function cachedGetAddressBalance(rpc: BitokRpc, address: string) {
  const key = `getAddressBalance:${address}`;
  const hit = getCached<bigint>(key, 'getAddressBalance');
  if (hit !== null) return hit;
  const result = await rpc.getAddressBalance(address);
  setCache(key, result);
  return result;
}

export async function cachedGetAddressTxids(rpc: BitokRpc, address: string) {
  const key = `getAddressTxids:${address}`;
  const hit = getCached<string[]>(key, 'getAddressTxids');
  if (hit) return hit;
  const result = await rpc.getAddressTxids(address);
  setCache(key, result);
  return result;
}

export async function cachedGetRawTransaction(rpc: BitokRpc, txid: string, verbose: 1) {
  const key = `getRawTransaction:${txid}:${verbose}`;
  const hit = getCached<RawTransaction>(key, 'getRawTransaction');
  if (hit) return hit;
  const result = await rpc.getRawTransaction(txid, verbose);
  setCache(key, result);
  return result;
}

export async function cachedGetMempool(rpc: BitokRpc) {
  const key = 'getMempool';
  const hit = getCached<string[]>(key, 'getMempool');
  if (hit) return hit;
  const result = await rpc.getMempool();
  setCache(key, result);
  return result;
}
