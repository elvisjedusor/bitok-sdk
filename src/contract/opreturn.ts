import { ScriptBuilder } from '../script/builder';
import { bytesToHex, hexToBytes } from '../utils/bytes';
import { MAX_SCRIPT_SIZE } from '../types/constants';

/**
 * Maximum bytes of arbitrary data that can fit in an OP_RETURN output.
 * Subtracts the OP_RETURN opcode (1 byte) and the push data prefix (up to 5 bytes).
 */
const MAX_OPRETURN_DATA = MAX_SCRIPT_SIZE - 6;

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
export function decodeOpReturn(scriptHex: string): OpReturnData | null {
  const bytes = hexToBytes(scriptHex);
  if (bytes.length < 1 || bytes[0] !== 0x6a) return null;

  let dataStart = 1;
  let dataLen = 0;

  // OP_RETURN with no data payload
  if (bytes.length === 1) {
    return {
      scriptPubKeyHex: scriptHex,
      dataHex: '',
      dataText: '',
      byteSize: 0,
    };
  }

  // Parse the push data prefix to find where the payload starts and how long it is
  const lenByte = bytes[1];
  if (lenByte < 0x4c) {
    // Direct length: byte value is the data length
    dataLen = lenByte;
    dataStart = 2;
  } else if (lenByte === 0x4c) {
    // OP_PUSHDATA1: next 1 byte is the length
    dataLen = bytes[2] ?? 0;
    dataStart = 3;
  } else if (lenByte === 0x4d) {
    // OP_PUSHDATA2: next 2 bytes (little-endian) are the length
    dataLen = (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
    dataStart = 4;
  } else if (lenByte === 0x4e) {
    // OP_PUSHDATA4: next 4 bytes (little-endian) are the length
    dataLen = (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8) | ((bytes[4] ?? 0) << 16) | ((bytes[5] ?? 0) << 24);
    dataStart = 6;
  } else {
    return null;
  }

  const data = bytes.slice(dataStart, dataStart + dataLen);
  let dataText: string | undefined;
  try {
    dataText = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    dataText = undefined;
  }

  return {
    scriptPubKeyHex: scriptHex,
    dataHex: bytesToHex(data),
    dataText,
    byteSize: data.length,
  };
}
