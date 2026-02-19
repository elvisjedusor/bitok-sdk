export const COIN = 100_000_000n;
export const CENT = 1_000_000n;
export const MAX_MONEY = 21_000_000n * COIN;
export const DUST_THRESHOLD = CENT;

export const MAX_BLOCK_SIZE = 1_000_000;
export const MAX_INV_SZ = 50_000;

export const COINBASE_MATURITY = 100;

export const SCRIPT_EXEC_ACTIVATION_HEIGHT = 18_000;
export const TIMEWARP_ACTIVATION_HEIGHT = 16_000;

export const DEFAULT_BLOCK_PRIORITY_SIZE = 27_000;
export const FREE_PRIORITY_THRESHOLD = 57_600_000n;

export const MIN_FEE_PER_KB = CENT;

export const DEFAULT_PORT = 18333;
export const RPC_PORT = 8332;
export const PROTOCOL_VERSION = 319;

export const NETWORK_MAGIC = new Uint8Array([0xb4, 0x0b, 0xc0, 0xde]);

export const MAX_SCRIPT_SIZE = 10_000;
export const MAX_STACK_SIZE = 1_000;
export const MAX_SCRIPT_ELEMENT_SIZE = 520;
export const MAX_OPS_PER_SCRIPT = 201;
export const MAX_PUBKEYS_PER_MULTISIG = 20;
export const MAX_SIGOPS_PER_BLOCK = 20_000;
export const MAX_BIGNUM_SIZE = 4;

export const GENESIS_HASH = '0290400ea28d3fe79d102ca6b7cd11cee5eba9f17f2046c303d92f65d6ed2617';
export const GENESIS_TIME = 1231006505;
export const GENESIS_NBITS = 0x1effffff;
export const GENESIS_NONCE = 37137;
export const GENESIS_VERSION = 1;

export const POW_LIMIT_COMPACT = 0x1e7fffff;
export const POW_LIMIT_HEX = '00007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

export const YESPOWER_N = 2048;
export const YESPOWER_R = 32;
export const YESPOWER_PERS = 'BitokPoW';
export const YESPOWER_PERSLEN = 8;

export const RETARGET_TIMESPAN = 14 * 24 * 60 * 60;
export const TARGET_SPACING = 10 * 60;
export const RETARGET_INTERVAL = 2016;
export const TIMEWARP_MAX_DRIFT = 7200;
export const MIN_RETARGET_TIMESPAN = Math.floor((14 * 24 * 60 * 60) / 4);
export const MAX_RETARGET_TIMESPAN = (14 * 24 * 60 * 60) * 4;

export const POW_HASHRATE_SHIFT = 17;

export const SIGHASH_ALL = 0x01;
export const SIGHASH_NONE = 0x02;
export const SIGHASH_SINGLE = 0x03;
export const SIGHASH_ANYONECANPAY = 0x80;

export const SCRIPT_VERIFY_NONE = 0x00;
export const SCRIPT_VERIFY_EXEC = 0x01;

export const SEQUENCE_FINAL = 0xffffffff;

export const ADDRESS_VERSION_MAINNET = 0x00;

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const WIF_VERSION = 0x80;
