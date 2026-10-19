// Adverse-path proof on one sealed tally:
//   1. its own creator tries to delete it  -> must revert (owner is the seal address)
//   2. its own creator tries to patch it   -> must revert (readonly)
//   3. an unrelated wallet extends it      -> must succeed (permissionless extension)
import { decodeTally, q, sameAddr } from "../src/arkiv/schema.ts"
import { keepAlive } from "../src/arkiv/write.ts"
import { reader, walletFor } from "./clients.ts"

const creator = walletFor("observerA")
const stranger = walletFor("observerD")
const page = await reader.select().where(q.talliesAtPu("LA/09/03/002")).createdBy(creator.address).limit(1).fetch()
const t = decodeTally(page.entities[0])
console.log("target", t.key, "creator", t.creator, "owner", t.owner, "expiresAt", t.expiresAt)

const short = (e: unknown) => {
  const text = String((e as Error)?.message ?? e) + "\n" + String((e as { cause?: Error })?.cause?.message ?? "")
  return text.split("\n").map((l) => l.trim()).filter((l) => /^Error: |reverted|\(0x|^\([0-9]/.test(l)).slice(0, 3).join(" ")
}
try {
  await creator.client.deleteEntity({ entityKey: t.key })
  console.log("DELETE BY CREATOR: unexpectedly succeeded")
} catch (e) {
  console.log("delete by creator rejected:", short(e))
}
try {
  await creator.client.patchEntity({ entityKey: t.key, set: { pa: 999n } })
  console.log("PATCH BY CREATOR: unexpectedly succeeded")
} catch (e) {
  console.log("patch by creator rejected:", short(e))
}
const block = await reader.getBlockNumber()
const secondsLeft = Number(t.expiresAt - block) * 2
if (process.argv[2] === "no-extend") process.exit(0)
const r = await keepAlive(stranger.client, t.key, secondsLeft)
const after = decodeTally(await reader.getEntity(t.key))
console.log("extended by", stranger.address, "tx", r.txHash, "expiresAt", t.expiresAt, "->", after.expiresAt, "owner still seal:", sameAddr(after.owner, t.owner))
