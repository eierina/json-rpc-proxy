# RPC Proxy

A simple RPC proxy server that transparently forwards JSON-RPC requests to an Ethereum RPC provider while handling block range limitations for filter calls.

## Features

- Proxies JSON-RPC requests from `http://localhost:PORT` to `https://some.rpc.provider.com`
- Automatically batches filter calls (like `eth_getLogs`) that exceed a maximum block range (default: 10000 blocks)
- Supports both single RPC calls and batch requests

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure the `.env` file:
   ```
   RPC_PROVIDER_URL=https://your.rpc.provider.com
   RPC_PORT=8545
   RPC_HOST=localhost
   MAX_BLOCK_RANGE=10000
   ```

## Usage

Start the proxy server:

```
npm start
```

The proxy will start on the configured port (default: 8545).

### Single RPC calls

Send your RPC requests to `http://localhost:8545` the same way you would to your provider:

```
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"fromBlock":"0x0","toBlock":"0x100000"}],"id":1}' http://localhost:8545
```

### Batch RPC calls

For batch requests, send an array of RPC calls to the `/batch` endpoint:

```
curl -X POST -H "Content-Type: application/json" --data '[{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"fromBlock":"0x0","toBlock":"0x100000"}],"id":1}, {"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":2}]' http://localhost:8545/batch
```

## How it works

When a filter call exceeds the configured maximum block range:

1. The proxy splits the request into smaller chunks (e.g., 50,000 blocks each)
2. Executes each chunk separately
3. Combines the results
4. Returns the combined result to the client

All other RPC calls are passed through directly to the provider.