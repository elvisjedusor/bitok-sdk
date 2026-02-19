import { Opcode } from '../types/script';

export const OPCODE_NAMES: Record<number, string> = {
  [Opcode.OP_0]: '0',
  [Opcode.OP_PUSHDATA1]: 'OP_PUSHDATA1',
  [Opcode.OP_PUSHDATA2]: 'OP_PUSHDATA2',
  [Opcode.OP_PUSHDATA4]: 'OP_PUSHDATA4',
  [Opcode.OP_1NEGATE]: '-1',
  [Opcode.OP_RESERVED]: 'OP_RESERVED',
  [Opcode.OP_1]: '1',
  [Opcode.OP_2]: '2',
  [Opcode.OP_3]: '3',
  [Opcode.OP_4]: '4',
  [Opcode.OP_5]: '5',
  [Opcode.OP_6]: '6',
  [Opcode.OP_7]: '7',
  [Opcode.OP_8]: '8',
  [Opcode.OP_9]: '9',
  [Opcode.OP_10]: '10',
  [Opcode.OP_11]: '11',
  [Opcode.OP_12]: '12',
  [Opcode.OP_13]: '13',
  [Opcode.OP_14]: '14',
  [Opcode.OP_15]: '15',
  [Opcode.OP_16]: '16',
  [Opcode.OP_NOP]: 'OP_NOP',
  [Opcode.OP_VER]: 'OP_VER',
  [Opcode.OP_IF]: 'OP_IF',
  [Opcode.OP_NOTIF]: 'OP_NOTIF',
  [Opcode.OP_VERIF]: 'OP_VERIF',
  [Opcode.OP_VERNOTIF]: 'OP_VERNOTIF',
  [Opcode.OP_ELSE]: 'OP_ELSE',
  [Opcode.OP_ENDIF]: 'OP_ENDIF',
  [Opcode.OP_VERIFY]: 'OP_VERIFY',
  [Opcode.OP_RETURN]: 'OP_RETURN',
  [Opcode.OP_TOALTSTACK]: 'OP_TOALTSTACK',
  [Opcode.OP_FROMALTSTACK]: 'OP_FROMALTSTACK',
  [Opcode.OP_2DROP]: 'OP_2DROP',
  [Opcode.OP_2DUP]: 'OP_2DUP',
  [Opcode.OP_3DUP]: 'OP_3DUP',
  [Opcode.OP_2OVER]: 'OP_2OVER',
  [Opcode.OP_2ROT]: 'OP_2ROT',
  [Opcode.OP_2SWAP]: 'OP_2SWAP',
  [Opcode.OP_IFDUP]: 'OP_IFDUP',
  [Opcode.OP_DEPTH]: 'OP_DEPTH',
  [Opcode.OP_DROP]: 'OP_DROP',
  [Opcode.OP_DUP]: 'OP_DUP',
  [Opcode.OP_NIP]: 'OP_NIP',
  [Opcode.OP_OVER]: 'OP_OVER',
  [Opcode.OP_PICK]: 'OP_PICK',
  [Opcode.OP_ROLL]: 'OP_ROLL',
  [Opcode.OP_ROT]: 'OP_ROT',
  [Opcode.OP_SWAP]: 'OP_SWAP',
  [Opcode.OP_TUCK]: 'OP_TUCK',
  [Opcode.OP_CAT]: 'OP_CAT',
  [Opcode.OP_SUBSTR]: 'OP_SUBSTR',
  [Opcode.OP_LEFT]: 'OP_LEFT',
  [Opcode.OP_RIGHT]: 'OP_RIGHT',
  [Opcode.OP_SIZE]: 'OP_SIZE',
  [Opcode.OP_INVERT]: 'OP_INVERT',
  [Opcode.OP_AND]: 'OP_AND',
  [Opcode.OP_OR]: 'OP_OR',
  [Opcode.OP_XOR]: 'OP_XOR',
  [Opcode.OP_EQUAL]: 'OP_EQUAL',
  [Opcode.OP_EQUALVERIFY]: 'OP_EQUALVERIFY',
  [Opcode.OP_RESERVED1]: 'OP_RESERVED1',
  [Opcode.OP_RESERVED2]: 'OP_RESERVED2',
  [Opcode.OP_1ADD]: 'OP_1ADD',
  [Opcode.OP_1SUB]: 'OP_1SUB',
  [Opcode.OP_2MUL]: 'OP_2MUL',
  [Opcode.OP_2DIV]: 'OP_2DIV',
  [Opcode.OP_NEGATE]: 'OP_NEGATE',
  [Opcode.OP_ABS]: 'OP_ABS',
  [Opcode.OP_NOT]: 'OP_NOT',
  [Opcode.OP_0NOTEQUAL]: 'OP_0NOTEQUAL',
  [Opcode.OP_ADD]: 'OP_ADD',
  [Opcode.OP_SUB]: 'OP_SUB',
  [Opcode.OP_MUL]: 'OP_MUL',
  [Opcode.OP_DIV]: 'OP_DIV',
  [Opcode.OP_MOD]: 'OP_MOD',
  [Opcode.OP_LSHIFT]: 'OP_LSHIFT',
  [Opcode.OP_RSHIFT]: 'OP_RSHIFT',
  [Opcode.OP_BOOLAND]: 'OP_BOOLAND',
  [Opcode.OP_BOOLOR]: 'OP_BOOLOR',
  [Opcode.OP_NUMEQUAL]: 'OP_NUMEQUAL',
  [Opcode.OP_NUMEQUALVERIFY]: 'OP_NUMEQUALVERIFY',
  [Opcode.OP_NUMNOTEQUAL]: 'OP_NUMNOTEQUAL',
  [Opcode.OP_LESSTHAN]: 'OP_LESSTHAN',
  [Opcode.OP_GREATERTHAN]: 'OP_GREATERTHAN',
  [Opcode.OP_LESSTHANOREQUAL]: 'OP_LESSTHANOREQUAL',
  [Opcode.OP_GREATERTHANOREQUAL]: 'OP_GREATERTHANOREQUAL',
  [Opcode.OP_MIN]: 'OP_MIN',
  [Opcode.OP_MAX]: 'OP_MAX',
  [Opcode.OP_WITHIN]: 'OP_WITHIN',
  [Opcode.OP_RIPEMD160]: 'OP_RIPEMD160',
  [Opcode.OP_SHA1]: 'OP_SHA1',
  [Opcode.OP_SHA256]: 'OP_SHA256',
  [Opcode.OP_HASH160]: 'OP_HASH160',
  [Opcode.OP_HASH256]: 'OP_HASH256',
  [Opcode.OP_CODESEPARATOR]: 'OP_CODESEPARATOR',
  [Opcode.OP_CHECKSIG]: 'OP_CHECKSIG',
  [Opcode.OP_CHECKSIGVERIFY]: 'OP_CHECKSIGVERIFY',
  [Opcode.OP_CHECKMULTISIG]: 'OP_CHECKMULTISIG',
  [Opcode.OP_CHECKMULTISIGVERIFY]: 'OP_CHECKMULTISIGVERIFY',
  [Opcode.OP_SINGLEBYTE_END]: 'OP_SINGLEBYTE_END',
  [Opcode.OP_DOUBLEBYTE_BEGIN]: 'OP_DOUBLEBYTE_BEGIN',
  [Opcode.OP_PUBKEY]: 'OP_PUBKEY',
  [Opcode.OP_PUBKEYHASH]: 'OP_PUBKEYHASH',
  [Opcode.OP_HASHDATA]: 'OP_HASHDATA',
  [Opcode.OP_INVALIDOPCODE]: 'OP_INVALIDOPCODE',
};

export const OPCODE_BY_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(OPCODE_NAMES).map(([k, v]) => [v, Number(k)])
);

export function opcodeToName(op: number): string {
  return OPCODE_NAMES[op] ?? `OP_UNKNOWN(0x${op.toString(16).padStart(2, '0')})`;
}

export function nameToOpcode(name: string): number {
  const op = OPCODE_BY_NAME[name.toUpperCase()];
  if (op === undefined) throw new Error(`Unknown opcode name: ${name}`);
  return op;
}

export function isDisabledOpcode(op: number): boolean {
  return (
    op === Opcode.OP_VERIF ||
    op === Opcode.OP_VERNOTIF
  );
}

export function isPushOpcode(op: number): boolean {
  return (op <= 0x4e) || op === Opcode.OP_1NEGATE || (op >= Opcode.OP_1 && op <= Opcode.OP_16);
}

export function isCountedOpcode(op: number): boolean {
  return op > Opcode.OP_16;
}
