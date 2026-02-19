import { Transaction, TxInput, TxOutput } from '../types/transaction';
import { concatBytes, writeUInt32LE, writeInt64LE, writeInt32LE, hexToBytes, bytesToHex, reverseBytes } from '../utils/bytes';
import { encodeVarInt, decodeVarInt } from '../utils/varint';
import { hash256 } from '../crypto/hash';
import { Opcode } from '../types/script';

export function stripCodeSeparators(script: Uint8Array): Uint8Array {
  const result: number[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i];
    if (op === Opcode.OP_CODESEPARATOR) {
      i++;
      continue;
    }
    if (op >= 0x01 && op <= 0x4b) {
      if (i + 1 + op > script.length) throw new Error('Malformed script: push data extends past end of script');
      result.push(op);
      for (let j = 0; j < op; j++) result.push(script[i + 1 + j]);
      i += 1 + op;
    } else if (op === 0x4c) {
      if (i + 2 > script.length) throw new Error('Malformed script: OP_PUSHDATA1 missing length byte');
      const len = script[i + 1];
      if (i + 2 + len > script.length) throw new Error('Malformed script: OP_PUSHDATA1 data extends past end of script');
      result.push(op, len);
      for (let j = 0; j < len; j++) result.push(script[i + 2 + j]);
      i += 2 + len;
    } else if (op === 0x4d) {
      if (i + 3 > script.length) throw new Error('Malformed script: OP_PUSHDATA2 missing length bytes');
      const len = script[i + 1] | (script[i + 2] << 8);
      if (i + 3 + len > script.length) throw new Error('Malformed script: OP_PUSHDATA2 data extends past end of script');
      result.push(op, script[i + 1], script[i + 2]);
      for (let j = 0; j < len; j++) result.push(script[i + 3 + j]);
      i += 3 + len;
    } else if (op === 0x4e) {
      if (i + 5 > script.length) throw new Error('Malformed script: OP_PUSHDATA4 missing length bytes');
      const len = script[i + 1] | (script[i + 2] << 8) | (script[i + 3] << 16) | (script[i + 4] << 24);
      if (i + 5 + len > script.length) throw new Error('Malformed script: OP_PUSHDATA4 data extends past end of script');
      result.push(op, script[i + 1], script[i + 2], script[i + 3], script[i + 4]);
      for (let j = 0; j < len; j++) result.push(script[i + 5 + j]);
      i += 5 + len;
    } else {
      result.push(op);
      i++;
    }
  }
  return new Uint8Array(result);
}

export function serializeTransaction(tx: Transaction): Uint8Array {
  const parts: Uint8Array[] = [];

  parts.push(writeInt32LE(tx.version));
  parts.push(encodeVarInt(tx.vin.length));

  for (const input of tx.vin) {
    parts.push(reverseBytes(hexToBytes(input.prevout.txid)));
    parts.push(writeUInt32LE(input.prevout.vout));
    parts.push(encodeVarInt(input.scriptSig.length));
    parts.push(input.scriptSig);
    parts.push(writeUInt32LE(input.sequence));
  }

  parts.push(encodeVarInt(tx.vout.length));
  for (const output of tx.vout) {
    parts.push(writeInt64LE(output.value));
    parts.push(encodeVarInt(output.scriptPubKey.length));
    parts.push(output.scriptPubKey);
  }

  parts.push(writeUInt32LE(tx.locktime));
  return concatBytes(...parts);
}

export function deserializeTransaction(bytes: Uint8Array): Transaction {
  let offset = 0;

  const checkBounds = (needed: number): void => {
    if (offset + needed > bytes.length) {
      throw new Error(`deserializeTransaction: buffer too short at offset ${offset} (need ${needed} more bytes, have ${bytes.length - offset})`);
    }
  };

  const readUInt32LE = (): number => {
    checkBounds(4);
    const v = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(0, true);
    offset += 4;
    return v;
  };

  const readInt32LE = (): number => {
    checkBounds(4);
    const v = new DataView(bytes.buffer, bytes.byteOffset + offset).getInt32(0, true);
    offset += 4;
    return v;
  };

  const readInt64LE = (): bigint => {
    checkBounds(8);
    const v = new DataView(bytes.buffer, bytes.byteOffset + offset).getBigInt64(0, true);
    offset += 8;
    return v;
  };

  const readVarInt = (): number => {
    checkBounds(1);
    const { value, bytesRead } = decodeVarInt(bytes, offset);
    offset += bytesRead;
    return Number(value);
  };

  const readBytes = (n: number): Uint8Array => {
    checkBounds(n);
    const slice = bytes.slice(offset, offset + n);
    offset += n;
    return slice;
  };

  const version = readInt32LE();

  const vinCount = readVarInt();
  const vin: TxInput[] = [];
  for (let i = 0; i < vinCount; i++) {
    const prevHashBytes = readBytes(32);
    const txid = bytesToHex(reverseBytes(prevHashBytes));
    const vout = readUInt32LE();
    const scriptLen = readVarInt();
    const scriptSig = readBytes(scriptLen);
    const sequence = readUInt32LE();
    vin.push({ prevout: { txid, vout }, scriptSig, sequence });
  }

  const voutCount = readVarInt();
  const vout: TxOutput[] = [];
  for (let i = 0; i < voutCount; i++) {
    const value = readInt64LE();
    const scriptLen = readVarInt();
    const scriptPubKey = readBytes(scriptLen);
    vout.push({ value, scriptPubKey });
  }

  const locktime = readUInt32LE();

  return { version, vin, vout, locktime };
}

export function txid(tx: Transaction): string {
  const raw = serializeTransaction(tx);
  const h = hash256(raw);
  return bytesToHex(reverseBytes(h));
}

export function serializeForSigning(
  tx: Transaction,
  inputIndex: number,
  subscript: Uint8Array,
  sighashType: number
): Uint8Array {
  if (inputIndex < 0 || inputIndex >= tx.vin.length) {
    throw new Error(`serializeForSigning: inputIndex ${inputIndex} out of range (tx has ${tx.vin.length} inputs)`);
  }

  const sighashBase = sighashType & 0x1f;
  if (sighashBase < 0x01 || sighashBase > 0x03) {
    throw new Error(`Invalid sighash base type: 0x${sighashBase.toString(16)} (must be SIGHASH_ALL=1, SIGHASH_NONE=2, or SIGHASH_SINGLE=3)`);
  }
  const anyoneCanPay = (sighashType & 0x80) !== 0;

  const cleanedSubscript = stripCodeSeparators(subscript);

  let txCopy: Transaction = {
    version: tx.version,
    locktime: tx.locktime,
    vin: tx.vin.map((inp, i) => ({
      prevout: inp.prevout,
      scriptSig: i === inputIndex ? cleanedSubscript : new Uint8Array(0),
      sequence: inp.sequence,
    })),
    vout: tx.vout.map((out) => ({ value: out.value, scriptPubKey: out.scriptPubKey })),
  };

  if (sighashBase === 0x02) {
    txCopy = {
      ...txCopy,
      vout: [],
      vin: txCopy.vin.map((inp, i) => ({
        ...inp,
        sequence: i === inputIndex ? inp.sequence : 0,
      })),
    };
  } else if (sighashBase === 0x03) {
    if (inputIndex >= tx.vout.length) {
      throw new Error(`SIGHASH_SINGLE: input index ${inputIndex} >= output count ${tx.vout.length}`);
    }
    const truncatedVout = tx.vout.slice(0, inputIndex + 1).map((out, i) =>
      i === inputIndex ? out : { value: -1n, scriptPubKey: new Uint8Array(0) }
    );
    txCopy = {
      ...txCopy,
      vout: truncatedVout,
      vin: txCopy.vin.map((inp, i) => ({
        ...inp,
        sequence: i === inputIndex ? inp.sequence : 0,
      })),
    };
  }

  if (anyoneCanPay) {
    txCopy = {
      ...txCopy,
      vin: [txCopy.vin[inputIndex]],
    };
  }

  const serialized = serializeTransaction(txCopy);
  const typeBytes = new Uint8Array(4);
  new DataView(typeBytes.buffer).setUint32(0, sighashType, true);

  return concatBytes(serialized, typeBytes);
}
