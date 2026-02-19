import { Transaction, TxInput, TxOutput, UTXO, FeeEstimate } from '../types/transaction';
import {
  COIN,
  CENT,
  DUST_THRESHOLD,
  MAX_MONEY,
  SEQUENCE_FINAL,
  FREE_PRIORITY_THRESHOLD,
  MIN_FEE_PER_KB,
} from '../types/constants';
import { ScriptBuilder } from '../script/builder';
import { hexToBytes, bytesToHex } from '../utils/bytes';
import { serializeTransaction, deserializeTransaction } from './serialize';

export class TransactionBuilder {
  private version = 1;
  private inputs: TxInput[] = [];
  private outputs: TxOutput[] = [];
  private locktime = 0;

  setVersion(v: number): this {
    this.version = v;
    return this;
  }

  setLocktime(lt: number): this {
    this.locktime = lt;
    return this;
  }

  addInput(txidHex: string, vout: number, sequence = SEQUENCE_FINAL): this {
    this.inputs.push({
      prevout: { txid: txidHex, vout },
      scriptSig: new Uint8Array(0),
      sequence,
    });
    return this;
  }

  addInputFromUTXO(utxo: UTXO, sequence = SEQUENCE_FINAL): this {
    return this.addInput(utxo.txid, utxo.vout, sequence);
  }

  addOutput(scriptPubKey: Uint8Array, value: bigint): this {
    if (value < 0n) throw new Error('Output value cannot be negative');
    if (value > MAX_MONEY) throw new Error('Output value exceeds MAX_MONEY');
    this.outputs.push({ scriptPubKey, value });
    return this;
  }

  addOutputToAddress(address: string, valueSatoshis: bigint): this {
    const script = ScriptBuilder.p2pkh(address);
    return this.addOutput(script, valueSatoshis);
  }

  addOutputToAddressBitok(address: string, valueBitok: string | bigint): this {
    const satoshis = typeof valueBitok === 'bigint'
      ? valueBitok * COIN
      : bitokToSatoshis(valueBitok);
    return this.addOutputToAddress(address, satoshis);
  }

  addOpReturnOutput(data: Uint8Array | string): this {
    const bytes = typeof data === 'string' ? hexToBytes(data) : data;
    const script = ScriptBuilder.opReturn(bytes);
    return this.addOutput(script, 0n);
  }

  addOpReturnText(text: string): this {
    const encoder = new TextEncoder();
    return this.addOpReturnOutput(encoder.encode(text));
  }

  addCustomOutput(scriptHex: string, valueSatoshis: bigint): this {
    return this.addOutput(hexToBytes(scriptHex), valueSatoshis);
  }

  build(): Transaction {
    if (this.inputs.length === 0) throw new Error('Transaction must have at least one input');
    if (this.outputs.length === 0) throw new Error('Transaction must have at least one output');

    const totalOut = this.outputs.reduce((acc, o) => acc + o.value, 0n);
    if (totalOut > MAX_MONEY) throw new Error('Total output exceeds MAX_MONEY');

    return {
      version: this.version,
      vin: this.inputs.map((i) => ({ ...i })),
      vout: this.outputs.map((o) => ({ ...o })),
      locktime: this.locktime,
    };
  }

  toHex(): string {
    return bytesToHex(serializeTransaction(this.build()));
  }

  estimateSize(): number {
    const overhead = 10;
    const inputSize = 180;
    const outputSize = 34;
    return overhead + this.inputs.length * inputSize + this.outputs.length * outputSize;
  }

  estimateFee(utxos: UTXO[], blockHeight: number): FeeEstimate {
    const txSizeBytes = this.estimateSize();
    const totalInput = utxos.reduce((acc, u) => acc + u.valueSatoshis, 0n);
    const totalOutput = this.outputs.reduce((acc, o) => acc + o.value, 0n);

    let priority = 0n;
    for (const utxo of utxos) {
      priority += utxo.valueSatoshis * BigInt(utxo.confirmations);
    }
    priority = txSizeBytes > 0 ? priority / BigInt(txSizeBytes) : 0n;

    const isFree = priority >= FREE_PRIORITY_THRESHOLD && txSizeBytes < 1000;

    const feePerKb = MIN_FEE_PER_KB;
    const baseFee = BigInt(Math.ceil(txSizeBytes / 1000)) * feePerKb;
    const hasDustOutput = this.outputs.some((o) => o.value < DUST_THRESHOLD);
    const minFee = hasDustOutput && baseFee < feePerKb ? feePerKb : baseFee;
    const totalFee = isFree ? 0n : minFee;

    return { feePerKb, totalFee, priority, isFree };
  }

  clone(): TransactionBuilder {
    const b = new TransactionBuilder();
    b.version = this.version;
    b.locktime = this.locktime;
    b.inputs = this.inputs.map((i) => ({
      prevout: { ...i.prevout },
      scriptSig: i.scriptSig.slice(),
      sequence: i.sequence,
    }));
    b.outputs = this.outputs.map((o) => ({
      value: o.value,
      scriptPubKey: o.scriptPubKey.slice(),
    }));
    return b;
  }

  static fromHex(hex: string): TransactionBuilder {
    const tx = deserializeTransaction(hexToBytes(hex));
    const b = new TransactionBuilder();
    b.version = tx.version;
    b.locktime = tx.locktime;
    b.inputs = tx.vin;
    b.outputs = tx.vout;
    return b;
  }
}

export function satoshisToBitok(satoshis: bigint): number {
  return Number(satoshis) / Number(COIN);
}

export function bitokToSatoshis(bitok: string | number): bigint {
  const [intPart, fracPart = ''] = String(bitok).split('.');
  const padded = fracPart.slice(0, 8).padEnd(8, '0');
  return BigInt(intPart) * COIN + BigInt(padded);
}

export function isDust(valueSatoshis: bigint): boolean {
  return valueSatoshis < DUST_THRESHOLD;
}

export function selectUTXOs(
  utxos: UTXO[],
  targetSatoshis: bigint,
  feeSatoshis: bigint = CENT
): UTXO[] {
  const sorted = [...utxos].sort((a, b) =>
    b.valueSatoshis > a.valueSatoshis ? 1 : b.valueSatoshis < a.valueSatoshis ? -1 : 0
  );
  const selected: UTXO[] = [];
  let total = 0n;
  const needed = targetSatoshis + feeSatoshis;

  for (const utxo of sorted) {
    if (total >= needed) break;
    selected.push(utxo);
    total += utxo.valueSatoshis;
  }

  if (total < needed) throw new Error(`Insufficient funds: have ${total} satoshis, need ${needed}`);
  return selected;
}
