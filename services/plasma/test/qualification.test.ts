import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateEmployment } from "../src/qualification.js";
import {
  EMPLOYER_A,
  FIXTURE_WALLET,
  TOKEN_A,
  employers,
  missingMonthTransfers,
  positiveTransfers,
  stablecoins,
  tieBreakTransfers
} from "./fixtures.js";

describe("evaluateEmployment", () => {
  it("passes positive fixture and uses strict UTC month windows", () => {
    const result = evaluateEmployment(FIXTURE_WALLET, positiveTransfers, employers, stablecoins);

    assert.equal(result.qualifies, true);
    assert.equal(result.employer?.toLowerCase(), EMPLOYER_A.toLowerCase());
    assert.deepEqual(result.monthsMatched, ["2025-11", "2025-12", "2026-01"]);
    assert.equal(result.paymentCount, 4);
  });

  it("fails fixture when a month is missing", () => {
    const result = evaluateEmployment(FIXTURE_WALLET, missingMonthTransfers, employers, stablecoins);

    assert.equal(result.qualifies, false);
    assert.equal(result.employer, null);
    assert.deepEqual(result.monthsMatched, []);
    assert.equal(result.paymentCount, 0);
  });

  it("applies employer tie-break deterministically", () => {
    const result = evaluateEmployment(FIXTURE_WALLET, tieBreakTransfers, employers, stablecoins);

    assert.equal(result.qualifies, true);
    assert.equal(result.employer?.toLowerCase(), EMPLOYER_A.toLowerCase());
    assert.deepEqual(result.monthsMatched, ["2025-11", "2025-12", "2026-01"]);
  });

  it("generates deterministic commitments across reruns", () => {
    const first = evaluateEmployment(FIXTURE_WALLET, positiveTransfers, employers, stablecoins);
    const second = evaluateEmployment(FIXTURE_WALLET, positiveTransfers, employers, stablecoins);

    assert.equal(first.factCommitment, second.factCommitment);
  });

  it("excludes transfers with non-allowlisted tokens", () => {
    const disallowedTokenTransfers = positiveTransfers.map((transfer) => ({
      ...transfer,
      token: "0x3000000000000000000000000000000000000003"
    }));

    const result = evaluateEmployment(FIXTURE_WALLET, disallowedTokenTransfers, employers, new Set([TOKEN_A.toLowerCase()]));

    assert.equal(result.qualifies, false);
  });

  it("demo_one_payment mode qualifies with one valid payment", () => {
    const singlePayment = [positiveTransfers[0]];
    const strict = evaluateEmployment(FIXTURE_WALLET, singlePayment, employers, stablecoins);
    const demo = evaluateEmployment(FIXTURE_WALLET, singlePayment, employers, stablecoins, {
      ruleMode: "demo_one_payment"
    });

    assert.equal(strict.qualifies, false);
    assert.equal(demo.qualifies, true);
    assert.equal(demo.employer?.toLowerCase(), EMPLOYER_A.toLowerCase());
    assert.equal(demo.paymentCount, 1);
  });

  it("demo_one_payment remains deterministic", () => {
    const one = evaluateEmployment(FIXTURE_WALLET, positiveTransfers, employers, stablecoins, {
      ruleMode: "demo_one_payment"
    });
    const two = evaluateEmployment(FIXTURE_WALLET, positiveTransfers, employers, stablecoins, {
      ruleMode: "demo_one_payment"
    });

    assert.equal(one.factCommitment, two.factCommitment);
  });
});
