import { ScriptBuilder } from '../script/builder';
import { hash160, sha256Single } from '../crypto/hash';
import { addressToHash160 } from '../crypto/keys';
import { bytesToHex } from '../utils/bytes';
import { TransactionBuilder } from '../tx/builder';
import { encodeMinimalPush } from '../script/encode';
import { Opcode } from '../types/script';
import { concatBytes } from '../utils/bytes';
import { UTXO } from '../types/transaction';

/**
 * A simple hashlock contract.
 *
 * The output can only be spent by someone who knows the preimage of a hash.
 * Additionally, the spender must sign with the key matching receiverAddress.
 *
 * Script pattern:
 *   OP_HASH160 <hash(preimage)> OP_EQUALVERIFY OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
 *
 * To spend: provide sig + pubkey + preimage in scriptSig.
 */
export interface HashlockContract {
  scriptPubKeyHex: string;
  preimageHex: string;
  hashHex: string;
  hashType: 'hash160' | 'sha256';
  address?: string;
}

/**
 * Creates a hashlock output script from a raw preimage bytes.
 *
 * @param preimage       - The secret preimage bytes. Keep this private until you want to claim.
 * @param receiverAddress - The address that must sign to claim (along with revealing the preimage).
 * @param hashType       - Hash function to use: 'hash160' (RIPEMD160(SHA256)) or 'sha256'. Defaults to 'hash160'.
 */
export function createHashlock(
  preimage: Uint8Array,
  receiverAddress: string,
  hashType: 'hash160' | 'sha256' = 'hash160'
): HashlockContract {
  const hashFn = hashType === 'hash160' ? hash160 : sha256Single;
  const preimageHash = hashFn(preimage);
  const pubkeyHash = addressToHash160(receiverAddress);

  const scriptPubKey = hashType === 'hash160'
    ? ScriptBuilder.hashlock(preimageHash, pubkeyHash)
    : ScriptBuilder.hashlockSha256(preimageHash, pubkeyHash);

  return {
    scriptPubKeyHex: bytesToHex(scriptPubKey),
    preimageHex: bytesToHex(preimage),
    hashHex: bytesToHex(preimageHash),
    hashType,
    address: receiverAddress,
  };
}

/**
 * Convenience wrapper: creates a hashlock from a plain UTF-8 string secret
 * instead of raw bytes. The string is encoded to bytes before hashing.
 *
 * @param secret          - The secret string (e.g. a password or random phrase).
 * @param receiverAddress - The address that must sign to claim.
 * @param hashType        - Hash function to use. Defaults to 'hash160'.
 */
export function createHashlockFromSecret(
  secret: string,
  receiverAddress: string,
  hashType: 'hash160' | 'sha256' = 'hash160'
): HashlockContract {
  const encoder = new TextEncoder();
  return createHashlock(encoder.encode(secret), receiverAddress, hashType);
}

/**
 * Builds the scriptSig (unlocking script) for spending a hashlock output.
 *
 * Push order (stack after execution, bottom to top):
 *   <sig> <pubkey> <preimage>
 *
 * @param signatureDer - DER-encoded ECDSA signature (without sighash byte).
 * @param publicKey    - Compressed public key (33 bytes).
 * @param preimage     - The secret preimage that hashes to the value in the script.
 * @param sighashByte  - Sighash type byte appended to the signature (e.g. 0x01 for SIGHASH_ALL).
 */
export function buildHashlockSpendScriptSig(
  signatureDer: Uint8Array,
  publicKey: Uint8Array,
  preimage: Uint8Array,
  sighashByte: number
): Uint8Array {
  const sigWithType = concatBytes(signatureDer, new Uint8Array([sighashByte]));
  return concatBytes(
    encodeMinimalPush(sigWithType),
    encodeMinimalPush(publicKey),
    encodeMinimalPush(preimage)
  );
}

/**
 * A Hash Time-Lock Contract (HTLC).
 *
 * Combines a hashlock with a timelock refund path:
 *  - Claim path:  receiver reveals preimage + signs → gets funds immediately.
 *  - Refund path: sender signs after locktime expires → reclaims funds.
 *
 * locktime is stored here (not embedded in the script itself) and is applied
 * as nLockTime on the refund transaction via buildHTLCRefundTx.
 */
export interface HTLCContract {
  scriptPubKeyHex: string;
  preimageHex: string;
  hashHex: string;
  receiverAddress: string;
  refundAddress: string;
  /** Unix timestamp (or block height) after which the sender can reclaim funds. */
  locktime: number;
}

/**
 * Creates an HTLC output script.
 *
 * The locktime is NOT embedded in the locking script. Instead it is stored in
 * the returned contract object and enforced via nLockTime on the refund tx
 * (see buildHTLCRefundTx). This is intentional: it keeps the script simpler
 * and relies on transaction-level timelock enforcement.
 *
 * @param preimage        - Secret preimage bytes. Share with receiver off-chain.
 * @param receiverAddress - Address that can claim by revealing the preimage.
 * @param refundAddress   - Address that can reclaim funds after locktime expires.
 * @param locktime        - Expiry as Unix timestamp or block height.
 */
export function createHTLC(
  preimage: Uint8Array,
  receiverAddress: string,
  refundAddress: string,
  locktime: number
): HTLCContract {
  const preimageHash = hash160(preimage);
  const receiverHash = addressToHash160(receiverAddress);
  const refundHash = addressToHash160(refundAddress);

  const scriptPubKey = ScriptBuilder.htlc(preimageHash, receiverHash, refundHash);

  return {
    scriptPubKeyHex: bytesToHex(scriptPubKey),
    preimageHex: bytesToHex(preimage),
    hashHex: bytesToHex(preimageHash),
    receiverAddress,
    refundAddress,
    locktime,
  };
}

/**
 * Builds the scriptSig for the HTLC claim path (receiver spends).
 *
 * Pushes OP_1 at the end to select the claim branch in the script.
 * Push order: <sig> <pubkey> <preimage> OP_1
 *
 * @param signatureDer - DER-encoded ECDSA signature.
 * @param publicKey    - Receiver's compressed public key.
 * @param preimage     - The secret preimage.
 * @param sighashByte  - Sighash type byte (e.g. 0x01).
 */
export function buildHTLCClaimScriptSig(
  signatureDer: Uint8Array,
  publicKey: Uint8Array,
  preimage: Uint8Array,
  sighashByte: number
): Uint8Array {
  const sigWithType = concatBytes(signatureDer, new Uint8Array([sighashByte]));
  return concatBytes(
    encodeMinimalPush(sigWithType),
    encodeMinimalPush(publicKey),
    encodeMinimalPush(preimage),
    new Uint8Array([Opcode.OP_1])
  );
}

/**
 * Builds the scriptSig for the HTLC refund path (sender reclaims after locktime).
 *
 * Pushes OP_0 at the end to select the refund branch in the script.
 * Push order: <sig> <pubkey> OP_0
 *
 * The transaction spending this input must also set nLockTime >= contract.locktime
 * (done automatically by buildHTLCRefundTx).
 *
 * @param signatureDer - DER-encoded ECDSA signature.
 * @param publicKey    - Sender's (refund) compressed public key.
 * @param sighashByte  - Sighash type byte (e.g. 0x01).
 */
export function buildHTLCRefundScriptSig(
  signatureDer: Uint8Array,
  publicKey: Uint8Array,
  sighashByte: number
): Uint8Array {
  const sigWithType = concatBytes(signatureDer, new Uint8Array([sighashByte]));
  return concatBytes(
    encodeMinimalPush(sigWithType),
    encodeMinimalPush(publicKey),
    new Uint8Array([Opcode.OP_0])
  );
}

/**
 * Builds the unsigned refund transaction for an HTLC.
 *
 * Sets nLockTime = contract.locktime so the transaction is invalid until that
 * time/block. The input sequence is 0x00000000 to enable nLockTime enforcement.
 *
 * After building, sign the input with the refund key and set the scriptSig
 * using buildHTLCRefundScriptSig.
 *
 * @param contract            - The HTLC contract (locktime is read from here).
 * @param htlcUtxo            - The UTXO holding the locked funds.
 * @param refundValueSatoshis - Amount to send back (funds minus miner fee).
 * @param changeAddress       - Destination for the refunded coins.
 */
export function buildHTLCRefundTx(
  contract: HTLCContract,
  htlcUtxo: UTXO,
  refundValueSatoshis: bigint,
  changeAddress: string
): TransactionBuilder {
  return new TransactionBuilder()
    .setLocktime(contract.locktime)
    .addInput(htlcUtxo.txid, htlcUtxo.vout, 0x00000000)
    .addOutputToAddress(changeAddress, refundValueSatoshis);
}

/**
 * Builds the unsigned claim transaction for an HTLC.
 *
 * No locktime is needed for the claim path — the receiver can spend immediately
 * once they reveal the preimage.
 *
 * After building, sign the input with the receiver key and set the scriptSig
 * using buildHTLCClaimScriptSig.
 *
 * @param htlcUtxo          - The UTXO holding the locked funds.
 * @param claimValueSatoshis - Amount to send to receiver (funds minus miner fee).
 * @param receiverAddress   - Destination address for the claimed coins.
 */
export function buildHTLCClaimTx(
  htlcUtxo: UTXO,
  claimValueSatoshis: bigint,
  receiverAddress: string
): TransactionBuilder {
  return new TransactionBuilder()
    .addInput(htlcUtxo.txid, htlcUtxo.vout)
    .addOutputToAddress(receiverAddress, claimValueSatoshis);
}
