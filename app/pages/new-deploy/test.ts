import { test, assert, equal } from "@elements/app";
import { makeFixture } from "#app/shared/services/fixtures";
import { loadDeployTargets } from "#app/shared/services/deploys";

test("new deploy offers each service its newest commits first", () => {
  let f = makeFixture();

  let targets = loadDeployTargets();
  let commits = targets.commits.filter((c) => c.serviceId === f.serviceId);

  equal(commits.map((c) => c.version), ["1.0.3", "1.0.2", "1.0.1"]);
  equal(targets.environments.filter((e) => e.serviceId === f.serviceId).length, 2);
  assert(targets.services.some((s) => s.id === f.serviceId));
});
