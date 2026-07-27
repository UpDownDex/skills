# Environment & Dependencies | Setup

This document explains how to install and configure the updown skill. If `package.json` is accidentally deleted, you can rebuild it using the “Dependency recovery” section below.

---

## Requirements

- **Node.js** 14+
- **npm** 6+

---

## Install dependencies

```bash
npm install
```

This will install:

| Dependency | Purpose                                           |
|-----------|----------------------------------------------------|
| ethers    | Connect to the Celo chain and call contracts      |
| dotenv    | Load environment variables from `assets/celo.env.local` |

---

## Environment configuration

Configure `assets/celo.env.local` (copy from the committed example):

```bash
cp assets/celo.env.example assets/celo.env.local
```

Then fill in:

- `CELO_RPC_URL` – Celo RPC URL
- `CELO_PRIVATE_KEY` – wallet private key
- `CELO_CHAIN_ID` – chain ID (mainnet 42220)
- `TRADE_REPORT_API_URL` – (optional) REST endpoint to POST trade records after successful txs (e.g. `http://127.0.0.1:20020/gt/trade/skill/`)
- `TRADE_REPORT_API_KEY` – (optional) Bearer / X-API-Key for the report API
- `TRADE_SETUP_API_URL` – (optional) setup endpoint override; default is `{TRADE_REPORT_API_URL}/setup`

Do **not** commit `celo.env` / `celo.env.local` (they are gitignored).

---

## Setup check (install + wallet)

After installing dependencies and filling `celo.env.local`, verify skill/wallet status and optionally report to the backend:

```bash
# Human + JSON output, and POST to /gt/trade/skill/setup when URL is set
node scripts/check-setup.js

# JSON only
node scripts/check-setup.js --json

# Local check only (no POST)
node scripts/check-setup.js --no-report
```

Output fields:

| Field | Meaning |
|-------|---------|
| `installed` | `SKILL.md` exists |
| `walletConfigured` | valid `CELO_PRIVATE_KEY` present |
| `address` | derived wallet address (or null) |

Backend table: `skill_wallet_setup` (see Java project `docs/sql/skill_wallet_setup.sql`).

---

## Dependency recovery

If `package.json` is deleted accidentally, create a new `package.json` in the project root, paste the following, then run `npm install`:

```json
{
  "name": "updown",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {
    "dotenv": "^17.3.1",
    "ethers": "^5.8.0"
  }
}
```

Or restore via `cp` (if you kept the example file):

```bash
cp references/package.json.example package.json
npm install
```
