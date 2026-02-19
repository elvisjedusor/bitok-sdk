import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha1 } from '@noble/hashes/sha1';

export function hash256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

export function sha256Single(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function ripemd160Single(data: Uint8Array): Uint8Array {
  return ripemd160(data);
}

export function sha1Single(data: Uint8Array): Uint8Array {
  return sha1(data);
}

export function computeTxid(rawTx: Uint8Array): string {
  const h = hash256(rawTx);
  return Array.from(h.slice().reverse())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function computeMerkleRoot(txids: string[]): string {
  if (txids.length === 0) throw new Error('Empty transaction list');

  let hashes: Uint8Array[] = txids.map((txid) => {
    if (txid.length !== 64) {
      throw new Error(`Invalid txid length: expected 64 hex chars, got ${txid.length}`);
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      const byte = parseInt(txid.slice(i * 2, i * 2 + 2), 16);
      if (isNaN(byte)) throw new Error(`Invalid txid hex at position ${i * 2}: "${txid.slice(i * 2, i * 2 + 2)}"`);
      bytes[i] = byte;
    }
    return new Uint8Array(bytes.slice().reverse());
  });

  while (hashes.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : hashes[i];
      const combined = new Uint8Array(64);
      combined.set(left, 0);
      combined.set(right, 32);
      next.push(new Uint8Array(hash256(combined)));
    }
    hashes = next;
  }

  return Array.from(hashes[0].slice().reverse())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
