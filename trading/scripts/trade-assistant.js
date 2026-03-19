const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
require('dotenv').config({
  path: path.resolve(__dirname, '../assets/celo.env.local'),
})

const addresses = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../assets/addresses.json'), 'utf8'),
)
const markets = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../assets/markets.json'), 'utf8'),
)
const tokenMeta = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../assets/celo-tokens.json'), 'utf8'),
)

// TWAP uiFeeReceiver helper functions (following SDK implementation)
const TWAP_VERSION = '01'
const TWAP_PREFIX = '0xff0000'
const MAX_UINT256 =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

function generateTwapId() {
  return Math.floor(Math.random() * 256 * 256)
    .toString(16)
    .padStart(4, '0')
}

function createTwapUiFeeReceiver(numberOfParts) {
  const twapId = generateTwapId()
  const numberOfPartsInHex = Number(numberOfParts).toString(16).padStart(2, '0')
  const buffer = '00'.repeat(12)
  const isExpressHex = '00'
  return `${TWAP_PREFIX}${buffer}${isExpressHex}${numberOfPartsInHex}${twapId}${TWAP_VERSION}`
}

// Import ABI (same as in open-position.js)
const chainlinkPriceFeedProviderAbi = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../assets/abis/ChainlinkPriceFeedProvider.json'),
    'utf8',
  ),
).abi

// Get token price using the same ChainlinkPriceFeedProvider as in open-position.js
// Price precision: 10^(30 - tokenDecimals)
async function getTokenPrice(tokenSymbol, provider) {
  try {
    // Find token address and decimals
    const tokenInfo = Object.entries(tokenMeta).find(
      ([symbol, info]) => symbol.toUpperCase() === tokenSymbol.toUpperCase(),
    )
    if (!tokenInfo) {
      console.log(`Token not found: ${tokenSymbol}`)
      return null
    }

    const tokenAddress = tokenInfo[1].address
    const tokenDecimals = tokenInfo[1].decimals

    // Use ChainlinkPriceFeedProvider to get price (same as in open-position.js)
    const chainlinkPriceFeedProvider = new ethers.Contract(
      addresses.celo.ChainlinkPriceFeedProvider,
      chainlinkPriceFeedProviderAbi,
      provider,
    )

    const result = await chainlinkPriceFeedProvider.getOraclePrice(
      tokenAddress,
      '0x',
    )
    const mid = result.min.add(result.max).div(2)

    // Price precision: 10^(30 - tokenDecimals)
    const priceDecimals = 30 - tokenDecimals
    const priceInUsd = ethers.utils.formatUnits(mid, priceDecimals)

    console.log(`   Price from ChainlinkPriceFeedProvider for ${tokenSymbol}:`)
    console.log(`     tokenDecimals:  ${tokenDecimals}`)
    console.log(`     priceDecimals:  ${priceDecimals}`)
    console.log(
      `     min:            ${ethers.utils.formatUnits(
        result.min,
        priceDecimals,
      )}`,
    )
    console.log(
      `     max:            ${ethers.utils.formatUnits(
        result.max,
        priceDecimals,
      )}`,
    )
    console.log(`     mid (average):  ${priceInUsd} USD`)

    return parseFloat(priceInUsd)
  } catch (err) {
    console.log(`Failed to fetch price: ${err.message}`)
    return null
  }
}

// Help message
const HELP_MESSAGE = `
=== UPDOWN Trade Assistant ===

You can place orders like this:

[Market open]
  "Create a BTC/USDT long market order with 10 USDT margin, 2x leverage"
  "Market short ETH/USDT with 5 USDT margin"

[Limit open]
  "Open BTC long with limit, trigger 65000, 10 USDT margin"
  "Open ETH short with limit, trigger 3500, 5 USDT margin"

[Close]
  "Close BTC/USDT long position"
  "Market close ETH short position"

[Stop-loss / Take-profit]
  "Set stop-loss for BTC long, trigger 60000"
  "Set take-profit for ETH short, trigger 4000"

[Query]
  "Show my positions"
  "Check my balance"

Parameters:
  - Markets: BTC/USDT, ETH/USDT, CELO/USDT, EURm/USDT, JPYm/USDT, NGNm/USDT
  - Order type: market / limit / stop-loss / take-profit
  - Direction: long or short
  - Margin: any amount (requires sufficient balance)
  - Leverage: default 1x, configurable
`

// Parse user input
function parseUserInput(input) {
  const result = {
    action: null, // 'open', 'close', 'stopLoss', 'takeProfit', 'query'
    market: null, // 'BTC', 'ETH', etc.
    orderType: null, // 'market', 'limit', 'stopLoss', 'takeProfit'
    isLong: null, // true/false
    sizeUsd: null, // position size
    collateralUsd: null, // margin
    leverage: 1, // leverage
    triggerPrice: null, // trigger price
    closePercent: 100, // close percentage
  }

  const inputLower = input.toLowerCase()

  // Detect query actions
  if (
    inputLower.includes('query') ||
    inputLower.includes('show') ||
    inputLower.includes('positions') ||
    inputLower.includes('balance')
  ) {
    result.action = 'query'
    if (inputLower.includes('balance')) {
      result.queryType = 'balance'
    } else {
      result.queryType = 'positions'
    }
    return result
  }

  // Detect close actions
  if (
    inputLower.includes('close')
  ) {
    result.action = 'close'

    // Detect close order type
    if (inputLower.includes('market')) {
      result.orderType = 'market'
    } else if (inputLower.includes('limit')) {
      result.orderType = 'limit'
    } else {
      result.orderType = 'market' // default market close
    }

    // Detect close percentage
    const percentMatch = input.match(/(\d+)%/)
    if (percentMatch) {
      result.closePercent = parseInt(percentMatch[1])
    }
  } else if (inputLower.includes('stop market')) {
    // Stop-market open (StopIncrease)
    result.action = 'open'
    result.orderType = 'stopMarket'

    // Detect trigger price
    const triggerPriceMatch = input.match(
      /(?:trigger|price)\s*[:=]?\s*(\d+\.?\d*)/i,
    )
    if (triggerPriceMatch) {
      result.triggerPrice = parseFloat(triggerPriceMatch[1])
    }
  } else if (inputLower.includes('stop-loss') || inputLower.includes('stop loss')) {
    result.action = 'stopLoss'
    result.orderType = 'stopLoss'

    // Detect collateral token symbol for position selection
    const collateralMatch = input.match(
      /(CELO|USDT|BTC|ETH)\s*(?:collateral|margin)/i,
    )
    if (collateralMatch) {
      result.collateralTokenSymbol = collateralMatch[1].toUpperCase()
    }

    // Detect close percentage
    const percentMatch = input.match(/(\d+)%/)
    if (percentMatch) {
      result.closePercent = parseInt(percentMatch[1])
    }
  } else if (
    inputLower.includes('take-profit') ||
    inputLower.includes('take profit')
  ) {
    result.action = 'takeProfit'
    result.orderType = 'takeProfit'

    // Detect collateral token for position selection
    const collateralMatch = input.match(
      /(CELO|USDT|BTC|ETH)\s*(?:collateral|margin)/i,
    )
    if (collateralMatch) {
      result.collateralTokenSymbol = collateralMatch[1].toUpperCase()
    }

    // Detect close percentage
    const percentMatch = input.match(/(\d+)%/)
    if (percentMatch) {
      result.closePercent = parseInt(percentMatch[1])
    }
  } else if (inputLower.includes('twap')) {
    // TWAP split: decide open/close based on close-related keywords
    if (
      inputLower.includes('close')
    ) {
      result.action = 'close'
    } else {
      result.action = 'open'
    }
    result.orderType = 'twap'

    // Parse TWAP parameters (for configs only, not real submission)
    const twapPartsMatch = input.match(/(\d+)\s*(?:parts?|orders?)/i)
    if (twapPartsMatch) {
      result.twapParts = parseInt(twapPartsMatch[1])
    }

    const twapIntervalMatch = input.match(/(\d+)\s*(?:minutes?|mins?)/i)
    if (twapIntervalMatch) {
      result.twapInterval = parseInt(twapIntervalMatch[1]) * 60 // convert to seconds
    }
  } else {
    // Open action
    result.action = 'open'

    // Detect order type
    if (inputLower.includes('limit')) {
      result.orderType = 'limit'
    } else if (inputLower.includes('market')) {
      result.orderType = 'market'
    } else {
      result.orderType = 'market' // default market
    }
  }

  // Generic pattern: "X collateral" / "X margin"
  const genericCollateralMatch = input.match(
    /(CELO|USDT|BTC|ETH|EURm|JPYm|NGNm|AUDm|GBPm)\s*(?:collateral|margin)/i,
  )
  if (genericCollateralMatch) {
    result.collateralTokenSymbol = genericCollateralMatch[1].toUpperCase()
  }

  // Detect market symbol
  const marketMatch = input.match(/(BTC|ETH|CELO|EURm|JPYm|NGNm)/i)
  if (marketMatch) {
    result.market = marketMatch[1].toUpperCase()
  }

  // Detect direction
  if (
    inputLower.includes('long') ||
    inputLower.includes('buy')
  ) {
    result.isLong = true
  } else if (
    inputLower.includes('short') ||
    inputLower.includes('sell')
  ) {
    result.isLong = false
  }

  // Detect margin/size (supports USDT, BTC, ETH, etc.)
  // Pattern1: "1.5U", "1.5USDT", "1.5CELO"
  // Pattern2: "10U worth of CELO" - compute quantity from price
  const valueMatch = input.match(
    /(\d+(?:\.\d+)?)\s*(?:USDT|USD|U)\s*(?:worth\s+of)\s*(BTC|ETH|CELO|EURm|JPYm|NGNm|AUDm|GBPm)/i,
  )
  const amountMatch = input.match(
    /(\d+(?:\.\d+)?)\s*(?:USDT|USD|U|BTC|ETH|CELO|EURm|JPYm|NGNm|AUDm|GBPm)/i,
  )

  if (valueMatch) {
    // Pattern: "10U worth of CELO"
    result.collateralValueUsd = parseFloat(valueMatch[1])
    result.collateralTokenSymbol = valueMatch[2].toUpperCase()
  } else if (amountMatch) {
    const amount = parseFloat(amountMatch[1])
    if (result.action === 'open') {
      result.collateralUsd = amount
    } else {
      result.sizeUsd = amount
    }
  }

  // Detect leverage
  const leverageMatch = input.match(/(\d+)x/i)
  if (leverageMatch) {
    result.leverage = parseInt(leverageMatch[1])
  }

  // Detect trigger price
  const priceMatch = input.match(
    /(?:trigger|price)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
  )
  if (priceMatch) {
    result.triggerPrice = parseFloat(priceMatch[1])
  }

  return result
}

// Generate order config
async function generateOrderConfig(parsed, userInput, provider) {
  const marketInfo = markets.find((m) => m.indexTokenSymbol === parsed.market)
  if (!marketInfo) {
    throw new Error(`Market not found: ${parsed.market}/USDT`)
  }

  const config = {
    market: marketInfo.marketToken,
    indexToken: marketInfo.indexToken,
    isLong: parsed.isLong,
  }

  if (parsed.action === 'open') {
    // Open-position config
    // Payment token / collateral token parsing
    // Supported patterns:
    //  - "pay 1000 CELO, USDT as collateral"
    //  - "1000 CELO payment, USDT collateral"
    //  - "long with 10 USDT ..." (if collateral omitted, payment token is collateral)

    // 1. Payment symbol: parse from symbol after amount
    let paymentTokenSymbol = null
    const paymentMatch = userInput.match(
      /(\d+(?:\.\d+)?)\s*(USDT|USD|U|BTC|ETH|CELO|EURm|JPYm|NGNm|AUDm|GBPm)/i,
    )
    if (paymentMatch) {
      const matchedSymbol = paymentMatch[2].toUpperCase()
      paymentTokenSymbol =
        matchedSymbol === 'U' || matchedSymbol === 'USD'
          ? 'USDT'
          : matchedSymbol
    }

    // 2. Collateral symbol: prefer the one from "X collateral"
    let collateralTokenSymbol = parsed.collateralTokenSymbol || null

    // If user didn't explicitly specify collateral, default collateral = payment token
    if (!collateralTokenSymbol) {
      collateralTokenSymbol =
        paymentTokenSymbol ||
        (parsed.isLong ? marketInfo.indexTokenSymbol : 'USDT')
    }

    // If still no payment token, default payment = collateral
    if (!paymentTokenSymbol) {
      paymentTokenSymbol = collateralTokenSymbol
    }

    // Set final collateral token address
    const collateralTokenInfo = Object.entries(tokenMeta).find(
      ([symbol]) => symbol.toUpperCase() === collateralTokenSymbol,
    )
    config.initialCollateralToken = collateralTokenInfo
      ? collateralTokenInfo[1].address
      : parsed.isLong
      ? marketInfo.longToken
      : marketInfo.shortToken

    // Set payment token address
    const paymentTokenInfo = Object.entries(tokenMeta).find(
      ([symbol]) => symbol.toUpperCase() === paymentTokenSymbol,
    )
    config.paymentToken = paymentTokenInfo
      ? paymentTokenInfo[1].address
      : config.initialCollateralToken

    // Set swapPath:
    // If payment token ≠ collateral, use a related market to swap
    config.swapPath = []

    if (paymentTokenSymbol !== collateralTokenSymbol) {
      // Find market between paymentToken / collateralToken, e.g.:
      //  - CELO/USDT
      //  - BTC/USDT
      const paymentCollateralMarket = markets.find((m) => {
        const idx = m.indexTokenSymbol
        const shortSym = m.shortTokenSymbol || 'USDT'
        return (
          (idx === paymentTokenSymbol && shortSym === collateralTokenSymbol) ||
          (idx === collateralTokenSymbol && shortSym === paymentTokenSymbol)
        )
      })

      if (paymentCollateralMarket) {
        // Single-hop swap via CELO/USDT-like market: payment -> collateral
        config.swapPath = [paymentCollateralMarket.marketToken]
      }
    }

    // OrderType enum:
    // 0: MarketSwap      (unused)
    // 1: LimitSwap       (unused)
    // 2: MarketIncrease  (market increase)
    // 3: LimitIncrease   (limit increase / stop-limit increase)
    // 4: MarketDecrease  (market decrease)
    // 5: LimitDecrease   (limit decrease / take profit)
    // 6: StopLossDecrease(Stop loss)
    // 7: Liquidation     (not used in frontend)
    // 8: StopIncrease    (stop-market increase)
    if (parsed.orderType === 'market') {
      config.orderType = 2 // MarketIncrease
    } else if (parsed.orderType === 'limit') {
      config.orderType = 3 // LimitIncrease
      if (!parsed.triggerPrice) {
        throw new Error('Limit orders require a trigger price')
      }
      config.triggerPriceHuman = parsed.triggerPrice
    } else if (parsed.orderType === 'stopMarket') {
      // Stop-market open (StopIncrease)
      config.orderType = 8 // StopIncrease
      if (!parsed.triggerPrice) {
        throw new Error('Stop-market orders require a trigger price')
      }
      config.triggerPriceHuman = parsed.triggerPrice
    }

    // Compute position size (margin × leverage)
    let collateralAmount
    let collateralTokenDisplay

    if (parsed.collateralValueUsd && parsed.collateralTokenSymbol && provider) {
      // Pattern: "10U worth of CELO" - compute amount from price
      const tokenInfo = Object.entries(tokenMeta).find(
        ([symbol, info]) =>
          symbol.toUpperCase() === parsed.collateralTokenSymbol.toUpperCase(),
      )
      if (tokenInfo) {
        const tokenPrice = await getTokenPrice(
          parsed.collateralTokenSymbol,
          provider,
        )
        if (!tokenPrice) {
          throw new Error(
            `Failed to get price for ${parsed.collateralTokenSymbol}`,
          )
        }
        const tokenAmount = parsed.collateralValueUsd / tokenPrice
        const decimals = tokenInfo[1].decimals
        // Convert to amount (respecting decimals), keep 6 decimal places
        collateralAmount = parseFloat(tokenAmount.toFixed(6))
        collateralTokenDisplay = `${collateralAmount} ${parsed.collateralTokenSymbol}`
        console.log(`\n💰 Price calculation:`)
        console.log(
          `   ${parsed.collateralTokenSymbol} price: $${tokenPrice.toFixed(6)}`,
        )
        console.log(`   Target value: $${parsed.collateralValueUsd}`)
        console.log(
          `   Computed amount: ${collateralAmount} ${parsed.collateralTokenSymbol}\n`,
        )
      } else {
        throw new Error(`Token not found: ${parsed.collateralTokenSymbol}`)
      }
    } else {
      // Normal format: direct numeric amount
      collateralAmount = parsed.collateralUsd || 10
      collateralTokenDisplay = `${collateralAmount} ${collateralTokenSymbol}`
    }

    const sizeUsd =
      (parsed.collateralValueUsd || parsed.collateralUsd || 10) *
      (parsed.leverage || 1)
    config.sizeDeltaUsdHuman = sizeUsd
    config.initialCollateralDeltaAmountHuman = collateralAmount
    // swapPath is already set above; no need to reset here
  } else if (parsed.action === 'close') {
    // Close-position config
    config.initialCollateralToken = parsed.isLong
      ? marketInfo.longToken
      : marketInfo.shortToken

    if (parsed.orderType === 'market') {
      config.orderType = 4 // MarketDecrease
    } else if (parsed.orderType === 'limit') {
      config.orderType = 5 // LimitDecrease / take-profit
    }

    config.closePercent = parsed.closePercent || 100
  } else if (parsed.action === 'stopLoss') {
    // Stop-loss config
    config.orderType = 6 // StopLossDecrease
    config.closePercent = parsed.closePercent || 100
    if (!parsed.triggerPrice) {
      throw new Error('Stop-loss orders require a trigger price')
    }
    config.triggerPriceHuman = parsed.triggerPrice
    // Set collateral token for filtering positions;
    // if user specifies one, prefer it; otherwise fall back to defaults
    if (parsed.collateralTokenSymbol) {
      const collateralTokenInfo = Object.entries(tokenMeta).find(
        ([symbol, info]) =>
          symbol.toUpperCase() === parsed.collateralTokenSymbol.toUpperCase(),
      )
      if (collateralTokenInfo) {
        config.initialCollateralToken = collateralTokenInfo[1].address
      } else {
        config.initialCollateralToken = parsed.isLong
          ? marketInfo.longToken
          : marketInfo.shortToken
      }
    } else {
      config.initialCollateralToken = parsed.isLong
        ? marketInfo.longToken
        : marketInfo.shortToken
    }
  } else if (parsed.action === 'takeProfit') {
    // Take-profit config: use LimitDecrease (5)
    config.orderType = 5 // LimitDecrease (TP / limit close)
    config.closePercent = parsed.closePercent || 100
    if (!parsed.triggerPrice) {
      throw new Error('Take-profit orders require a trigger price')
    }
    config.triggerPriceHuman = parsed.triggerPrice
    // Set collateral token for filtering positions;
    // if user specifies one, prefer it; otherwise fall back to defaults
    if (parsed.collateralTokenSymbol) {
      const collateralTokenInfo = Object.entries(tokenMeta).find(
        ([symbol, info]) =>
          symbol.toUpperCase() === parsed.collateralTokenSymbol.toUpperCase(),
      )
      if (collateralTokenInfo) {
        config.initialCollateralToken = collateralTokenInfo[1].address
      } else {
        config.initialCollateralToken = parsed.isLong
          ? marketInfo.longToken
          : marketInfo.shortToken
      }
    } else {
      config.initialCollateralToken = parsed.isLong
        ? marketInfo.longToken
        : marketInfo.shortToken
    }
  }

  return config
}

// Generate TWAP split configs (returns multiple configs)
function generateTwapConfigs(parsed, baseConfig) {
  const numberOfParts = parsed.twapParts || 2
  const intervalSeconds = parsed.twapInterval || 300 // default 5 minutes
  const now = Math.floor(Date.now() / 1000)
  const startTime = baseConfig.validFromTime || now
  const uiFeeReceiver = createTwapUiFeeReceiver(numberOfParts)

  const configs = []

  if (parsed.action === 'open') {
    const totalSize =
      baseConfig.sizeDeltaUsdHuman ||
      (parsed.collateralValueUsd || parsed.collateralUsd || 10) *
        (parsed.leverage || 1)
    const totalCollateral =
      baseConfig.initialCollateralDeltaAmountHuman ||
      parsed.collateralValueUsd ||
      parsed.collateralUsd ||
      10

    const sizePer = totalSize / numberOfParts
    const collateralPer = totalCollateral / numberOfParts

    for (let i = 0; i < numberOfParts; i++) {
      const cfg = {
        ...baseConfig,
        sizeDeltaUsdHuman: sizePer,
        initialCollateralDeltaAmountHuman: collateralPer,
        orderType: 3, // LimitIncrease (TWAP uses limit orders)
        // Long: price unbounded above; Short: price unbounded below
        acceptablePrice: parsed.isLong ? MAX_UINT256 : '0',
        triggerPrice: parsed.isLong ? MAX_UINT256 : '0',
        validFromTime: String(startTime + intervalSeconds * i),
        uiFeeReceiver,
      }
      configs.push({ cfg, index: i + 1, total: numberOfParts })
    }
  } else if (parsed.action === 'close') {
    // Split using closePercent
    const basePercent = Math.floor(100 / numberOfParts)
    let usedPercent = 0

    // Extract total position size to split closing size
    const totalSize = baseConfig.sizeDeltaUsdHuman
      ? parseFloat(baseConfig.sizeDeltaUsdHuman)
      : 0
    // No extra collateral needed for closing; explicitly set to avoid send-twap-multicall parsing issues
    const defaultCollateral = '0'

    for (let i = 0; i < numberOfParts; i++) {
      const isLast = i === numberOfParts - 1
      const thisPercent = isLast ? 100 - usedPercent : basePercent
      usedPercent += thisPercent

      const cfg = {
        ...baseConfig,
        orderType: 5, // LimitDecrease (TWAP uses limit orders)
        closePercent: thisPercent,
        sizeDeltaUsdHuman:
          totalSize > 0 ? ((totalSize * thisPercent) / 100).toString() : '0',
        initialCollateralDeltaAmountHuman: defaultCollateral,
        acceptablePrice: parsed.isLong ? '0' : MAX_UINT256,
        triggerPrice: parsed.isLong ? '0' : MAX_UINT256,
        validFromTime: String(startTime + intervalSeconds * i),
        uiFeeReceiver,
      }
      configs.push({ cfg, index: i + 1, total: numberOfParts })
    }
  }

  return configs
}

// Validate parsed user input
function validateInput(parsed) {
  const errors = []

  if (!parsed.market) {
    errors.push('Please specify market (e.g. BTC/USDT, ETH/USDT)')
  }

  if (parsed.action === 'open' && parsed.isLong === null) {
    errors.push('Please specify direction (long/short)')
  }

  if (
    parsed.action === 'open' &&
    !parsed.collateralUsd &&
    !parsed.collateralValueUsd
  ) {
    errors.push(
      'Please specify margin amount (e.g. 10 USDT) or value (e.g. value of 10U CELO)',
    )
  }

  if (
    (parsed.action === 'stopLoss' || parsed.action === 'takeProfit') &&
    !parsed.triggerPrice
  ) {
    errors.push('Please specify trigger price')
  }

  return errors
}

// Main entrypoint
async function main() {
  const userInput = process.argv[2]

  if (!userInput || userInput === '--help' || userInput === '-h') {
    console.log(HELP_MESSAGE)
    return
  }

  console.log('\n=== User input ===')
  console.log(userInput)
  console.log('')

  // Parse input
  const parsed = parseUserInput(userInput)

  console.log('=== Parsed result ===')
  console.log(JSON.stringify(parsed, null, 2))
  console.log('')

  // Query action (no validation needed)
  if (parsed.action === 'query') {
    console.log('Executing query...')
    console.log('')
    const { execSync } = require('child_process')
    try {
      execSync(`node ${path.join(__dirname, 'query.js')} ${parsed.queryType}`, {
        stdio: 'inherit',
      })
    } catch (e) {
      // Suppress query execution errors here
    }
    return
  }

  // Validate input
  const errors = validateInput(parsed)
  if (errors.length > 0) {
    console.log('❌ Invalid input:')
    errors.forEach((e) => console.log(`  - ${e}`))
    console.log('')
    console.log('💡 Hint: You can place orders like:')
    console.log(
      '  "Create a BTC/USDT long market order with 10 USDT margin, 2x leverage"',
    )
    console.log('  "Close BTC/USDT long position"')
    console.log('  "Set stop-loss for BTC long, trigger 60000"')
    return
  }

  // Initialize provider (if price lookup is needed)
  let provider = null
  if (parsed.collateralValueUsd) {
    const rpcUrl = process.env.CELO_RPC_URL
    if (rpcUrl) {
      provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
        chainId: Number(process.env.CELO_CHAIN_ID || '42220'),
        name: 'celo',
      })
    }
  }

  // Generate order config(s)
  try {
    const baseConfig = await generateOrderConfig(parsed, userInput, provider)

    // TWAP: generate multiple split-order configs
    if (parsed.orderType === 'twap') {
      const twapConfigs = generateTwapConfigs(parsed, baseConfig)

      if (!twapConfigs.length) {
        throw new Error('TWAP only supports open/close operations')
      }

      console.log('=== Generated TWAP split configs ===')

      const ordersDir = path.join(__dirname, '../orders')
      if (!fs.existsSync(ordersDir)) {
        fs.mkdirSync(ordersDir, { recursive: true })
      }

      twapConfigs.forEach(({ cfg, index, total }) => {
        const suffix = `twap-part${index}-of-${total}`
        const configFileName = `order-${
          parsed.action
        }-${parsed.market.toLowerCase()}-${
          parsed.isLong ? 'long' : 'short'
        }-${suffix}.json`
        const configPath = path.join(ordersDir, configFileName)

        console.log(`\n--- Order ${index}/${total} ---`)
        console.log(JSON.stringify(cfg, null, 2))

        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2))
        console.log(`✅ Saved: orders/${configFileName}`)

        if (parsed.action === 'open') {
          console.log('Run:')
          console.log(
            `  node scripts/open-position.js orders/${configFileName}`,
          )
        } else if (parsed.action === 'close') {
          console.log('Run:')
          console.log(
            `  node scripts/close-position.js orders/${configFileName}`,
          )
        }
      })

      console.log('')
      console.log('=== TWAP Multicall batch send ===')
      console.log('Use the following command to send all TWAP orders at once:')
      console.log(
        `  node scripts/send-twap-multicall.js "${parsed.market.toLowerCase()}"`,
      )
      console.log('')
    } else {
      const config = baseConfig

      console.log('=== Generated order config ===')
      console.log(JSON.stringify(config, null, 2))
      console.log('')

      // Save config file into orders/ directory
      const ordersDir = path.join(__dirname, '../orders')
      if (!fs.existsSync(ordersDir)) {
        fs.mkdirSync(ordersDir, { recursive: true })
      }

      const configFileName = `order-${
        parsed.action
      }-${parsed.market.toLowerCase()}-${parsed.isLong ? 'long' : 'short'}.json`
      const configPath = path.join(ordersDir, configFileName)
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

      console.log(`✅ Order config saved: orders/${configFileName}`)
      console.log('')

      // Prompt execution command
      if (parsed.action === 'open') {
        console.log('Run:')
        console.log(`  node scripts/open-position.js orders/${configFileName}`)
      } else if (
        parsed.action === 'close' ||
        parsed.action === 'stopLoss' ||
        parsed.action === 'takeProfit'
      ) {
        console.log('Run:')
        console.log(`  node scripts/close-position.js orders/${configFileName}`)
      }
      console.log('')
    }
  } catch (error) {
    console.log('❌ Failed to generate order config:')
    console.log(error.message)
  }
}

main().catch(console.error)
