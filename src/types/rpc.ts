export interface RpcConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  protocol?: 'http' | 'https';
  timeout?: number;
}

export interface RpcRequest {
  jsonrpc: '1.0' | '2.0';
  id: string | number | null;
  method: string;
  params: unknown[];
}

export interface RpcResponse<T = unknown> {
  result: T;
  error: RpcError | null;
  id: string | number | null;
}

export interface RpcError {
  code: number;
  message: string;
}

export class BitokRpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'BitokRpcError';
    this.code = code;
  }
}

export const RPC_ERROR_CODES = {
  INVALID_AMOUNT: -3,
  INSUFFICIENT_FEES: -4,
  ACCOUNT_NOT_FOUND: -5,
  NOT_ENOUGH_BALANCE: -6,
  INVALID_PARAMETER: -8,
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export interface RawTxInput {
  txid?: string;
  vout?: number;
  scriptSig?: string;
  coinbase?: string;
  sequence: number;
}

export interface RawTxOutput {
  value: number;
  n: number;
  scriptPubKey: string;
  address?: string;
}

export interface RawTransaction {
  hex: string;
  txid: string;
  version: number;
  locktime: number;
  vin: RawTxInput[];
  vout: RawTxOutput[];
  blockhash?: string;
  blockheight?: number;
  blocktime?: number;
  confirmations?: number;
}

export interface DecodedInput {
  txid?: string;
  vout?: number;
  scriptSig?: {
    asm: string;
    hex: string;
  };
  coinbase?: string;
  sequence: number;
}

export interface DecodedOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    reqSigs?: number;
    addresses?: string[];
  };
}

export interface DecodedRawTransaction {
  txid: string;
  version: number;
  locktime: number;
  vin: DecodedInput[];
  vout: DecodedOutput[];
}

export interface TxDetailVinEntry {
  txid?: string;
  vout?: number;
  coinbase?: string;
}

export interface TxDetailVoutEntry {
  value: number;
  n: number;
  address?: string;
}

export interface TxDetailItem {
  category: 'send' | 'receive' | 'generate';
  address?: string;
  amount: number;
}

export interface TxDetail {
  txid: string;
  version: number;
  time?: number;
  confirmations?: number;
  blockhash?: string;
  amount?: number;
  fee?: number;
  details?: TxDetailItem[];
  vin?: TxDetailVinEntry[];
  vout?: TxDetailVoutEntry[];
}

export interface MultisigInfo {
  asm: string;
  hex: string;
  type: string;
  reqSigs: number;
  addresses: string[];
}

export interface PreimageInfo {
  preimage: string;
  hash160: string;
  sha256: string;
  size: number;
}

export interface PreimageListEntry {
  preimage: string;
  hash: string;
  hashSize: number;
  preimageSize: number;
}

export interface BlockHeaderInfo {
  hash: string;
  version: number;
  previousblockhash: string;
  merkleroot: string;
  time: number;
  bits: number;
  nonce: number;
  height: number;
  confirmations: number;
  nextblockhash?: string;
  hex: string;
}

export interface RpcScriptAnalysis {
  asm: string;
  hex: string;
  size: number;
  type: string;
  reqSigs?: number;
  addresses?: string[];
  template?: {
    name: string;
    description: string;
    scriptSig?: string;
    spendable?: string;
  };
  opcodes: {
    counted: number;
    pushes: number;
    distinct: string[];
    categories: {
      crypto: string[];
      stack: string[];
      flow: string[];
      arithmetic: string[];
      splice: string[];
      bitwise: string[];
    };
  };
  sigops: number;
  maxPushSize?: number;
  limits: {
    size: string;
    opcodes: string;
    sigops: string;
    maxPushSize?: string;
    withinLimits: boolean;
  };
}

export interface RpcScriptValidationResult {
  valid: boolean;
  success: boolean;
  finalStack: string[];
  stackSize: number;
  warnings?: string[];
}

export interface IndexerInfo {
  enabled: boolean;
  height?: number;
  bestHeight?: number;
  synced?: boolean;
}

export interface AddressUtxo {
  txid: string;
  vout: number;
  value: number;
  height: number;
  confirmations: number;
  coinbase: boolean;
}

export interface RpcBuildScriptResult {
  hex: string;
  asm: string;
  size: number;
  type: string;
  reqSigs?: number;
  addresses?: string[];
  withinLimits: boolean;
}

export interface RpcSetScriptSigResult {
  hex: string;
  scriptSig: string;
  scriptSigAsm: string;
  inputIndex: number;
}

export interface RpcSigHashResult {
  sighash: string;
  inputIndex: number;
  hashType: number;
  hashTypeName: string;
  scriptPubKeyAsm: string;
}

export interface RpcScriptSigElement {
  index: number;
  hex?: string;
  size?: number;
  opcode?: string;
  value?: number;
  role: string;
}

export interface RpcDecodedScriptSig {
  scriptSig: string;
  scriptSigAsm: string;
  scriptPubKey: string;
  scriptPubKeyAsm: string;
  type: string;
  elements: RpcScriptSigElement[];
  pushCount: number;
  isPushOnly: boolean;
}

export interface RpcVerifyScriptPairResult {
  verified: boolean;
  inputIndex: number;
  scriptSig: string;
  scriptSigAsm: string;
  scriptPubKey: string;
  scriptPubKeyAsm: string;
  type: string;
  flags: string;
  diagnostics?: string[];
}
