# Bitok Web Wallet

Browser-based wallet for the Bitok node. Connects directly to a running `bitokd` instance via JSON-RPC.

## Requirements

- A running `bitokd` node with RPC enabled and CORS configured
- Node.js 18+

## Node Configuration

Add the following to your `bitok.conf`:

```ini
server=1
rpcuser=yourusername
rpcpassword=yourpassword
cors=1
corsorigin=http://localhost:5173
```

For production, set `corsorigin` to your actual wallet URL (e.g. `https://wallet.yourdomain.com`).

See [RPC_API.md](../RPC_API.md) for full CORS and RPC configuration details.

## Setup

Copy `.env` and fill in your node connection details:

```ini
VITE_RPC_USER=yourusername
VITE_RPC_PASS=yourpassword
VITE_RPC_HOST=127.0.0.1
VITE_RPC_PORT=8332
VITE_RPC_PROTOCOL=http
```

Use `https` for `VITE_RPC_PROTOCOL` when your node is behind a TLS-terminating reverse proxy.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs to `dist/`. Serve with any static file server.
