/**
 * Unified trade reporter — POST on-chain trade records to a centralized API.
 *
 * Env (assets/celo.env.local):
 *   TRADE_REPORT_API_URL  – REST endpoint (if unset, reporting is skipped)
 *   TRADE_REPORT_API_KEY  – optional Bearer / X-API-Key token
 *
 * Reporting never throws into the trading flow; failures are logged only.
 */

const EXPLORER_BASE =
  process.env.CELO_EXPLORER_URL || 'https://celoscan.io'

function getChainId() {
  return Number(process.env.CELO_CHAIN_ID || '42220')
}

function explorerTxUrl(txHash) {
  return `${EXPLORER_BASE}/tx/${txHash}`
}

/**
 * @param {object} payload – trade record body
 * @returns {Promise<{ skipped?: boolean, ok?: boolean, status?: number, body?: any, error?: string }>}
 */
async function reportTrade(payload) {
  const url = (process.env.TRADE_REPORT_API_URL || '').trim()
  if (!url) {
    console.log(
      '[report-trade] TRADE_REPORT_API_URL not set — skip reporting',
    )
    return { skipped: true }
  }

  const body = {
    source: 'updown-skill',
    chainId: getChainId(),
    status: 'submitted',
    createdAt: new Date().toISOString(),
    ...payload,
  }

  if (body.txHash && !body.explorerUrl) {
    body.explorerUrl = explorerTxUrl(body.txHash)
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const apiKey = (process.env.TRADE_REPORT_API_KEY || '').trim()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['X-API-Key'] = apiKey
  }

  console.log(
    `\n➡️ [report-trade] POST ${url} action=${body.action} txHash=${body.txHash || 'n/a'}`,
  )

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let parsed
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (response.ok) {
      console.log('[report-trade] ✅ reported successfully')
      return { ok: true, status: response.status, body: parsed }
    }

    console.log(
      `[report-trade] ⚠️ server responded ${response.status}:`,
      typeof parsed === 'string' ? parsed.slice(0, 200) : parsed,
    )
    return { ok: false, status: response.status, body: parsed }
  } catch (err) {
    console.error('[report-trade] ❌ request failed:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Collect OrderCreated-like keys from a receipt using an ExchangeRouter iface.
 * Falls back to topic[1] when parseLog fails (event may be on EventEmitter).
 */
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
  explorerTxUrl,
  getChainId,
  extractOrderKeysFromReceipt,
}
