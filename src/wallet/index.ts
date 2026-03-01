import {
  generatePrivateKey,
  privateKeyToPublicKey,
  publicKeyToAddress,
  privateKeyToWIF,
  wifToPrivateKey,
  addressToHash160,
  isValidAddress,
  isValidPrivateKey,
} from '../crypto/keys';
import { hash160 } from '../crypto/hash';
import { ScriptBuilder } from '../script/builder';
import { bytesToHex, hexToBytes } from '../utils/bytes';
import { BitokRpc } from '../rpc/api';
import { UTXO } from '../types/transaction';
import { selectUTXOs, bitokToSatoshis, satoshisToBitok } from '../tx/builder';
import { TransactionBuilder } from '../tx/builder';
import { signTransaction } from '../tx/signer';
import { MIN_FEE_PER_KB } from '../types/constants';

export interface KeyPair {
  privateKeyHex: string;
  privateKeyWIF: string;
  publicKeyHex: string;
  address: string;
  hash160: string;
}

export function generateKeyPair(): KeyPair {
  const privateKey = generatePrivateKey();
  return deriveKeyPair(privateKey);
}

export function deriveKeyPair(privateKey: Uint8Array): KeyPair {
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid private key');
  }
  const publicKey = privateKeyToPublicKey(privateKey, false);
  const address = publicKeyToAddress(publicKey);
  const h160 = hash160(publicKey);

  return {
    privateKeyHex: bytesToHex(privateKey),
    privateKeyWIF: privateKeyToWIF(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    address,
    hash160: bytesToHex(h160),
  };
}

export function importFromWIF(wif: string): KeyPair {
  const privateKey = wifToPrivateKey(wif);
  return deriveKeyPair(privateKey);
}

export function validateAddress(address: string): {
  valid: boolean;
  hash160?: string;
  error?: string;
} {
  try {
    const h160 = addressToHash160(address);
    return { valid: true, hash160: bytesToHex(h160) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export class Wallet {
  private keyPair: KeyPair;

  constructor(keyPair?: KeyPair) {
    this.keyPair = keyPair ?? generateKeyPair();
  }

  static generate(): Wallet {
    return new Wallet(generateKeyPair());
  }

  static fromWIF(wif: string): Wallet {
    return new Wallet(importFromWIF(wif));
  }

  static fromPrivateKeyHex(hex: string): Wallet {
    return new Wallet(deriveKeyPair(hexToBytes(hex)));
  }

  get address(): string {
    return this.keyPair.address;
  }

  get privateKeyWIF(): string {
    return this.keyPair.privateKeyWIF;
  }

  get publicKeyHex(): string {
    return this.keyPair.publicKeyHex;
  }

  get privateKeyHex(): string {
    return this.keyPair.privateKeyHex;
  }

  get hash160Hex(): string {
    return this.keyPair.hash160;
  }

  async getBalance(rpc: BitokRpc): Promise<bigint> {
    return rpc.getAddressBalance(this.address);
  }

  async getUTXOs(rpc: BitokRpc): Promise<UTXO[]> {
    return rpc.getAddressUtxos(this.address);
  }

  async send(
    rpc: BitokRpc,
    toAddress: string,
    amountSatoshis: bigint,
    feeSatoshis?: bigint
  ): Promise<string> {
    const utxos = await this.getUTXOs(rpc);

    let fee: bigint;
    let selected: ReturnType<typeof selectUTXOs>;

    if (feeSatoshis !== undefined) {
      fee = feeSatoshis;
      selected = selectUTXOs(utxos, amountSatoshis, fee);
    } else {
      const roughSelected = selectUTXOs(utxos, amountSatoshis, MIN_FEE_PER_KB);
      const totalIn = roughSelected.reduce((acc, u) => acc + u.valueSatoshis, 0n);
      const hasChange = totalIn - amountSatoshis - MIN_FEE_PER_KB > 0n;
      const outputCount = hasChange ? 2 : 1;
      const estimatedSize = 10 + roughSelected.length * 180 + outputCount * 34;
      fee = BigInt(1 + Math.floor(estimatedSize / 1000)) * MIN_FEE_PER_KB;
      selected = selectUTXOs(utxos, amountSatoshis, fee);
    }

    const totalIn = selected.reduce((acc, u) => acc + u.valueSatoshis, 0n);
    const change = totalIn - amountSatoshis - fee;

    const builder = new TransactionBuilder()
      .addOutputToAddress(toAddress, amountSatoshis);

    for (const utxo of selected) {
      builder.addInput(utxo.txid, utxo.vout);
    }

    if (change > 0n) {
      builder.addOutputToAddress(this.address, change);
    }

    const tx = builder.build();
    const privKey = hexToBytes(this.keyPair.privateKeyHex);
    const scriptPubKeyHex = bytesToHex(ScriptBuilder.p2pkh(this.address));
    const prevTxs = selected.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      scriptPubKey: scriptPubKeyHex,
    }));

    let txid: string;
    try {
      const signed = signTransaction(tx, [privKey], { prevTxs });
      if (!signed.complete) {
        const errors = signed.inputs.filter((inp) => !inp.complete).map((inp) => inp.error).join('; ');
        throw new Error(`Failed to sign all inputs: ${errors}`);
      }
      txid = await rpc.sendRawTransaction(signed.hex);
    } finally {
      privKey.fill(0);
    }

    return txid;
  }

  exportBackup(): { address: string; wif: string; publicKey: string } {
    return {
      address: this.address,
      wif: this.privateKeyWIF,
      publicKey: this.publicKeyHex,
    };
  }
}

export {
  generatePrivateKey,
  privateKeyToPublicKey,
  publicKeyToAddress,
  privateKeyToWIF,
  wifToPrivateKey,
  addressToHash160,
  isValidAddress,
  bitokToSatoshis,
  satoshisToBitok,
};
