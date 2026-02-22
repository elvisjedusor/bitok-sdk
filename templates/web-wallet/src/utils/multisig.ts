import {
  hexToBytes,
  parseScript,
  classifyScript,
  verifyHash,
} from 'bitok';

export function extractPublicKeysFromMultisigScript(scriptHex: string): Uint8Array[] {
  try {
    const bytes = hexToBytes(scriptHex);
    if (classifyScript(bytes) !== 'multisig') {
      throw new Error('Script is not a multisig script');
    }

    const tokens = parseScript(bytes);
    const pubkeys: Uint8Array[] = [];

    for (let i = 1; i < tokens.length - 2; i++) {
      const tok = tokens[i];
      if (tok.data && tok.data.length === 65) {
        pubkeys.push(tok.data);
      }
    }

    return pubkeys;
  } catch (err) {
    throw new Error(`Failed to extract public keys: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

export function orderSignaturesForMultisig(
  signaturesWithType: Uint8Array[],
  publicKeys: Uint8Array[],
  sigHash: Uint8Array
): Uint8Array[] {
  const orderedSignatures: Uint8Array[] = [];
  const usedSigIndices = new Set<number>();

  for (const pubKey of publicKeys) {
    let matchedSigIndex = -1;

    for (let i = 0; i < signaturesWithType.length; i++) {
      if (usedSigIndices.has(i)) continue;

      const sigWithType = signaturesWithType[i];
      const signature = sigWithType.slice(0, sigWithType.length - 1);

      try {
        const isValid = verifyHash(sigHash, signature, pubKey);
        if (isValid) {
          matchedSigIndex = i;
          break;
        }
      } catch {
        continue;
      }
    }

    if (matchedSigIndex !== -1) {
      orderedSignatures.push(signaturesWithType[matchedSigIndex]);
      usedSigIndices.add(matchedSigIndex);
    }
  }

  return orderedSignatures;
}
