import { ScriptAnalysis } from '../types/script';
import { Opcode } from '../types/script';
import {
  MAX_SCRIPT_SIZE,
  MAX_OPS_PER_SCRIPT,
  MAX_SCRIPT_ELEMENT_SIZE,
  MAX_PUBKEYS_PER_MULTISIG,
} from '../types/constants';
import { parseScript } from './encode';
import { opcodeToName } from './opcodes';
import { classifyScript, isPushOnly, countSigOps } from './decoder';
import { bytesToHex } from '../utils/bytes';

export function analyzeScript(script: Uint8Array): ScriptAnalysis {
  const hex = bytesToHex(script);
  const tokens = parseScript(script);
  const type = classifyScript(script);
  const warnings: string[] = [];

  const asmParts: string[] = tokens.map((t) => {
    if (t.type === 'data') {
      return t.data!.length === 0 ? 'OP_0' : bytesToHex(t.data!);
    }
    if (t.type === 'number') {
      if (t.opcode === Opcode.OP_1NEGATE) return 'OP_1NEGATE';
      return `OP_${t.value}`;
    }
    return opcodeToName(t.opcode!);
  });

  let opcodeCount = 0;
  let pushDataCount = 0;
  let usesArithmetic = false;
  let usesBitwise = false;
  let usesSplice = false;
  let usesHashlock = false;
  let maxElementSeen = 0;

  for (const t of tokens) {
    if (t.type === 'data' || t.type === 'number') {
      pushDataCount++;
      const size = t.data?.length ?? 0;
      if (size > maxElementSeen) maxElementSeen = size;
    } else {
      const op = t.opcode!;

      if (op > Opcode.OP_16) opcodeCount++;

      if (
        op === Opcode.OP_ADD || op === Opcode.OP_SUB ||
        op === Opcode.OP_MUL || op === Opcode.OP_DIV || op === Opcode.OP_MOD ||
        op === Opcode.OP_LSHIFT || op === Opcode.OP_RSHIFT ||
        op === Opcode.OP_2MUL || op === Opcode.OP_2DIV ||
        op === Opcode.OP_1ADD || op === Opcode.OP_1SUB
      ) usesArithmetic = true;
      if (op >= Opcode.OP_INVERT && op <= Opcode.OP_XOR) usesBitwise = true;
      if (op >= Opcode.OP_CAT && op <= Opcode.OP_SIZE) usesSplice = true;
      if (
        op === Opcode.OP_HASH160 ||
        op === Opcode.OP_SHA256 ||
        op === Opcode.OP_HASH256 ||
        op === Opcode.OP_RIPEMD160
      ) {
        usesHashlock = true;
      }
    }
  }

  if (script.length > MAX_SCRIPT_SIZE) {
    warnings.push(`Script exceeds MAX_SCRIPT_SIZE (${script.length} > ${MAX_SCRIPT_SIZE})`);
  }
  if (opcodeCount > MAX_OPS_PER_SCRIPT) {
    warnings.push(`Too many opcodes (${opcodeCount} > ${MAX_OPS_PER_SCRIPT})`);
  }
  if (maxElementSeen > MAX_SCRIPT_ELEMENT_SIZE) {
    warnings.push(`Push data exceeds MAX_SCRIPT_ELEMENT_SIZE (${maxElementSeen} > ${MAX_SCRIPT_ELEMENT_SIZE})`);
  }

  const sigopCount = countSigOps(script);
  const exceedsLimits = warnings.length > 0;

  const standardTypes = [
    'pubkey', 'pubkeyhash', 'multisig', 'nulldata',
    'hashlock', 'hashlock-sha256',
    'arithmetic', 'bitwise', 'bitwise-sig',
    'cat-covenant', 'cat-hash', 'cat-script',
    'splice',
  ];
  const isStandard = standardTypes.includes(type);

  return {
    asm: asmParts.join(' '),
    hex,
    type,
    opcodeCount,
    byteSize: script.length,
    sigopCount,
    pushDataCount,
    usesArithmetic,
    usesBitwise,
    usesSplice,
    usesHashlock,
    exceedsLimits,
    limitWarnings: warnings,
    isPushOnly: isPushOnly(script),
    isStandard,
  };
}
