import { describe, expect, it } from "vitest"

import {
  canTransitionPreparation,
  legacyStatusFromHiring,
  unsupportedNumericClaims,
  workflowStateFromLegacy,
} from "./workflowDomain"

describe("workflow state compatibility", () => {
  it("backfills legacy application statuses without losing hiring state", () => {
    expect(workflowStateFromLegacy("Saved")).toEqual({
      preparationStatus: "discovered",
      hiringStatus: "not_applied",
    })
    expect(workflowStateFromLegacy("Interview")).toEqual({
      preparationStatus: "ready",
      hiringStatus: "interview",
    })
    expect(legacyStatusFromHiring("assessment")).toBe("Test")
  })

  it("rejects skipped preparation transitions", () => {
    expect(canTransitionPreparation("discovered", "qualified")).toBe(true)
    expect(canTransitionPreparation("discovered", "ready")).toBe(false)
    expect(canTransitionPreparation("preparing", "archived")).toBe(true)
    expect(canTransitionPreparation("archived", "discovered")).toBe(true)
  })

  it("finds numeric claims that do not exist in candidate evidence", () => {
    expect(
      unsupportedNumericClaims(
        "Improved activation by 24% after 6 months.",
        "Verified: improved activation by 18% after 6 months."
      )
    ).toEqual(["24%"])
  })
})
