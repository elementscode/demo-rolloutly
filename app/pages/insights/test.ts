import { test, equal } from "@elements/app";
import { finishedDeploy, makeFixture } from "#app/shared/services/fixtures";
import { loadInsights } from "#app/shared/services/deploys";

test("insights filtered to one service ignore the others", () => {
  let before = loadInsights("").totals.deploys;
  let a = makeFixture("checkout");
  let b = makeFixture("search");
  finishedDeploy(a, a.commits[0], "staging", "succeeded", 30);
  finishedDeploy(b, b.commits[0], "staging", "failed", 30, "build");

  equal(loadInsights(a.serviceId).totals.deploys, 1);
  equal(loadInsights(a.serviceId).totals.failed, 0);
  equal(loadInsights("").totals.deploys, before + 2);
});
