// Operator clients for the seed and evidence scripts. Keys are read from a local file outside
// the repository (NTULI_WALLETS, default ~/.ntuli/wallets.json) and never logged.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export const reader = createPublicClient({ chain: tiramisu, transport: http() })

type Stored = Record<string, { pk: Hex; address: Hex }>

export function loadWallets(): Stored {
  const file = process.env.NTULI_WALLETS ?? `${homedir()}/.ntuli/wallets.json`
  return JSON.parse(readFileSync(file, "utf8"))
}

export function walletFor(role: string) {
  const stored = loadWallets()[role]
  if (!stored) throw new Error(`no wallet for role ${role}`)
  const account = privateKeyToAccount(stored.pk)
  return {
    address: account.address as Hex,
    client: createWalletClient({ chain: tiramisu, transport: http(), account }),
  }
}
