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
  RpcBuildScriptResult,
  RpcSetScriptSigResult,
  RpcSigHashResult,
  RpcDecodedScriptSig,
  RpcVerifyScriptPairResult,
  IndexerInfo,
  AddressUtxo,
  MempoolTxInfo,
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

  async getAddressMempool(address: string): Promise<MempoolTxInfo[]> {
    const mempoolTxids = await this.getMempool();
    if (mempoolTxids.length === 0) return [];

    const batchSize = 20;
    const results: MempoolTxInfo[] = [];

    for (let i = 0; i < mempoolTxids.length; i += batchSize) {
      const batch = mempoolTxids.slice(i, i + batchSize);
      const txDetails = await Promise.all(
        batch.map(txid =>
          this.getRawTransaction(txid, 1).catch(() => null)
        )
      );

      for (const rawTx of txDetails) {
        if (!rawTx || typeof rawTx === 'string') continue;
        const tx = rawTx as RawTransaction;

        const hasOutput = tx.vout.some(o => o.address === address);
        const hasInput = tx.vin.some(v => v.txid !== undefined);

        if (!hasOutput && !hasInput) continue;

        let isSpender = false;
        if (hasInput) {
          const inputChecks = await Promise.all(
            tx.vin
              .filter(v => v.txid)
              .map(async v => {
                try {
                  const prevTx = await this.getRawTransaction(v.txid!, 1) as RawTransaction;
                  return prevTx.vout[v.vout ?? 0]?.address === address;
                } catch {
                  return false;
                }
              })
          );
          isSpender = inputChecks.some(Boolean);
        }

        if (!hasOutput && !isSpender) continue;

        const receivedAmount = tx.vout
          .filter(o => o.address === address)
          .reduce((sum, o) => sum + o.value, 0);

        let sentAmount = 0;
        if (isSpender) {
          sentAmount = tx.vout
            .filter(o => o.address !== address)
            .reduce((sum, o) => sum + o.value, 0);
        }

        results.push({
          txid: tx.txid,
          receivedAmount,
          sentAmount,
          isSend: isSpender,
          isReceive: hasOutput && !isSpender,
          time: Math.floor(Date.now() / 1000),
        });
      }
    }

    return results;
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

  async buildScript(items: string[]): Promise<RpcBuildScriptResult> {
    return this.client.call<RpcBuildScriptResult>('buildscript', [items]);
  }

  async setScriptSig(
    rawTxHex: string,
    vinIndex: number,
    scriptSig: string | string[]
  ): Promise<RpcSetScriptSigResult> {
    return this.client.call<RpcSetScriptSigResult>('setscriptsig', [rawTxHex, vinIndex, scriptSig]);
  }

  async getScriptSigHash(
    rawTxHex: string,
    vinIndex: number,
    scriptPubKeyHex: string,
    sighashType = 'ALL'
  ): Promise<RpcSigHashResult> {
    return this.client.call<RpcSigHashResult>('getscriptsighash', [rawTxHex, vinIndex, scriptPubKeyHex, sighashType]);
  }

  async decodeScriptSig(
    scriptSigHex: string,
    scriptPubKeyHex: string
  ): Promise<RpcDecodedScriptSig> {
    return this.client.call<RpcDecodedScriptSig>('decodescriptsig', [scriptSigHex, scriptPubKeyHex]);
  }

  async verifyScriptPair(
    rawTxHex: string,
    vinIndex: number,
    scriptPubKeyHex: string,
    flags = 'exec'
  ): Promise<RpcVerifyScriptPairResult> {
    return this.client.call<RpcVerifyScriptPairResult>(
      'verifyscriptpair',
      [rawTxHex, vinIndex, scriptPubKeyHex, flags]
    );
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
