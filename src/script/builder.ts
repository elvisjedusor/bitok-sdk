import { Opcode } from '../types/script';
import { concatBytes, hexToBytes, bytesToHex } from '../utils/bytes';
import { encodeMinimalPush, encodeNumber } from './encode';
import { hash160, sha256Single } from '../crypto/hash';
import { addressToHash160 } from '../crypto/keys';
import { MAX_SCRIPT_SIZE, MAX_SCRIPT_ELEMENT_SIZE } from '../types/constants';

export class ScriptBuilder {
  private chunks: Uint8Array[] = [];

  op(opcode: Opcode | number): this {
    this.chunks.push(new Uint8Array([opcode]));
    return this;
  }

  pushBytes(data: Uint8Array): this {
    if (data.length > MAX_SCRIPT_ELEMENT_SIZE) {
      throw new Error(`Data too large: ${data.length} bytes (max ${MAX_SCRIPT_ELEMENT_SIZE})`);
    }
    this.chunks.push(encodeMinimalPush(data));
    return this;
  }

  pushBytesUnchecked(data: Uint8Array): this {
    this.chunks.push(encodeMinimalPush(data));
    return this;
  }

  pushHex(hex: string): this {
    return this.pushBytes(hexToBytes(hex));
  }

  pushNumber(n: number): this {
    this.chunks.push(encodeNumber(n));
    return this;
  }

  pushInt(n: number): this {
    return this.pushNumber(n);
  }

  build(): Uint8Array {
    const result = concatBytes(...this.chunks);
    if (result.length > MAX_SCRIPT_SIZE) {
      throw new Error(`Script too large: ${result.length} bytes (max ${MAX_SCRIPT_SIZE})`);
    }
    return result;
  }

  toHex(): string {
    return bytesToHex(this.build());
  }

  clone(): ScriptBuilder {
    const b = new ScriptBuilder();
    b.chunks = this.chunks.map((c) => c.slice());
    return b;
  }

  static p2pkh(address: string): Uint8Array {
    const hash = addressToHash160(address);
    return new ScriptBuilder()
      .op(Opcode.OP_DUP)
      .op(Opcode.OP_HASH160)
      .pushBytes(hash)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_CHECKSIG)
      .build();
  }

  static p2pk(publicKey: Uint8Array): Uint8Array {
    if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
      throw new Error('Bitok requires uncompressed public keys (65 bytes, 0x04 prefix)');
    }
    return new ScriptBuilder()
      .pushBytes(publicKey)
      .op(Opcode.OP_CHECKSIG)
      .build();
  }

  static multisig(m: number, publicKeys: Uint8Array[]): Uint8Array {
    if (m < 1 || m > publicKeys.length || publicKeys.length > 20) {
      throw new Error(`Invalid multisig: ${m} of ${publicKeys.length}`);
    }
    for (const pk of publicKeys) {
      if (pk.length !== 65 || pk[0] !== 0x04) {
        throw new Error('Bitok requires uncompressed public keys (65 bytes, 0x04 prefix)');
      }
    }
    const b = new ScriptBuilder().pushNumber(m);
    for (const pk of publicKeys) {
      b.pushBytes(pk);
    }
    return b
      .pushNumber(publicKeys.length)
      .op(Opcode.OP_CHECKMULTISIG)
      .build();
  }

  static opReturn(data?: Uint8Array): Uint8Array {
    const b = new ScriptBuilder().op(Opcode.OP_RETURN);
    if (data && data.length > 0) {
      if (data.length <= MAX_SCRIPT_ELEMENT_SIZE) {
        b.pushBytesUnchecked(data);
      } else {
        let offset = 0;
        while (offset < data.length) {
          const end = Math.min(offset + MAX_SCRIPT_ELEMENT_SIZE, data.length);
          b.pushBytesUnchecked(data.slice(offset, end));
          offset = end;
        }
      }
    }
    return b.build();
  }

  static opReturnHex(hex: string): Uint8Array {
    return ScriptBuilder.opReturn(hexToBytes(hex));
  }

  static hashlock(preimageHash: Uint8Array, pubkeyHash: Uint8Array): Uint8Array {
    if (preimageHash.length !== 20) {
      throw new Error(`hashlock: preimageHash must be 20 bytes (HASH160), got ${preimageHash.length}`);
    }
    if (pubkeyHash.length !== 20) {
      throw new Error(`hashlock: pubkeyHash must be 20 bytes (HASH160), got ${pubkeyHash.length}`);
    }
    return new ScriptBuilder()
      .op(Opcode.OP_HASH160)
      .pushBytes(preimageHash)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_DUP)
      .op(Opcode.OP_HASH160)
      .pushBytes(pubkeyHash)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_CHECKSIG)
      .build();
  }

  static hashlockSha256(preimageHash: Uint8Array, pubkeyHash: Uint8Array): Uint8Array {
    if (preimageHash.length !== 32) {
      throw new Error(`hashlockSha256: preimageHash must be 32 bytes (SHA256), got ${preimageHash.length}`);
    }
    if (pubkeyHash.length !== 20) {
      throw new Error(`hashlockSha256: pubkeyHash must be 20 bytes (HASH160), got ${pubkeyHash.length}`);
    }
    return new ScriptBuilder()
      .op(Opcode.OP_SHA256)
      .pushBytes(preimageHash)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_DUP)
      .op(Opcode.OP_HASH160)
      .pushBytes(pubkeyHash)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_CHECKSIG)
      .build();
  }

  static htlc(
    preimageHash: Uint8Array,
    receiverPubkeyHash: Uint8Array,
    refundPubkeyHash: Uint8Array
  ): Uint8Array {
    return new ScriptBuilder()
      .op(Opcode.OP_IF)
        .op(Opcode.OP_HASH160)
        .pushBytes(preimageHash)
        .op(Opcode.OP_EQUALVERIFY)
        .op(Opcode.OP_DUP)
        .op(Opcode.OP_HASH160)
        .pushBytes(receiverPubkeyHash)
      .op(Opcode.OP_ELSE)
        .op(Opcode.OP_DUP)
        .op(Opcode.OP_HASH160)
        .pushBytes(refundPubkeyHash)
      .op(Opcode.OP_ENDIF)
      .op(Opcode.OP_EQUALVERIFY)
      .op(Opcode.OP_CHECKSIG)
      .build();
  }

  static catCovenant(expectedData: Uint8Array): Uint8Array {
    return new ScriptBuilder()
      .op(Opcode.OP_DUP)
      .op(Opcode.OP_CAT)
      .pushBytes(expectedData)
      .op(Opcode.OP_EQUAL)
      .build();
  }

  static arithmeticCondition(
    multiplier: number,
    threshold: number,
    comparison: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  ): Uint8Array {
    const compOp: Record<string, Opcode> = {
      gt: Opcode.OP_GREATERTHAN,
      gte: Opcode.OP_GREATERTHANOREQUAL,
      lt: Opcode.OP_LESSTHAN,
      lte: Opcode.OP_LESSTHANOREQUAL,
      eq: Opcode.OP_NUMEQUAL,
    };
    return new ScriptBuilder()
      .pushNumber(multiplier)
      .op(Opcode.OP_MUL)
      .pushNumber(threshold)
      .op(compOp[comparison])
      .op(Opcode.OP_VERIFY)
      .build();
  }
}
