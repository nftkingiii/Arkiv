// Reads the demo election back from Tiramisu with no app or backend involved, and prints what a
// judge can check on the explorer: creator, owner, creation flags and expiry of every tally.
import { ACCREDITOR, decodeAccreditation, decodeTally, isSealed, q } from "../src/arkiv/schema.ts"
import { reader } from "./clients.ts"

const acc = await reader.select().where(q.accreditations()).createdBy(ACCREDITOR).limit(200).fetch()
console.log("accreditations by", ACCREDITOR, acc.entities.length)
for (const e of acc.entities) {
  const a = decodeAccreditation(e)
  console.log("  observer", a.observer, a.mission, "key", a.key)
}
const tal = await reader.select().where(q.allTallies()).limit(200).fetch()
console.log("tallies", tal.entities.length)
for (const e of tal.entities) {
  const t = decodeTally(e)
  console.log(" ", t.pu.padEnd(13), "creator", t.creator.slice(0, 10), "owner", t.owner.slice(0, 10), "readonly", t.readonly, "anyoneExtends", t.permissionlessExtension, "sealed", isSealed(t), "expiresAt", t.expiresAt)
}
const hi = await reader.select({ key: true }).where(q.highTurnout(9000)).limit(50).fetch()
console.log("turnout > 90%:", hi.entities.length)
