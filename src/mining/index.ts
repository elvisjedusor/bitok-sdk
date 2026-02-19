import { BlockTemplate, BlockTemplateTx } from '../types/block';
import { COIN, POW_HASHRATE_SHIFT, POW_LIMIT_HEX } from '../types/constants';
import { computeMerkleRoot, hash256 } from '../crypto/hash';
import { bytesToHex, hexToBytes, writeUInt32LE, writeUInt64LE, writeInt32LE, concatBytes, reverseBytes } from '../utils/bytes';
import { encodeVarInt } from '../utils/varint';
import { encodeMinimalPush } from '../script/encode';
import { ScriptBuilder } from '../script/builder';

export interface MiningCandidate {
  header: Uint8Array;
  coinbaseTxHex: string;
  transactionHexes: string[];
  merkleRoot: string;
  target: string;
  height: number;
}

export interface WorkItem {
  data: string;
  target: string;
  midstate?: string;
}

export function parsePriority(tx: BlockTemplateTx): number {
  return tx.priority ?? 0;
}

export function sortByPriority(transactions: BlockTemplateTx[]): BlockTemplateTx[] {
  return [...transactions].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return b.fee - a.fee;
  });
}

export function sortByFee(transactions: BlockTemplateTx[]): BlockTemplateTx[] {
  return [...transactions].sort((a, b) => b.fee - a.fee);
}

export function sortByFeePerKb(transactions: BlockTemplateTx[]): BlockTemplateTx[] {
  return [...transactions].sort((a, b) => {
    const sizeA = a.data.length / 2 || 1;
    const sizeB = b.data.length / 2 || 1;
    const feePerKbA = a.fee / sizeA;
    const feePerKbB = b.fee / sizeB;
    if (feePerKbB !== feePerKbA) return feePerKbB - feePerKbA;
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    return pb - pa;
  });
}

export function selectTransactions(
  template: BlockTemplate,
  strategy: 'priority' | 'fee' | 'mixed' = 'mixed',
  maxSigOps = 20_000,
  maxSize = 1_000_000
): BlockTemplateTx[] {
  const sorted =
    strategy === 'priority'
      ? sortByPriority(template.transactions)
      : strategy === 'fee'
      ? sortByFee(template.transactions)
      : sortByFeePerKb(template.transactions);

  const selected: BlockTemplateTx[] = [];
  let totalSigOps = 0;
  let totalSize = 0;

  for (const tx of sorted) {
    const txSigOps = tx.sigops;
    const txSize = tx.data.length / 2;

    if (totalSigOps + txSigOps > maxSigOps) continue;
    if (totalSize + txSize > maxSize - 1000) continue;

    selected.push(tx);
    totalSigOps += txSigOps;
    totalSize += txSize;
  }

  return selected;
}

function encodeScriptNumber(n: number): Uint8Array {
  if (n === 0) return new Uint8Array(0);
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
  return new Uint8Array(bytes);
}

export function buildCoinbaseTx(
  blockHeight: number,
  reward: bigint,
  toAddress: string,
  extraNonce = 0,
  coinbaseMessage = '/Bitok/'
): string {
  const heightRaw = encodeScriptNumber(blockHeight);
  const msgBytes = new TextEncoder().encode(coinbaseMessage);
  const extraBytes = new Uint8Array(4);
  new DataView(extraBytes.buffer).setUint32(0, extraNonce, true);

  const inputScript = concatBytes(
    encodeMinimalPush(heightRaw),
    encodeMinimalPush(msgBytes),
    encodeMinimalPush(extraBytes)
  );

  if (inputScript.length < 2 || inputScript.length > 100) {
    throw new Error(
      `Coinbase scriptSig length ${inputScript.length} is out of range [2, 100]. ` +
      'Shorten coinbaseMessage or reduce extraNonce size.'
    );
  }

  const nullHash = new Uint8Array(32);
  const nullIndex = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
  const inputSequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

  const outputScript = ScriptBuilder.p2pkh(toAddress);

  const version = writeInt32LE(1);
  const vinCount = new Uint8Array([0x01]);
  const voutCount = new Uint8Array([0x01]);
  const locktime = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

  const inputLen = encodeVarInt(inputScript.length);
  const outputLen = encodeVarInt(outputScript.length);

  const serialized = concatBytes(
    version,
    vinCount,
    nullHash,
    nullIndex,
    inputLen,
    inputScript,
    inputSequence,
    voutCount,
    writeUInt64LE(reward),
    outputLen,
    outputScript,
    locktime
  );

  return bytesToHex(serialized);
}

export function buildBlockHeader(
  version: number,
  prevHash: string,
  merkleRoot: string,
  time: number,
  bits: number,
  nonce: number
): Uint8Array {
  const versionBytes = writeUInt32LE(version);
  const prevHashBytes = reverseBytes(hexToBytes(prevHash));
  const merkleBytes = reverseBytes(hexToBytes(merkleRoot));
  const timeBytes = writeUInt32LE(time);
  const bitsBytes = writeUInt32LE(bits);
  const nonceBytes = writeUInt32LE(nonce);

  return concatBytes(versionBytes, prevHashBytes, merkleBytes, timeBytes, bitsBytes, nonceBytes);
}

let yespowerImpl: ((header80: Uint8Array) => Uint8Array) | null = null;

export function setYespowerImplementation(impl: (header80: Uint8Array) => Uint8Array): void {
  yespowerImpl = impl;
}

export function computeBlockHash(header80: Uint8Array): string {
  if (!yespowerImpl) {
    throw new Error(
      'Yespower implementation not set. Call setYespowerImplementation() with a Yespower hash function before using computeBlockHash or verifyBlockHash. ' +
      'Bitok uses Yespower PoW — SHA256 is NOT the correct algorithm for block hashing.'
    );
  }
  const h = yespowerImpl(header80);
  return bytesToHex(reverseBytes(h));
}

export function verifyBlockHash(header80: Uint8Array, targetHex: string): boolean {
  const hash = computeBlockHash(header80);
  const hashBigInt = BigInt('0x' + hash);
  const targetBigInt = BigInt('0x' + targetHex);
  return hashBigInt <= targetBigInt;
}

export function difficultyToTarget(difficulty: number): string {
  const maxTarget = BigInt('0x' + POW_LIMIT_HEX);
  const diffStr = difficulty.toFixed(8);
  const [intPart, fracPart = ''] = diffStr.split('.');
  const scale = 100_000_000n;
  const diffBigInt = BigInt(intPart) * scale + BigInt(fracPart.padEnd(8, '0').slice(0, 8));
  if (diffBigInt === 0n) throw new Error('Difficulty must be greater than zero');
  const target = (maxTarget * scale) / diffBigInt;
  return target.toString(16).padStart(64, '0');
}

export function targetToDifficulty(targetHex: string): number {
  const target = BigInt('0x' + targetHex);
  if (target === 0n) return 0;
  const maxTarget = BigInt('0x' + POW_LIMIT_HEX);
  const scaled = (maxTarget * 1_000_000_000n) / target;
  return Number(scaled) / 1_000_000_000;
}

export function nbitsToTarget(nbits: number): string {
  const exp = (nbits >> 24) & 0xff;
  const mantissa = nbits & 0x7fffff;
  const neg = (nbits & 0x800000) !== 0;
  if (neg) return '0'.repeat(64);
  let target: bigint;
  if (exp >= 3) {
    target = BigInt(mantissa) * (256n ** BigInt(exp - 3));
  } else {
    target = BigInt(mantissa) / (256n ** BigInt(3 - exp));
  }
  return target.toString(16).padStart(64, '0');
}

export function estimateHashrate(
  blocksFound: number,
  difficulty: number,
  timeSeconds: number
): number {
  if (timeSeconds === 0) return 0;
  return (blocksFound * difficulty * Math.pow(2, POW_HASHRATE_SHIFT)) / timeSeconds;
}

export function calculateBlockReward(height: number): bigint {
  const halvings = Math.floor(height / 210_000);
  if (halvings >= 64) return 0n;
  return (50n * COIN) >> BigInt(halvings);
}

export function prepareMiningCandidate(
  template: BlockTemplate,
  minerAddress: string,
  extraNonce = 0
): MiningCandidate {
  const reward = BigInt(template.coinbasevalue);
  const coinbaseTxHex = buildCoinbaseTx(
    template.height,
    reward,
    minerAddress,
    extraNonce
  );

  const selected = selectTransactions(template);
  const allTxHexes = [coinbaseTxHex, ...selected.map((t) => t.data)];

  const coinbaseTxBytes = hexToBytes(coinbaseTxHex);
  const coinbaseTxid = bytesToHex(reverseBytes(hash256(coinbaseTxBytes)));

  const allTxids = [
    coinbaseTxid,
    ...selected.map((t) => t.hash),
  ];

  const merkleRoot = computeMerkleRoot(allTxids);
  const bits = parseInt(template.bits, 16);
  const now = Math.floor(Date.now() / 1000);
  const header = buildBlockHeader(
    template.version,
    template.previousblockhash,
    merkleRoot,
    Math.max(now, template.mintime),
    bits,
    0
  );

  return {
    header,
    coinbaseTxHex,
    transactionHexes: selected.map((t) => t.data),
    merkleRoot,
    target: nbitsToTarget(bits),
    height: template.height,
  };
}

export function serializeBlock(
  candidate: MiningCandidate,
  nonce: number
): string {
  const header = candidate.header.slice();
  new DataView(header.buffer, header.byteOffset + 76).setUint32(0, nonce, true);

  const allTxs = [candidate.coinbaseTxHex, ...candidate.transactionHexes];
  const txCount = encodeVarInt(allTxs.length);
  const txBytes = allTxs.map((h) => hexToBytes(h));

  return bytesToHex(concatBytes(header, txCount, ...txBytes));
}
