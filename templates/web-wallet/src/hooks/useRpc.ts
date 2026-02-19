import { useState, useCallback, useRef } from 'react';
import { BitokRpc } from 'bitok';
import type { RpcSettings } from '../types/wallet';

export function useRpc(settings: RpcSettings) {
  const clientRef = useRef<BitokRpc | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeClient = useCallback((s: RpcSettings) => {
    const isLocal = s.host === '127.0.0.1' || s.host === 'localhost';
    const url = isLocal ? '/rpc' : undefined;
    return new BitokRpc({
      host: s.host,
      port: s.port,
      user: s.user,
      password: s.password,
      protocol: s.protocol,
      url,
    });
  }, []);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = makeClient(settings);
    }
    return clientRef.current;
  }, [settings, makeClient]);

  const reconnect = useCallback((newSettings: RpcSettings) => {
    clientRef.current = makeClient(newSettings);
    setConnected(false);
    setError(null);
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    try {
      const client = getClient();
      await client.getInfo();
      setConnected(true);
      setError(null);
      return true;
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Connection failed');
      return false;
    }
  }, [getClient]);

  return { getClient, connected, error, testConnection, reconnect, setConnected };
}
