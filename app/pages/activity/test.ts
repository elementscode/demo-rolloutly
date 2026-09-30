import { test, equal } from "@elements/app";
import { finishedDeploy, makeFixture } from "#app/shared/services/fixtures";
import { loadActivity } from "#app/shared/services/deploys";

test("activity lists deploys newest first across services", () => {
  let a = makeFixture("checkout");
  let b = makeFixture("search");
  finishedDeploy(a, a.commits[0], "staging", "succeeded", 50);
  finishedDeploy(b, b.commits[0], "production", "failed", 10, "test");

  let rows = loadActivity(10);

  equal(rows.map((r) => r.serviceSlug), ["search", "checkout"]);
  equal(rows[0].failedStage, "test");
});
