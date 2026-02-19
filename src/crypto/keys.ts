import { secp256k1 } from '@noble/curves/secp256k1';
import { base58CheckEncode, base58CheckDecode } from './base58';
import { hash160 } from './hash';
import { ADDRESS_VERSION_MAINNET, WIF_VERSION } from '../types/constants';

export function generatePrivateKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

export function privateKeyToPublicKey(privateKey: Uint8Array, compressed = false): Uint8Array {
  return secp256k1.getPublicKey(privateKey, compressed);
}

export function publicKeyToAddress(publicKey: Uint8Array): string {
  const h160 = hash160(publicKey);
  return base58CheckEncode(ADDRESS_VERSION_MAINNET, h160);
}

export function privateKeyToWIF(privateKey: Uint8Array): string {
  return base58CheckEncode(WIF_VERSION, privateKey);
}

export function wifToPrivateKey(wif: string): Uint8Array {
  const { version, payload } = base58CheckDecode(wif);
  if (version !== WIF_VERSION) {
    throw new Error(`Invalid WIF version: expected 0x${WIF_VERSION.toString(16)}, got 0x${version.toString(16)}`);
  }
  if (payload.length !== 32) {
    throw new Error('Invalid WIF private key length');
  }
  return payload;
}

export function addressToHash160(address: string): Uint8Array {
  const { version, payload } = base58CheckDecode(address);
  if (version !== ADDRESS_VERSION_MAINNET) {
    throw new Error(`Invalid address version: ${version}`);
  }
  if (payload.length !== 20) {
    throw new Error('Invalid address payload length');
  }
  return payload;
}

export function isValidAddress(address: string): boolean {
  try {
    addressToHash160(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidPrivateKey(key: Uint8Array): boolean {
  return secp256k1.utils.isValidPrivateKey(key);
}

export function signHash(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const sig = secp256k1.sign(hash, privateKey, { lowS: true });
  return new Uint8Array(sig.toDERRawBytes());
}

export function verifyHash(
  hash: Uint8Array,
  derSignature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    return false;
  }
  try {
    return secp256k1.verify(derSignature, hash, publicKey);
  } catch {
    return false;
  }
}
