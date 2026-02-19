export function encodeVarInt(value: number | bigint): Uint8Array {
  const n = BigInt(value);
  if (n < 0xfdn) {
    return new Uint8Array([Number(n)]);
  } else if (n <= 0xffffn) {
    const buf = new Uint8Array(3);
    buf[0] = 0xfd;
    const view = new DataView(buf.buffer);
    view.setUint16(1, Number(n), true);
    return buf;
  } else if (n <= 0xffffffffn) {
    const buf = new Uint8Array(5);
    buf[0] = 0xfe;
    const view = new DataView(buf.buffer);
    view.setUint32(1, Number(n), true);
    return buf;
  } else {
    const buf = new Uint8Array(9);
    buf[0] = 0xff;
    const view = new DataView(buf.buffer);
    view.setBigUint64(1, n, true);
    return buf;
  }
}

export interface VarIntResult {
  value: bigint;
  bytesRead: number;
}

export function decodeVarInt(bytes: Uint8Array, offset = 0): VarIntResult {
  const first = bytes[offset];
  if (first < 0xfd) {
    return { value: BigInt(first), bytesRead: 1 };
  } else if (first === 0xfd) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1);
    return { value: BigInt(view.getUint16(0, true)), bytesRead: 3 };
  } else if (first === 0xfe) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1);
    return { value: BigInt(view.getUint32(0, true)), bytesRead: 5 };
  } else {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1);
    return { value: view.getBigUint64(0, true), bytesRead: 9 };
  }
}

export function varIntSize(value: number | bigint): number {
  const n = BigInt(value);
  if (n < 0xfdn) return 1;
  if (n <= 0xffffn) return 3;
  if (n <= 0xffffffffn) return 5;
  return 9;
}
