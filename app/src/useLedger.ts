import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Hex } from "viem"
import { live, reader } from "./arkiv/client"
import {
  ACCREDITOR,
  APP,
  decodeAccreditation,
  decodeTally,
  q,
  verdictFor,
  type Accreditation,
  type PuVerdict,
  type Tally,
} from "./arkiv/schema"

export type FeedItem = { at: number; text: string; key?: Hex; tx?: Hex }

// Loads every Ntuli entity with cursor pagination, then keeps the view current from entity events.
export function useLedger() {
  const [tallies, setTallies] = useState<Map<string, Tally>>(new Map())
  const [accreditations, setAccreditations] = useState<Accreditation[]>([])
  const [block, setBlock] = useState<bigint>(0n)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string>("")
  const [liveState, setLiveState] = useState<"connecting" | "live" | "down">("connecting")
  const [feed, setFeed] = useState<FeedItem[]>([])
  const known = useRef<Set<string>>(new Set())

  const push = (f: FeedItem) => setFeed((x) => [f, ...x].slice(0, 30))

  const loadAccreditations = useCallback(async () => {
    const out: Accreditation[] = []
    // Trust comes from $creator: an accreditation anyone else wrote is ignored by the query itself.
    for await (const e of reader.select().where(q.accreditations()).createdBy(ACCREDITOR).limit(100))
      out.push(decodeAccreditation(e))
    setAccreditations(out)
  }, [])

  const loadTallies = useCallback(async () => {
    const next = new Map<string, Tally>()
    for await (const e of reader.select().where(q.allTallies()).limit(100)) {
      const t = decodeTally(e)
      next.set(t.key.toLowerCase(), t)
    }
    known.current = new Set(next.keys())
    setTallies(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [b] = await Promise.all([reader.getBlockNumber(), loadAccreditations(), loadTallies()])
      setBlock(b)
      setStatus("ready")
    } catch (e) {
      setError(String((e as Error).message ?? e))
      setStatus("error")
    }
  }, [loadAccreditations, loadTallies])

  const refetchOne = useCallback(async (key: Hex) => {
    try {
      const e = await reader.getEntity(key)
      const attrs = e.attributes as Record<string, { value: unknown }> | undefined
      if (attrs?.app?.value !== APP) return null
      if (attrs.kind?.value === "tally") {
        const t = decodeTally(e)
        setTallies((m) => new Map(m).set(t.key.toLowerCase(), t))
        return t
      }
      if (attrs.kind?.value === "accreditation") await loadAccreditations()
    } catch {
      /* not ours, or already gone */
    }
    return null
  }, [loadAccreditations])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    let stopped = false
    const unwatch = live.watchEntityEvents({
      onEntityCreated: async (ev) => {
        const t = await refetchOne(ev.entityKey)
        if (t && !stopped)
          push({ at: Date.now(), text: `New sealed tally at ${t.pu}`, key: ev.entityKey, tx: ev.transactionHash })
        setLiveState("live")
      },
      onExpiryExtended: async (ev) => {
        if (!known.current.has(ev.entityKey.toLowerCase())) return
        const t = await refetchOne(ev.entityKey)
        if (t) push({ at: Date.now(), text: `Tally at ${t.pu} kept alive`, key: ev.entityKey, tx: ev.transactionHash })
      },
      onEntityDeleted: async (ev) => {
        // Accreditations are the only Ntuli records that can be deleted (revocation).
        await loadAccreditations()
        push({ at: Date.now(), text: "An accreditation was revoked", key: ev.entityKey, tx: ev.transactionHash })
      },
      onError: () => setLiveState("down"),
    })
    live.getBlockNumber().then(() => !stopped && setLiveState("live")).catch(() => setLiveState("down"))
    const tick = setInterval(() => reader.getBlockNumber().then(setBlock).catch(() => {}), 10_000)
    return () => {
      stopped = true
      unwatch()
      clearInterval(tick)
    }
  }, [refetchOne, loadAccreditations])

  const accreditedSet = useMemo(() => {
    const s = new Set<string>()
    for (const a of accreditations) if (a.expiresAt > block || block === 0n) s.add(a.observer.toLowerCase())
    return s
  }, [accreditations, block])

  const verdicts = useMemo(() => {
    const byPu = new Map<string, Tally[]>()
    for (const t of tallies.values()) byPu.set(t.pu, [...(byPu.get(t.pu) ?? []), t])
    const out: PuVerdict[] = []
    for (const ts of byPu.values()) out.push(verdictFor(ts, accreditedSet))
    return out.sort((x, y) => x.pu.localeCompare(y.pu))
  }, [tallies, accreditedSet])

  return {
    tallies: [...tallies.values()],
    accreditations,
    accreditedSet,
    verdicts,
    block,
    status,
    error,
    liveState,
    feed,
    refresh,
    refetchOne,
  }
}
