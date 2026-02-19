import { Opcode } from '../types/script';
import { MAX_SCRIPT_ELEMENT_SIZE } from '../types/constants';
import { concatBytes } from '../utils/bytes';

export function encodeMinimalPush(data: Uint8Array): Uint8Array {
  const len = data.length;

  if (len === 0) {
    return new Uint8Array([Opcode.OP_0]);
  }

  if (len === 1) {
    const v = data[0];
    if (v === 0x81) return new Uint8Array([Opcode.OP_1NEGATE]);
    if (v >= 1 && v <= 16) return new Uint8Array([Opcode.OP_1 + v - 1]);
  }

  if (len <= 75) {
    return concatBytes(new Uint8Array([len]), data);
  }

  if (len <= 255) {
    return concatBytes(new Uint8Array([Opcode.OP_PUSHDATA1, len]), data);
  }

  if (len <= 65535) {
    const lenBytes = new Uint8Array(2);
    new DataView(lenBytes.buffer).setUint16(0, len, true);
    return concatBytes(new Uint8Array([Opcode.OP_PUSHDATA2]), lenBytes, data);
  }

  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, len, true);
  return concatBytes(new Uint8Array([Opcode.OP_PUSHDATA4]), lenBytes, data);
}

export function encodeNumber(n: number): Uint8Array {
  if (n === 0) return new Uint8Array([Opcode.OP_0]);
  if (n === -1) return new Uint8Array([Opcode.OP_1NEGATE]);
  if (n >= 1 && n <= 16) return new Uint8Array([Opcode.OP_1 + n - 1]);

  const abs = Math.abs(n);
  const bytes: number[] = [];
  let temp = abs;
  while (temp > 0) {
    bytes.push(temp & 0xff);
    temp >>= 8;
  }
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(n < 0 ? 0x80 : 0x00);
  } else if (n < 0) {
    bytes[bytes.length - 1] |= 0x80;
  }

  return encodeMinimalPush(new Uint8Array(bytes));
}

export interface ParsedToken {
  type: 'opcode' | 'data' | 'number';
  opcode?: number;
  data?: Uint8Array;
  value?: number;
  endOffset?: number;
}

export function parseScript(bytes: Uint8Array): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  let i = 0;

  while (i < bytes.length) {
    const op = bytes[i];
    i++;

    if (op === 0x00) {
      tokens.push({ type: 'data', data: new Uint8Array(0), endOffset: i });
    } else if (op >= 0x01 && op <= 0x4b) {
      const data = bytes.slice(i, i + op);
      i += op;
      tokens.push({ type: 'data', data, endOffset: i });
    } else if (op === Opcode.OP_PUSHDATA1) {
      const len = bytes[i++];
      tokens.push({ type: 'data', data: bytes.slice(i, i + len), endOffset: i + len });
      i += len;
    } else if (op === Opcode.OP_PUSHDATA2) {
      const len = new DataView(bytes.buffer, bytes.byteOffset + i).getUint16(0, true);
      i += 2;
      tokens.push({ type: 'data', data: bytes.slice(i, i + len), endOffset: i + len });
      i += len;
    } else if (op === Opcode.OP_PUSHDATA4) {
      const len = new DataView(bytes.buffer, bytes.byteOffset + i).getUint32(0, true);
      i += 4;
      tokens.push({ type: 'data', data: bytes.slice(i, i + len), endOffset: i + len });
      i += len;
    } else if (op === Opcode.OP_1NEGATE) {
      tokens.push({ type: 'number', value: -1, opcode: op, endOffset: i });
    } else if (op >= Opcode.OP_1 && op <= Opcode.OP_16) {
      tokens.push({ type: 'number', value: op - Opcode.OP_1 + 1, opcode: op, endOffset: i });
    } else {
      tokens.push({ type: 'opcode', opcode: op, endOffset: i });
    }
  }

  return tokens;
}

export function decodeNumber(bytes: Uint8Array, requireMinimal = false): number {
  if (bytes.length === 0) return 0;
  if (bytes.length > 4) throw new Error('Script number overflow');

  if (requireMinimal && bytes.length > 0) {
    const last = bytes[bytes.length - 1];
    if ((last & 0x7f) === 0) {
      if (bytes.length <= 1 || (bytes[bytes.length - 2] & 0x80) === 0) {
        throw new Error('Non-minimal encoding');
      }
    }
  }

  let result = 0;
  for (let i = 0; i < bytes.length; i++) {
    result |= bytes[i] << (8 * i);
  }

  if (bytes[bytes.length - 1] & 0x80) {
    const sign = -(result & ~(0x80 << (8 * (bytes.length - 1))));
    result = sign;
  }

  return result;
}
