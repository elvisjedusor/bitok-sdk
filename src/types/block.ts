export interface BlockHeader {
  version: number;
  previousblockhash: string;
  merkleroot: string;
  time: number;
  bits: number;
  nonce: number;
}

export interface Block extends BlockHeader {
  hash: string;
  height: number;
  tx: string[];
  nextblockhash?: string;
}

export interface BlockTemplate {
  version: number;
  previousblockhash: string;
  transactions: BlockTemplateTx[];
  coinbaseaux: Record<string, string>;
  coinbasevalue: number;
  target: string;
  mintime: number;
  mutable: string[];
  noncerange: string;
  sigoplimit: number;
  sizelimit: number;
  curtime: number;
  bits: string;
  height: number;
}

export interface BlockTemplateTx {
  data: string;
  hash: string;
  txid: string;
  depends: number[];
  fee: number;
  sigops: number;
  priority?: number;
}

export interface MiningInfo {
  blocks: number;
  currentblocksize: number;
  currentblocktx: number;
  difficulty: number;
  networkhashps: number;
  pooledtx: number;
  chain: string;
  generate: boolean;
  genproclimit: number;
}
