const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
require('dotenv').config({
  path: path.resolve(__dirname, '../assets/celo.env.local'),
})

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value =
      argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    args[key] = value
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)

  const to = args.to
  const data = args.data || '0x'
  const valueStr = args.value || '0'
  const gasLimitStr = args.gasLimit

  if (!to) {
    console.log('\n=== Omni Bridge TX Sender ===\n')
    console.log('Usage:')
    console.log(
      '  node scripts/omni-bridge-tx.js --to <address> --data <calldata> [--value <amount>] [--gasLimit <number>]\n',
    )
    console.log('Example:')
    console.log('  node scripts/omni-bridge-tx.js \\')
    console.log('    --to 0xBridgeOrRouterAddress \\')
    console.log('    --data 0xabc123... \\')
    console.log('    --value 0.05')
    process.exit(1)
  }

  const rpcUrl = process.env.CELO_RPC_URL
  const privateKey = process.env.CELO_PRIVATE_KEY
  const chainId = Number(process.env.CELO_CHAIN_ID || '42220')

  if (!rpcUrl || !privateKey) {
    throw new Error(
      'Missing CELO_RPC_URL or CELO_PRIVATE_KEY in assets/celo.env.local',
    )
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
    chainId,
    name: 'custom',
  })

  const wallet = new ethers.Wallet(privateKey, provider)

  console.log('\n=== Omni Bridge TX Sender ===\n')
  console.log('From address:', wallet.address)
  console.log('To contract: ', to)
  console.log('Value:       ', valueStr)
  console.log('Chain ID:    ', chainId)
  console.log('')

  const value = ethers.utils.parseEther(valueStr.toString())

  const txRequest = {
    to,
    data,
    value,
  }

  if (gasLimitStr) {
    txRequest.gasLimit = ethers.BigNumber.from(gasLimitStr)
  } else {
    console.log('Estimating gas...')
    const estimatedGas = await provider.estimateGas({
      ...txRequest,
      from: wallet.address,
    })
    txRequest.gasLimit = estimatedGas.mul(120).div(100) // +20% buffer
    console.log(
      'Estimated gas:',
      estimatedGas.toString(),
      '  Using gasLimit:',
      txRequest.gasLimit.toString(),
    )
  }

  const tx = await wallet.sendTransaction(txRequest)

  console.log('\n=== Transaction sent ===')
  console.log('txHash:', tx.hash)
  console.log('Waiting for confirmation...\n')

  const receipt = await tx.wait()

  console.log('=== Transaction confirmed ===')
  console.log('Block:', receipt.blockNumber)
  console.log('gasUsed:', receipt.gasUsed.toString())
  console.log('Status:', receipt.status === 1 ? '✅ Success' : '❌ Failed')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
