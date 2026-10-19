// Prints the verdict every polling unit would get from the demo data, without touching the chain.
import { DEMO_UNITS, reportFor } from "./demo-data.ts"
import { SEAL, decodeTally, verdictFor, tallyAttributes, tallyPayload, type Tally } from "../src/arkiv/schema.ts"

const roles = ["observerA", "observerB", "observerC", "observerD"]
const accredited = new Set(["observera", "observerb", "observerc"])
const all: Tally[] = []
let t0 = 1
for (const r of roles)
  for (const u of DEMO_UNITS) {
    const rep = reportFor(r, u)
    if (!rep) continue
    const attributes = tallyAttributes(rep, t0++)
    const payload = tallyPayload(rep)
    all.push(decodeTally({ key: "0x", creator: r, owner: SEAL, creationFlags: { readonly: true }, attributes, toJson: () => payload }))
  }
for (const u of DEMO_UNITS) {
  const v = verdictFor(all.filter((t) => t.pu === u.pu), accredited)
  console.log(u.pu.padEnd(14), v.status.padEnd(11), "acc", v.accredited.length, "other", v.others.length, "overvote", v.accredited.some((t) => t.overvote), "turnout", (all.find((t) => t.pu === u.pu)!.turnoutBp / 100) + "%")
}
