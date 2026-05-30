import { afterAll, expect, test } from "bun:test";
import { emptyVenture, missingGateFields, processResponse } from "../state/stateManager";

afterAll(async () => {
  await Bun.$`rm -rf ${new URL("../businesses/merge-test", import.meta.url).pathname}`.quiet();
});

test("reports intake gate fields before idea", () => {
  const venture = emptyVenture("Test Business");
  venture.phase = "idea";
  expect(missingGateFields(venture, "idea")).toContain("intake.idea");
});

test("merges a trailing wzd state block", async () => {
  const venture = emptyVenture("Merge Test");
  const response = 'Here is the move.\n```wzd-state\n{"intake":{"idea":"Sell audits","skills":["sales"]},"next_actions":["Name ten targets"]}\n```';
  const result = await processResponse(response, venture);
  expect(result.display).toBe("Here is the move.");
  expect(result.venture.intake.idea).toBe("Sell audits");
  expect(result.venture.next_actions).toEqual(["Name ten targets"]);
});
