// Ntuli data contract on Arkiv. Everything the app filters on is a typed attribute;
// the payload only carries what a reader needs to display a record.
// The full contract is documented in /arkiv/schema.md.
import { addr, bytes32, i32, str, u64 } from "@arkiv-network/sdk/attr"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import type { Hex } from "viem"

export const APP = "ntuli"
export const SCHEMA_VERSION = 1
export const ELECTION = "demo-2026-gov"
export const ELECTION_LABEL = "Demo governorship election (synthetic data)"

// The accreditation body's wallet. Accreditation records count only if this address created them.
export const ACCREDITOR = "0x19932668eA29e2F446d404228Ae0d71ed9a3BA97" as Hex

// Sealed tallies are handed to this address in the same transaction that creates them.
// Nobody holds its key, so nobody can delete the record before it expires.
export const SEAL = "0x000000000000000000000000000000000000dEaD" as Hex

export const PARTIES = ["pa", "pb", "pc", "pd"] as const
export type Party = (typeof PARTIES)[number]
export const PARTY_LABEL: Record<Party, string> = {
  pa: "Party A",
  pb: "Party B",
  pc: "Party C",
  pd: "Party D",
}

// Lifetimes follow the dispute process, not a storage budget.
export const TALLY_DAYS = 180 // window in which a result can still be challenged
export const ACCREDITATION_DAYS = 45 // one observation mission
export const KEEP_ALIVE_DAYS = 30 // what one "keep alive" adds beyond the current expiry

export type TallyInput = {
  state: string
  lga: string
  ward: string
  pu: string // polling unit code, e.g. "LA/09/03/012"
  puName: string
  registered: number
  accredited: number
  votes: Record<Party, number>
  rejected: number
  sheetHash: Hex // hash of the result sheet photo; the photo itself never goes on Arkiv
  note?: string
}

export function turnoutBp(t: Pick<TallyInput, "registered" | "accredited">): number {
  if (t.registered <= 0) return 0
  return Math.round((t.accredited / t.registered) * 10_000)
}

export function totalCast(t: Pick<TallyInput, "votes" | "rejected">): number {
  return PARTIES.reduce((s, p) => s + t.votes[p], 0) + t.rejected
}

export function tallyAttributes(t: TallyInput, reportedAt: number) {
  return {
    app: str(APP),
    v: i32(SCHEMA_VERSION),
    kind: str("tally"),
    election: str(ELECTION),
    state: str(t.state),
    lga: str(t.lga),
    ward: str(t.ward),
    pu: str(t.pu),
    registered: u64(t.registered),
    accredited: u64(t.accredited),
    pa: u64(t.votes.pa),
    pb: u64(t.votes.pb),
    pc: u64(t.votes.pc),
    pd: u64(t.votes.pd),
    rejected: u64(t.rejected),
    turnout_bp: i32(turnoutBp(t)),
    // More votes cast than voters accredited is the classic forged-sheet signal; kept queryable.
    overvote: i32(totalCast(t) > t.accredited ? 1 : 0),
    reported_at: u64(reportedAt),
    sheet: bytes32(t.sheetHash),
  }
}

export function tallyPayload(t: TallyInput) {
  return { puName: t.puName, note: t.note ?? "", synthetic: true }
}

export function accreditationAttributes(observer: Hex, missionCode: string) {
  return {
    app: str(APP),
    v: i32(SCHEMA_VERSION),
    kind: str("accreditation"),
    election: str(ELECTION),
    observer: addr(observer),
    mission: str(missionCode),
  }
}

// ---- Queries ----------------------------------------------------------------

export const base = (kind: "tally" | "accreditation") => [
  eq("app", APP),
  eq("kind", kind),
  eq("election", ELECTION),
]

export const q = {
  accreditations: () => and(base("accreditation")),
  talliesInState: (state: string) => and([...base("tally"), eq("state", state)]),
  talliesAtPu: (pu: string) => and([...base("tally"), eq("pu", pu)]),
  allTallies: () => and(base("tally")),
  highTurnout: (bp: number) => and([...base("tally"), gt("turnout_bp", bp)]),
  overvotes: () => and([...base("tally"), eq("overvote", 1)]),
}

// ---- Decoding -----------------------------------------------------------------

type RawAttrs = Readonly<Record<string, { value: unknown }>> | undefined

export type Tally = {
  key: Hex
  creator: Hex
  owner: Hex
  createdAt: bigint
  expiresAt: bigint
  readonly: boolean
  permissionlessExtension: boolean
  state: string
  lga: string
  ward: string
  pu: string
  puName: string
  note: string
  registered: number
  accredited: number
  votes: Record<Party, number>
  rejected: number
  turnoutBp: number
  overvote: boolean
  reportedAt: number
  sheet: Hex
}

const num = (a: RawAttrs, k: string) => Number((a?.[k]?.value as bigint | number | undefined) ?? 0)
const s = (a: RawAttrs, k: string) => String(a?.[k]?.value ?? "")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeTally(e: any): Tally {
  const a = e.attributes as RawAttrs
  let payload: { puName?: string; note?: string } = {}
  try {
    payload = e.toJson()
  } catch {
    payload = {}
  }
  return {
    key: e.key,
    creator: e.creator,
    owner: e.owner,
    createdAt: e.createdAt ?? 0n,
    expiresAt: e.expiresAt ?? 0n,
    readonly: !!e.creationFlags?.readonly,
    permissionlessExtension: !!e.creationFlags?.permissionlessExtension,
    state: s(a, "state"),
    lga: s(a, "lga"),
    ward: s(a, "ward"),
    pu: s(a, "pu"),
    puName: payload.puName ?? "",
    note: payload.note ?? "",
    registered: num(a, "registered"),
    accredited: num(a, "accredited"),
    votes: { pa: num(a, "pa"), pb: num(a, "pb"), pc: num(a, "pc"), pd: num(a, "pd") },
    rejected: num(a, "rejected"),
    turnoutBp: num(a, "turnout_bp"),
    overvote: num(a, "overvote") === 1,
    reportedAt: num(a, "reported_at"),
    sheet: s(a, "sheet") as Hex,
  }
}

export type Accreditation = {
  key: Hex
  creator: Hex
  observer: Hex
  mission: string
  alias: string
  expiresAt: bigint
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeAccreditation(e: any): Accreditation {
  const a = e.attributes as RawAttrs
  let payload: { alias?: string } = {}
  try {
    payload = e.toJson()
  } catch {
    payload = {}
  }
  return {
    key: e.key,
    creator: e.creator,
    observer: s(a, "observer") as Hex,
    mission: s(a, "mission"),
    alias: payload.alias ?? "",
    expiresAt: e.expiresAt ?? 0n,
  }
}

// ---- Verdicts -----------------------------------------------------------------

export const sameAddr = (x?: string, y?: string) => !!x && !!y && x.toLowerCase() === y.toLowerCase()

export const isSealed = (t: Tally) => t.readonly && sameAddr(t.owner, SEAL)

export function fingerprint(t: Tally): string {
  return [t.registered, t.accredited, ...PARTIES.map((p) => t.votes[p]), t.rejected].join("|")
}

export type PuStatus = "confirmed" | "contested" | "single" | "unverified"

export type PuVerdict = {
  pu: string
  puName: string
  state: string
  lga: string
  ward: string
  status: PuStatus
  // The result accredited observers agree on (or the largest agreeing group when contested).
  leading?: Tally
  accredited: Tally[] // tallies by accredited observers, one per observer (earliest wins)
  others: Tally[] // tallies by wallets with no live accreditation, shown but never counted
  groups: { fp: string; tallies: Tally[] }[]
}

// One observer gets one voice per polling unit: a later conflicting report from the same wallet
// is kept on screen but cannot outvote another observer.
export function verdictFor(tallies: Tally[], accreditedSet: Set<string>): PuVerdict {
  const sorted = [...tallies].sort((x, y) => x.reportedAt - y.reportedAt)
  const first = sorted[0]
  const seen = new Set<string>()
  const accredited: Tally[] = []
  const others: Tally[] = []
  for (const t of sorted) {
    const c = t.creator.toLowerCase()
    if (accreditedSet.has(c) && isSealed(t)) {
      if (!seen.has(c)) {
        seen.add(c)
        accredited.push(t)
      } else others.push(t)
    } else others.push(t)
  }
  const byFp = new Map<string, Tally[]>()
  for (const t of accredited) {
    const fp = fingerprint(t)
    byFp.set(fp, [...(byFp.get(fp) ?? []), t])
  }
  const groups = [...byFp.entries()]
    .map(([fp, ts]) => ({ fp, tallies: ts }))
    .sort((x, y) => y.tallies.length - x.tallies.length)
  let status: PuStatus
  if (accredited.length === 0) status = "unverified"
  else if (groups.length > 1) status = "contested"
  else if (accredited.length >= 2) status = "confirmed"
  else status = "single"
  return {
    pu: first.pu,
    puName: first.puName,
    state: first.state,
    lga: first.lga,
    ward: first.ward,
    status,
    leading: groups[0]?.tallies[0],
    accredited,
    others,
    groups,
  }
}

export const STATUS_LABEL: Record<PuStatus, string> = {
  confirmed: "Confirmed",
  contested: "Contested",
  single: "One observer",
  unverified: "Unverified",
}
