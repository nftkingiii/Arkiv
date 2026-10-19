import { formatEther } from "viem"
import { loadWallets, reader } from "./clients.ts"

for (const [role, w] of Object.entries(loadWallets())) {
  const bal = await reader.getBalance({ address: w.address })
  console.log(role.padEnd(11), w.address, formatEther(bal), "GLM")
}
