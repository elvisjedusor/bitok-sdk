import { Transaction, PartiallySignedTx, PrevTxInfo, SigHashType } from '../types/transaction';
import {
  SIGHASH_ALL,
  SIGHASH_NONE,
  SIGHASH_SINGLE,
  SIGHASH_ANYONECANPAY,
  SEQUENCE_FINAL,
  SCRIPT_VERIFY_EXEC,
} from '../types/constants';
import { serializeForSigning, serializeTransaction, deserializeTransaction } from './serialize';
import { hash256, hash160 } from '../crypto/hash';
import { signHash, privateKeyToPublicKey, wifToPrivateKey } from '../crypto/keys';
import { encodeMinimalPush, parseScript } from '../script/encode';
import { classifyScript } from '../script/decoder';
import { hexToBytes, bytesToHex, concatBytes } from '../utils/bytes';
import { Opcode } from '../types/script';

export function sighashTypeToInt(type: SigHashType): number {
  let value = type.base === 'ALL' ? SIGHASH_ALL : type.base === 'NONE' ? SIGHASH_NONE : SIGHASH_SINGLE;
  if (type.anyoneCanPay) value |= SIGHASH_ANYONECANPAY;
  return value;
}

export function parseSigHashType(typeStr: string): SigHashType {
  const parts = typeStr.toUpperCase().split('|');
  const base = parts[0] as 'ALL' | 'NONE' | 'SINGLE';
  if (!['ALL', 'NONE', 'SINGLE'].includes(base)) {
    throw new Error(`Invalid sighash type: ${typeStr}`);
  }
  return { base, anyoneCanPay: parts.includes('ANYONECANPAY') };
}

export function computeSigHash(
  tx: Transaction,
  inputIndex: number,
  scriptCode: Uint8Array,
  sighashType: number
): Uint8Array {
  const preimage = serializeForSigning(tx, inputIndex, scriptCode, sighashType);
  return hash256(preimage);
}

export function buildP2PKHSig(
  sigDer: Uint8Array,
  publicKey: Uint8Array,
  sighashByte: number
): Uint8Array {
  const sigWithHashType = concatBytes(sigDer, new Uint8Array([sighashByte]));
  return concatBytes(
    encodeMinimalPush(sigWithHashType),
    encodeMinimalPush(publicKey)
  );
}

export function buildMultisigScriptSig(
  signatures: Uint8Array[],
  sighashByte: number
): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([Opcode.OP_0])];
  for (const sig of signatures) {
    const sigWithType = concatBytes(sig, new Uint8Array([sighashByte]));
    parts.push(encodeMinimalPush(sigWithType));
  }
  return concatBytes(...parts);
}

export interface SignOptions {
  sighashType?: SigHashType;
  prevTxs?: PrevTxInfo[];
}

export function signTransaction(
  tx: Transaction,
  privateKeys: Uint8Array[],
  options: SignOptions = {}
): PartiallySignedTx {
  const sighashType = options.sighashType ?? { base: 'ALL', anyoneCanPay: false };
  const sighashInt = sighashTypeToInt(sighashType);

  const signed = {
    version: tx.version,
    vin: tx.vin.map((inp) => ({ ...inp, scriptSig: inp.scriptSig.slice() })),
    vout: tx.vout.map((out) => ({ ...out })),
    locktime: tx.locktime,
  };

  const signedInputs = signed.vin.map((_, i) => ({
    index: i,
    scriptSig: new Uint8Array(0),
    complete: false,
    error: undefined as string | undefined,
  }));

  for (let i = 0; i < signed.vin.length; i++) {
    const prevInfo = options.prevTxs?.find(
      (p) => p.txid === tx.vin[i].prevout.txid && p.vout === tx.vin[i].prevout.vout
    );

    const scriptPubKeyHex = prevInfo?.scriptPubKey;
    if (!scriptPubKeyHex) {
      signedInputs[i].error = `No prevTxs entry for input ${i} (${tx.vin[i].prevout.txid}:${tx.vin[i].prevout.vout})`;
      continue;
    }

    const scriptPubKey = hexToBytes(scriptPubKeyHex);
    const scriptType = classifyScript(scriptPubKey);

    if (scriptType === 'pubkeyhash') {
      const tokens = parseScript(scriptPubKey);
      if (tokens.length < 5 || !tokens[2]?.data) {
        signedInputs[i].error = `Input ${i}: malformed P2PKH scriptPubKey`;
        continue;
      }
      const requiredHash160 = tokens[2].data;

      let matched = false;
      for (const privKey of privateKeys) {
        const pubKey = privateKeyToPublicKey(privKey, false);
        const pubKeyHash = hash160(pubKey);

        const matches = requiredHash160.length === pubKeyHash.length &&
          requiredHash160.every((b, idx) => b === pubKeyHash[idx]);

        if (matches) {
          const sigHash = computeSigHash(signed as Transaction, i, scriptPubKey, sighashInt);
          const sig = signHash(sigHash, privKey);
          signed.vin[i].scriptSig = new Uint8Array(buildP2PKHSig(sig, pubKey, sighashInt));
          signedInputs[i] = { index: i, scriptSig: signed.vin[i].scriptSig, complete: true, error: undefined };
          matched = true;
          break;
        }
      }
      if (!matched) {
        signedInputs[i].error = `Input ${i}: no provided private key matches the P2PKH address`;
      }
    } else if (scriptType === 'pubkey') {
      const tokens = parseScript(scriptPubKey);
      if (tokens.length < 2 || !tokens[0]?.data) {
        signedInputs[i].error = `Input ${i}: malformed P2PK scriptPubKey`;
        continue;
      }
      const pubKeyData = tokens[0].data;
      if (pubKeyData.length !== 65 || pubKeyData[0] !== 0x04) {
        signedInputs[i].error = `Input ${i}: P2PK script contains invalid or compressed public key`;
        continue;
      }

      let matched = false;
      for (const privKey of privateKeys) {
        const pubKey = privateKeyToPublicKey(privKey, false);
        const matches = pubKeyData.length === pubKey.length &&
          pubKeyData.every((b, idx) => b === pubKey[idx]);

        if (matches) {
          const sigHash = computeSigHash(signed as Transaction, i, scriptPubKey, sighashInt);
          const sig = signHash(sigHash, privKey);
          const sigWithType = concatBytes(sig, new Uint8Array([sighashInt]));
          signed.vin[i].scriptSig = new Uint8Array(encodeMinimalPush(sigWithType));
          signedInputs[i] = { index: i, scriptSig: signed.vin[i].scriptSig, complete: true, error: undefined };
          matched = true;
          break;
        }
      }
      if (!matched) {
        signedInputs[i].error = `Input ${i}: no provided private key matches the P2PK public key`;
      }
    } else {
      signedInputs[i].error = `Input ${i}: unsupported script type "${scriptType}" for signing`;
    }
  }

  const allComplete = signedInputs.every((s) => s.complete);
  const hex = bytesToHex(serializeTransaction(signed as Transaction));

  return { hex, complete: allComplete, inputs: signedInputs };
}

export function signTransactionWIF(
  txHex: string,
  wifKeys: string[],
  prevTxs: PrevTxInfo[],
  sighashTypeStr = 'ALL'
): PartiallySignedTx {
  const tx: Transaction = deserializeTransaction(hexToBytes(txHex));
  const privateKeys = wifKeys.map((wif) => wifToPrivateKey(wif));
  const sighashType = parseSigHashType(sighashTypeStr);
  return signTransaction(tx, privateKeys, { sighashType, prevTxs });
}
