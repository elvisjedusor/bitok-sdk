import { Opcode } from '../types/script';
import { ScriptInterpreterResult as ScriptValidationResult } from '../types/script';
import { Transaction } from '../types/transaction';
import { parseScript, decodeNumber, encodeMinimalPush } from './encode';
import {
  MAX_STACK_SIZE,
  MAX_OPS_PER_SCRIPT,
  MAX_SCRIPT_ELEMENT_SIZE,
  MAX_SCRIPT_SIZE,
  MAX_PUBKEYS_PER_MULTISIG,
  MAX_BIGNUM_SIZE,
  SCRIPT_VERIFY_EXEC,
  PROTOCOL_VERSION,
} from '../types/constants';
import {
  sha256Single,
  ripemd160Single,
  sha1Single,
  hash160,
  hash256,
} from '../crypto/hash';
import { verifyHash } from '../crypto/keys';
import { bytesToHex, concatBytes, equalBytes } from '../utils/bytes';
import { serializeForSigning, stripCodeSeparators } from '../tx/serialize';

type Stack = Uint8Array[];

// --------------------------------------------------------------------------
// castBool: byte-level truth test (used for OP_IF, OP_VERIFY, etc.)
// --------------------------------------------------------------------------
function castBool(v: Uint8Array): boolean {
  if (v.length === 0) return false;
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== 0) {
      // Negative zero is false
      if (i === v.length - 1 && v[i] === 0x80) return false;
      return true;
    }
  }
  return false;
}

// --------------------------------------------------------------------------
// numToBytes: encode a JS number as a script number (little-endian, sign bit)
// --------------------------------------------------------------------------
function numToBytes(n: number): Uint8Array {
  if (n === 0) return new Uint8Array(0);
  const abs = Math.abs(n);
  const bytes: number[] = [];
  let temp = abs;
  while (temp > 0) {
    bytes.push(temp & 0xff);
    temp = Math.floor(temp / 256);
  }
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(n < 0 ? 0x80 : 0x00);
  } else if (n < 0) {
    bytes[bytes.length - 1] |= 0x80;
  }
  return new Uint8Array(bytes);
}

// --------------------------------------------------------------------------
// checkNumSize: gated on SCRIPT_VERIFY_EXEC (rule #1)
// When flag is NOT set, no size or minimal encoding check.
// --------------------------------------------------------------------------
function checkNumSize(v: Uint8Array, flags: number): void {
  if (!(flags & SCRIPT_VERIFY_EXEC)) return;
  if (v.length > 4) {
    throw new Error('Script number overflow');
  }
  if (v.length > 0) {
    if ((v[v.length - 1] & 0x7f) === 0) {
      if (v.length <= 1 || (v[v.length - 2] & 0x80) === 0) {
        throw new Error('Non-minimally encoded script number');
      }
    }
  }
}

// --------------------------------------------------------------------------
// decodeNumberFlagged: decode a stack item as a number, gating the size
// check on SCRIPT_VERIFY_EXEC.
// --------------------------------------------------------------------------
function decodeNumberFlagged(v: Uint8Array, flags: number): number {
  checkNumSize(v, flags);
  return decodeNumber(v);
}

// --------------------------------------------------------------------------
// isMinimalPush: check that a push opcode is the minimal encoding for data
// --------------------------------------------------------------------------
function isMinimalPush(opcode: number, data: Uint8Array): boolean {
  const len = data.length;
  if (len === 0) return opcode === Opcode.OP_0;
  if (len === 1) {
    const v = data[0];
    if (v === 0x81) return opcode === Opcode.OP_1NEGATE;
    if (v >= 1 && v <= 16) return opcode === Opcode.OP_1 + v - 1;
    return opcode === 1;
  }
  if (len <= 75) return opcode === len;
  if (len <= 255) return opcode === Opcode.OP_PUSHDATA1;
  if (len <= 65535) return opcode === Opcode.OP_PUSHDATA2;
  return true;
}

// --------------------------------------------------------------------------
// isPushOnly: all opcodes must have value <= OP_16 (0x60). C++ IsPushOnly
// checks opcode <= OP_16, which means any byte value 0x00..0x60. (rule #18)
// --------------------------------------------------------------------------
function isPushOnly(script: Uint8Array): boolean {
  let i = 0;
  while (i < script.length) {
    const op = script[i];
    i++;
    if (op > Opcode.OP_16) return false;
    // Skip over any push data
    if (op >= 0x01 && op <= 0x4b) {
      i += op;
    } else if (op === Opcode.OP_PUSHDATA1) {
      if (i >= script.length) return false;
      const len = script[i];
      i += 1 + len;
    } else if (op === Opcode.OP_PUSHDATA2) {
      if (i + 1 >= script.length) return false;
      const len = script[i] | (script[i + 1] << 8);
      i += 2 + len;
    } else if (op === Opcode.OP_PUSHDATA4) {
      if (i + 3 >= script.length) return false;
      const len = script[i] | (script[i + 1] << 8) | (script[i + 2] << 16) | (script[i + 3] << 24);
      i += 4 + len;
    }
    // OP_0 (0x00), OP_1NEGATE (0x4f), OP_RESERVED (0x50), OP_1..OP_16 (0x51..0x60)
    // have no data following them (already handled above or are single-byte)
  }
  return true;
}

// --------------------------------------------------------------------------
// findAndDelete: remove all occurrences of encodeMinimalPush(data) from
// scriptBytes. (rules #15, #16, #19)
// --------------------------------------------------------------------------
function findAndDelete(scriptBytes: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length === 0) return scriptBytes;
  const needle = encodeMinimalPush(data);
  const needleLen = needle.length;
  const result: number[] = [];
  let i = 0;
  while (i < scriptBytes.length) {
    // Check if needle matches at position i
    let match = false;
    if (i + needleLen <= scriptBytes.length) {
      match = true;
      for (let j = 0; j < needleLen; j++) {
        if (scriptBytes[i + j] !== needle[j]) {
          match = false;
          break;
        }
      }
    }
    if (match) {
      // Skip over the matched bytes
      i += needleLen;
    } else {
      result.push(scriptBytes[i]);
      i++;
    }
  }
  return new Uint8Array(result);
}

// --------------------------------------------------------------------------
// makeSameSize: pad the shorter array with zeros to match the longer.
// Used by OP_AND/OP_OR/OP_XOR. (rule #10)
// --------------------------------------------------------------------------
function makeSameSize(a: Uint8Array, b: Uint8Array): [Uint8Array, Uint8Array] {
  if (a.length === b.length) return [a, b];
  const maxLen = Math.max(a.length, b.length);
  const padA = new Uint8Array(maxLen);
  const padB = new Uint8Array(maxLen);
  padA.set(a);
  padB.set(b);
  return [padA, padB];
}

// --------------------------------------------------------------------------
// parseSigHashType: split signature into DER bytes + hash type byte
// --------------------------------------------------------------------------
function parseSigHashType(sigWithHashType: Uint8Array): { sig: Uint8Array; hashType: number } | null {
  if (sigWithHashType.length < 1) return null;
  const hashType = sigWithHashType[sigWithHashType.length - 1];
  const sig = sigWithHashType.slice(0, sigWithHashType.length - 1);
  return { sig, hashType };
}

// --------------------------------------------------------------------------
// checkSignatureEncoding: validates DER format, low-S, and hash type.
// All checks gated on SCRIPT_VERIFY_EXEC. Empty sig is always valid (rule #17)
// --------------------------------------------------------------------------
function checkSignatureEncoding(sig: Uint8Array, flags: number): boolean {
  if (!(flags & SCRIPT_VERIFY_EXEC)) return true;
  // Empty sig: valid (means "don't match")
  if (sig.length === 0) return true;

  // Min 9 bytes, max 73 bytes (including 1-byte hash type)
  if (sig.length < 9 || sig.length > 73) return false;

  const hashType = sig[sig.length - 1];

  // Check defined hash type: (hashType & ~0x80) must be 1, 2, or 3
  const baseHashType = hashType & 0x1f;
  if (baseHashType < 1 || baseHashType > 3) return false;

  // DER structure check on sig[0..sig.length-2]
  const der = sig.slice(0, sig.length - 1);

  // Must start with 0x30 (SEQUENCE)
  if (der[0] !== 0x30) return false;
  // Length byte
  if (der[1] !== der.length - 2) return false;

  // R integer
  if (der[2] !== 0x02) return false;
  const rLen = der[3];
  if (rLen === 0 || rLen > der.length - 7) return false;
  // R must not have leading zeros unless high bit of next byte is set
  if (der[4] & 0x80) return false; // negative R
  if (rLen > 1 && der[4] === 0x00 && !(der[5] & 0x80)) return false; // unnecessary leading zero

  // S integer
  const sOffset = 4 + rLen;
  if (sOffset >= der.length) return false;
  if (der[sOffset] !== 0x02) return false;
  const sLen = der[sOffset + 1];
  if (sLen === 0) return false;
  if (sOffset + 2 + sLen !== der.length) return false;
  // S must not be negative
  if (der[sOffset + 2] & 0x80) return false; // negative S
  if (sLen > 1 && der[sOffset + 2] === 0x00 && !(der[sOffset + 3] & 0x80)) return false; // unnecessary leading zero

  // Low-S check: S must be <= secp256k1 n/2
  // n/2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
  const HALF_ORDER = new Uint8Array([
    0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d,
    0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
  ]);
  const sStart = sOffset + 2;
  // Extract the canonical 32-byte big-endian S value (strip leading zero padding)
  const sRaw = der.slice(sStart, sStart + sLen);
  // Normalise to 32 bytes: strip leading zero bytes added for DER sign-bit
  let sNorm = sRaw;
  while (sNorm.length > 32 && sNorm[0] === 0x00) sNorm = sNorm.slice(1);
  // Pad to 32 bytes if shorter
  if (sNorm.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(sNorm, 32 - sNorm.length);
    sNorm = padded;
  }
  // Compare sNorm <= HALF_ORDER byte-by-byte (big-endian)
  for (let k = 0; k < 32; k++) {
    if (sNorm[k] < HALF_ORDER[k]) break;
    if (sNorm[k] > HALF_ORDER[k]) return false;
  }

  return true;
}

// --------------------------------------------------------------------------
// checkArithmeticOverflow: gated on SCRIPT_VERIFY_EXEC. (rule #13)
// --------------------------------------------------------------------------
function checkArithmeticOverflow(result: Uint8Array, flags: number): boolean {
  if ((flags & SCRIPT_VERIFY_EXEC) && result.length > MAX_BIGNUM_SIZE) return false;
  return true;
}

export interface CheckSigContext {
  tx?: Transaction;
  inputIndex?: number;
  scriptCode?: Uint8Array;
}

// --------------------------------------------------------------------------
// evalScript: the main script interpreter
// --------------------------------------------------------------------------
export function evalScript(
  script: Uint8Array,
  stack: Stack,
  flags: number = SCRIPT_VERIFY_EXEC,
  context: CheckSigContext = {}
): ScriptValidationResult {
  // Rule #2: script size limit gated on SCRIPT_VERIFY_EXEC
  if ((flags & SCRIPT_VERIFY_EXEC) && script.length > MAX_SCRIPT_SIZE) {
    return { success: false, finalStack: [], error: 'Script too large' };
  }

  const altStack: Stack = [];
  let nOpCount = 0;
  const execStack: boolean[] = [];
  const tokens = parseScript(script);

  // Track the offset after the most recent OP_CODESEPARATOR (rule #20)
  // Used as the scriptCode base for CHECKSIG operations.
  let lastCodeSepEndOffset = 0;

  try {
    for (const token of tokens) {
      const executing = execStack.every((v) => v);

      // ---------------------------------------------------------------
      // Push data tokens
      // ---------------------------------------------------------------
      if (token.type === 'data' || token.type === 'number') {
        if (executing) {
          const data = token.type === 'data'
            ? (token.data ?? new Uint8Array(0))
            : numToBytes(token.value ?? 0);

          // Rule #3: element push size gated on SCRIPT_VERIFY_EXEC
          if ((flags & SCRIPT_VERIFY_EXEC) && data.length > MAX_SCRIPT_ELEMENT_SIZE) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Push data too large' };
          }

          // Rule #5: MinimalPush check gated on SCRIPT_VERIFY_EXEC
          if ((flags & SCRIPT_VERIFY_EXEC) && token.type === 'data' && token.opcode !== undefined) {
            if (!isMinimalPush(token.opcode, data)) {
              return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Non-minimal push operation' };
            }
          }

          stack.push(data);
        }

        // Rule #4: stack size check at END of each token iteration
        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      // ---------------------------------------------------------------
      // Opcode tokens
      // ---------------------------------------------------------------
      const op = token.opcode!;

      // Rule #6: opcount — gated on SCRIPT_VERIFY_EXEC, NO exclusions for RESERVED1/RESERVED2
      if ((flags & SCRIPT_VERIFY_EXEC) && op > Opcode.OP_16 && ++nOpCount > MAX_OPS_PER_SCRIPT) {
        return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Too many opcodes' };
      }

      // Rule #7: OP_VERIF/OP_VERNOTIF fail even in non-executing branches when SCRIPT_VERIFY_EXEC
      // This runs BEFORE the fExec check.
      if ((flags & SCRIPT_VERIFY_EXEC) && (op === Opcode.OP_VERIF || op === Opcode.OP_VERNOTIF)) {
        return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: `Disabled opcode: 0x${op.toString(16)}` };
      }

      // ---------------------------------------------------------------
      // Flow control — these are processed regardless of executing state
      // ---------------------------------------------------------------
      if (op === Opcode.OP_IF || op === Opcode.OP_NOTIF) {
        let val = false;
        if (executing) {
          if (stack.length < 1) throw new Error('OP_IF: empty stack');
          val = castBool(stack.pop()!);
          if (op === Opcode.OP_NOTIF) val = !val;
        }
        execStack.push(val);

        // Rule #4: stack size check at END of each token iteration
        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      if (op === Opcode.OP_ELSE) {
        if (execStack.length === 0) throw new Error('OP_ELSE without OP_IF');
        execStack[execStack.length - 1] = !execStack[execStack.length - 1];

        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      if (op === Opcode.OP_ENDIF) {
        if (execStack.length === 0) throw new Error('OP_ENDIF without OP_IF');
        execStack.pop();

        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      // Not executing: skip
      if (!executing) {
        // Rule #4: stack size check at END of each token iteration
        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      // ---------------------------------------------------------------
      // Executing opcodes
      // ---------------------------------------------------------------

      // Rule #9: OP_RETURN always returns false unconditionally (no flags check)
      if (op === Opcode.OP_RETURN) {
        return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_RETURN' };
      }

      // Rule #8: OP_VER — when SCRIPT_VERIFY_EXEC: return false.
      // When NOT set: push VERSION (319) as script number.
      if (op === Opcode.OP_VER) {
        if (flags & SCRIPT_VERIFY_EXEC) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Disabled opcode: OP_VER' };
        } else {
          stack.push(numToBytes(PROTOCOL_VERSION));
        }
        if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large' };
        }
        continue;
      }

      switch (op) {
        case Opcode.OP_NOP: break;

        case Opcode.OP_RESERVED:
        case Opcode.OP_RESERVED1:
        case Opcode.OP_RESERVED2: {
          // In executing context, reserved opcodes cause script failure
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: `Reserved opcode: 0x${op.toString(16)}` };
        }

        case Opcode.OP_VERIFY: {
          if (stack.length < 1) throw new Error('OP_VERIFY: empty stack');
          if (!castBool(stack.pop()!)) throw new Error('OP_VERIFY failed');
          break;
        }

        case Opcode.OP_TOALTSTACK: {
          if (stack.length < 1) throw new Error('OP_TOALTSTACK: empty stack');
          altStack.push(stack.pop()!);
          break;
        }

        case Opcode.OP_FROMALTSTACK: {
          if (altStack.length < 1) throw new Error('OP_FROMALTSTACK: empty altstack');
          stack.push(altStack.pop()!);
          break;
        }

        case Opcode.OP_DROP: {
          if (stack.length < 1) throw new Error('OP_DROP: empty stack');
          stack.pop();
          break;
        }

        case Opcode.OP_2DROP: {
          if (stack.length < 2) throw new Error('OP_2DROP: insufficient stack');
          stack.pop(); stack.pop();
          break;
        }

        case Opcode.OP_DUP: {
          if (stack.length < 1) throw new Error('OP_DUP: empty stack');
          stack.push(stack[stack.length - 1].slice());
          break;
        }

        case Opcode.OP_2DUP: {
          if (stack.length < 2) throw new Error('OP_2DUP: insufficient stack');
          stack.push(stack[stack.length - 2].slice(), stack[stack.length - 1].slice());
          break;
        }

        case Opcode.OP_3DUP: {
          if (stack.length < 3) throw new Error('OP_3DUP: insufficient stack');
          stack.push(
            stack[stack.length - 3].slice(),
            stack[stack.length - 2].slice(),
            stack[stack.length - 1].slice()
          );
          break;
        }

        case Opcode.OP_OVER: {
          if (stack.length < 2) throw new Error('OP_OVER: insufficient stack');
          stack.push(stack[stack.length - 2].slice());
          break;
        }

        case Opcode.OP_2OVER: {
          if (stack.length < 4) throw new Error('OP_2OVER: insufficient stack');
          stack.push(stack[stack.length - 4].slice(), stack[stack.length - 3].slice());
          break;
        }

        case Opcode.OP_SWAP: {
          if (stack.length < 2) throw new Error('OP_SWAP: insufficient stack');
          const sA = stack.pop()!; const sB = stack.pop()!;
          stack.push(sA, sB);
          break;
        }

        case Opcode.OP_2SWAP: {
          if (stack.length < 4) throw new Error('OP_2SWAP: insufficient stack');
          const [sD, sC, sB2, sA2] = [stack.pop()!, stack.pop()!, stack.pop()!, stack.pop()!];
          stack.push(sC, sD, sA2, sB2);
          break;
        }

        case Opcode.OP_ROT: {
          if (stack.length < 3) throw new Error('OP_ROT: insufficient stack');
          const [rC, rB, rA] = [stack.pop()!, stack.pop()!, stack.pop()!];
          stack.push(rB, rC, rA);
          break;
        }

        case Opcode.OP_2ROT: {
          if (stack.length < 6) throw new Error('OP_2ROT: insufficient stack');
          const rot = stack.splice(stack.length - 6, 6);
          stack.push(...rot.slice(2), ...rot.slice(0, 2));
          break;
        }

        case Opcode.OP_NIP: {
          if (stack.length < 2) throw new Error('OP_NIP: insufficient stack');
          const nipTop = stack.pop()!;
          stack.pop();
          stack.push(nipTop);
          break;
        }

        case Opcode.OP_TUCK: {
          if (stack.length < 2) throw new Error('OP_TUCK: insufficient stack');
          const [tuckTop, tuckSec] = [stack.pop()!, stack.pop()!];
          stack.push(tuckTop, tuckSec, tuckTop.slice());
          break;
        }

        case Opcode.OP_IFDUP: {
          if (stack.length < 1) throw new Error('OP_IFDUP: empty stack');
          if (castBool(stack[stack.length - 1])) stack.push(stack[stack.length - 1].slice());
          break;
        }

        case Opcode.OP_DEPTH: {
          stack.push(numToBytes(stack.length));
          break;
        }

        case Opcode.OP_PICK: {
          if (stack.length < 2) throw new Error('OP_PICK: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          const pickN = decodeNumber(stack.pop()!);
          if (pickN < 0 || pickN >= stack.length) throw new Error('OP_PICK: invalid index');
          stack.push(stack[stack.length - 1 - pickN].slice());
          break;
        }

        case Opcode.OP_ROLL: {
          if (stack.length < 2) throw new Error('OP_ROLL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          const rollN = decodeNumber(stack.pop()!);
          if (rollN < 0 || rollN >= stack.length) throw new Error('OP_ROLL: invalid index');
          const rollItem = stack.splice(stack.length - 1 - rollN, 1)[0];
          stack.push(rollItem);
          break;
        }

        case Opcode.OP_SIZE: {
          if (stack.length < 1) throw new Error('OP_SIZE: empty stack');
          stack.push(numToBytes(stack[stack.length - 1].length));
          break;
        }

        case Opcode.OP_EQUAL: {
          if (stack.length < 2) throw new Error('OP_EQUAL: insufficient stack');
          const [eqB, eqA] = [stack.pop()!, stack.pop()!];
          stack.push(equalBytes(eqA, eqB) ? new Uint8Array([1]) : new Uint8Array(0));
          break;
        }

        case Opcode.OP_EQUALVERIFY: {
          if (stack.length < 2) throw new Error('OP_EQUALVERIFY: insufficient stack');
          const [evB, evA] = [stack.pop()!, stack.pop()!];
          if (!equalBytes(evA, evB)) throw new Error('OP_EQUALVERIFY failed');
          break;
        }

        // Rule #28: OP_CAT — overflow check gated on SCRIPT_VERIFY_EXEC
        case Opcode.OP_CAT: {
          if (stack.length < 2) throw new Error('OP_CAT: insufficient stack');
          const [catB, catA] = [stack.pop()!, stack.pop()!];
          const cat = concatBytes(catA, catB);
          if ((flags & SCRIPT_VERIFY_EXEC) && cat.length > MAX_SCRIPT_ELEMENT_SIZE) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_CAT result too large' };
          }
          stack.push(cat);
          break;
        }

        // Rule #26: OP_SUBSTR — C++ clamps instead of throwing on out-of-range
        case Opcode.OP_SUBSTR: {
          if (stack.length < 3) throw new Error('OP_SUBSTR: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const ssLen = decodeNumber(stack.pop()!);
          const ssBegin = decodeNumber(stack.pop()!);
          const ssStr = stack.pop()!;
          if (ssLen < 0 || ssBegin < 0) throw new Error('OP_SUBSTR: negative argument');
          let nBegin = ssBegin;
          let nEnd = ssBegin + ssLen;
          if (nBegin > ssStr.length) nBegin = ssStr.length;
          if (nEnd > ssStr.length) nEnd = ssStr.length;
          const subResult = ssStr.slice(nBegin, nEnd);
          if ((flags & SCRIPT_VERIFY_EXEC) && subResult.length > MAX_SCRIPT_ELEMENT_SIZE) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_SUBSTR result too large' };
          }
          stack.push(subResult);
          break;
        }

        // Rule #27: OP_LEFT — clamp correctly
        case Opcode.OP_LEFT: {
          if (stack.length < 2) throw new Error('OP_LEFT: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          const leftN = decodeNumber(stack.pop()!);
          const leftStr = stack.pop()!;
          if (leftN < 0) throw new Error('OP_LEFT: negative size');
          stack.push(leftStr.slice(0, Math.min(leftN, leftStr.length)));
          break;
        }

        // Rule #27: OP_RIGHT — clamp correctly
        case Opcode.OP_RIGHT: {
          if (stack.length < 2) throw new Error('OP_RIGHT: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          const rightN = decodeNumber(stack.pop()!);
          const rightStr = stack.pop()!;
          if (rightN < 0) throw new Error('OP_RIGHT: negative size');
          stack.push(rightStr.slice(Math.max(0, rightStr.length - rightN)));
          break;
        }

        case Opcode.OP_INVERT: {
          if (stack.length < 1) throw new Error('OP_INVERT: empty stack');
          const inv = stack.pop()!;
          stack.push(new Uint8Array(inv.map((b) => ~b & 0xff)));
          break;
        }

        // Rule #10: OP_AND/OP_OR/OP_XOR — use MakeSameSize (pad shorter with zeros)
        case Opcode.OP_AND: {
          if (stack.length < 2) throw new Error('OP_AND: insufficient stack');
          const [rawAndB, rawAndA] = [stack.pop()!, stack.pop()!];
          const [andA, andB] = makeSameSize(rawAndA, rawAndB);
          stack.push(new Uint8Array(andA.map((byte, i) => byte & andB[i])));
          break;
        }

        case Opcode.OP_OR: {
          if (stack.length < 2) throw new Error('OP_OR: insufficient stack');
          const [rawOrB, rawOrA] = [stack.pop()!, stack.pop()!];
          const [orA, orB] = makeSameSize(rawOrA, rawOrB);
          stack.push(new Uint8Array(orA.map((byte, i) => byte | orB[i])));
          break;
        }

        case Opcode.OP_XOR: {
          if (stack.length < 2) throw new Error('OP_XOR: insufficient stack');
          const [rawXorB, rawXorA] = [stack.pop()!, stack.pop()!];
          const [xorA, xorB] = makeSameSize(rawXorA, rawXorB);
          stack.push(new Uint8Array(xorA.map((byte, i) => byte ^ xorB[i])));
          break;
        }

        // Rule #13: Arithmetic result overflow check gated on SCRIPT_VERIFY_EXEC
        case Opcode.OP_1ADD: {
          if (stack.length < 1) throw new Error('OP_1ADD: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const r1add = numToBytes(decodeNumber(stack.pop()!) + 1);
          if (!checkArithmeticOverflow(r1add, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_1ADD: result overflow' };
          }
          stack.push(r1add);
          break;
        }

        case Opcode.OP_1SUB: {
          if (stack.length < 1) throw new Error('OP_1SUB: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const r1sub = numToBytes(decodeNumber(stack.pop()!) - 1);
          if (!checkArithmeticOverflow(r1sub, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_1SUB: result overflow' };
          }
          stack.push(r1sub);
          break;
        }

        case Opcode.OP_2MUL: {
          if (stack.length < 1) throw new Error('OP_2MUL: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const r2mul = numToBytes(decodeNumber(stack.pop()!) * 2);
          if (!checkArithmeticOverflow(r2mul, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_2MUL: result overflow' };
          }
          stack.push(r2mul);
          break;
        }

        case Opcode.OP_2DIV: {
          if (stack.length < 1) throw new Error('OP_2DIV: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const r2div = numToBytes(Math.trunc(decodeNumber(stack.pop()!) / 2));
          if (!checkArithmeticOverflow(r2div, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_2DIV: result overflow' };
          }
          stack.push(r2div);
          break;
        }

        case Opcode.OP_NEGATE: {
          if (stack.length < 1) throw new Error('OP_NEGATE: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const rneg = numToBytes(-decodeNumber(stack.pop()!));
          if (!checkArithmeticOverflow(rneg, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_NEGATE: result overflow' };
          }
          stack.push(rneg);
          break;
        }

        case Opcode.OP_ABS: {
          if (stack.length < 1) throw new Error('OP_ABS: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const rabs = numToBytes(Math.abs(decodeNumber(stack.pop()!)));
          if (!checkArithmeticOverflow(rabs, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_ABS: result overflow' };
          }
          stack.push(rabs);
          break;
        }

        case Opcode.OP_NOT: {
          if (stack.length < 1) throw new Error('OP_NOT: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const rnot = numToBytes(decodeNumber(stack.pop()!) === 0 ? 1 : 0);
          if (!checkArithmeticOverflow(rnot, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_NOT: result overflow' };
          }
          stack.push(rnot);
          break;
        }

        case Opcode.OP_0NOTEQUAL: {
          if (stack.length < 1) throw new Error('OP_0NOTEQUAL: empty stack');
          checkNumSize(stack[stack.length - 1], flags);
          const r0ne = numToBytes(decodeNumber(stack.pop()!) !== 0 ? 1 : 0);
          if (!checkArithmeticOverflow(r0ne, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_0NOTEQUAL: result overflow' };
          }
          stack.push(r0ne);
          break;
        }

        case Opcode.OP_ADD: {
          if (stack.length < 2) throw new Error('OP_ADD: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const addB = decodeNumber(stack.pop()!);
          const addA = decodeNumber(stack.pop()!);
          const radd = numToBytes(addA + addB);
          if (!checkArithmeticOverflow(radd, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_ADD: result overflow' };
          }
          stack.push(radd);
          break;
        }

        case Opcode.OP_SUB: {
          if (stack.length < 2) throw new Error('OP_SUB: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const subB = decodeNumber(stack.pop()!);
          const subA = decodeNumber(stack.pop()!);
          const rsub = numToBytes(subA - subB);
          if (!checkArithmeticOverflow(rsub, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_SUB: result overflow' };
          }
          stack.push(rsub);
          break;
        }

        case Opcode.OP_MUL: {
          if (stack.length < 2) throw new Error('OP_MUL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const mulB = decodeNumber(stack.pop()!);
          const mulA = decodeNumber(stack.pop()!);
          const rmul = numToBytes(mulA * mulB);
          if (!checkArithmeticOverflow(rmul, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_MUL: result overflow' };
          }
          stack.push(rmul);
          break;
        }

        case Opcode.OP_DIV: {
          if (stack.length < 2) throw new Error('OP_DIV: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const divB = decodeNumber(stack.pop()!);
          const divA = decodeNumber(stack.pop()!);
          if (divB === 0) throw new Error('OP_DIV: division by zero');
          const rdiv = numToBytes(Math.trunc(divA / divB));
          if (!checkArithmeticOverflow(rdiv, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_DIV: result overflow' };
          }
          stack.push(rdiv);
          break;
        }

        case Opcode.OP_MOD: {
          if (stack.length < 2) throw new Error('OP_MOD: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const modB = decodeNumber(stack.pop()!);
          const modA = decodeNumber(stack.pop()!);
          if (modB === 0) throw new Error('OP_MOD: division by zero');
          const rmod = numToBytes(modA % modB);
          if (!checkArithmeticOverflow(rmod, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_MOD: result overflow' };
          }
          stack.push(rmod);
          break;
        }

        // Rule #14: negative shift always fails; shift > 31 only fails under SCRIPT_VERIFY_EXEC
        case Opcode.OP_LSHIFT: {
          if (stack.length < 2) throw new Error('OP_LSHIFT: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const lshiftAmt = decodeNumber(stack.pop()!);
          const lshiftVal = decodeNumber(stack.pop()!);
          if (lshiftAmt < 0) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_LSHIFT: negative shift amount' };
          }
          if ((flags & SCRIPT_VERIFY_EXEC) && lshiftAmt > 31) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_LSHIFT: shift amount exceeds 31' };
          }
          const rlshift = numToBytes(lshiftVal << lshiftAmt);
          if (!checkArithmeticOverflow(rlshift, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_LSHIFT: result overflow' };
          }
          stack.push(rlshift);
          break;
        }

        case Opcode.OP_RSHIFT: {
          if (stack.length < 2) throw new Error('OP_RSHIFT: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const rshiftAmt = decodeNumber(stack.pop()!);
          const rshiftVal = decodeNumber(stack.pop()!);
          if (rshiftAmt < 0) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_RSHIFT: negative shift amount' };
          }
          if ((flags & SCRIPT_VERIFY_EXEC) && rshiftAmt > 31) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_RSHIFT: shift amount exceeds 31' };
          }
          const rrshift = numToBytes(rshiftVal >> rshiftAmt);
          if (!checkArithmeticOverflow(rrshift, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_RSHIFT: result overflow' };
          }
          stack.push(rrshift);
          break;
        }

        // Rule #11: OP_BOOLAND/OP_BOOLOR — use decodeNumber (via CastToBigNum),
        // with flag-dependent validation. A value is truthy if its numeric value != 0.
        case Opcode.OP_BOOLAND: {
          if (stack.length < 2) throw new Error('OP_BOOLAND: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const boolandBVal = decodeNumber(stack.pop()!);
          const boolandAVal = decodeNumber(stack.pop()!);
          const rbooland = numToBytes(boolandAVal !== 0 && boolandBVal !== 0 ? 1 : 0);
          if (!checkArithmeticOverflow(rbooland, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_BOOLAND: result overflow' };
          }
          stack.push(rbooland);
          break;
        }

        case Opcode.OP_BOOLOR: {
          if (stack.length < 2) throw new Error('OP_BOOLOR: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const boolorBVal = decodeNumber(stack.pop()!);
          const boolorAVal = decodeNumber(stack.pop()!);
          const rboolor = numToBytes(boolorAVal !== 0 || boolorBVal !== 0 ? 1 : 0);
          if (!checkArithmeticOverflow(rboolor, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_BOOLOR: result overflow' };
          }
          stack.push(rboolor);
          break;
        }

        case Opcode.OP_NUMEQUAL: {
          if (stack.length < 2) throw new Error('OP_NUMEQUAL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const numeqB = decodeNumber(stack.pop()!);
          const numeqA = decodeNumber(stack.pop()!);
          const rnumeq = numToBytes(numeqA === numeqB ? 1 : 0);
          if (!checkArithmeticOverflow(rnumeq, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_NUMEQUAL: result overflow' };
          }
          stack.push(rnumeq);
          break;
        }

        // Rule #12: OP_NUMEQUALVERIFY — push result first, then verify
        case Opcode.OP_NUMEQUALVERIFY: {
          if (stack.length < 2) throw new Error('OP_NUMEQUALVERIFY: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const numevB = decodeNumber(stack.pop()!);
          const numevA = decodeNumber(stack.pop()!);
          const rnumev = numToBytes(numevA === numevB ? 1 : 0);
          if (!checkArithmeticOverflow(rnumev, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_NUMEQUALVERIFY: result overflow' };
          }
          stack.push(rnumev);
          // Now verify: pop the result and fail if false
          if (!castBool(stack.pop()!)) throw new Error('OP_NUMEQUALVERIFY failed');
          break;
        }

        case Opcode.OP_NUMNOTEQUAL: {
          if (stack.length < 2) throw new Error('OP_NUMNOTEQUAL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const numneqB = decodeNumber(stack.pop()!);
          const numneqA = decodeNumber(stack.pop()!);
          const rnumneq = numToBytes(numneqA !== numneqB ? 1 : 0);
          if (!checkArithmeticOverflow(rnumneq, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_NUMNOTEQUAL: result overflow' };
          }
          stack.push(rnumneq);
          break;
        }

        case Opcode.OP_LESSTHAN: {
          if (stack.length < 2) throw new Error('OP_LESSTHAN: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const ltB = decodeNumber(stack.pop()!);
          const ltA = decodeNumber(stack.pop()!);
          const rlt = numToBytes(ltA < ltB ? 1 : 0);
          if (!checkArithmeticOverflow(rlt, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_LESSTHAN: result overflow' };
          }
          stack.push(rlt);
          break;
        }

        case Opcode.OP_GREATERTHAN: {
          if (stack.length < 2) throw new Error('OP_GREATERTHAN: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const gtB = decodeNumber(stack.pop()!);
          const gtA = decodeNumber(stack.pop()!);
          const rgt = numToBytes(gtA > gtB ? 1 : 0);
          if (!checkArithmeticOverflow(rgt, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_GREATERTHAN: result overflow' };
          }
          stack.push(rgt);
          break;
        }

        case Opcode.OP_LESSTHANOREQUAL: {
          if (stack.length < 2) throw new Error('OP_LESSTHANOREQUAL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const lteB = decodeNumber(stack.pop()!);
          const lteA = decodeNumber(stack.pop()!);
          const rlte = numToBytes(lteA <= lteB ? 1 : 0);
          if (!checkArithmeticOverflow(rlte, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_LESSTHANOREQUAL: result overflow' };
          }
          stack.push(rlte);
          break;
        }

        case Opcode.OP_GREATERTHANOREQUAL: {
          if (stack.length < 2) throw new Error('OP_GREATERTHANOREQUAL: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const gteB = decodeNumber(stack.pop()!);
          const gteA = decodeNumber(stack.pop()!);
          const rgte = numToBytes(gteA >= gteB ? 1 : 0);
          if (!checkArithmeticOverflow(rgte, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_GREATERTHANOREQUAL: result overflow' };
          }
          stack.push(rgte);
          break;
        }

        case Opcode.OP_MIN: {
          if (stack.length < 2) throw new Error('OP_MIN: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const minB = decodeNumber(stack.pop()!);
          const minA = decodeNumber(stack.pop()!);
          const rmin = numToBytes(Math.min(minA, minB));
          if (!checkArithmeticOverflow(rmin, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_MIN: result overflow' };
          }
          stack.push(rmin);
          break;
        }

        case Opcode.OP_MAX: {
          if (stack.length < 2) throw new Error('OP_MAX: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          const maxB = decodeNumber(stack.pop()!);
          const maxA = decodeNumber(stack.pop()!);
          const rmax = numToBytes(Math.max(maxA, maxB));
          if (!checkArithmeticOverflow(rmax, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_MAX: result overflow' };
          }
          stack.push(rmax);
          break;
        }

        // Rule #25: OP_WITHIN — C++ pops: stacktop(-1)=max, stacktop(-2)=min, stacktop(-3)=value
        case Opcode.OP_WITHIN: {
          if (stack.length < 3) throw new Error('OP_WITHIN: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          checkNumSize(stack[stack.length - 2], flags);
          checkNumSize(stack[stack.length - 3], flags);
          const withinMax = decodeNumber(stack.pop()!);
          const withinMin = decodeNumber(stack.pop()!);
          const withinX = decodeNumber(stack.pop()!);
          const rwithin = numToBytes(withinX >= withinMin && withinX < withinMax ? 1 : 0);
          if (!checkArithmeticOverflow(rwithin, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'OP_WITHIN: result overflow' };
          }
          stack.push(rwithin);
          break;
        }

        case Opcode.OP_RIPEMD160: {
          if (stack.length < 1) throw new Error('OP_RIPEMD160: empty stack');
          stack.push(ripemd160Single(stack.pop()!));
          break;
        }

        case Opcode.OP_SHA1: {
          if (stack.length < 1) throw new Error('OP_SHA1: empty stack');
          stack.push(sha1Single(stack.pop()!));
          break;
        }

        case Opcode.OP_SHA256: {
          if (stack.length < 1) throw new Error('OP_SHA256: empty stack');
          stack.push(sha256Single(stack.pop()!));
          break;
        }

        case Opcode.OP_HASH160: {
          if (stack.length < 1) throw new Error('OP_HASH160: empty stack');
          stack.push(hash160(stack.pop()!));
          break;
        }

        case Opcode.OP_HASH256: {
          if (stack.length < 1) throw new Error('OP_HASH256: empty stack');
          stack.push(hash256(stack.pop()!));
          break;
        }

        // Rule #20: OP_CODESEPARATOR sets lastCodeSepEndOffset to offset AFTER the codesep byte
        case Opcode.OP_CODESEPARATOR: {
          lastCodeSepEndOffset = token.endOffset!;
          break;
        }

        // Rule #15, #17, #21: OP_CHECKSIG
        case Opcode.OP_CHECKSIG:
        case Opcode.OP_CHECKSIGVERIFY: {
          if (stack.length < 2) throw new Error('OP_CHECKSIG: insufficient stack');
          // Rule #21: pubKey is on top, sig is below (stacktop(-1)=pubKey, stacktop(-2)=sig)
          const csPubKey = stack.pop()!;
          const csSigRaw = stack.pop()!;

          // Rule #17: checkSignatureEncoding BEFORE computing hash
          if (!checkSignatureEncoding(csSigRaw, flags)) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Invalid signature encoding' };
          }

          let csResult = false;

          if (context.tx && context.inputIndex !== undefined && csPubKey.length === 65 && csPubKey[0] === 0x04) {
            // Rule #15: scriptCode is script.slice(lastCodeSepEndOffset)
            // then findAndDelete(sig), then stripCodeSeparators
            let scriptCodeForSig: Uint8Array = new Uint8Array(script.buffer, script.byteOffset + lastCodeSepEndOffset, script.length - lastCodeSepEndOffset);
            // Apply findAndDelete for this signature (raw data, not encoded)
            scriptCodeForSig = findAndDelete(new Uint8Array(scriptCodeForSig), csSigRaw);
            const cleaned = stripCodeSeparators(scriptCodeForSig);

            if (csSigRaw.length > 0) {
              const csParsed = parseSigHashType(csSigRaw);
              if (csParsed && csParsed.sig.length > 0) {
                const preimage = serializeForSigning(
                  context.tx,
                  context.inputIndex,
                  cleaned,
                  csParsed.hashType
                );
                const sigHash = hash256(preimage);
                try {
                  csResult = verifyHash(sigHash, csParsed.sig, csPubKey);
                } catch {
                  csResult = false;
                }
              }
            }
          }

          stack.push(csResult ? new Uint8Array([1]) : new Uint8Array(0));
          if (op === Opcode.OP_CHECKSIGVERIFY) {
            if (!castBool(stack.pop()!)) throw new Error('OP_CHECKSIGVERIFY failed');
          }
          break;
        }

        // Rule #16, #17: OP_CHECKMULTISIG
        case Opcode.OP_CHECKMULTISIG:
        case Opcode.OP_CHECKMULTISIGVERIFY: {
          if (stack.length < 1) throw new Error('OP_CHECKMULTISIG: insufficient stack');
          checkNumSize(stack[stack.length - 1], flags);
          const msN = decodeNumber(stack.pop()!);
          if (msN < 0 || msN > MAX_PUBKEYS_PER_MULTISIG) {
            throw new Error(`OP_CHECKMULTISIG: invalid n (${msN})`);
          }
          // Rule #6: pubkeys count toward opcount
          nOpCount += msN;
          if ((flags & SCRIPT_VERIFY_EXEC) && nOpCount > MAX_OPS_PER_SCRIPT) {
            return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Too many opcodes' };
          }
          if (stack.length < msN) throw new Error('OP_CHECKMULTISIG: not enough pubkeys on stack');
          const msPubKeys: Uint8Array[] = [];
          for (let pk = 0; pk < msN; pk++) msPubKeys.push(stack.pop()!);
          msPubKeys.reverse();

          if (stack.length < 1) throw new Error('OP_CHECKMULTISIG: missing m');
          checkNumSize(stack[stack.length - 1], flags);
          const msM = decodeNumber(stack.pop()!);
          if (msM < 0 || msM > msN) throw new Error(`OP_CHECKMULTISIG: invalid m (${msM})`);
          if (stack.length < msM) throw new Error('OP_CHECKMULTISIG: not enough signatures on stack');
          const msSigs: Uint8Array[] = [];
          for (let s = 0; s < msM; s++) msSigs.push(stack.pop()!);
          msSigs.reverse();

          if (stack.length < 1) throw new Error('OP_CHECKMULTISIG: missing dummy element');
          const msDummy = stack.pop()!;
          if ((flags & SCRIPT_VERIFY_EXEC) && msDummy.length !== 0) {
            throw new Error('OP_CHECKMULTISIG: dummy element must be empty (NULLDUMMY)');
          }

          // Rule #16: build scriptCode, then findAndDelete ALL signatures BEFORE any verification
          let msScriptCode: Uint8Array = new Uint8Array(script.slice(lastCodeSepEndOffset));
          for (const sigRaw of msSigs) {
            msScriptCode = findAndDelete(msScriptCode, sigRaw);
          }
          const msCleaned = stripCodeSeparators(msScriptCode);

          // Rule #17: check encoding for all sigs
          for (const sigRaw of msSigs) {
            if (!checkSignatureEncoding(sigRaw, flags)) {
              return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Invalid signature encoding in multisig' };
            }
          }

          let msOk = true;
          let pkIdx = 0;
          for (let si = 0; si < msSigs.length && msOk; si++) {
            const sigRaw = msSigs[si];
            if (sigRaw.length === 0) { msOk = false; break; }

            let sigVerified = false;
            while (pkIdx < msPubKeys.length && !sigVerified) {
              const parsed = parseSigHashType(sigRaw);
              if (!parsed || parsed.sig.length === 0) { pkIdx++; continue; }

              if (context.tx && context.inputIndex !== undefined) {
                try {
                  const preimage = serializeForSigning(
                    context.tx,
                    context.inputIndex,
                    msCleaned,
                    parsed.hashType
                  );
                  const sigHash = hash256(preimage);
                  sigVerified = verifyHash(sigHash, parsed.sig, msPubKeys[pkIdx]);
                } catch { sigVerified = false; }
              }
              pkIdx++;
            }
            if (!sigVerified) msOk = false;
          }

          stack.push(msOk ? new Uint8Array([1]) : new Uint8Array(0));
          if (op === Opcode.OP_CHECKMULTISIGVERIFY) {
            if (!castBool(stack.pop()!)) throw new Error('OP_CHECKMULTISIGVERIFY failed');
          }
          break;
        }

        // Rule #22: DEFAULT case returns false (unknown opcode causes script failure)
        default:
          return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: `Unknown opcode: 0x${op.toString(16).padStart(2, '0')}` };
      }

      // Rule #4: stack size check at END of each token iteration
      if ((flags & SCRIPT_VERIFY_EXEC) && stack.length + altStack.length > MAX_STACK_SIZE) {
        return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Stack too large after opcode' };
      }
    }

    // Rule #23: if execStack is not empty, unmatched OP_IF
    if (execStack.length > 0) {
      return { success: false, finalStack: stack.map((v) => bytesToHex(v)), error: 'Unmatched OP_IF' };
    }

    const finalStack = stack.map((v) => bytesToHex(v));

    if (stack.length === 0) {
      return { success: false, finalStack, error: 'Empty stack' };
    }

    const success = castBool(stack[stack.length - 1]);
    return { success, finalStack };
  } catch (err) {
    return {
      success: false,
      finalStack: stack.map((v) => bytesToHex(v)),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --------------------------------------------------------------------------
// verifyScript: runs scriptSig then scriptPubKey, checking IsPushOnly on sig
// --------------------------------------------------------------------------
export function verifyScript(
  scriptSig: Uint8Array,
  scriptPubKey: Uint8Array,
  flags: number = SCRIPT_VERIFY_EXEC,
  context: CheckSigContext = {}
): ScriptValidationResult {
  // Rule #18: IsPushOnly check on scriptSig when SCRIPT_VERIFY_EXEC
  if ((flags & SCRIPT_VERIFY_EXEC) && !isPushOnly(scriptSig)) {
    return { success: false, finalStack: [], error: 'scriptSig is not push-only' };
  }

  const stack: Stack = [];

  // Run scriptSig (no scriptCode override needed here; context is for scriptPubKey verification)
  const sigResult = evalScript(scriptSig, stack, flags, context);
  if (!sigResult.success) {
    return sigResult;
  }

  // Run scriptPubKey with the stack populated by scriptSig
  // The scriptCode for CHECKSIG is the scriptPubKey itself (not scriptSig)
  const sigContext: CheckSigContext = { ...context };
  // Do NOT override scriptCode here; evalScript uses script.slice(lastCodeSepEndOffset)
  // which for scriptPubKey with no prior codeseparator is the full scriptPubKey
  return evalScript(scriptPubKey, stack, flags, sigContext);
}
