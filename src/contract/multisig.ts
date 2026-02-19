import { ScriptBuilder } from '../script/builder';
import { bytesToHex, hexToBytes, concatBytes } from '../utils/bytes';
import { encodeMinimalPush } from '../script/encode';
import { Opcode } from '../types/script';
import { hash160 } from '../crypto/hash';
import { publicKeyToAddress } from '../crypto/keys';

/**
 * An m-of-n bare multisig wallet.
 *
 * Requires m signatures out of n registered public keys to spend funds.
 * Bitok uses bare multisig (the full script is the scriptPubKey directly).
 *
 * Common uses: shared treasuries, corporate accounts, hardware wallet backups.
 */
export interface MultisigWallet {
  /** Number of required signatures. */
  m: number;
  /** Total number of participants (public keys). */
  n: number;
  /** All participant public keys as hex strings. */
  publicKeys: string[];
  /** The bare multisig locking script as hex. Send funds to this scriptPubKey. */
  scriptPubKeyHex: string;
  /** P2PKH address for each participant key. */
  addresses: string[];
}

/**
 * Creates an m-of-n multisig wallet.
 *
 * @param m          - Minimum number of signatures required to spend (1 <= m <= n).
 * @param publicKeys - Array of uncompressed public keys (65 bytes each, 0x04 prefix). Max 20.
 *
 * @example
 * // 2-of-3 multisig
 * const wallet = createMultisigWallet(2, [alicePub, bobPub, carolPub]);
 * // Send coins to wallet.scriptPubKeyHex
 * // Spend by collecting any 2 of 3 signatures
 */
export function createMultisigWallet(
  m: number,
  publicKeys: Uint8Array[]
): MultisigWallet {
  if (m < 1 || m > publicKeys.length) {
    throw new Error(`Invalid m-of-n: m=${m}, n=${publicKeys.length}`);
  }
  if (publicKeys.length > 20) {
    throw new Error('Too many public keys: max 20');
  }

  const redeemScript = ScriptBuilder.multisig(m, publicKeys);
  const addresses = publicKeys.map((pk) => publicKeyToAddress(pk));

  return {
    m,
    n: publicKeys.length,
    publicKeys: publicKeys.map((pk) => bytesToHex(pk)),
    scriptPubKeyHex: bytesToHex(redeemScript),
    addresses,
  };
}

/**
 * Builds the scriptSig for spending a multisig output.
 *
 * Prepends OP_0 (required due to an off-by-one bug in the original Bitcoin
 * script interpreter that became consensus — OP_CHECKMULTISIG pops one extra
 * item from the stack).
 *
 * Each signature must already be in DER format. Pass them in the same order
 * as their corresponding public keys in the redeem script.
 *
 * @param signatures - Array of { derBytes, sighashByte } objects. Provide exactly m signatures.
 *
 * @example
 * const scriptSig = buildMultisigSpendScriptSig([
 *   { derBytes: aliceSig, sighashByte: 0x01 },
 *   { derBytes: bobSig,   sighashByte: 0x01 },
 * ]);
 */
export function buildMultisigSpendScriptSig(
  signatures: Array<{ derBytes: Uint8Array; sighashByte: number }>
): Uint8Array {
  // OP_0 is the extra dummy element consumed by the OP_CHECKMULTISIG bug
  const parts: Uint8Array[] = [new Uint8Array([Opcode.OP_0])];
  for (const sig of signatures) {
    const withType = concatBytes(sig.derBytes, new Uint8Array([sig.sighashByte]));
    parts.push(encodeMinimalPush(withType));
  }
  return concatBytes(...parts);
}

/**
 * A 2-of-3 escrow contract between a buyer, seller, and arbitrator.
 *
 * Any two of the three parties must agree to release funds.
 * Typical flow:
 *   - Buyer sends coins to the escrow scriptPubKeyHex.
 *   - On successful trade: buyer + seller co-sign to release to seller.
 *   - On dispute: arbitrator sides with one party and co-signs with them.
 */
export interface EscrowContract {
  /** Always 2 (two signatures required). */
  m: number;
  /** P2PKH addresses of [buyer, seller, arbitrator]. */
  parties: string[];
  /** The locking script as hex. Send funds here to lock them in escrow. */
  scriptPubKeyHex: string;
  /** Human-readable description of the escrow setup. */
  description?: string;
}

/**
 * Creates a 2-of-3 escrow contract.
 *
 * @param buyerPubKey      - Uncompressed public key of the buyer (65 bytes, 0x04 prefix).
 * @param sellerPubKey     - Uncompressed public key of the seller (65 bytes, 0x04 prefix).
 * @param arbitratorPubKey - Uncompressed public key of the trusted arbitrator (65 bytes, 0x04 prefix).
 */
export function createEscrow(
  buyerPubKey: Uint8Array,
  sellerPubKey: Uint8Array,
  arbitratorPubKey: Uint8Array
): EscrowContract {
  const wallet = createMultisigWallet(2, [buyerPubKey, sellerPubKey, arbitratorPubKey]);
  return {
    m: 2,
    parties: wallet.addresses,
    scriptPubKeyHex: wallet.scriptPubKeyHex,
    description: '2-of-3 escrow: buyer, seller, arbitrator',
  };
}
