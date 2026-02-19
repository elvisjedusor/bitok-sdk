# bitok-sdk

Official TypeScript SDK for the **Bitok** cryptocurrency. Build, sign, and broadcast transactions; construct scripts and smart contracts; mine blocks; and query the full node RPC — all from a single zero-dependency-on-the-runtime library.

```
npm install bitok
```

Requires Node.js >= 18.

---

## Node requirements

The SDK communicates with a Bitok full node over JSON-RPC. The node **must** be started with the indexer and CORS flags enabled, otherwise address balance lookups, UTXO queries, and transaction history will not work.

### Recommended `bitok.conf`

Place this file in your data directory (`~/.bitokd/bitok.conf` on Linux, `%APPDATA%\Bitok\bitok.conf` on Windows, `~/Library/Application Support/Bitok/bitok.conf` on macOS):

```ini
# Run as RPC server
server=1

# RPC credentials — change these
rpcuser=myuser
rpcpassword=mypassword

# RPC port (default 8332)
rpcport=8332

# Allow connections from localhost only (safest)
rpcbind=127.0.0.1
rpcallowip=127.0.0.1

# To allow connections from your local network, add lines like:
# rpcallowip=192.168.1.0/24

# Enable address indexer (required for balance/UTXO/history queries)
indexer=1

# Enable CORS headers (required for browser/web wallet access)
cors=1

# Restrict CORS to your web wallet origin (optional but recommended)
# corsorigin=http://localhost:5173
```

Then start the daemon:

```
bitokoind -daemon
```

Or pass the flags directly without a config file:

```
bitokoind -daemon -server -rpcuser=myuser -rpcpassword=mypassword -indexer -cors
```

**`indexer=1`** enables the address indexer — required for `getAddressBalance`, `getAddressUtxos`, `getAddressTxids`, and `Wallet.getBalance()` / `Wallet.getUTXOs()`.

**`cors=1`** adds `Access-Control-Allow-Origin` headers to RPC responses — required when calling the node from a browser or web wallet.

---

## Table of contents

- [Quick start](#quick-start)
- [Modules](#modules)
  - [Wallet](#wallet)
  - [RPC client](#rpc-client)
  - [Transactions](#transactions)
  - [Scripts](#scripts)
  - [Contracts](#contracts)
  - [Mining](#mining)
  - [Crypto primitives](#crypto-primitives)
  - [Utilities](#utilities)
  - [Constants](#constants)
- [What makes Bitok different](#what-makes-bitok-different)
- [Error handling](#error-handling)

---

## Quick start

```ts
import { Wallet } from 'bitok/wallet';
import { BitokRpc } from 'bitok/rpc';

const rpc = new BitokRpc({ host: '127.0.0.1', port: 8332, user: 'rpc', pass: 'rpc' });

// Generate a fresh wallet
const wallet = Wallet.generate();
console.log(wallet.address);       // Base58Check address
console.log(wallet.privateKeyWIF); // WIF private key — back this up!

// Send 1.5 BITOK (pass amount as satoshis bigint: 1 BITOK = 100_000_000 satoshis)
const txid = await wallet.send(rpc, 'BReceiverAddressHere', 150_000_000n);
console.log('sent:', txid);
```

---

## Modules

### Wallet

`import { Wallet, generateKeyPair, importFromWIF, validateAddress } from 'bitok/wallet'`

#### `Wallet` class

| Member | Description |
|---|---|
| `Wallet.generate()` | Creates a wallet with a fresh random key |
| `Wallet.fromWIF(wif)` | Restores a wallet from a WIF private key |
| `Wallet.fromPrivateKeyHex(hex)` | Restores a wallet from a hex private key |
| `.address` | Base58Check address |
| `.privateKeyWIF` | WIF-encoded private key |
| `.publicKeyHex` | Uncompressed public key hex |
| `.privateKeyHex` | Raw private key hex |
| `.hash160Hex` | RIPEMD160(SHA256(pubkey)) hex |
| `.getBalance(rpc)` | Returns spendable balance in satoshis (`bigint`). Requires node `-indexer` flag. |
| `.getUTXOs(rpc)` | Returns `UTXO[]` for this address. Requires node `-indexer` flag. |
| `.send(rpc, toAddress, amountSatoshis, feeSatoshis?)` | Builds, signs, and broadcasts a P2PKH payment. Amounts are `bigint` satoshis. Fee is auto-estimated if omitted. Returns txid. |
| `.exportBackup()` | Returns `{ address, wif, publicKey }` |

**Amount units:** All amounts are `bigint` satoshis. Use `bitokToSatoshis` / `satoshisToBitok` to convert.

```ts
import { bitokToSatoshis, satoshisToBitok } from 'bitok/wallet';

bitokToSatoshis(1.5)        // → 150_000_000n
satoshisToBitok(150_000_000n) // → 1.5
```

#### Standalone functions

```ts
import { generateKeyPair, importFromWIF, validateAddress } from 'bitok/wallet';

// Generate a key pair without instantiating a Wallet
const kp = generateKeyPair();
// kp.privateKeyHex, kp.privateKeyWIF, kp.publicKeyHex, kp.address, kp.hash160

// Restore from WIF
const kp2 = importFromWIF('5HueCGU8...');

// Validate an address (returns { valid, hash160?, error? })
const result = validateAddress('1BitokAddress...');
```

---

### RPC client

`import { BitokRpc, BitokRpcError } from 'bitok/rpc'`

```ts
const rpc = new BitokRpc({
  host: '127.0.0.1',
  port: 8332,
  user: 'rpcuser',
  pass: 'rpcpass',
  // timeout: 30_000,  // ms (optional, default 30 s)
  // protocol: 'https', // set to 'https' for TLS nodes (optional)
});
```

#### Indexer (requires `-indexer` node flag)

These methods call the address indexer and will error if the node was not started with `-indexer`.

| Method | Returns |
|---|---|
| `getIndexerInfo()` | `IndexerInfo` — indexer status and height |
| `getAddressTxids(address)` | `string[]` — txids involving the address |
| `getAddressUtxos(address)` | `UTXO[]` — unspent outputs for the address |
| `getAddressBalance(address)` | `bigint` satoshis — confirmed balance |

#### Blockchain

| Method | Returns |
|---|---|
| `getBlockCount()` | `number` — current chain height |
| `getBlockNumber()` | `number` — alias for `getblockcount` |
| `getBestBlockHash()` | `string` — hash of the chain tip |
| `getBlockHash(height)` | `string` |
| `getBlock(hash)` | `Block` |
| `getBlockHeader(hash)` | `BlockHeaderInfo` |
| `getInfo()` | `NetworkInfo` |
| `getDifficulty()` | `number` |

#### Transactions

| Method | Returns |
|---|---|
| `getTransaction(txid)` | `WalletTransaction` |
| `getRawTransaction(txid)` | raw hex `string` |
| `getRawTransaction(txid, 1)` | `DecodedRawTransaction` |
| `decodeRawTransaction(hex)` | `DecodedRawTransaction` |
| `createRawTransaction(inputs, outputs, locktime?)` | unsigned raw hex |
| `signRawTransaction(hex, prevTxs?, keys?, sighashType?)` | `{ hex, complete }` |
| `sendRawTransaction(hex)` | txid `string` |
| `decodeScript(hex)` | `{ asm, hex, type, reqSigs?, addresses? }` |
| `getMempool()` | `string[]` txids |
| `getTxOutProof(txid, blockHash?)` | proof hex |
| `verifyTxOutProof(proof)` | `string[]` txids |

#### Wallet (node-managed keys)

| Method | Returns |
|---|---|
| `getBalance()` | `number` BITOK |
| `getNewAddress(label?)` | `string` address |
| `sendToAddress(address, amount, comment?, commentTo?)` | txid |
| `getReceivedByAddress(address, minconf?)` | `number` |
| `getReceivedByLabel(label, minconf?)` | `number` |
| `listTransactions(count?, includeGenerated?)` | `ListTransaction[]` |
| `listReceivedByAddress(minconf?, includeEmpty?)` | address summaries |
| `listReceivedByLabel(minconf?, includeEmpty?)` | label summaries |
| `getAddressesByLabel(label)` | `string[]` |
| `setLabel(address, label)` | — |
| `getLabel(address)` | `string` |
| `dumpPrivKey(address)` | WIF `string` |
| `importPrivKey(wif, label?, rescan?)` | `string` |
| `validateAddress(address)` | `AddressInfo` |
| `rescanWallet()` | `{ found: number }` |

#### Multisig

| Method | Returns |
|---|---|
| `createMultisig(nRequired, keys)` | `MultisigInfo` |

#### Script analysis (node-side)

| Method | Returns |
|---|---|
| `analyzeScript(scriptHex)` | `RpcScriptAnalysis` |
| `validateScript(scriptHex, stack?, flags?)` | `RpcScriptValidationResult` — `stack` is `string[]` (hex items), `flags` defaults to `'exec'` |

#### Hash preimages (hashlock support)

| Method | Returns |
|---|---|
| `addPreimage(preimageHex)` | `PreimageInfo` |
| `listPreimages()` | `PreimageListEntry[]` |

#### Mining

| Method | Returns |
|---|---|
| `getMiningInfo()` | `MiningInfo` |
| `getBlockTemplate(mode?)` | `BlockTemplate` |
| `submitBlock(hex)` | `string \| null` |
| `getWork(data?)` | work object |
| `setGenerate(enable, cpuLimit?)` | — |
| `getGenerate()` | `boolean` |

#### Network & control

| Method | Returns |
|---|---|
| `getConnectionCount()` | `number` |
| `getPeerInfo()` | `PeerInfo[]` |
| `help()` | `string` |
| `stop()` | `string` |

---

### Transactions

`import { TransactionBuilder, signTransaction, signTransactionWIF, satoshisToBitok, bitokToSatoshis, isDust, selectUTXOs } from 'bitok/tx'`

#### `TransactionBuilder`

A fluent builder for assembling raw transactions.

```ts
import { TransactionBuilder } from 'bitok/tx';

const builder = new TransactionBuilder()
  .setVersion(1)
  .addInput(prevTxid, 0)                          // sequence defaults to 0xffffffff
  .addInputFromUTXO(utxo)                         // convenience from a UTXO object
  .addOutputToAddress(addr, 50_000_000n)           // satoshis as bigint
  .addOutputToAddressBitok(addr, 0.5)              // BITOK as number (auto-converts)
  .addOpReturnOutput(dataBytes)                    // arbitrary bytes
  .addOpReturnText('hello')                        // UTF-8 text
  .addCustomOutput(scriptHex, 0n)                  // raw scriptPubKey hex
  .setLocktime(0);

const tx  = builder.build();   // → Transaction object
const hex = builder.toHex();   // → serialized wire-format hex

const size    = builder.estimateSize();                // estimated bytes
const feeInfo = builder.estimateFee(utxos, height);    // { feePerKb, totalFee, priority, isFree }

const clone     = builder.clone();
const restored  = TransactionBuilder.fromHex(hex);
```

#### Signing

```ts
import { signTransaction, signTransactionWIF } from 'bitok/tx';

// Sign with raw private keys (Uint8Array[])
// NOTE: private key bytes are zeroed out by the function after use
const result = signTransaction(tx, [privateKey], {
  prevTxs: [{ txid, vout, scriptPubKey }],              // required for each input
  sighashType: { base: 'ALL', anyoneCanPay: false },    // optional, defaults to SIGHASH_ALL
});
// result.hex      — signed transaction hex ready to broadcast
// result.complete — true when all inputs are signed
// result.inputs   — per-input results:
//   { index, scriptSig, complete, error? }
//   error is set (with a reason string) on any input that could not be signed

// Sign with WIF keys (string[])
const result2 = signTransactionWIF(txHex, ['5HueCGU8...'], prevTxs, 'ALL');
```

Supported script types for auto-signing: `pubkeyhash` (P2PKH) and `pubkey` (P2PK).

**Sighash types:** `serializeForSigning` enforces that the sighash base type is one of `SIGHASH_ALL` (0x01), `SIGHASH_NONE` (0x02), or `SIGHASH_SINGLE` (0x03). Any other value throws immediately.

#### Helper functions

```ts
satoshisToBitok(100_000_000n)  // → 1
bitokToSatoshis(1)              // → 100_000_000n
isDust(900_000n)                // → false  (DUST_THRESHOLD = CENT = 1_000_000 sat)

// Greedy UTXO selection — picks largest-first until target + fee is covered
const selected = selectUTXOs(utxos, targetSatoshis, feeSatoshis);
```

---

### Scripts

`import { ScriptBuilder, decodeScript, classifyScript, analyzeScript, evalScript, verifyScript } from 'bitok/script'`

#### `ScriptBuilder` — fluent API

```ts
import { ScriptBuilder } from 'bitok/script';
import { Opcode } from 'bitok';

// Standard templates (static helpers returning Uint8Array)
const p2pkhScript = ScriptBuilder.p2pkh(address);
const p2pkScript  = ScriptBuilder.p2pk(publicKey);          // uncompressed 65-byte key
const msigScript  = ScriptBuilder.multisig(2, [key1, key2, key3]);  // 2-of-3
const nullData    = ScriptBuilder.opReturn(dataBytes);
const nullDataHex = ScriptBuilder.opReturnHex('deadbeef');

// Hashlock — requires preimage hash + pubkey hash (OP_HASH160-based)
const hashlock    = ScriptBuilder.hashlock(preimageHash, pubkeyHash);
// Hashlock — SHA256-based variant
const hashlock256 = ScriptBuilder.hashlockSha256(preimageHash, pubkeyHash);

// HTLC — IF/ELSE with claim path (preimage+sig) and refund path (sig only)
const htlc = ScriptBuilder.htlc(preimageHash, receiverPubkeyHash, refundPubkeyHash);

// OP_CAT covenant (uses the re-enabled OP_CAT opcode)
const covenant = ScriptBuilder.catCovenant(expectedData);

// Arithmetic condition using OP_MUL (re-enabled)
// Stack top × multiplier must satisfy comparison against threshold
const cond = ScriptBuilder.arithmeticCondition(3, 100, 'gte');
// comparisons: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'

// Low-level fluent builder
const custom = new ScriptBuilder()
  .op(Opcode.OP_DUP)
  .pushBytes(someBytes)
  .pushNumber(42)
  .op(Opcode.OP_EQUAL)
  .build();            // → Uint8Array

const hex  = new ScriptBuilder().op(Opcode.OP_NOP).toHex();
const copy = builder.clone();
```

#### Decoding and classification

```ts
import { decodeScript, classifyScript, analyzeScript } from 'bitok/script';

const decoded = decodeScript(scriptBytes);
// decoded.type        — ScriptType (see below)
// decoded.asm         — human-readable assembly string
// decoded.addresses   — array of addresses (when applicable)
// decoded.reqSigs     — required signatures (when applicable)

const type = classifyScript(scriptBytes);
// → ScriptType string

const analysis = analyzeScript(scriptBytes);
// analysis.type          — ScriptType
// analysis.asm           — assembly string
// analysis.hex           — hex string
// analysis.opcodeCount   — number of non-push opcodes
// analysis.byteSize      — script length in bytes
// analysis.sigopCount    — signature operation count
// analysis.pushDataCount — number of push data operations
// analysis.usesArithmetic — uses OP_MUL, OP_DIV, etc.
// analysis.usesBitwise   — uses OP_AND, OP_OR, etc.
// analysis.usesSplice    — uses OP_CAT, OP_SUBSTR, etc.
// analysis.usesHashlock  — uses OP_HASH160 / OP_HASH256 patterns
// analysis.exceedsLimits — true if any script limit is exceeded
// analysis.limitWarnings — string[] describing which limits are exceeded
// analysis.isPushOnly    — true if script contains only push opcodes
// analysis.isStandard    — true if it matches a recognized standard type
```

**ScriptType values:** `'pubkey'` | `'pubkeyhash'` | `'multisig'` | `'nulldata'` | `'hashlock'` | `'hashlock-sha256'` | `'arithmetic'` | `'bitwise'` | `'bitwise-sig'` | `'cat-covenant'` | `'cat-hash'` | `'cat-script'` | `'splice'` | `'nonstandard'`

#### Script interpreter

```ts
import { evalScript, verifyScript } from 'bitok/script';
import { SCRIPT_VERIFY_EXEC } from 'bitok';

// Execute a script against an initial stack, return the result
const { success, finalStack, error } = evalScript(scriptBytes, initialStack, SCRIPT_VERIFY_EXEC);
// success     — true if the script executed without error and top stack item is truthy
// finalStack  — string[] of hex-encoded stack items after execution
// error       — error message string if execution failed

// Verify a scriptSig + scriptPubKey pair together
const { success, finalStack, error } = verifyScript(scriptSigBytes, scriptPubKeyBytes, SCRIPT_VERIFY_EXEC);
```

---

### Contracts

`import { ... } from 'bitok/contract'`

#### Hashlock

Lock funds behind a secret. Only the party who knows the preimage can claim.

```ts
import {
  createHashlock,
  createHashlockFromSecret,
  buildHashlockSpendScriptSig,
} from 'bitok/contract';

// Lock using raw bytes — hashType: 'hash160' (default) or 'sha256'
const contract = createHashlock(preimageBytes, receiverAddress, 'hash160');
// contract.scriptPubKeyHex — send funds here
// contract.preimageHex     — the secret (keep private until claiming)
// contract.hashHex         — the hash embedded in the script
// contract.hashType

// Lock using a UTF-8 string secret
const contract2 = createHashlockFromSecret('my secret phrase', receiverAddress);

// Build scriptSig for spending (after signing)
const scriptSig = buildHashlockSpendScriptSig(sigDer, pubKey, preimage, 0x01);
// Push order: <sig> <pubkey> <preimage>
```

#### HTLC (Hash Time-Lock Contract)

Combines a hashlock with a timelock refund path. Useful for atomic swaps and payment channels.

```ts
import {
  createHTLC,
  buildHTLCClaimScriptSig,
  buildHTLCRefundScriptSig,
  buildHTLCClaimTx,
  buildHTLCRefundTx,
} from 'bitok/contract';

const htlc = createHTLC(preimage, receiverAddress, refundAddress, locktime);
// htlc.scriptPubKeyHex — lock coins here
// htlc.locktime        — Unix timestamp or block height for refund path

// Claim path: receiver reveals preimage + signs
const claimTx  = buildHTLCClaimTx(htlcUtxo, claimValueSatoshis, receiverAddress);
const claimSig = buildHTLCClaimScriptSig(sigDer, pubKey, preimage, 0x01);
// Push order: <sig> <pubkey> <preimage> OP_1

// Refund path: sender reclaims after locktime expires
// nLockTime is set on the tx automatically by buildHTLCRefundTx
const refundTx  = buildHTLCRefundTx(htlc, htlcUtxo, refundValueSatoshis, refundAddress);
const refundSig = buildHTLCRefundScriptSig(sigDer, pubKey, 0x01);
// Push order: <sig> <pubkey> OP_0
```

The locktime is enforced via `nLockTime` on the refund transaction — not embedded in the script itself — keeping the script compact.

#### Multisig wallet

Bitok uses **bare multisig** — the full redeem script is directly the `scriptPubKey`. There is no P2SH wrapping.

```ts
import { createMultisigWallet, buildMultisigSpendScriptSig, createEscrow } from 'bitok/contract';

// m-of-n wallet (up to 20 keys, uncompressed 65-byte keys required)
const wallet = createMultisigWallet(2, [alicePubKey, bobPubKey, carolPubKey]);
// wallet.scriptPubKeyHex  — send funds here (this is the bare multisig script)
// wallet.publicKeys       — string[] of participant public keys (hex)
// wallet.addresses        — P2PKH address per key
// wallet.m, wallet.n

// Spend: OP_0 dummy + m signatures (must be in the same order as the keys in the script)
const scriptSig = buildMultisigSpendScriptSig([
  { derBytes: aliceSig, sighashByte: 0x01 },
  { derBytes: bobSig,   sighashByte: 0x01 },
]);

// 2-of-3 escrow (buyer / seller / arbitrator)
// Any 2 of 3 must sign to release funds
const escrow = createEscrow(buyerPubKey, sellerPubKey, arbitratorPubKey);
// escrow.scriptPubKeyHex, escrow.addresses, escrow.m
```

#### OP_RETURN data embedding

Store arbitrary data on-chain. OP_RETURN outputs are unspendable and pruned from the UTXO set.

```ts
import { embedData, embedText, embedHex, embedJSON, decodeOpReturn } from 'bitok/contract';

const out1 = embedData(rawBytes);              // arbitrary Uint8Array
const out2 = embedText('hello world');         // UTF-8 string
const out3 = embedHex('deadbeef');             // hex string
const out4 = embedJSON({ v: 1, msg: 'ping' }); // JSON-serializable value

// All return: { scriptPubKeyHex, dataHex, dataText?, byteSize }

// Decode an existing OP_RETURN output's scriptPubKey
const decoded = decodeOpReturn(scriptHex);
// decoded?.dataHex, decoded?.dataText, decoded?.byteSize
// Returns null if the script is not an OP_RETURN
```

---

### Mining

`import { ... } from 'bitok/mining'`

Bitok uses **Yespower** proof-of-work (N=2048, r=32, personalization string `BitokPoW`). The SDK provides all block-building logic but delegates the Yespower hash computation to a pluggable callback — this lets you use native bindings, WASM, or any other implementation.

#### Registering the Yespower implementation

```ts
import { setYespowerImplementation } from 'bitok/mining';

// Provide a function that accepts an 80-byte header and returns a 32-byte hash
setYespowerImplementation((header80: Uint8Array): Uint8Array => {
  return myYespowerBindings.hash(header80);
});
```

`computeBlockHash` and `verifyBlockHash` will throw if called before a Yespower implementation is registered.

#### End-to-end mining loop

```ts
import { BitokRpc } from 'bitok/rpc';
import {
  prepareMiningCandidate,
  serializeBlock,
  verifyBlockHash,
  setYespowerImplementation,
} from 'bitok/mining';

setYespowerImplementation(myHashFn);

const rpc = new BitokRpc({ host: '127.0.0.1', port: 8332, user: 'rpc', pass: 'rpc' });
const template  = await rpc.getBlockTemplate();
const candidate = prepareMiningCandidate(template, minerAddress);

// candidate.header           — 80-byte block header (nonce sits at bytes 76–79)
// candidate.target           — 64-char hex target the hash must be <= to
// candidate.merkleRoot       — merkle root hex
// candidate.coinbaseTxHex    — serialized coinbase transaction hex
// candidate.transactionHexes — all non-coinbase transactions to include
// candidate.height           — block height being mined

for (let nonce = 0; nonce <= 0xffffffff; nonce++) {
  const header = candidate.header.slice();
  new DataView(header.buffer).setUint32(76, nonce, true);

  if (verifyBlockHash(header, candidate.target)) {
    const blockHex = serializeBlock(candidate, nonce);
    await rpc.submitBlock(blockHex);
    console.log('Block found at nonce', nonce);
    break;
  }
}
```

#### Individual helpers

```ts
// Build a coinbase transaction manually
const coinbaseTxHex = buildCoinbaseTx(
  blockHeight,
  rewardSatoshis,      // bigint
  minerAddress,
  extraNonce,          // default 0
  '/Bitok/'            // coinbase message (default)
);

// Build an 80-byte block header
const header = buildBlockHeader(version, prevHash, merkleRoot, time, bits, nonce);

// Difficulty ↔ target conversion
const targetHex  = difficultyToTarget(1234.56);
const difficulty = targetToDifficulty(targetHex);
const target64   = nbitsToTarget(0x1e0fffff);   // convert compact bits → target hex

// Block reward schedule (identical to Bitcoin — halves every 210,000 blocks)
const reward = calculateBlockReward(height);    // → bigint satoshis

// Estimated network hashrate
const hps = estimateHashrate(blocksFound, difficulty, timeSeconds);

// Select transactions from a block template
const txs = selectTransactions(template, 'mixed', maxSigOps, maxSize);
// strategies: 'priority' | 'fee' | 'mixed'
// Respects maxSigOps (default 20,000) and maxSize (default 1,000,000 bytes)
```

---

### Crypto primitives

`import { ... } from 'bitok/crypto'`

#### Hash functions

```ts
import { hash256, hash160, sha256Single, computeTxid, computeMerkleRoot } from 'bitok/crypto';

hash256(data)               // SHA256(SHA256(data)) — used for txids and block hashes
hash160(data)               // RIPEMD160(SHA256(data)) — used in P2PKH addresses
sha256Single(data)          // SHA256(data)

computeTxid(rawTxBytes)     // hash256, returns little-endian hex (as displayed in explorers)
computeMerkleRoot(txids)    // builds merkle tree from an array of txid hex strings
                            // each txid must be exactly 64 hex characters
```

#### Key management

```ts
import {
  generatePrivateKey, privateKeyToPublicKey, publicKeyToAddress,
  privateKeyToWIF, wifToPrivateKey,
  addressToHash160, isValidAddress, isValidPrivateKey,
} from 'bitok/crypto';

const privKey  = generatePrivateKey();                 // random 32-byte Uint8Array
const pubKey   = privateKeyToPublicKey(privKey);       // uncompressed (65 bytes) by default
const pubKeyC  = privateKeyToPublicKey(privKey, true); // compressed (33 bytes)
const address  = publicKeyToAddress(pubKey);           // Base58Check P2PKH address

const wif      = privateKeyToWIF(privKey);             // WIF-encode the private key
const privKey2 = wifToPrivateKey(wif);                 // decode WIF → raw Uint8Array

const h160    = addressToHash160(address);             // decode address → 20-byte Uint8Array
const valid   = isValidAddress(address);               // boolean
const validPk = isValidPrivateKey(privKey);            // boolean
```

#### ECDSA signing

```ts
import { signHash, verifyHash } from 'bitok/crypto';

const sig = signHash(msgHash32, privateKey);           // DER-encoded, low-S normalized
const ok  = verifyHash(msgHash32, sig, publicKey);     // boolean
```

All curve operations use `@noble/curves/secp256k1`. All hash operations use `@noble/hashes`.

---

### Utilities

`import { hexToBytes, bytesToHex, concatBytes, reverseBytes } from 'bitok/crypto'`
`import { encodeVarInt, decodeVarInt, varIntSize } from 'bitok'`

#### Byte helpers

```ts
hexToBytes('deadbeef')              // → Uint8Array([0xde, 0xad, 0xbe, 0xef])
bytesToHex(new Uint8Array([1, 2]))  // → '0102'
concatBytes(a, b, c)               // → new Uint8Array (copies all inputs)
reverseBytes(bytes)                // → new Uint8Array (copy, not in-place)
```

#### VarInt

Bitcoin-compatible variable-length integer encoding used in transaction serialization.

```ts
encodeVarInt(252n)   // → Uint8Array([0xfc])            — 1 byte
encodeVarInt(253n)   // → Uint8Array([0xfd, 0xfd, 0x00]) — 3 bytes
const { value, bytesRead } = decodeVarInt(bytes, offset);
varIntSize(300n)     // → 3  (number of bytes needed to encode 300)
```

---

### Constants

All constants are exported from `'bitok'` (root) and `'bitok/types'`.

| Constant | Value | Description |
|---|---|---|
| `COIN` | `100_000_000n` | Satoshis per BITOK |
| `CENT` | `1_000_000n` | 0.01 BITOK in satoshis |
| `DUST_THRESHOLD` | `CENT` | Minimum non-dust output value |
| `MAX_MONEY` | `21_000_000n * COIN` | Total supply cap |
| `MAX_BLOCK_SIZE` | `1_000_000` | Max block size in bytes |
| `MAX_SCRIPT_SIZE` | `10_000` | Max script size in bytes |
| `MAX_SCRIPT_ELEMENT_SIZE` | `520` | Max bytes per stack element |
| `MAX_OPS_PER_SCRIPT` | `201` | Max opcodes per script |
| `MAX_PUBKEYS_PER_MULTISIG` | `20` | Max keys in a multisig |
| `MAX_SIGOPS_PER_BLOCK` | `20_000` | |
| `MAX_STACK_SIZE` | `1_000` | Max stack depth during script execution |
| `COINBASE_MATURITY` | `100` | Blocks before coinbase output is spendable |
| `DEFAULT_PORT` | `18333` | P2P port |
| `RPC_PORT` | `8332` | JSON-RPC port |
| `PROTOCOL_VERSION` | `319` | Wire protocol version |
| `NETWORK_MAGIC` | `0xb40bc0de` | 4-byte network identifier |
| `GENESIS_HASH` | `0290400e…` | Hash of block 0 |
| `GENESIS_NBITS` | `0x1effffff` | Genesis difficulty target |
| `GENESIS_NONCE` | `37137` | |
| `GENESIS_TIME` | `1231006505` | Genesis block timestamp |
| `POW_LIMIT_HEX` | `00007fff…` | Minimum difficulty target (max target) |
| `YESPOWER_N` | `2048` | Yespower memory cost parameter |
| `YESPOWER_R` | `32` | Yespower block size parameter |
| `YESPOWER_PERS` | `'BitokPoW'` | Yespower personalization string |
| `RETARGET_INTERVAL` | `2016` | Blocks per difficulty adjustment window |
| `TARGET_SPACING` | `600` | Target seconds per block (10 minutes) |
| `RETARGET_TIMESPAN` | `1_209_600` | Two weeks in seconds |
| `TIMEWARP_ACTIVATION_HEIGHT` | `16_000` | Block height where timewarp fix activates |
| `SCRIPT_EXEC_ACTIVATION_HEIGHT` | `18_000` | Block height where advanced script execution activates |
| `SIGHASH_ALL` | `0x01` | |
| `SIGHASH_NONE` | `0x02` | |
| `SIGHASH_SINGLE` | `0x03` | |
| `SIGHASH_ANYONECANPAY` | `0x80` | |
| `SEQUENCE_FINAL` | `0xffffffff` | Standard input sequence (no relative lock) |
| `ADDRESS_VERSION_MAINNET` | `0x00` | P2PKH version byte |
| `WIF_VERSION` | `0x80` | WIF private key version byte |
| `SCRIPT_VERIFY_NONE` | `0x00` | No script verification flags |
| `SCRIPT_VERIFY_EXEC` | `0x01` | Enable full opcode execution (post-activation) |
| `MIN_FEE_PER_KB` | `CENT` | Minimum relay fee (1,000,000 sat/KB) |
| `FREE_PRIORITY_THRESHOLD` | `57_600_000n` | Priority above which a tx is relayed for free |

---

## What makes Bitok different

Bitok re-enables several opcodes that Bitcoin permanently disabled. These opcodes are available after block `SCRIPT_EXEC_ACTIVATION_HEIGHT` (18,000) when scripts are executed with the `SCRIPT_VERIFY_EXEC` flag.

| Opcode | Effect |
|---|---|
| `OP_CAT` | Concatenates the top two stack items |
| `OP_MUL` | Multiplies the top two stack items |
| `OP_DIV` | Integer division |
| `OP_MOD` | Modulo |
| `OP_LSHIFT` / `OP_RSHIFT` | Bitwise left/right shift |
| `OP_2MUL` / `OP_2DIV` | Multiply or divide top item by 2 |

`ScriptBuilder.catCovenant()` and `ScriptBuilder.arithmeticCondition()` provide ready-made templates that use these opcodes.

Other Bitok-specific characteristics:

- **Yespower PoW** — GPU/ASIC-resistant, CPU-friendly proof of work (N=2048, r=32, personalization `BitokPoW`)
- **Timewarp fix** — activates at block 16,000
- **Network magic** — `0xb40bc0de`
- **Genesis block** — timestamp `1231006505`, nonce `37137`

---

## Error handling

All methods throw standard `Error` instances with descriptive messages. RPC errors additionally throw `BitokRpcError` (exported from `'bitok/rpc'`) with a `.code` field matching the node's JSON-RPC error codes.

```ts
import { BitokRpcError } from 'bitok/rpc';

try {
  await rpc.sendRawTransaction(badHex);
} catch (err) {
  if (err instanceof BitokRpcError) {
    console.error(err.code, err.message);
  }
}
```

Common validation errors thrown by the SDK:

| Situation | Message |
|---|---|
| Output value is negative | `Output value cannot be negative` |
| Output value exceeds supply cap | `Output value exceeds MAX_MONEY` |
| No inputs when calling `.build()` | `Transaction must have at least one input` |
| No outputs when calling `.build()` | `Transaction must have at least one output` |
| Script exceeds 10,000 bytes | `Script too large: N bytes (max 10000)` |
| Push data exceeds 520 bytes | `Data too large: N bytes (max 520)` |
| Invalid m-of-n parameters | `Invalid multisig: M of N` |
| More than 20 multisig keys | `Too many public keys: max 20` |
| Insufficient UTXOs for payment | `Insufficient funds: have N satoshis, need M` |
| Invalid WIF encoding | `Invalid WIF version` / `Invalid WIF private key length` |
| Invalid address | `Invalid address version: N` |
| Invalid txid in merkle root | `Invalid txid length: expected 64 hex chars, got N` |
| Invalid sighash type | `Invalid sighash base type: 0xN (must be SIGHASH_ALL=1, SIGHASH_NONE=2, or SIGHASH_SINGLE=3)` |
| Buffer too short in deserialization | `deserializeTransaction: buffer too short at offset N` |
| Yespower not registered | `Yespower implementation not set. Call setYespowerImplementation()…` |
