import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, http, webSocket, type Hex } from "viem"

export const RPC_HTTP = "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
export const RPC_WS = "wss://rpc.tiramisu.db-chain.testnet.arkiv.network"
export const EXPLORER = "https://tiramisu.explorer.arkiv.network"
export const CHAIN_ID = 7738577

// Reads go straight from the browser to a public Tiramisu node. There is no Ntuli backend.
export const reader = createPublicClient({ chain: tiramisu, transport: http(RPC_HTTP) })

// Live updates use a real socket. Without a WebSocket transport the SDK silently polls.
export const live = createPublicClient({ chain: tiramisu, transport: webSocket(RPC_WS) })

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
const injected = () => (window as unknown as { ethereum?: Eip1193 }).ethereum

export const hasInjectedWallet = () => !!injected()

export async function connectWallet() {
  const eth = injected()
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or Rabby to write.")
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Hex[]
  const hexId = `0x${CHAIN_ID.toString(16)}`
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] })
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: "Arkiv Tiramisu",
          nativeCurrency: { name: "GLM", symbol: "GLM", decimals: 18 },
          rpcUrls: [RPC_HTTP],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    })
  }
  const wallet = createWalletClient({ chain: tiramisu, transport: custom(eth), account: address })
  return { address, wallet }
}

export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`
export const short = (h?: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "")
