const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({
  path: path.resolve(__dirname, "../assets/celo.env.local"),
});

const addresses = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../assets/addresses.json"), "utf8")
);
const readerAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../assets/abis/Reader.json"), "utf8")
).abi;
const markets = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../assets/markets.json"), "utf8")
);
const tokenMeta = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../assets/celo-tokens.json"), "utf8")
);

function normalizeAddr(addr) {
  return (addr || "").toLowerCase();
}

function findMarketInfo(marketToken) {
  const target = normalizeAddr(marketToken);
  return markets.find((m) => normalizeAddr(m.marketToken) === target) || null;
}

function getTokenSymbol(address) {
  for (const [symbol, info] of Object.entries(tokenMeta)) {
    if (normalizeAddr(info.address) === normalizeAddr(address)) {
      return symbol;
    }
  }
  return address.slice(0, 10) + "...";
}

async function main() {
  const command = process.argv[2] || "positions";
  
  const rpcUrl = process.env.CELO_RPC_URL;
  const privateKey = process.env.CELO_PRIVATE_KEY;
  
  if (!rpcUrl || !privateKey) {
    throw new Error("Missing CELO_RPC_URL or CELO_PRIVATE_KEY in assets/celo.env.local");
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
    chainId: Number(process.env.CELO_CHAIN_ID || "42220"),
    name: "celo",
  });

  const wallet = new ethers.Wallet(privateKey, provider);
  const reader = new ethers.Contract(addresses.celo.Reader, readerAbi, provider);

  if (command === "positions") {
    console.log("\n=== Positions ===\n");
    console.log("Wallet address:", wallet.address);
    console.log("");
    
    const allPositions = await reader.getAccountPositions(
      addresses.celo.DataStore,
      wallet.address,
      0,
      50
    );
    
    const openPositions = allPositions.filter((p) =>
      ethers.BigNumber.from(p.numbers.sizeInUsd || 0).gt(0)
    );
    
    console.log(`Total positions: ${allPositions.length}`);
    console.log(`Active positions: ${openPositions.length}`);
    console.log("");
    
    if (openPositions.length === 0) {
      console.log("No active positions");
    } else {
      openPositions.forEach((p, i) => {
        const m = findMarketInfo(p.addresses.market);
        const marketLabel = m ? `${m.indexTokenSymbol}/USDT` : p.addresses.market;
        const collateralSymbol = getTokenSymbol(p.addresses.collateralToken);
        console.log(`--- Position #${i + 1} ---`);
        console.log(`Market: ${marketLabel}`);
        console.log(`Side: ${p.flags.isLong ? "🟢 Long" : "🔴 Short"}`);
        console.log(`Size: ${ethers.utils.formatUnits(p.numbers.sizeInUsd, 30)} USD`);
        console.log(`Collateral: ${ethers.utils.formatUnits(p.numbers.collateralAmount, 30)} USD`);
        console.log(`Collateral token: ${collateralSymbol}`);
        console.log(
          `Opened at: ${new Date(
            Number(p.numbers.increasedAtTime) * 1000,
          ).toLocaleString()}`,
        );
        console.log("");
      });
    }
    
    // Show balances
    console.log("=== Wallet balances ===");
    const celoBalance = await provider.getBalance(wallet.address);
    console.log(`CELO: ${ethers.utils.formatUnits(celoBalance, 18)}`);
    
    for (const [symbol, info] of Object.entries(tokenMeta)) {
      const token = new ethers.Contract(
        info.address,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      try {
        const balance = await token.balanceOf(wallet.address);
        if (balance.gt(0)) {
          console.log(`${symbol}: ${ethers.utils.formatUnits(balance, info.decimals)}`);
        }
      } catch {}
    }
    console.log("");
    
  } else if (command === "balance") {
    console.log("\n=== Wallet balances ===\n");
    console.log("Wallet address:", wallet.address);
    console.log("");
    
    const celoBalance = await provider.getBalance(wallet.address);
    console.log(`CELO: ${ethers.utils.formatUnits(celoBalance, 18)}`);
    
    for (const [symbol, info] of Object.entries(tokenMeta)) {
      const token = new ethers.Contract(
        info.address,
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        provider
      );
      try {
        const balance = await token.balanceOf(wallet.address);
        const decimals = await token.decimals();
        console.log(`${symbol}: ${ethers.utils.formatUnits(balance, decimals)}`);
      } catch (e) {
        console.log(`${symbol}: failed to read balance`);
      }
    }
    console.log("");
    console.log("=== Market LP (GM) balances ===");
    try {
      const markets = require('../assets/markets.json');
      for (const market of markets) {
        const token = new ethers.Contract(
          market.marketToken,
          ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
          provider
        );
        const balance = await token.balanceOf(wallet.address);
        if (balance.gt(0)) {
          const decimals = 18;
          console.log(
            market.indexTokenSymbol +
              "/" +
              market.shortTokenSymbol +
              " LP (GM Token): " +
              ethers.utils.formatUnits(balance, decimals),
          );
        }
      }
    } catch(e) {
      console.log("Failed to read market LP balances: ", e.message);
    }

    console.log("");
    
  } else {
    console.log("\n=== UPDOWN Query Tool ===\n");
    console.log("Usage: node query.js <command>\n");
    console.log("Available commands:");
    console.log("  positions    - show positions (default)");
    console.log("  balance      - show balances");
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
