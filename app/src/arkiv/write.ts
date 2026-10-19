// Writes shared by the browser app and the operator scripts.
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import type { Hex } from "viem"
import {
  ACCREDITATION_DAYS,
  KEEP_ALIVE_DAYS,
  SEAL,
  TALLY_DAYS,
  accreditationAttributes,
  tallyAttributes,
  tallyPayload,
  type TallyInput,
} from "./schema.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wallet = any

// Publishes tallies as sealed records in one transaction: each is created readonly with
// permissionless extension, and handed to SEAL in the same batch. There is no moment at which
// the observer could still edit or delete what they posted.
export async function publishSealedTallies(
  reader: Wallet,
  wallet: Wallet,
  owner: Hex,
  tallies: TallyInput[],
) {
  const predicted = await reader.predictEntityKeys({ owner, count: tallies.length })
  const reportedAt = Math.floor(Date.now() / 1000)
  const result = await wallet.executeBatch({
    creates: tallies.map((t, i) => ({
      attributes: tallyAttributes(t, reportedAt),
      payload: jsonToPayload(tallyPayload(t)),
      contentType: "application/json",
      expires: ExpirationTime.fromDays(TALLY_DAYS),
      flags: { readonly: true, permissionlessExtension: true },
      salt: predicted[i].salt,
    })),
    ownershipChanges: predicted.map((p: { key: Hex }) => ({ entityKey: p.key, newOwner: SEAL })),
  })
  return { txHash: result.txHash as Hex, keys: result.createdEntities as Hex[] }
}

// Accreditation is one atomic batch: a mission's observer list lands together or not at all.
export async function accreditObservers(
  wallet: Wallet,
  observers: { address: Hex; alias: string }[],
  mission: string,
) {
  const result = await wallet.executeBatch({
    creates: observers.map((o) => ({
      attributes: accreditationAttributes(o.address, mission),
      payload: jsonToPayload({ alias: o.alias, synthetic: true }),
      contentType: "application/json",
      expires: ExpirationTime.fromDays(ACCREDITATION_DAYS),
    })),
  })
  return { txHash: result.txHash as Hex, keys: result.createdEntities as Hex[] }
}

// Anyone can push a sealed tally's expiry out; the new expiry must be later than the current one.
export async function keepAlive(wallet: Wallet, entityKey: Hex, secondsLeft: number) {
  const seconds = Math.max(0, secondsLeft) + KEEP_ALIVE_DAYS * 24 * 3600
  const rounded = Math.ceil(seconds / 2) * 2 // durations must be whole 2-second blocks
  return wallet.extendEntity({ entityKey, expires: ExpirationTime.fromSeconds(rounded) })
}

// Revoking an accreditation is deleting it; its observer's tallies stay on chain but stop counting.
export async function revokeAccreditation(wallet: Wallet, entityKey: Hex) {
  return wallet.deleteEntity({ entityKey })
}
