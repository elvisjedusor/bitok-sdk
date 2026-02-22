import { useState, useCallback } from 'react';
import {
  TransactionBuilder,
  selectUTXOs,
  bitokToSatoshis,
  signTransaction,
  wifToPrivateKey,
  ScriptBuilder,
  bytesToHex,
  hexToBytes,
  serializeTransaction,
  deserializeTransaction,
  computeSigHash,
  signHash,
  privateKeyToPublicKey,
  buildHashlockSpendScriptSig,
  buildHTLCClaimScriptSig,
  buildHTLCRefundScriptSig,
  buildMultisigScriptSig,
  SIGHASH_ALL,
} from 'bitok';
import type { BitokRpc, UTXO } from 'bitok';
import type { StoredWallet } from '../types/wallet';
import { extractPublicKeysFromMultisigScript, orderSignaturesForMultisig } from '../utils/multisig';

export interface BroadcastState {
  broadcasting: boolean;
  txid: string | null;
  error: string | null;
}

export function useBroadcast(wallet: StoredWallet, rpc: BitokRpc) {
  const [state, setState] = useState<BroadcastState>({
    broadcasting: false,
    txid: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({ broadcasting: false, txid: null, error: null });
  }, []);

  const fundContract = useCallback(
    async (scriptHex: string, amountBitok: string, feeBitok: string): Promise<string> => {
      if (!wallet.wif) throw new Error('Private key not available');
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const amountSatoshis = bitokToSatoshis(amountBitok);
        const feeSatoshis = bitokToSatoshis(feeBitok);
        const utxos = await rpc.getAddressUtxos(wallet.address);
        const selected = selectUTXOs(utxos, amountSatoshis, feeSatoshis);
        const totalIn = selected.reduce((acc: bigint, u: UTXO) => acc + u.valueSatoshis, 0n);
        const change = totalIn - amountSatoshis - feeSatoshis;

        const builder = new TransactionBuilder();
        builder.addCustomOutput(scriptHex, amountSatoshis);
        for (const utxo of selected) {
          builder.addInput(utxo.txid, utxo.vout);
        }
        if (change > 0n) {
          builder.addOutputToAddress(wallet.address, change);
        }

        const tx = builder.build();
        const privKey = wifToPrivateKey(wallet.wif);
        const myScriptPubKey = bytesToHex(ScriptBuilder.p2pkh(wallet.address));
        const prevTxs = selected.map((u: UTXO) => ({
          txid: u.txid,
          vout: u.vout,
          scriptPubKey: myScriptPubKey,
        }));

        let txid: string;
        try {
          const signed = signTransaction(tx, [privKey], { prevTxs });
          if (!signed.complete) {
            const errors = signed.inputs
              .filter((inp) => !inp.complete)
              .map((inp) => inp.error)
              .join('; ');
            throw new Error(`Signing failed: ${errors}`);
          }
          txid = await rpc.sendRawTransaction(signed.hex);
        } finally {
          privKey.fill(0);
        }

        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transaction failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [wallet, rpc]
  );

  const broadcastOpReturn = useCallback(
    async (scriptHex: string, feeBitok: string): Promise<string> => {
      if (!wallet.wif) throw new Error('Private key not available');
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const feeSatoshis = bitokToSatoshis(feeBitok);
        const utxos = await rpc.getAddressUtxos(wallet.address);
        const selected = selectUTXOs(utxos, 0n, feeSatoshis);
        const totalIn = selected.reduce((acc: bigint, u: UTXO) => acc + u.valueSatoshis, 0n);
        const change = totalIn - feeSatoshis;

        const builder = new TransactionBuilder();
        builder.addCustomOutput(scriptHex, 0n);
        for (const utxo of selected) {
          builder.addInput(utxo.txid, utxo.vout);
        }
        if (change > 0n) {
          builder.addOutputToAddress(wallet.address, change);
        }

        const tx = builder.build();
        const privKey = wifToPrivateKey(wallet.wif);
        const myScriptPubKey = bytesToHex(ScriptBuilder.p2pkh(wallet.address));
        const prevTxs = selected.map((u: UTXO) => ({
          txid: u.txid,
          vout: u.vout,
          scriptPubKey: myScriptPubKey,
        }));

        let txid: string;
        try {
          const signed = signTransaction(tx, [privKey], { prevTxs });
          if (!signed.complete) throw new Error('Signing failed');
          txid = await rpc.sendRawTransaction(signed.hex);
        } finally {
          privKey.fill(0);
        }

        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transaction failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [wallet, rpc]
  );

  const broadcastRawHex = useCallback(
    async (hex: string): Promise<string> => {
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const txid = await rpc.sendRawTransaction(hex);
        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Broadcast failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [rpc]
  );

  const claimHashlock = useCallback(
    async (
      contractScriptHex: string,
      fundingTxid: string,
      fundingVout: number,
      fundedAmountBitok: string,
      secret: string,
      feeBitok: string,
      destinationAddress: string
    ): Promise<string> => {
      if (!wallet.wif) throw new Error('Private key not available');
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const fundedSatoshis = bitokToSatoshis(fundedAmountBitok);
        const feeSatoshis = bitokToSatoshis(feeBitok);
        const claimAmount = fundedSatoshis - feeSatoshis;
        if (claimAmount <= 0n) throw new Error('Fee exceeds funded amount');

        const builder = new TransactionBuilder()
          .addInput(fundingTxid, fundingVout)
          .addOutputToAddress(destinationAddress, claimAmount);

        const tx = builder.build();
        const privKey = wifToPrivateKey(wallet.wif);
        const pubKey = privateKeyToPublicKey(privKey, false);
        const scriptCode = new Uint8Array(
          contractScriptHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
        );

        const sigHash = computeSigHash(tx, 0, scriptCode, SIGHASH_ALL);
        const signature = signHash(sigHash, privKey);
        const preimageBytes = new TextEncoder().encode(secret);
        const scriptSig = buildHashlockSpendScriptSig(signature, pubKey, preimageBytes, SIGHASH_ALL);

        tx.vin[0].scriptSig = scriptSig;
        const signedHex = bytesToHex(serializeTransaction(tx));
        privKey.fill(0);

        const txid = await rpc.sendRawTransaction(signedHex);
        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Claim failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [wallet, rpc]
  );

  const claimHTLC = useCallback(
    async (
      contractScriptHex: string,
      fundingTxid: string,
      fundingVout: number,
      fundedAmountBitok: string,
      secret: string,
      feeBitok: string,
      destinationAddress: string
    ): Promise<string> => {
      if (!wallet.wif) throw new Error('Private key not available');
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const fundedSatoshis = bitokToSatoshis(fundedAmountBitok);
        const feeSatoshis = bitokToSatoshis(feeBitok);
        const claimAmount = fundedSatoshis - feeSatoshis;
        if (claimAmount <= 0n) throw new Error('Fee exceeds funded amount');

        const builder = new TransactionBuilder()
          .addInput(fundingTxid, fundingVout)
          .addOutputToAddress(destinationAddress, claimAmount);

        const tx = builder.build();
        const privKey = wifToPrivateKey(wallet.wif);
        const pubKey = privateKeyToPublicKey(privKey, false);
        const scriptCode = new Uint8Array(
          contractScriptHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
        );

        const sigHash = computeSigHash(tx, 0, scriptCode, SIGHASH_ALL);
        const signature = signHash(sigHash, privKey);
        const preimageBytes = new TextEncoder().encode(secret);
        const scriptSig = buildHTLCClaimScriptSig(signature, pubKey, preimageBytes, SIGHASH_ALL);

        tx.vin[0].scriptSig = scriptSig;
        const signedHex = bytesToHex(serializeTransaction(tx));
        privKey.fill(0);

        const txid = await rpc.sendRawTransaction(signedHex);
        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Claim failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [wallet, rpc]
  );

  const refundHTLC = useCallback(
    async (
      contractScriptHex: string,
      fundingTxid: string,
      fundingVout: number,
      fundedAmountBitok: string,
      locktime: number,
      feeBitok: string,
      destinationAddress: string
    ): Promise<string> => {
      if (!wallet.wif) throw new Error('Private key not available');
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const fundedSatoshis = bitokToSatoshis(fundedAmountBitok);
        const feeSatoshis = bitokToSatoshis(feeBitok);
        const refundAmount = fundedSatoshis - feeSatoshis;
        if (refundAmount <= 0n) throw new Error('Fee exceeds funded amount');

        const builder = new TransactionBuilder()
          .setLocktime(locktime)
          .addInput(fundingTxid, fundingVout, 0x00000000)
          .addOutputToAddress(destinationAddress, refundAmount);

        const tx = builder.build();
        const privKey = wifToPrivateKey(wallet.wif);
        const pubKey = privateKeyToPublicKey(privKey, false);
        const scriptCode = new Uint8Array(
          contractScriptHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
        );

        const sigHash = computeSigHash(tx, 0, scriptCode, SIGHASH_ALL);
        const signature = signHash(sigHash, privKey);
        const scriptSig = buildHTLCRefundScriptSig(signature, pubKey, SIGHASH_ALL);

        tx.vin[0].scriptSig = scriptSig;
        const signedHex = bytesToHex(serializeTransaction(tx));
        privKey.fill(0);

        const txid = await rpc.sendRawTransaction(signedHex);
        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Refund failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [wallet, rpc]
  );

  const signMultisigPartial = useCallback(
    (
      unsignedTxHex: string,
      contractScriptHex: string,
      wif: string
    ): string => {
      const tx = deserializeTransaction(hexToBytes(unsignedTxHex));
      const scriptCode = hexToBytes(contractScriptHex);
      const privKey = wifToPrivateKey(wif.trim());
      try {
        const sigHash = computeSigHash(tx, 0, scriptCode, SIGHASH_ALL);
        const sig = signHash(sigHash, privKey);
        const sigWithType = new Uint8Array(sig.length + 1);
        sigWithType.set(sig);
        sigWithType[sig.length] = SIGHASH_ALL;
        return bytesToHex(sigWithType);
      } finally {
        privKey.fill(0);
      }
    },
    []
  );

  const broadcastMultisig = useCallback(
    async (
      unsignedTxHex: string,
      contractScriptHex: string,
      sigHexes: string[]
    ): Promise<string> => {
      setState({ broadcasting: true, txid: null, error: null });
      try {
        const tx = deserializeTransaction(hexToBytes(unsignedTxHex));
        const scriptCode = hexToBytes(contractScriptHex);

        const signaturesWithType: Uint8Array[] = sigHexes.map(h => hexToBytes(h));

        const publicKeys = extractPublicKeysFromMultisigScript(contractScriptHex);
        const sigHash = computeSigHash(tx, 0, scriptCode, SIGHASH_ALL);
        const orderedSignatures = orderSignaturesForMultisig(signaturesWithType, publicKeys, sigHash);

        const signaturesWithoutType = orderedSignatures.map(sig => sig.slice(0, sig.length - 1));

        tx.vin[0].scriptSig = buildMultisigScriptSig(signaturesWithoutType, SIGHASH_ALL);
        const signedHex = bytesToHex(serializeTransaction(tx));

        const txid = await rpc.sendRawTransaction(signedHex);
        setState({ broadcasting: false, txid, error: null });
        return txid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Broadcast failed';
        setState({ broadcasting: false, txid: null, error: msg });
        throw err;
      }
    },
    [rpc]
  );

  return {
    ...state,
    reset,
    fundContract,
    broadcastOpReturn,
    broadcastRawHex,
    claimHashlock,
    claimHTLC,
    refundHTLC,
    signMultisigPartial,
    broadcastMultisig,
  };
}
