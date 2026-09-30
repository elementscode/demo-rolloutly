import { test, equal, sql } from "@elements/app";
import { finishedDeploy, makeFixture } from "#app/shared/services/fixtures";
import { CheckHealthJob } from "#app/jobs/check-health";

test("CheckHealthJob keeps a release that failed its health check degraded", () => {
  let f = makeFixture();
  finishedDeploy(f, f.commits[0], "staging", "succeeded", 60);
  finishedDeploy(f, f.commits[1], "production", "failed", 30, "health check");

  new CheckHealthJob().probe();

  let rows = sql<{ name: string; health: string; errorRate: number }>(
    `select name, health, errorRate::float8 as errorRate from environments where serviceId = ${f.serviceId} order by name`,
  ).all();

  let production = rows.find((r) => r.name === "production")!;
  equal(production.health, "degraded");
  equal(production.errorRate >= 4, true);
});
