import { RpcClient } from './client';
import {
  RpcConfig,
  TxDetail,
  RawTransaction,
  DecodedRawTransaction,
  MultisigInfo,
  PreimageInfo,
  PreimageListEntry,
  BlockHeaderInfo,
  RpcScriptAnalysis,
  RpcScriptValidationResult,
  IndexerInfo,
  AddressUtxo,
} from '../types/rpc';
import { Block, BlockTemplate, MiningInfo } from '../types/block';
import { NetworkInfo, PeerInfo } from '../types/network';
import { UTXO } from '../types/transaction';

function coinsToSatoshis(coins: number): bigint {
  const str = coins.toFixed(8);
  const [whole, frac = ''] = str.split('.');
  const padded = frac.padEnd(8, '0').slice(0, 8);
  return BigInt(whole) * 100_000_000n + BigInt(padded);
}

export class BitokRpc {
  readonly client: RpcClient;

  constructor(config: RpcConfig) {
    this.client = new RpcClient(config);
  }

  // ─── Blockchain ─────────────────────────────────────────────────────────────

  async getBlockCount(): Promise<number> {
    return this.client.call<number>('getblockcount');
  }

  async getBlockNumber(): Promise<number> {
    return this.client.call<number>('getblocknumber');
  }

  async getBestBlockHash(): Promise<string> {
    return this.client.call<string>('getbestblockhash');
  }

  async getBlockHash(height: number): Promise<string> {
    return this.client.call<string>('getblockhash', [height]);
  }

  async getBlock(hash: string): Promise<Block> {
    return this.client.call<Block>('getblock', [hash]);
  }

  async getBlockHeader(hash: string): Promise<BlockHeaderInfo> {
    return this.client.call<BlockHeaderInfo>('getblockheader', [hash]);
  }

  async getInfo(): Promise<NetworkInfo> {
    return this.client.call<NetworkInfo>('getinfo');
  }

  async getDifficulty(): Promise<number> {
    return this.client.call<number>('getdifficulty');
  }

  // ─── Transactions ────────────────────────────────────────────────────────────

  async getTransaction(txid: string): Promise<TxDetail> {
    return this.client.call<TxDetail>('gettransaction', [txid]);
  }

  async getRawTransaction(txid: string, verbose?: 0): Promise<string>;
  async getRawTransaction(txid: string, verbose: 1): Promise<RawTransaction>;
  async getRawTransaction(txid: string, verbose = 0): Promise<string | RawTransaction> {
    return this.client.call<string | RawTransaction>('getrawtransaction', [txid, verbose]);
  }

  async decodeRawTransaction(hexString: string): Promise<DecodedRawTransaction> {
    return this.client.call<DecodedRawTransaction>('decoderawtransaction', [hexString]);
  }

  async createRawTransaction(
    inputs: Array<{ txid: string; vout: number; sequence?: number }>,
    outputs: Record<string, number | string>,
    locktime = 0
  ): Promise<string> {
    return this.client.call<string>('createrawtransaction', [inputs, outputs, locktime]);
  }

  async signRawTransaction(
    hexString: string,
    prevTxs: Array<{ txid: string; vout: number; scriptPubKey: string }> = [],
    privateKeys: string[] = [],
    sighashType = 'ALL'
  ): Promise<{ hex: string; complete: boolean }> {
    return this.client.call<{ hex: string; complete: boolean }>(
      'signrawtransaction',
      [hexString, prevTxs, privateKeys, sighashType]
    );
  }

  async sendRawTransaction(hexString: string): Promise<string> {
    return this.client.call<string>('sendrawtransaction', [hexString]);
  }

  async decodeScript(hexScript: string): Promise<{
    asm: string;
    hex: string;
    type: string;
    reqSigs?: number;
    addresses?: string[];
  }> {
    return this.client.call('decodescript', [hexScript]);
  }

  async getMempool(): Promise<string[]> {
    return this.client.call<string[]>('getrawmempool');
  }

  async getTxOutProof(txid: string, blockHash?: string): Promise<string> {
    const params: unknown[] = [txid];
    if (blockHash) params.push(blockHash);
    return this.client.call<string>('gettxoutproof', params);
  }

  async verifyTxOutProof(proof: string): Promise<string[]> {
    return this.client.call<string[]>('verifytxoutproof', [proof]);
  }

  // ─── Indexer ─────────────────────────────────────────────────────────────────

  async getIndexerInfo(): Promise<IndexerInfo> {
    return this.client.call<IndexerInfo>('getindexerinfo');
  }

  async getAddressTxids(address: string): Promise<string[]> {
    return this.client.call<string[]>('getaddresstxids', [address]);
  }

  async getAddressUtxos(address: string): Promise<UTXO[]> {
    const raw = await this.client.call<AddressUtxo[]>('getaddressutxos', [address]);
    return raw.map((u) => ({
      ...u,
      valueSatoshis: coinsToSatoshis(u.value),
    }));
  }

  async getAddressBalance(address: string): Promise<bigint> {
    const coins = await this.client.call<number>('getaddressbalance', [address]);
    return coinsToSatoshis(coins);
  }

  // ─── Multisig ────────────────────────────────────────────────────────────────

  async createMultisig(nRequired: number, keys: string[]): Promise<MultisigInfo> {
    return this.client.call<MultisigInfo>('createmultisig', [nRequired, keys]);
  }

  // ─── Script Analysis ─────────────────────────────────────────────────────────

  async analyzeScript(scriptHex: string): Promise<RpcScriptAnalysis> {
    return this.client.call<RpcScriptAnalysis>('analyzescript', [scriptHex]);
  }

  async validateScript(
    scriptHex: string,
    stack: string[] = [],
    flags = 'exec'
  ): Promise<RpcScriptValidationResult> {
    return this.client.call<RpcScriptValidationResult>('validatescript', [scriptHex, stack, flags]);
  }

  // ─── Hash Preimages ───────────────────────────────────────────────────────────

  async addPreimage(preimageHex: string): Promise<PreimageInfo> {
    return this.client.call<PreimageInfo>('addpreimage', [preimageHex]);
  }

  async listPreimages(): Promise<PreimageListEntry[]> {
    return this.client.call<PreimageListEntry[]>('listpreimages');
  }

  // ─── Mining ──────────────────────────────────────────────────────────────────

  async getMiningInfo(): Promise<MiningInfo> {
    return this.client.call<MiningInfo>('getmininginfo');
  }

  async getBlockTemplate(): Promise<BlockTemplate> {
    return this.client.call<BlockTemplate>('getblocktemplate');
  }

  async submitBlock(hexData: string): Promise<string | null> {
    return this.client.call<string | null>('submitblock', [hexData]);
  }

  async getWork(data?: string): Promise<unknown> {
    return this.client.call('getwork', data ? [data] : []);
  }

  async setGenerate(generate: boolean, processorLimit = -1): Promise<null> {
    return this.client.call<null>('setgenerate', [generate, processorLimit]);
  }

  async getGenerate(): Promise<boolean> {
    return this.client.call<boolean>('getgenerate');
  }

  // ─── Network ─────────────────────────────────────────────────────────────────

  async getConnectionCount(): Promise<number> {
    return this.client.call<number>('getconnectioncount');
  }

  async getPeerInfo(): Promise<PeerInfo[]> {
    return this.client.call<PeerInfo[]>('getpeerinfo');
  }

  // ─── Control ─────────────────────────────────────────────────────────────────

  async help(): Promise<string> {
    return this.client.call<string>('help');
  }

  async stop(): Promise<string> {
    return this.client.call<string>('stop');
  }
}
