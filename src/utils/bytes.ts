export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string: odd length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function reverseBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice().reverse();
}

export function writeUInt8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

export function readUInt8(bytes: Uint8Array, offset = 0): number {
  return bytes[offset];
}

export function writeUInt16LE(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  const view = new DataView(buf.buffer);
  view.setUint16(0, value, true);
  return buf;
}

export function readUInt16LE(bytes: Uint8Array, offset = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return view.getUint16(0, true);
}

export function writeUInt32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, true);
  return buf;
}

export function writeUInt64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, value, true);
  return buf;
}

export function readUInt32LE(bytes: Uint8Array, offset = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return view.getUint32(0, true);
}

export function readUInt64LE(bytes: Uint8Array, offset = 0): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return view.getBigUint64(0, true);
}

export function writeInt64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigInt64(0, value, true);
  return buf;
}

export function writeInt32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setInt32(0, value, true);
  return buf;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
