// Seeds the synthetic demo election on Tiramisu:
//   1. funds observer wallets from the accreditor wallet
//   2. accredits observers A, B and C in one batch (D stays unaccredited on purpose)
//   3. each observer publishes sealed tallies for the polling units it covered
// Every polling unit, vote and observer below is invented. No real person or result is stored.
import { parseEther, type Hex } from "viem"
import { accreditObservers, publishSealedTallies } from "../src/arkiv/write.ts"
import type { TallyInput } from "../src/arkiv/schema.ts"
import { DEMO_UNITS, reportFor } from "./demo-data.ts"
import { reader, walletFor } from "./clients.ts"

const step = process.argv[2] ?? "all"
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

async function fund() {
  const acc = walletFor("accreditor")
  for (const role of ["observerA", "observerB", "observerC", "observerD"]) {
    const to = walletFor(role).address
    const bal = await reader.getBalance({ address: to })
    if (bal >= parseEther("0.05")) continue
    const hash = await acc.client.sendTransaction({ to, value: parseEther("0.1") })
    await reader.waitForTransactionReceipt({ hash })
    log("funded", role, to, hash)
  }
}

async function accredit() {
  const acc = walletFor("accreditor")
  const observers = [
    { address: walletFor("observerA").address, alias: "Observer A (synthetic)" },
    { address: walletFor("observerB").address, alias: "Observer B (synthetic)" },
    { address: walletFor("observerC").address, alias: "Observer C (synthetic)" },
  ]
  const r = await accreditObservers(acc.client, observers, "MISSION-DEMO-01")
  log("accredited", r.txHash, r.keys)
}

async function tallies() {
  for (const role of ["observerA", "observerB", "observerC", "observerD"] as const) {
    const w = walletFor(role)
    const reports: TallyInput[] = DEMO_UNITS.map((u) => reportFor(role, u)).filter(
      (t): t is TallyInput => t !== null,
    )
    if (reports.length === 0) continue
    const r = await publishSealedTallies(reader, w.client, w.address as Hex, reports)
    log("sealed", role, reports.length, "tallies", r.txHash)
  }
}

if (step === "fund" || step === "all") await fund()
if (step === "accredit" || step === "all") await accredit()
if (step === "tallies" || step === "all") await tallies()
