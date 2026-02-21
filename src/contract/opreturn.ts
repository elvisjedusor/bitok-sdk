import { ScriptBuilder } from '../script/builder';
import { bytesToHex, hexToBytes } from '../utils/bytes';
import { MAX_SCRIPT_SIZE } from '../types/constants';

/**
 * Maximum bytes of arbitrary data that can fit in an OP_RETURN output.
 * OP_RETURN outputs are unspendable so the 520-byte per-push limit does not apply.
 * 1 byte OP_RETURN + 5 bytes OP_PUSHDATA4 prefix + N data bytes <= 10000
 */
const MAX_OPRETURN_DATA = MAX_SCRIPT_SIZE - 1 - 5;

/**
 * Represents an OP_RETURN output — an unspendable output used to store
 * arbitrary data on-chain.
 *
 * OP_RETURN outputs are provably unspendable (the script immediately returns
 * false), so they do not bloat the UTXO set. Nodes prune them after indexing.
 *
 * Common uses: document timestamping, protocol metadata, asset issuance markers.
 */
export interface OpReturnData {
  /** The full locking script (OP_RETURN <data>) as hex. */
  scriptPubKeyHex: string;
  /** The embedded data as hex. */
  dataHex: string;
  /** The embedded data decoded as UTF-8 text, if valid. undefined if binary. */
  dataText?: string;
  /** Number of data bytes embedded (not counting the script overhead). */
  byteSize: number;
}

/**
 * Creates an OP_RETURN output embedding raw bytes.
 *
 * @param data - Arbitrary bytes to embed. Must not exceed MAX_OPRETURN_DATA bytes.
 * @throws If data exceeds the maximum allowed size.
 */
export function embedData(data: Uint8Array): OpReturnData {
  if (data.length > MAX_OPRETURN_DATA) {
    throw new Error(`Data too large: ${data.length} bytes (max ${MAX_OPRETURN_DATA})`);
  }
  const script = ScriptBuilder.opReturn(data);
  let dataText: string | undefined;
  try {
    dataText = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    dataText = undefined;
  }

  return {
    scriptPubKeyHex: bytesToHex(script),
    dataHex: bytesToHex(data),
    dataText,
    byteSize: data.length,
  };
}

/**
 * Creates an OP_RETURN output embedding a UTF-8 string.
 *
 * @param text - Plain text to embed. Encoded to UTF-8 bytes before storing.
 */
export function embedText(text: string): OpReturnData {
  const encoder = new TextEncoder();
  return embedData(encoder.encode(text));
}

/**
 * Creates an OP_RETURN output from a hex string.
 * Useful when you already have the data as hex (e.g. a hash or identifier).
 *
 * @param hex - Hex-encoded bytes to embed.
 */
export function embedHex(hex: string): OpReturnData {
  return embedData(hexToBytes(hex));
}

/**
 * Serializes a JSON-serializable object to UTF-8 and embeds it in an OP_RETURN output.
 * Useful for lightweight on-chain metadata (e.g. protocol version tags, asset data).
 *
 * @param obj - Any JSON-serializable value.
 */
export function embedJSON(obj: unknown): OpReturnData {
  return embedText(JSON.stringify(obj));
}

/**
 * Decodes an OP_RETURN script back into its data payload.
 *
 * Handles all standard push data encodings (direct length, OP_PUSHDATA1/2/4).
 * Returns null if the script does not start with OP_RETURN (0x6a).
 *
 * @param scriptHex - The full scriptPubKey hex of a suspected OP_RETURN output.
 * @returns Parsed OpReturnData, or null if the script is not OP_RETURN.
 */
function readPush(bytes: Uint8Array, offset: number): { data: Uint8Array; next: number } | null {
  if (offset >= bytes.length) return null;
  const lenByte = bytes[offset];
  if (lenByte === 0x00) {
    return { data: new Uint8Array(0), next: offset + 1 };
  }
  if (lenByte >= 0x01 && lenByte <= 0x4b) {
    const end = offset + 1 + lenByte;
    if (end > bytes.length) return null;
    return { data: bytes.slice(offset + 1, end), next: end };
  }
  if (lenByte === 0x4c) {
    if (offset + 2 > bytes.length) return null;
    const len = bytes[offset + 1];
    const end = offset + 2 + len;
    if (end > bytes.length) return null;
    return { data: bytes.slice(offset + 2, end), next: end };
  }
  if (lenByte === 0x4d) {
    if (offset + 3 > bytes.length) return null;
    const len = (bytes[offset + 1]) | (bytes[offset + 2] << 8);
    const end = offset + 3 + len;
    if (end > bytes.length) return null;
    return { data: bytes.slice(offset + 3, end), next: end };
  }
  if (lenByte === 0x4e) {
    if (offset + 5 > bytes.length) return null;
    const len = (bytes[offset + 1]) | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16) | (bytes[offset + 4] << 24);
    const end = offset + 5 + len;
    if (end > bytes.length) return null;
    return { data: bytes.slice(offset + 5, end), next: end };
  }
  return null;
}

export function decodeOpReturn(scriptHex: string): OpReturnData | null {
  const bytes = hexToBytes(scriptHex);
  if (bytes.length < 1 || bytes[0] !== 0x6a) return null;

  if (bytes.length === 1) {
    return {
      scriptPubKeyHex: scriptHex,
      dataHex: '',
      dataText: '',
      byteSize: 0,
    };
  }

  const chunks: Uint8Array[] = [];
  let pos = 1;
  while (pos < bytes.length) {
    const push = readPush(bytes, pos);
    if (!push) break;
    chunks.push(push.data);
    pos = push.next;
  }

  if (chunks.length === 0) {
    return {
      scriptPubKeyHex: scriptHex,
      dataHex: '',
      dataText: '',
      byteSize: 0,
    };
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  let dataText: string | undefined;
  try {
    dataText = new TextDecoder('utf-8', { fatal: true }).decode(combined);
  } catch {
    dataText = undefined;
  }

  return {
    scriptPubKeyHex: scriptHex,
    dataHex: bytesToHex(combined),
    dataText,
    byteSize: combined.length,
  };
}
