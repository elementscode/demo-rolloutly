import { test, equal, sql } from "@elements/app";
import { finishedDeploy, makeFixture } from "#app/shared/services/fixtures";
import { loadActivity } from "#app/shared/services/deploys";

test("activity lists deploys newest first across services", () => {
  let a = makeFixture("checkout");
  let b = makeFixture("search");
  finishedDeploy(a, a.commits[0], "staging", "succeeded", 50);
  finishedDeploy(b, b.commits[0], "production", "failed", 10, "test");

  let mine = new Set([a.serviceId, b.serviceId]);
  let total = sql<{ n: number }>(`select count(*)::int as n from deploys`).firstOrThrow().n;
  let rows = loadActivity(total).filter((r) => mine.has(r.serviceId));

  equal(rows.map((r) => r.serviceSlug), [b.slug, a.slug]);
  equal(rows[0].failedStage, "test");
});
