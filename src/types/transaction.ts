export interface OutPoint {
  txid: string;
  vout: number;
}

export interface TxInput {
  prevout: OutPoint;
  scriptSig: Uint8Array;
  sequence: number;
}

export interface TxOutput {
  value: bigint;
  scriptPubKey: Uint8Array;
}

export interface Transaction {
  version: number;
  vin: TxInput[];
  vout: TxOutput[];
  locktime: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  height: number;
  confirmations: number;
  coinbase: boolean;
  valueSatoshis: bigint;
}

export interface SigHashType {
  base: 'ALL' | 'NONE' | 'SINGLE';
  anyoneCanPay: boolean;
}

export interface SignedInput {
  index: number;
  scriptSig: Uint8Array;
  complete: boolean;
  error?: string;
}

export interface PartiallySignedTx {
  hex: string;
  complete: boolean;
  inputs: SignedInput[];
}

export interface PrevTxInfo {
  txid: string;
  vout: number;
  scriptPubKey: string;
  amount?: bigint;
}

export interface FeeEstimate {
  feePerKb: bigint;
  totalFee: bigint;
  priority: bigint;
  isFree: boolean;
}
