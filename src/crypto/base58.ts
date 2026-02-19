import { sha256 } from '@noble/hashes/sha256';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = 58n;
const ALPHABET_MAP = new Map<string, bigint>();
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP.set(ALPHABET[i], BigInt(i));
}

export function base58Encode(bytes: Uint8Array): string {
  let x = 0n;
  for (const byte of bytes) {
    x = x * 256n + BigInt(byte);
  }

  let result = '';
  while (x > 0n) {
    const rem = x % BASE;
    x = x / BASE;
    result = ALPHABET[Number(rem)] + result;
  }

  for (const byte of bytes) {
    if (byte === 0) result = '1' + result;
    else break;
  }

  return result;
}

export function base58Decode(str: string): Uint8Array {
  let x = 0n;
  for (const char of str) {
    const val = ALPHABET_MAP.get(char);
    if (val === undefined) throw new Error(`Invalid base58 character: ${char}`);
    x = x * BASE + val;
  }

  const bytes: number[] = [];
  while (x > 0n) {
    bytes.unshift(Number(x % 256n));
    x = x / 256n;
  }

  for (const char of str) {
    if (char === '1') bytes.unshift(0);
    else break;
  }

  return new Uint8Array(bytes);
}

export function base58CheckEncode(version: number, payload: Uint8Array): string {
  const versionedPayload = new Uint8Array(1 + payload.length);
  versionedPayload[0] = version;
  versionedPayload.set(payload, 1);

  const checksum = sha256(sha256(versionedPayload)).slice(0, 4);
  const full = new Uint8Array(versionedPayload.length + 4);
  full.set(versionedPayload, 0);
  full.set(checksum, versionedPayload.length);

  return base58Encode(full);
}

export function base58CheckDecode(str: string): { version: number; payload: Uint8Array } {
  const full = base58Decode(str);
  if (full.length < 5) throw new Error('Base58Check string too short');

  const payload = full.slice(0, full.length - 4);
  const checksum = full.slice(full.length - 4);
  const expectedChecksum = sha256(sha256(payload)).slice(0, 4);

  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid checksum in base58check string');
    }
  }

  return { version: payload[0], payload: payload.slice(1) };
}
