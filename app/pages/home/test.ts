import { test, equal } from "@elements/app";
import { finishedDeploy, loginAs, makeFixture } from "#app/shared/services/fixtures";
import { loadOverview, startDeploy } from "#app/shared/services/deploys";

test("overview shows a queued deploy as running on its service", () => {
  let f = makeFixture();
  finishedDeploy(f, f.commits[0], "production", "succeeded", 60);
  loginAs(f.userId);
  startDeploy({ serviceId: f.serviceId, environment: "production", commitId: f.commits[1] });

  let overview = loadOverview();
  let card = overview.services.find((s) => s.id === f.serviceId)!;

  equal(overview.running.filter((d) => d.serviceId === f.serviceId).length, 1);
  equal(card.running?.version, "1.0.2");
  equal(card.production.currentVersion, "1.0.1");
});
