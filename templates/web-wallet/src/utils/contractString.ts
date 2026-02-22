const VERSION = 2;
const MAGIC = 'BTOK';

interface ConfirmationPayload {
  scriptHex: string;
  fundingTxid?: string;
  fundingVout?: number;
  fundedAmount?: string;
  unsignedTxHex?: string;
  destination?: string;
  fee?: string;
  signatures?: string[];
}

interface CompactPayload {
  s: string;
  ft?: string;
  fv?: number;
  fa?: string;
  ut?: string;
  d?: string;
  f?: string;
  sg?: string[];
}

function toCompact(p: ConfirmationPayload): CompactPayload {
  const c: CompactPayload = { s: p.scriptHex };
  if (p.fundingTxid) c.ft = p.fundingTxid;
  if (p.fundingVout !== undefined) c.fv = p.fundingVout;
  if (p.fundedAmount) c.fa = p.fundedAmount;
  if (p.unsignedTxHex) c.ut = p.unsignedTxHex;
  if (p.destination) c.d = p.destination;
  if (p.fee) c.f = p.fee;
  if (p.signatures?.length) c.sg = p.signatures;
  return c;
}

function fromCompact(c: CompactPayload): ConfirmationPayload {
  return {
    scriptHex: c.s,
    fundingTxid: c.ft,
    fundingVout: c.fv,
    fundedAmount: c.fa,
    unsignedTxHex: c.ut,
    destination: c.d,
    fee: c.f,
    signatures: c.sg,
  };
}

interface LegacyPayload {
  type: string;
  m: number;
  n: number;
  pubkeys: string[];
  scriptHex: string;
  fundingTxid?: string;
  fundingVout?: number;
  fundedAmount?: string;
  unsignedTxHex?: string;
  destination?: string;
  fee?: string;
  signatures?: string[];
}

export function encodeConfirmation(payload: ConfirmationPayload): string {
  const compact = toCompact(payload);
  const json = JSON.stringify(compact);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `${MAGIC}${VERSION}:${encoded}`;
}

export function decodeConfirmation(str: string): ConfirmationPayload | null {
  try {
    const trimmed = str.trim();
    if (!trimmed.startsWith(MAGIC)) return null;
    const rest = trimmed.slice(MAGIC.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return null;
    const version = parseInt(rest.slice(0, colonIdx));
    const b64 = rest.slice(colonIdx + 1);
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);

    if (version === 1) {
      const legacy = parsed as LegacyPayload;
      if (!legacy.scriptHex) return null;
      return {
        scriptHex: legacy.scriptHex,
        fundingTxid: legacy.fundingTxid,
        fundingVout: legacy.fundingVout,
        fundedAmount: legacy.fundedAmount,
        unsignedTxHex: legacy.unsignedTxHex,
        destination: legacy.destination,
        fee: legacy.fee,
        signatures: legacy.signatures,
      };
    }

    if (version === 2) {
      const compact = parsed as CompactPayload;
      if (!compact.s) return null;
      return fromCompact(compact);
    }

    return null;
  } catch {
    return null;
  }
}

export function isConfirmationString(str: string): boolean {
  return str.trim().startsWith(MAGIC);
}

export type { ConfirmationPayload };
