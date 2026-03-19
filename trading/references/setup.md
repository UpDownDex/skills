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

Configure `assets/celo.env.local` (refer to `celo.env.example`, which is not committed):

- `CELO_RPC_URL` – Celo RPC URL
- `CELO_PRIVATE_KEY` – wallet private key
- `CELO_CHAIN_ID` – chain ID (mainnet 42220)

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
