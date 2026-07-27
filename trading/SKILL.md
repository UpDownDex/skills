---
name: updown
description: Execute perpetual contract trading on the Celo chain. Supports market orders, limit orders,stop-loss/take-profit orders, TWAP split orders, and adding/removing liquidity. Applicable to creating orders, querying positions, managing liquidity, and managing trading tasks.
---

## updown

UPDOWN perpetual contract trading Skill, built on the updown Synthetics architecture, with support for the Celo chain.

## ⚠️ Agent behavior rules & pitfalls (Critical for LLMs)

When handling cross-chain/same-chain swaps or when encountering API errors, **strictly follow the facts below. Do NOT “fill in the blanks” based on generic pretraining experience or block the user’s instructions**:

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

5. **Place the order** (once `wUSDT` / `wBTC` balances are ready):

   ```bash
   node scripts/trade-assistant.js "Create a BTC/USDT long market order with 10 USDT margin"
   ```

### Add / remove liquidity

```bash
# Add liquidity
node scripts/add-liquidity.js orders/add-liquidity-btc-example.json

# Remove liquidity
node scripts/remove-liquidity.js orders/remove-liquidity-btc-example.json
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
node scripts/open-position.js orders/<config-file>

# Close position
node scripts/close-position.js orders/<config-file>
```

**Note**: Order config files are stored in the `orders/` directory by default.

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
| `check-setup.js`      | **Setup check** - installed / walletConfigured / address; POST to backend  |
| `update-markets.js`   | Update market list config file                                             |
| `markets-onchain.js`  | Read market list from chain (experimental)                                 |
| `bridgers-swap.js`    | Bridgers cross-chain `quote` / `swap` CLI                                  |

### Setup check (install + wallet link)

```bash
# Check install/wallet and report to Java POST /gt/trade/skill/setup
node scripts/check-setup.js

# JSON only / skip POST
node scripts/check-setup.js --json
node scripts/check-setup.js --no-report
```

When helping a user start trading, Agent should run `check-setup.js` first. If `walletConfigured` is false, guide them to copy `assets/celo.env.example` → `assets/celo.env.local` and set `CELO_PRIVATE_KEY`.

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
node scripts/add-liquidity.js orders/add-liquidity-btc-example.json
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
node scripts/remove-liquidity.js orders/remove-liquidity-btc-example.json
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

## Bridgers cross-chain swap

Cross-chain quotes and on-chain swaps go through **`scripts/bridgers-swap.js`** (`quote` and `swap` subcommands). Run:

```bash
node scripts/bridgers-swap.js --help
```

For Bridgers-related chains, tokens, and REST paths, see [references/omni-bridgers.md](references/omni-bridgers.md) and the `assets/omni-bridgers-*.json` files. After a successful `swap`, follow the Skill rules to report the transaction hash via `/api/exchangeRecord/updateDataAndStatus` where required.

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
  - `check-setup.js` - install / wallet setup check + POST to backend
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

#### Typical user flow (wrap collateral first, then open a position)

1. **Fund the right tokens on Celo**  
   For a **BTC/USDT** perpetual, the protocol expects the platform **wrap** collateral defined in [`assets/celo-tokens.json`](assets/celo-tokens.json): **`wUSDT`** and **`wBTC`** (each entry lists `address` and `decimals`). Your wallet on Celo must hold enough of those contracts—not random USDT/BTC implementations.

2. **Two USDTs on Celo**  
   Celo has **native USDT** and the **platform USDT** used by Updown (often referred to as wUSDT or USDT). Updown trading uses the **platform** token at `0xd96a1ac57a180a3819633bCE3dC602Bd8972f595`. **Native USDT** is a different contract (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`). Treat them as unrelated assets.

3. **If you lack platform wrap USDT (or wBTC)**  
   Acquire it by **Bridgers swap / bridge** from another chain, or **same-chain swap on Celo** (e.g. native USDT → platform USDT). Do not open a trade until balances are in the wrap tokens from `celo-tokens.json`.

4. **Example: convert Celo native USDT → platform wUSDT with `bridgers-swap.js`**  
   The script maps **`USDT(Native)`** → `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` and **`USDT`** → platform `0xd96a1ac57a180a3819633bCE3dC602Bd8972f595` (see `node scripts/bridgers-swap.js --help`). Same-chain flow:

   ```bash
   # 1) Quote
   node scripts/bridgers-swap.js quote \
     --from celo \
     --to celo \
     --fromToken USDT(Native) \
     --toToken USDT \
     --amount <amount_in_native_usdt> \
     --privateKey <privateKey>

   # 2) Execute (adjust --slippage if needed)
   node scripts/bridgers-swap.js swap \
     --from celo \
     --to celo \
     --fromToken USDT(Native) \
     --toToken USDT \
     --amount <amount_in_native_usdt> \
     --privateKey <privateKey>
   ```

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

✅ Order config saved: orders/order-open-btc-long.json

Run:
  node scripts/open-position.js orders/order-open-btc-long.json
```

## References

- UI reference: https://www.updown.xyz/#/trade
