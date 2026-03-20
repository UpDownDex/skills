---
name: updown
description: Execute perpetual contract trading on the Celo chain. Supports market orders, limit orders,stop-loss / take-profit orders, TWAP split orders, and adding/removing liquidity. Applicable to creating orders, querying positions, managing liquidity, and managing trading tasks.
---

## updown

UPDOWN perpetual contract trading Skill, built on the updown Synthetics architecture, with support for the Celo chain.

## ⚠️ Agent behavior rules & pitfalls (Critical for LLMs)

When handling cross-chain / same-chain swaps or when encountering API errors, **strictly follow the facts below. Do NOT “fill in the blanks” based on generic pretraining experience or block the user’s instructions**:

1. **The token contract address is the only identifier, not the name!**

   - Even if two tokens are both named `USDT`, as long as their **contract addresses differ**
     (for example, one is a bridged version `0xd96a...` and the other is native USDT(Native)
     `0x4806...`), they are **two different assets** on-chain.
   - **Swapping same-name tokens on the same chain (e.g. Celo USDT -> Celo USDT(Native)) is
     absolutely feasible and a very common DeFi need.** Do NOT tell users “same currency cannot
     be exchanged”, “has no real value”, or refuse to execute.

2. **The real reason behind the API error `Same currency cannot be exchanged`**

   - This error is **NOT** because “the protocol does not support USDT to USDT(Native)”.
   - The real reason is: a **parameter assembly bug** caused the `fromTokenAddress` and
     `toTokenAddress` you sent to the Bridgers API to become **exactly the same** contract address.
   - **Solution**: Inspect the name-matching logic in the code to ensure that symbols like
     `USDT(Native)` (with parentheses or special casing) are correctly mapped to **different
     contract addresses**.
   - **Path**: for native tokens, please look them up in `assets/omni-bridgers-tokens.json`.

3. **The real reason behind the API error `Service Internal Error (999)`**

   - This is usually due to missing implicit parameters that Bridgers strictly validates.
   - **Must include**: `sourceType: "H5"`, `sourceFlag: "perpex01"`, and `equipmentNo` must be
     filled with the user’s real wallet address, not left empty. Otherwise the API will reject it.

4. **Cross-chain / swap operations must upload the tx hash**
   - After the on-chain `swap` transaction is successfully mined,
     you **must** call `/api/exchangeRecord/updateDataAndStatus` to send `tx.hash` back
     to the server.
   - If you don’t send it back, the remote side cannot reconcile in time and user funds
     may get stuck.

## Features

- ✅ **Market orders (Market)** - execute immediately
- ✅ **Limit orders (Limit)** - execute when price reaches the specified level
- ✅ **Stop-loss / take-profit (Stop Loss / Take Profit)** - automatically execute when price is triggered
- ✅ **TWAP split orders** - split large orders into smaller ones; use multicall, single tx hash
- ✅ **Add / remove liquidity** - deposit long/short tokens to receive market tokens, or redeem them
- ✅ **Position query** - view position state in real time
- ✅ **Market browsing** - view all available trading pairs
- ✅ **Omni Bridge cross-chain deposit/withdrawal** - via Omni Bridge, move assets into/out of Celo
- ✅ **Bridgers cross-chain swap** - cross-chain token swaps via Bridgers (e.g. Arbitrum USDC → Celo USDT)

## Quick start

### Method 1: Trading assistant (recommended)

The trading assistant supports natural language input and automatically parses and generates orders:

```bash
# Show help
node scripts/trade-assistant.js

# Open position with market order
node scripts/trade-assistant.js "Create a BTC/USDT long market order with 10 USDT margin and 2x leverage"

# Open position with limit order
node scripts/trade-assistant.js "Open a short ETH position with a limit price of 3500 and 5 USDT margin"

# Close position
node scripts/trade-assistant.js "Close my BTC/USDT long position"

# Stop-loss / take-profit
node scripts/trade-assistant.js "Set stop-loss for BTC long position, trigger price 60000"
node scripts/trade-assistant.js "Set take-profit for ETH short position, trigger price 4000"

# Queries
node scripts/trade-assistant.js "Show my positions"
node scripts/trade-assistant.js "Check my balance"
```

### Add / remove liquidity

```bash
# Add liquidity
node scripts/add-liquidity.js assets/orders/add-liquidity-btc-example.json

# Remove liquidity
node scripts/remove-liquidity.js assets/orders/remove-liquidity-btc-example.json
```

You must configure `DepositVault`, `WithdrawalVault`, and `WNT` in `assets/addresses.json`.
See [references/liquidity-deposit-withdrawal.md](references/liquidity-deposit-withdrawal.md).

### Method 2: Use the CLI tool

#### 1. View available markets

```bash
node scripts/trade-cli.js markets
```

**Note**: The market list is read from config files by default. To update it, run:

```bash
# Try updating the market list from chain
node scripts/update-markets.js

# Or view markets directly on-chain (experimental)
node scripts/markets-onchain.js
```

#### 2. View order types

```bash
node scripts/trade-cli.js order-types
```

#### 3. Generate order templates

```bash
# Market order template (open position)
node scripts/trade-cli.js template MarketIncrease

# Limit order template (open position)
node scripts/trade-cli.js template LimitIncrease

# Stop-loss template (close position)
node scripts/trade-cli.js template StopLossDecrease

# Take-profit template (close position)
node scripts/trade-cli.js template TakeProfitDecrease
```

#### 4. Execute trades

```bash
# Open position
node scripts/open-position.js assets/orders/<config-file>

# Close position
node scripts/close-position.js assets/orders/<config-file>
```

**Note**: Order config files are stored in the `assets/orders/` directory by default.

#### 5. Query positions

```bash
# Query positions
node scripts/query.js positions

# Query balance
node scripts/query.js balance
```

## Order types in detail

### Opening orders (Increase Position)

| Type               | OrderType | Description                                                   |
| ------------------ | --------- | ------------------------------------------------------------- |
| MarketIncrease     | 2         | Market order to open a position; executes at current price    |
| LimitIncrease      | 3         | Limit order to open; executes when price reaches triggerPrice |
| TwapMarketIncrease | 3         | TWAP market open; splits a large order into multiple parts    |
| StopIncrease       | 8         | Market stop order                                             |

### Closing orders (Decrease Position)

| Type               | OrderType | Description                                                                  |
| ------------------ | --------- | ---------------------------------------------------------------------------- |
| MarketDecrease     | 4         | Market order to close; executes immediately at current price                 |
| LimitDecrease      | 5         | Limit order to close; executes when price reaches triggerPrice               |
| StopLossDecrease   | 6         | Stop-loss close; automatically executes when price falls to triggerPrice     |
| TakeProfitDecrease | 5         | Take-profit close; automatically executes when price rises to triggerPrice   |
| TwapMarketDecrease | 5         | TWAP close; splits a large order into multiple parts, multicall, one tx hash |

## Order configuration parameters

### Basic parameters

```json
{
  "market": "0x...", // Market address (required)
  "indexToken": "0x...", // Index token address (required)
  "initialCollateralToken": "0x...", // Collateral token (required)
  "isLong": true, // Long position or not (required)
  "orderType": 0, // Order type (required)
  "sizeDeltaUsdHuman": 100, // Position size (USD)
  "initialCollateralDeltaAmountHuman": 100 // Collateral amount
}
```

### Limit / stop parameters

```json
{
  "triggerPriceHuman": 70000, // Trigger price (for limit/stop orders)
  "acceptablePriceHuman": 70500 // Acceptable price (slippage protection)
}
```

### TWAP parameters

```json
{
  "twapInterval": 300, // Interval between each part (seconds)
  "twapParts": 5 // Number of parts to split into
}
```

### Close-position-specific parameters

```json
{
  "closePercent": 100 // Close percentage (1-100)
}
```

## Price calculation rules

- **Open long position**: acceptablePrice = oraclePrice × 1.03 (+3%)
- **Open short position**: acceptablePrice = oraclePrice × 0.97 (-3%)
- **Close long position**: acceptablePrice = oraclePrice × 0.97 (-3%)
- **Close short position**: acceptablePrice = oraclePrice × 1.03 (+3%)

## Execution fee

- Default executionFee: **0.2 CELO**
- Can be customized via `executionFeeHuman` in the order config

## Script list

| Script                | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `trade-assistant.js`  | **Trading assistant** - natural language orders, auto-generate configs     |
| `trade-cli.js`        | CLI tool (market query, template generation, parameter explanations)       |
| `open-position.js`    | Open position script (supports all order types)                            |
| `close-position.js`   | Close position script (supports all close types)                           |
| `add-liquidity.js`    | **Add liquidity** - after approval, multicall to deposit long/short tokens |
| `remove-liquidity.js` | **Remove liquidity** - after approval, multicall to redeem market tokens   |
| `query.js`            | Query tool (positions, balance)                                            |
| `update-markets.js`   | Update market list config file                                             |
| `markets-onchain.js`  | Read market list from chain (experimental)                                 |
| `omni-bridge-tx.js`   | Send Omni Bridge cross-chain tx (generic deposit/withdraw TX sender)       |

## Add / remove liquidity

Providing liquidity to a market yields market tokens (LP tokens). Redeeming market tokens returns long/short tokens. The process follows the contracts: **first approve tokens to the Router, then use ExchangeRouter.multicall** to send `sendTokens` + `createDeposit` or `sendTokens` + `createWithdrawal` in a single transaction.

**Pre-configuration**: in `assets/addresses.json`, under `celo`, configure:

- `DepositVault` - deposit contract address
- `WithdrawalVault` - withdrawal contract address
- `WNT` - execution-fee token address (usually wrapped native token on Celo)

For full details see [references/liquidity-deposit-withdrawal.md](references/liquidity-deposit-withdrawal.md).

### Add liquidity (add-liquidity)

Deposit long tokens and short tokens to receive market tokens (LP tokens). After the keeper executes, market tokens are sent to `receiver`.

```bash
node scripts/add-liquidity.js assets/orders/add-liquidity-btc-example.json
```

| Field                          | Description                                           |
| ------------------------------ | ----------------------------------------------------- |
| `marketSymbol` or `market`     | Market identifier, e.g. `"BTC"` or market address     |
| `initialLongTokenAmountHuman`  | Long token amount (human-readable)                    |
| `initialShortTokenAmountHuman` | Short token amount (human-readable)                   |
| `executionFeeHuman`            | Execution fee (default 0.2)                           |
| `receiver`                     | Address to receive market tokens (defaults to wallet) |

### Remove liquidity (remove-liquidity)

Burn market tokens to retrieve long/short tokens. After the keeper executes, long and short tokens are sent to `receiver`.

```bash
node scripts/remove-liquidity.js assets/orders/remove-liquidity-btc-example.json
```

| Field                      | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `marketSymbol` or `market` | Market identifier                                         |
| `marketTokenAmountHuman`   | Amount of market tokens to redeem                         |
| `executionFeeHuman`        | Execution fee (default 0.2)                               |
| `receiver`                 | Address to receive long/short tokens (defaults to wallet) |

### Liquidity flow

1. **Add**: user approves → multicall(sendTokens × 3 + createDeposit) → keeper executes → receive market tokens
2. **Remove**: user approves → multicall(sendTokens × 2 + createWithdrawal) → keeper executes → receive long/short tokens

## Omni Bridge cross-chain deposit / withdrawal

This section documents the cross-chain deposit / withdrawal flow based on Omni Bridge. It provides **command-line level instructions and a generic TX sending script**. The script can run independently and does not depend on any specific frontend project.

### 1. Concepts and use cases

- **Omni Bridge**: Cross-chain bridge infrastructure used to transfer representations of the same asset between chains (e.g. from Ethereum to Celo).
- **Role of this Skill**:
  - Does not reimplement complex frontend quoting, route selection, or fee estimation logic in this repo;
  - Only provides a **TX sender based on transaction data generated by a frontend/backend**, so you can perform the same cross-chain action from a pure CLI environment.

Typical scenarios:

- You obtain the parameters of an Omni Bridge transaction (`to`, `data`, `value`, etc.) from any frontend or its backend API and want to execute it directly on a server / terminal;
- You already have a stable routing service to **generate** bridge transactions, and only need a reliable “sign and broadcast” script.

### 2. Reference frontend-level flow

The typical frontend user flow (for understanding only) is:

1. **Select source and destination chains** (for example: Ethereum → Celo).
2. **Select deposit/withdraw asset and amount**:
   - Choose the token to send from the source chain (`fromToken`);
   - Choose the token to receive on the destination chain (`toToken`);
   - Enter the amount; the frontend uses `bridgersFetcher` or similar APIs to get quotes and min/max amounts.
3. **Check balance and allowance**:
   - The frontend checks current token balance;
   - For ERC20 tokens, it checks allowance; if insufficient, it sends an Approve transaction first.
4. **Generate Omni Bridge transaction data**:
   - The frontend calls the routing service and obtains the on-chain transaction details:
     - `to`: Omni Bridge or aggregator contract address
     - `data`: call data (ABI-encoded)
     - `value`: value of native asset to send, if any
5. **Send on-chain transaction**:
   - The frontend sends the transaction via a wallet (e.g. MetaMask).
6. **Wait for cross-chain completion**:
   - Listen for confirmation of the source chain transaction;
   - After bridging completes, check balance or records on the destination chain.

### 3. Sending Omni Bridge transactions via script in this Skill

This repo provides `scripts/omni-bridge-tx.js` to **send any Omni Bridge-related transaction from the command line** (no matter whether it’s “cross-chain deposit” or “cross-chain withdrawal”, as long as you already have `to` / `data` / `value`).

#### 3.1 Environment configuration

Reuse the existing Celo config file in this repo:

- In `assets/celo.env.local`, configure:

```bash
CELO_RPC_URL=your_CELO_RPC_url
CELO_PRIVATE_KEY=your_wallet_private_key
CELO_CHAIN_ID=42220 # or the corresponding Celo chain ID
```

> Note: if you want to send Omni Bridge transactions on another chain, temporarily change the above environment variables to that chain’s RPC/private key/ChainId. The script itself only depends on the RPC and is not tightly bound to Celo.

#### 3.2 Usage: generic TX sender

The CLI format is:

```bash
node scripts/omni-bridge-tx.js \
  --to 0xBridgeOrRouterAddress \
  --data 0xYourCalldataHere \
  --value 0 \
  --gasLimit 600000
```

- **Required parameters**
  - `--to`: transaction recipient address (typically the Omni Bridge/router contract)
  - `--data`: ABI-encoded call data
- **Optional parameters**
  - `--value`: amount of native token to send (string, in ETH/CELO units, e.g. `0` or `0.1`)
  - `--gasLimit`: custom gas limit (defaults to `ethers` estimate)

Internally, the script:

1. Reads `CELO_RPC_URL`, `CELO_PRIVATE_KEY`, `CELO_CHAIN_ID` from `assets/celo.env.local`;
2. Creates a Provider and Wallet via `ethers`;
3. Constructs and sends the transaction using the provided `to`, `data`, and `value`;
4. Prints:
   - The sending wallet address
   - The transaction hash
   - Block number and gas usage once confirmed

#### 3.3 Using frontend-generated transaction data

When debugging with any frontend that integrates Omni Bridge routing, you usually obtain tx parameters from:

- Intercepting wallet calls in the browser devtools;
- Or using the `tx` data returned by the project’s routing/bridge API (e.g. `{ to, data, value }`).

Once you have these fields, plug them directly into the script, for example:

```bash
node scripts/omni-bridge-tx.js \
  --to 0xYourOmniBridgeAddress \
  --data 0xabcdef1234... \
  --value 0.05
```

Semantically, this transaction can be:

- **Cross-chain deposit**: deposit assets from the current chain into Omni Bridge and wait to receive tokens on the destination chain;
- **Cross-chain withdrawal**: withdraw assets from a bridge contract to the current or another chain.

The script itself does not distinguish “deposit” from “withdrawal”; it only **reliably signs and broadcasts the bridge transaction you have constructed**.

#### 3.4 End-to-end example using Bridgers REST API

A typical cross-chain call can be executed by an HTTP client (in the style of `bridgersFetcher`) calling `https://api.bridgers.xyz`. The core flow is:

1. The frontend constructs `params` (see `submitHandle` in `DepositView.tsx` / `WithdrawalView.tsx`):
   - `equipmentNo` / `fromAddress` / `toAddress`: user address
   - `fromTokenAddress` / `toTokenAddress`: source/destination token addresses (use placeholder `0xeeee...` for native tokens)
   - `fromTokenChain` / `toTokenChain`: chain identifiers (e.g. `ETH`, `CELO`, taken from token config `mainNetwork`)
   - `fromTokenAmount`: amount on the source chain (on-chain precision or API format)
   - `amountOutMin`: minimum acceptable output
   - `fromCoinCode` / `toCoinCode`: token symbols (e.g. `USDT`, `USDC`)
2. The frontend calls `bridgersFetcher.fetchSwapCall(params)`:

```ts
// Pseudocode example: bridgersFetcher
export class bridgersFetcher {
  fetchSwapCall(params) {
    return fetch(buildUrl('https://api.bridgers.xyz', '/api/sswap/swap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then((res) => res.json())
  }
}
```

3. On success, the response structure contains `data.txData`:

```ts
// Typical snippet from DepositView / WithdrawalView
const calldata = await bridgers.fetchSwapCall(params)
if (calldata.resCode === 100) {
  const txData = calldata.data.txData
  // txData structure roughly:
  // {
  //   to:   "0x...", // target bridge/router contract address
  //   data: "0x...", // ABI-encoded calldata
  //   value:"0x..."  // optional, hex string amount
  // }
}
```

In the browser, the frontend hands `txData` directly to the wallet for signing and sending. In this Skill, you can perform the same operation on the server in two steps:

##### 3.4.1 Step one: obtain `txData` via REST API

**Option A: use `curl` directly against Bridgers API**

```bash
curl -X POST "https://api.bridgers.xyz/api/sswap/swap" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentNo": "0xYourAddress",
    "sourceType": "H5",
    "userNo": "",
    "sessionUuid": "",
    "orderId": "",
    "sourceFlag": "perpex01",
    "utmSource": "",
    "fromTokenAddress": "0xFromTokenAddress",
    "toTokenAddress":   "0xToTokenAddress",
    "fromAddress": "0xYourAddress",
    "toAddress":   "0xYourAddress",
    "fromTokenChain": "ETH",
    "toTokenChain":   "CELO",
    "fromTokenAmount": "1000000",
    "amountOutMin": "990000",
    "fromCoinCode": "USDT",
    "toCoinCode":   "USDT"
  }'
```

The important fields in the JSON response are:

```json
{
  "resCode": 100,
  "data": {
    "txData": {
      "to": "0xBridgeOrRouterAddress",
      "data": "0xabcdef...",
      "value": "0x0"
    },
    "orderId": "xxx",
    "operation": "deposit" // or "withdrawal"
  }
}
```

You can save `txData` to a local file, for example:

```bash
curl ... > bridgers-tx.json
```

**Option B: reuse `bridgersFetcher` logic in Node.js**

If you want to call it directly from a backend script, you can use the same request structure in a standalone Node script (e.g. `scripts/fetch-bridgers-tx.js`):

```js
const fetch = require('node-fetch')
async function main() {
  const params = {
    equipmentNo: '0xYourAddress',
    sourceType: 'H5',
    userNo: '',
    sessionUuid: '',
    orderId: '',
    sourceFlag: 'perpex01',
    utmSource: '',
    fromTokenAddress: '0xFromTokenAddress',
    toTokenAddress: '0xToTokenAddress',
    fromAddress: '0xYourAddress',
    toAddress: '0xYourAddress',
    fromTokenChain: 'ETH',
    toTokenChain: 'CELO',
    fromTokenAmount: '1000000',
    amountOutMin: '990000',
    fromCoinCode: 'USDT',
    toCoinCode: 'USDT',
  }

  const res = await fetch('https://api.bridgers.xyz/api/sswap/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  const json = await res.json()
  if (json.resCode !== 100) {
    throw new Error(`bridgers error: ${json.resCode} ${json.resMsg || ''}`)
  }

  const txData = json.data.txData
  console.log('to:', txData.to)
  console.log('data:', txData.data)
  console.log('value:', txData.value)
}

main().catch(console.error)
```

##### 3.4.2 Step two: pass `txData` to `omni-bridge-tx.js`

After obtaining `txData`, call the TX sending script provided by this Skill:

```bash
node scripts/omni-bridge-tx.js \
  --to   "$(jq -r '.data.txData.to'   bridgers-tx.json)" \
  --data "$(jq -r '.data.txData.data' bridgers-tx.json)" \
  --value "0"  # If txData.value is non-zero, put the corresponding ETH/CELO amount here
```

Notes:

- `txData.value` is usually a hex string (Wei). The `--value` parameter of `omni-bridge-tx.js` uses human-readable units and parses them with `parseEther`. If you need to match `txData.value` exactly, you can:
  - Modify `omni-bridge-tx.js` to support hex strings directly; or
  - Convert hex Wei to ETH/CELO in an external script, then pass the result to `--value`.

This gives you a **fully frontend-independent end-to-end flow**:

1. Use the Bridgers REST API to generate a cross-chain bridge transaction (`/api/sswap/swap` → `txData`);
2. Use this repo’s `omni-bridge-tx.js` to sign and send the Omni Bridge deposit/withdrawal transaction from the CLI;
3. Optionally integrate `bridgers.updateDataAndStatus` or `fetchTransData` APIs on the server to sync order status.

#### 3.5 Security and caveats

- When storing a private key in `assets/celo.env.local`, ensure the file is **never committed to version control** and has restricted read permissions on the server.
- Before execution, always verify:
  - `--to` address is correct;
  - `--data` comes from a trusted frontend/backend service;
  - `--value` is within an acceptable risk amount.
- If unsure, test with a very small amount (e.g. 0.001).

#### 3.6 Omni Bridgers related config files (chains & tokens & API)

See [references/omni-bridgers.md](references/omni-bridgers.md).

## Trade output example

After a successful open-position transaction:

```
=== Transaction submitted ===
createOrder txHash: 0x...
Transaction link: https://celoscan.io/tx/0x...

=== Transaction confirmed ===
status: ✅ success
blockNumber: 61500000
gasUsed: 850000

=== OrderCreated event ===
orderKey: 0x...
orderType: 0
account: 0x...

Note: the order has been created and is waiting for the keeper to execute...
After execution is complete, you can query positions to view the position status
```

## Examples

### Open BTC long with market order

```json
{
  "market": "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771",
  "indexToken": "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C",
  "initialCollateralToken": "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
  "isLong": true,
  "orderType": 2,
  "sizeDeltaUsdHuman": 100,
  "initialCollateralDeltaAmountHuman": 100
}
```

### Open BTC long with limit order (executes when price reaches \$70,000)

```json
{
  "market": "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771",
  "indexToken": "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C",
  "initialCollateralToken": "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
  "isLong": true,
  "orderType": 3,
  "sizeDeltaUsdHuman": 100,
  "initialCollateralDeltaAmountHuman": 100,
  "triggerPriceHuman": 70000,
  "acceptablePriceHuman": 70500
}
```

### Set stop-loss (auto-close BTC when price drops to \$65,000)

```json
{
  "market": "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771",
  "indexToken": "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C",
  "isLong": true,
  "orderType": 6,
  "closePercent": 100,
  "triggerPriceHuman": 65000,
  "acceptablePriceHuman": 64500
}
```

### Set take-profit (auto-close BTC when price rises to \$80,000)

```json
{
  "market": "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771",
  "indexToken": "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C",
  "isLong": true,
  "orderType": 5,
  "closePercent": 100,
  "triggerPriceHuman": 80000,
  "acceptablePriceHuman": 79500
}
```

## Trading flow

1. **User creates order** → call `createOrder` to submit the order
2. **Keeper listens** → off-chain keeper listens for order events
3. **Keeper executes** → provides prices and executes the order
4. **Order completes** → position is updated and funds change

## Notes

- Ensure the wallet has enough CELO to pay gas and executionFee
- Ensure sufficient collateral token balance
- Limit/stop orders may need to wait for keeper execution
- TWAP orders are executed as multiple transactions

## Resource navigation

- **Scripts**: `scripts/`

  - `trade-assistant.js` - trading assistant (natural language orders)
  - `trade-cli.js` - CLI tool
  - `open-position.js` - open position script
  - `close-position.js` - close position script
  - `add-liquidity.js` - add liquidity
  - `remove-liquidity.js` - remove liquidity
  - `query.js` - query tool
  - `update-markets.js` - update market list

- **Reference docs**: `references/`

  - [liquidity-deposit-withdrawal.md](references/liquidity-deposit-withdrawal.md) - add/remove liquidity details
  - [setup.md](references/setup.md) - environment and dependencies
  - [createOrder-updateOrder-cancleOrder.md](references/createOrder-updateOrder-cancleOrder.md) - order contract reference

- **Config**: `assets/`
  - `addresses.json` - contract addresses (ExchangeRouter, DepositVault, WithdrawalVault, WNT)
  - `markets.json` - market config
  - `celo-tokens.json` - token decimals
  - `celo.env.local` - environment variables (RPC, private key)
  - `abis/` - contract ABIs
  - `orders/` - order and liquidity config directory

## Trading assistant (trade-assistant.js)

The trading assistant is the UPDOWN Skill’s intelligent order-placement tool. It supports natural language parsing to simplify trading.

### Usage

```bash
node scripts/trade-assistant.js "your trading instruction"
```

### Supported command formats

#### Open-position orders

| Command example                                               | Description      |
| ------------------------------------------------------------- | ---------------- |
| `Create a BTC/USDT long market order with 10 USDT margin, 2x` | Market long BTC  |
| `Market short ETH/USDT with 5 USDT margin`                    | Market short ETH |
| `Open BTC long with limit, trigger 65000, 10 USDT margin`     | Limit long       |
| `Open ETH short with limit, trigger 3500, 5 USDT margin`      | Limit short      |

#### Close-position orders

| Command example          | Description   |
| ------------------------ | ------------- |
| `Close BTC/USDT long`    | Market close  |
| `Market close ETH short` | Market close  |
| `Close 50% of BTC long`  | Partial close |

#### Stop-loss / take-profit

| Command example                               | Description |
| --------------------------------------------- | ----------- |
| `Set stop-loss for BTC long, trigger 60000`   | Stop-loss   |
| `Set take-profit for ETH short, trigger 4000` | Take-profit |

#### Query

| Command example     | Description          |
| ------------------- | -------------------- |
| `Show my positions` | Query all positions  |
| `Check my balance`  | Query wallet balance |

### Parameter parsing

The trading assistant automatically parses the following parameters:

- **Market pair**: BTC, ETH, CELO, EURm, JPYm, NGNm, AUDm, GBPm
- **Order type**: market / limit
- **Direction**: long / short (open long/open short/long/short)
- **Margin**: any amount (denominated in USDT/USD/U)
- **Leverage**: default 1x, can be specified (e.g. 2x, 5x, 10x)
- **Trigger price**: required for limit and stop orders

### Workflow

1. User inputs a natural-language instruction
2. Assistant parses and validates parameters
3. Automatically generates an order config file
4. Prints the execution command
5. User copies and runs the command to execute the trade

### Sample output

```
=== User input ===
Create a BTC/USDT long market order with 10 USDT margin, 2x leverage

=== Parsed result ===
{
  "action": "open",
  "market": "BTC",
  "orderType": "market",
  "isLong": true,
  "collateralUsd": 10,
  "leverage": 2
}

=== Generated order config ===
{
  "market": "0x...",
  "indexToken": "0x...",
  "isLong": true,
  "orderType": 2,
  "sizeDeltaUsdHuman": 20,
  "initialCollateralDeltaAmountHuman": 10,
  ...
}

✅ Order config saved: assets/orders/order-open-btc-long.json

Run:
  node scripts/open-position.js assets/orders/order-open-btc-long.json
```

## References

- UI reference: https://www.updown.xyz/#/trade
