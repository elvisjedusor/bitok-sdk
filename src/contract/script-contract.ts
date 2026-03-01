import { BitokRpc } from '../rpc/api';
import { RpcVerifyScriptPairResult, RpcDecodedScriptSig } from '../types/rpc';
import { signHash } from '../crypto/keys';
import { bytesToHex, hexToBytes, concatBytes } from '../utils/bytes';
import { encodeMinimalPush } from '../script/encode';

export interface FundScriptResult {
  fundingTxHex: string;
  fundingTxid: string;
  vout: number;
  scriptPubKeyHex: string;
  amountBitok: number;
}

export interface SpendScriptResult {
  spendTxHex: string;
  spendTxid: string;
  verified: boolean;
  verifyError?: string;
}

export interface ScriptSigHashInfo {
  sighash: string;
  hashType: number;
  hashTypeName: string;
}

const SIGHASH_TYPE_BYTES: Record<string, number> = {
  'ALL': 0x01,
  'NONE': 0x02,
  'SINGLE': 0x03,
  'ALL|ANYONECANPAY': 0x81,
  'NONE|ANYONECANPAY': 0x82,
  'SINGLE|ANYONECANPAY': 0x83,
};

export class ScriptContract {
  constructor(private rpc: BitokRpc) {}

  async buildScriptHex(items: string[]): Promise<string> {
    const result = await this.rpc.buildScript(items);
    return result.hex;
  }

  async fund(
    scriptPubKeyHex: string,
    amountBitok: number,
    inputs: Array<{ txid: string; vout: number }>,
    changeAddress: string,
    changeBitok: number,
    signingKeys: string[] = []
  ): Promise<FundScriptResult> {
    const outputs: Record<string, number | string> = {};

    const scriptOutputKey = `script:${scriptPubKeyHex}`;
    outputs[scriptOutputKey] = amountBitok;

    if (changeBitok > 0) {
      outputs[changeAddress] = changeBitok;
    }

    const rawTx = await this.rpc.createRawTransaction(inputs, outputs);

    const signed = await this.rpc.signRawTransaction(rawTx, [], signingKeys);
    if (!signed.complete) {
      throw new Error('Funding transaction signing incomplete');
    }

    const decoded = await this.rpc.decodeRawTransaction(signed.hex);

    let vout = -1;
    for (const out of decoded.vout) {
      if (out.scriptPubKey.hex === scriptPubKeyHex) {
        vout = out.n;
        break;
      }
    }
    if (vout === -1) {
      throw new Error('Script output not found in funded transaction');
    }

    const txid = await this.rpc.sendRawTransaction(signed.hex);

    return {
      fundingTxHex: signed.hex,
      fundingTxid: txid,
      vout,
      scriptPubKeyHex,
      amountBitok,
    };
  }

  async getSigHash(
    rawTxHex: string,
    vinIndex: number,
    scriptPubKeyHex: string,
    sighashType = 'ALL'
  ): Promise<ScriptSigHashInfo> {
    const result = await this.rpc.getScriptSigHash(rawTxHex, vinIndex, scriptPubKeyHex, sighashType);
    return { sighash: result.sighash, hashType: result.hashType, hashTypeName: result.hashTypeName };
  }

  signSigHash(sighashHex: string, privateKey: Uint8Array, sighashType = 'ALL'): string {
    const hash = hexToBytes(sighashHex);
    const sig = signHash(hash, privateKey);
    const typeByte = SIGHASH_TYPE_BYTES[sighashType] ?? 0x01;
    const sigWithType = concatBytes(sig, new Uint8Array([typeByte]));
    return bytesToHex(sigWithType);
  }

  buildScriptSigFromPushes(pushHexes: string[]): string {
    const parts: Uint8Array[] = [];
    for (const hex of pushHexes) {
      parts.push(encodeMinimalPush(hexToBytes(hex)));
    }
    return bytesToHex(concatBytes(...parts));
  }

  async setScriptSig(
    rawTxHex: string,
    vinIndex: number,
    scriptSig: string | string[]
  ): Promise<string> {
    const result = await this.rpc.setScriptSig(rawTxHex, vinIndex, scriptSig);
    return result.hex;
  }

  async verify(
    rawTxHex: string,
    vinIndex: number,
    scriptPubKeyHex: string
  ): Promise<RpcVerifyScriptPairResult> {
    return this.rpc.verifyScriptPair(rawTxHex, vinIndex, scriptPubKeyHex);
  }

  async decodeScriptSig(
    scriptSigHex: string,
    scriptPubKeyHex: string
  ): Promise<RpcDecodedScriptSig> {
    return this.rpc.decodeScriptSig(scriptSigHex, scriptPubKeyHex);
  }

  async spend(
    fundingTxid: string,
    fundingVout: number,
    scriptPubKeyHex: string,
    scriptSigItems: string | string[],
    destinationAddress: string,
    amountBitok: number,
    privateKey?: Uint8Array,
    sighashType = 'ALL'
  ): Promise<SpendScriptResult> {
    const spendInputs = [{ txid: fundingTxid, vout: fundingVout }];
    const spendOutputs: Record<string, number> = { [destinationAddress]: amountBitok };
    let rawSpendTx = await this.rpc.createRawTransaction(spendInputs, spendOutputs);

    if (privateKey) {
      const { sighash } = await this.getSigHash(rawSpendTx, 0, scriptPubKeyHex, sighashType);
      const sigHex = this.signSigHash(sighash, privateKey, sighashType);

      if (Array.isArray(scriptSigItems)) {
        const resolved = scriptSigItems.map(item =>
          item === '{signature}' ? sigHex : item
        );
        rawSpendTx = await this.setScriptSig(rawSpendTx, 0, resolved);
      } else {
        const resolved = scriptSigItems.replace(/\{signature\}/g, sigHex);
        rawSpendTx = await this.setScriptSig(rawSpendTx, 0, resolved);
      }
    } else {
      rawSpendTx = await this.setScriptSig(rawSpendTx, 0, scriptSigItems);
    }

    const verification = await this.rpc.verifyScriptPair(rawSpendTx, 0, scriptPubKeyHex);

    if (!verification.verified) {
      return {
        spendTxHex: rawSpendTx,
        spendTxid: '',
        verified: false,
        verifyError: verification.diagnostics?.join('; '),
      };
    }

    const txid = await this.rpc.sendRawTransaction(rawSpendTx);

    return {
      spendTxHex: rawSpendTx,
      spendTxid: txid,
      verified: true,
    };
  }

  async analyzeScript(scriptHex: string) {
    return this.rpc.analyzeScript(scriptHex);
  }
}
