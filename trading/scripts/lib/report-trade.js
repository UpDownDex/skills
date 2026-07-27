/**
 * Unified HTTP reporter for updown-skill → centralized Java API.
 *
 * Env (assets/celo.env.local, optional — code defaults if unset):
 *   TRADE_REPORT_API_URL  – default https://api.updown.xyz/skill/
 *   TRADE_REPORT_API_KEY  – default skill-report-secret-001
 *   TRADE_SETUP_API_URL   – optional override for setup endpoint
 *
 * Business success code from Java Response is typically "800".
 */

const EXPLORER_BASE =
  process.env.CELO_EXPLORER_URL || 'https://celoscan.io'

/** Defaults when celo.env.local omits report URL / API key */
const DEFAULT_TRADE_REPORT_API_URL = 'https://api.updown.xyz/skill/'
const DEFAULT_TRADE_REPORT_API_KEY = 'skill-report-secret-001'

const BUSINESS_SUCCESS_CODES = new Set(['800', '200', 800, 200])

function getChainId() {
  return Number(process.env.CELO_CHAIN_ID || '42220')
}

function explorerTxUrl(txHash) {
  return `${EXPLORER_BASE}/tx/${txHash}`
}

function authHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const apiKey = (
    process.env.TRADE_REPORT_API_KEY || DEFAULT_TRADE_REPORT_API_KEY
  ).trim()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['X-API-Key'] = apiKey
  }
  return headers
}

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

/** Trade report URL (createOrder flow). */
function getTradeReportUrl() {
  return (
    process.env.TRADE_REPORT_API_URL || DEFAULT_TRADE_REPORT_API_URL
  ).trim()
}

/**
 * Setup / wallet-link report URL.
 * Default: TRADE_REPORT_API_URL with trailing /setup
 * Override: TRADE_SETUP_API_URL
 */
function getSetupReportUrl() {
  const override = (process.env.TRADE_SETUP_API_URL || '').trim()
  if (override) return override
  const tradeUrl = normalizeBaseUrl(getTradeReportUrl())
  if (!tradeUrl) return ''
  return `${tradeUrl}/setup`
}

function isBusinessSuccess(body) {
  if (body == null || typeof body !== 'object') return true
  if (body.code === undefined || body.code === null) return true
  return BUSINESS_SUCCESS_CODES.has(body.code)
}

/**
 * @param {string} url
 * @param {object} body
 * @param {string} label
 */
async function postJson(url, body, label) {
  if (!url) {
    console.log(`[${label}] URL not set — skip reporting`)
    return { skipped: true }
  }

  console.log(
    `\n➡️ [${label}] POST ${url} action=${body.action || 'n/a'}`,
  )

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let parsed
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!response.ok) {
      console.log(
        `[${label}] ⚠️ HTTP ${response.status}:`,
        typeof parsed === 'string' ? parsed.slice(0, 200) : parsed,
      )
      return { ok: false, status: response.status, body: parsed }
    }

    if (!isBusinessSuccess(parsed)) {
      console.log(
        `[${label}] ⚠️ business code=${parsed && parsed.code}:`,
        parsed && parsed.msg,
      )
      return { ok: false, status: response.status, body: parsed }
    }

    console.log(`[${label}] ✅ reported successfully`)
    return { ok: true, status: response.status, body: parsed }
  } catch (err) {
    console.error(`[${label}] ❌ request failed:`, err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Normalize human USD + SL/TP fields for reward judging.
 * Prefer explicit sizeDeltaUsdHuman; fall back to numeric-looking sizeDeltaUsd.
 */
function enrichTradeReportPayload(payload) {
  const body = { ...payload }

  if (
    body.sizeDeltaUsdHuman == null &&
    body.sizeDeltaUsd != null &&
    looksLikeHumanUsd(body.sizeDeltaUsd)
  ) {
    body.sizeDeltaUsdHuman = String(body.sizeDeltaUsd)
  }
  if (body.sizeDeltaUsdHuman != null) {
    body.sizeDeltaUsdHuman = String(body.sizeDeltaUsdHuman)
  }

  const orderTypeNum = Number(body.orderType)
  if (body.hasStopLoss == null && orderTypeNum === 6) {
    body.hasStopLoss = true
  }
  if (body.hasTakeProfit == null && orderTypeNum === 5) {
    body.hasTakeProfit = true
  }

  // Prefer dedicated set_sl_tp when both sides present in one report
  const bothSides =
    body.hasStopLoss === true &&
    body.hasTakeProfit === true &&
    (body.stopLossOrderKey || body.takeProfitOrderKey || body.slTpGroupId || body.positionKey)
  if (body.action !== 'set_sl_tp' && bothSides && body.forceSetSlTp !== false) {
    body.action = 'set_sl_tp'
  }
  if (body.action === 'set_sl_tp') {
    body.hasStopLoss = true
    body.hasTakeProfit = true
    if (!body.slTpGroupId && body.txHash) {
      body.slTpGroupId = `sltp-${body.txHash}`
    }
  }

  if (body.qualifiedTrade == null) {
    const a = body.action
    body.qualifiedTrade =
      a === 'open_position' ||
      a === 'close_position' ||
      a === 'twap_orders'
  }

  return body
}

function looksLikeHumanUsd(value) {
  const s = String(value).trim()
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return false
  // 30-decimal wei strings are huge integers without a decimal point
  return s.includes('.') || s.length <= 12
}

async function reportTrade(payload) {
  const url = getTradeReportUrl()
  const body = {
    source: 'updown-skill',
    chainId: getChainId(),
    status: 'submitted',
    createdAt: new Date().toISOString(),
    ...enrichTradeReportPayload(payload),
  }
  if (body.txHash && !body.explorerUrl) {
    body.explorerUrl = explorerTxUrl(body.txHash)
  }
  return postJson(url, body, 'report-trade')
}

async function reportSetup(payload) {
  const url = getSetupReportUrl()
  const body = {
    source: 'updown-skill',
    chainId: getChainId(),
    createdAt: new Date().toISOString(),
    action: 'setup_check',
    ...payload,
  }
  return postJson(url, body, 'report-setup')
}

function extractOrderKeysFromReceipt(receipt, exchangeRouterIface) {
  const keys = []
  if (!receipt || !receipt.logs) return keys

  for (const log of receipt.logs) {
    if (exchangeRouterIface) {
      try {
        const parsed = exchangeRouterIface.parseLog(log)
        if (parsed && parsed.name === 'OrderCreated') {
          const key = parsed.args.key || parsed.args.orderKey || parsed.args[0]
          if (key) keys.push(String(key))
          continue
        }
      } catch {
        // not this iface
      }
    }
  }
  return keys
}

module.exports = {
  reportTrade,
  reportSetup,
  postJson,
  explorerTxUrl,
  getChainId,
  getTradeReportUrl,
  getSetupReportUrl,
  extractOrderKeysFromReceipt,
  enrichTradeReportPayload,
}
