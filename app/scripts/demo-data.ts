// Synthetic polling units and observer reports. Names and codes are invented; states and LGAs
// are public place names used only to make the demo legible.
import { keccak256, toHex, type Hex } from "viem"
import type { Party, TallyInput } from "../src/arkiv/schema.ts"

type Unit = {
  state: string
  lga: string
  ward: string
  pu: string
  puName: string
  registered: number
  accredited: number
  votes: Record<Party, number>
  rejected: number
}

export const DEMO_UNITS: Unit[] = [
  { state: "Lagos", lga: "Ikeja", ward: "Ward 03", pu: "LA/09/03/001", puName: "Demo Primary School I", registered: 812, accredited: 401, votes: { pa: 172, pb: 151, pc: 49, pd: 18 }, rejected: 11 },
  { state: "Lagos", lga: "Ikeja", ward: "Ward 03", pu: "LA/09/03/002", puName: "Demo Town Hall", registered: 655, accredited: 298, votes: { pa: 120, pb: 133, pc: 30, pd: 9 }, rejected: 6 },
  { state: "Lagos", lga: "Surulere", ward: "Ward 07", pu: "LA/17/07/004", puName: "Demo Market Square", registered: 940, accredited: 512, votes: { pa: 201, pb: 222, pc: 61, pd: 20 }, rejected: 8 },
  { state: "Lagos", lga: "Surulere", ward: "Ward 07", pu: "LA/17/07/009", puName: "Demo Civic Centre", registered: 733, accredited: 344, votes: { pa: 160, pb: 129, pc: 40, pd: 9 }, rejected: 6 },
  { state: "Kano", lga: "Nassarawa", ward: "Ward 02", pu: "KN/30/02/011", puName: "Demo Junior Secondary", registered: 1020, accredited: 610, votes: { pa: 230, pb: 288, pc: 70, pd: 12 }, rejected: 10 },
  { state: "Kano", lga: "Nassarawa", ward: "Ward 02", pu: "KN/30/02/014", puName: "Demo Health Post", registered: 870, accredited: 835, votes: { pa: 20, pb: 801, pc: 6, pd: 2 }, rejected: 6 },
  { state: "Rivers", lga: "Obio/Akpor", ward: "Ward 05", pu: "RV/18/05/003", puName: "Demo Community Library", registered: 990, accredited: 455, votes: { pa: 141, pb: 160, pc: 132, pd: 13 }, rejected: 9 },
  { state: "Rivers", lga: "Obio/Akpor", ward: "Ward 05", pu: "RV/18/05/006", puName: "Demo Open Field", registered: 760, accredited: 330, votes: { pa: 99, pb: 118, pc: 101, pd: 6 }, rejected: 6 },
  { state: "FCT", lga: "AMAC", ward: "Ward 01", pu: "FC/01/01/008", puName: "Demo Model School", registered: 680, accredited: 302, votes: { pa: 130, pb: 120, pc: 35, pd: 10 }, rejected: 7 },
  { state: "FCT", lga: "AMAC", ward: "Ward 01", pu: "FC/01/01/010", puName: "Demo Youth Centre", registered: 590, accredited: 260, votes: { pa: 101, pb: 112, pc: 31, pd: 9 }, rejected: 7 },
]

const sheet = (pu: string, variant: string): Hex =>
  keccak256(toHex(`synthetic-sheet:${pu}:${variant}`))

const report = (u: Unit, variant = "original", over?: Partial<Unit>): TallyInput => {
  const merged = { ...u, ...over, votes: { ...u.votes, ...(over?.votes ?? {}) } }
  return { ...merged, sheetHash: sheet(u.pu, variant) }
}

// Who reported what. The scenarios the demo needs:
//   - A and B agree on most units            -> Confirmed
//   - C posts an inflated sheet at RV/18/05/003 (more votes than accredited voters) -> Contested
//   - only A covered FC/01/01/010            -> One observer
//   - only D (never accredited) covered LA/17/07/009 -> Unverified
//   - D also posts different numbers at LA/09/03/001; it is shown but never counted
//   - KN/30/02/014 is confirmed but has 96% turnout, which the anomaly query surfaces
export function reportFor(role: string, u: Unit): TallyInput | null {
  switch (role) {
    case "observerA":
      return u.pu === "LA/17/07/009" ? null : report(u)
    case "observerB":
      return ["LA/17/07/009", "FC/01/01/010", "RV/18/05/003"].includes(u.pu) ? null : report(u)
    case "observerC":
      if (u.pu === "RV/18/05/003")
        return report(u, "altered", {
          votes: { pa: 141, pb: 160, pc: 312, pd: 13 },
        } as Partial<Unit>)
      return u.state === "Kano" ? report(u) : null
    case "observerD":
      if (u.pu === "LA/17/07/009") return report(u)
      if (u.pu === "LA/09/03/001")
        return report(u, "unaccredited", { votes: { pa: 90, pb: 233, pc: 49, pd: 18 } } as Partial<Unit>)
      return null
    default:
      return null
  }
}
