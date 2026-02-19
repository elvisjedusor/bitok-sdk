import {
  RpcConfig,
  RpcRequest,
  RpcResponse,
  BitokRpcError,
} from '../types/rpc';

export class RpcClient {
  private config: Required<Omit<RpcConfig, 'timeout'>> & { timeout: number };
  private baseUrl: string;
  private authHeader: string;
  private requestId = 0;

  constructor(config: RpcConfig) {
    this.config = {
      protocol: 'http',
      timeout: 30_000,
      ...config,
    };
    this.baseUrl = `${this.config.protocol}://${this.config.host}:${this.config.port}/`;
    const credentials = btoa(`${this.config.user}:${this.config.password}`);
    this.authHeader = `Basic ${credentials}`;
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++this.requestId;
    const body: RpcRequest = {
      jsonrpc: '1.0',
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 500) {
        throw new BitokRpcError(-1, `HTTP error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new BitokRpcError(-1, `Node returned empty response (status ${response.status})`);
      }

      let json: RpcResponse<T>;
      try {
        json = JSON.parse(text) as RpcResponse<T>;
      } catch {
        throw new BitokRpcError(-1, `Invalid JSON from node: ${text.slice(0, 200)}`);
      }

      if (json.error) {
        throw new BitokRpcError(json.error.code, json.error.message);
      }

      return json.result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof BitokRpcError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BitokRpcError(-1, `RPC timeout after ${this.config.timeout}ms`);
      }
      throw new BitokRpcError(-1, err instanceof Error ? err.message : String(err));
    }
  }

  async batch<T = unknown>(calls: Array<{ method: string; params?: unknown[] }>): Promise<T[]> {
    const requests: RpcRequest[] = calls.map((call) => ({
      jsonrpc: '1.0',
      id: ++this.requestId,
      method: call.method,
      params: call.params ?? [],
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify(requests),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const batchText = await response.text();
      if (!batchText || batchText.trim() === '') {
        throw new BitokRpcError(-1, `Node returned empty response (status ${response.status})`);
      }
      let json: RpcResponse<T>[];
      try {
        json = JSON.parse(batchText) as RpcResponse<T>[];
      } catch {
        throw new BitokRpcError(-1, `Invalid JSON from node: ${batchText.slice(0, 200)}`);
      }

      return json.map((res) => {
        if (res.error) throw new BitokRpcError(res.error.code, res.error.message);
        return res.result;
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof BitokRpcError) throw err;
      throw new BitokRpcError(-1, err instanceof Error ? err.message : String(err));
    }
  }
}
