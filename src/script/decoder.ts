import { Opcode, ScriptType, DecodedScript } from '../types/script';
import { parseScript } from './encode';
import { opcodeToName } from './opcodes';
import { bytesToHex } from '../utils/bytes';
import { base58CheckEncode } from '../crypto/base58';
import { ADDRESS_VERSION_MAINNET } from '../types/constants';

export function decodeScript(scriptBytes: Uint8Array): DecodedScript {
  const hex = bytesToHex(scriptBytes);
  const tokens = parseScript(scriptBytes);

  const asmParts: string[] = tokens.map((t) => {
    if (t.type === 'data') {
      return t.data!.length === 0 ? 'OP_0' : bytesToHex(t.data!);
    }
    if (t.type === 'number') return `OP_${t.value}` === 'OP_-1' ? 'OP_1NEGATE' : `OP_${t.value}`;
    return opcodeToName(t.opcode!);
  });

  const asm = asmParts.join(' ');
  const type = classifyScript(scriptBytes);
  const info = extractScriptInfo(scriptBytes, type);

  return { asm, hex, type, ...info };
}

function extractScriptInfo(
  script: Uint8Array,
  type: ScriptType
): { reqSigs?: number; addresses?: string[] } {
  const tokens = parseScript(script);

  if (type === 'pubkeyhash') {
    const hashToken = tokens[2];
    if (hashToken?.type === 'data' && hashToken.data!.length === 20) {
      const address = base58CheckEncode(ADDRESS_VERSION_MAINNET, hashToken.data!);
      return { reqSigs: 1, addresses: [address] };
    }
  }

  if (type === 'pubkey') {
    return { reqSigs: 1, addresses: [] };
  }

  if (type === 'multisig') {
    const mToken = tokens[0];
    const nToken = tokens[tokens.length - 2];
    const m = mToken?.type === 'number' ? mToken.value! : 0;
    return { reqSigs: m, addresses: [] };
  }

  if (type === 'hashlock' || type === 'hashlock-sha256') {
    const pubkeyHashToken = tokens[5];
    if (pubkeyHashToken?.type === 'data' && pubkeyHashToken.data!.length === 20) {
      const address = base58CheckEncode(ADDRESS_VERSION_MAINNET, pubkeyHashToken.data!);
      return { reqSigs: 1, addresses: [address] };
    }
  }

  return {};
}

export function classifyScript(script: Uint8Array): ScriptType {
  const tokens = parseScript(script);
  const len = tokens.length;

  if (len === 0) return 'nonstandard';

  const firstOp = tokens[0];
  const lastOp = tokens[len - 1];

  if (
    len === 5 &&
    firstOp.opcode === Opcode.OP_DUP &&
    tokens[1].opcode === Opcode.OP_HASH160 &&
    tokens[2].type === 'data' && tokens[2].data!.length === 20 &&
    tokens[3].opcode === Opcode.OP_EQUALVERIFY &&
    lastOp.opcode === Opcode.OP_CHECKSIG
  ) {
    return 'pubkeyhash';
  }

  if (
    len === 2 &&
    firstOp.type === 'data' &&
    firstOp.data!.length === 65 &&
    firstOp.data![0] === 0x04 &&
    lastOp.opcode === Opcode.OP_CHECKSIG
  ) {
    return 'pubkey';
  }

  if (
    len >= 4 &&
    firstOp.type === 'number' &&
    tokens[len - 2].type === 'number' &&
    lastOp.opcode === Opcode.OP_CHECKMULTISIG
  ) {
    const allPubkeys = tokens.slice(1, len - 2).every(
      (t) => t.type === 'data' && t.data!.length === 65 && t.data![0] === 0x04
    );
    if (allPubkeys) return 'multisig';
  }

  if (
    firstOp.opcode === Opcode.OP_RETURN
  ) {
    return 'nulldata';
  }

  if (
    len >= 7 &&
    firstOp.opcode === Opcode.OP_HASH160 &&
    tokens[1].type === 'data' && tokens[1].data!.length === 20 &&
    tokens[2].opcode === Opcode.OP_EQUALVERIFY
  ) {
    return 'hashlock';
  }

  if (
    len >= 7 &&
    firstOp.opcode === Opcode.OP_SHA256 &&
    tokens[1].type === 'data' && tokens[1].data!.length === 32 &&
    tokens[2].opcode === Opcode.OP_EQUALVERIFY
  ) {
    return 'hashlock-sha256';
  }

  const usesArith = tokens.some((t) => {
    const op = t.opcode;
    return op !== undefined && (
      op === Opcode.OP_ADD || op === Opcode.OP_SUB ||
      op === Opcode.OP_MUL || op === Opcode.OP_DIV || op === Opcode.OP_MOD ||
      op === Opcode.OP_LSHIFT || op === Opcode.OP_RSHIFT ||
      op === Opcode.OP_2MUL || op === Opcode.OP_2DIV ||
      op === Opcode.OP_1ADD || op === Opcode.OP_1SUB
    );
  });
  if (usesArith) return 'arithmetic';

  const usesSplice = tokens.some((t) => {
    const op = t.opcode;
    return op !== undefined && (
      op === Opcode.OP_SUBSTR || op === Opcode.OP_LEFT || op === Opcode.OP_RIGHT
    );
  });
  if (usesSplice) return 'splice';

  const usesBitwise = tokens.some((t) => {
    const op = t.opcode;
    return op !== undefined && op >= Opcode.OP_INVERT && op <= Opcode.OP_XOR;
  });
  if (usesBitwise) {
    const hasChecksig = tokens.some((t) =>
      t.opcode === Opcode.OP_CHECKSIG || t.opcode === Opcode.OP_CHECKSIGVERIFY
    );
    return hasChecksig ? 'bitwise-sig' : 'bitwise';
  }

  const usesCat = tokens.some((t) => t.opcode === Opcode.OP_CAT);
  if (usesCat) {
    const hasChecksig = tokens.some((t) =>
      t.opcode === Opcode.OP_CHECKSIG || t.opcode === Opcode.OP_CHECKSIGVERIFY
    );
    const hasHash = tokens.some((t) => {
      const op = t.opcode;
      return op === Opcode.OP_HASH160 || op === Opcode.OP_SHA256 ||
             op === Opcode.OP_HASH256 || op === Opcode.OP_RIPEMD160;
    });
    if (hasHash && hasChecksig) return 'cat-covenant';
    if (hasHash) return 'cat-hash';
    return 'cat-script';
  }

  return 'nonstandard';
}

export function isPushOnly(script: Uint8Array): boolean {
  const tokens = parseScript(script);
  return tokens.every((t) => {
    if (t.type === 'data') return true;
    if (t.type === 'number') return true;
    return t.opcode! <= Opcode.OP_16;
  });
}

export function countSigOps(script: Uint8Array): number {
  const tokens = parseScript(script);
  let count = 0;

  for (let i = 0; i < tokens.length; i++) {
    const op = tokens[i].opcode;
    if (op === Opcode.OP_CHECKSIG || op === Opcode.OP_CHECKSIGVERIFY) {
      count += 1;
    } else if (op === Opcode.OP_CHECKMULTISIG || op === Opcode.OP_CHECKMULTISIGVERIFY) {
      const prev = i > 0 ? tokens[i - 1] : null;
      if (prev?.type === 'number' && prev.value !== undefined) {
        count += Math.min(prev.value, 20);
      } else {
        count += 20;
      }
    }
  }

  return count;
}
