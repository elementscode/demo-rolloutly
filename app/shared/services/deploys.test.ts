import { test, assert, equal, errorf, session, sql } from "@elements/app";
import { finishedDeploy, loginAs, makeFixture } from "#app/shared/services/fixtures";
import { loadDeployDetail, loadInsights, loadOverview, loadServiceDetail, rollback, startDeploy } from "#app/shared/services/deploys";

async function expectError(fn: () => unknown, fragment: string) {
  try {
    await fn();
    errorf("expected an error containing %v", fragment);
  } catch (err: any) {
    assert(String(err.message).includes(fragment), `got "${err.message}", wanted "${fragment}"`);
  }
}

test("startDeploy", () => {
  test("queues a deploy with its five pipeline stages", () => {
    let f = makeFixture();
    loginAs(f.userId);

    let number = startDeploy({ serviceId: f.serviceId, environment: "staging", commitId: f.commits[2] });
    let { deploy, stages } = loadDeployDetail(number);

    equal(deploy.status, "queued");
    equal(deploy.kind, "deploy");
    equal(deploy.version, "1.0.3");
    equal(stages.map((s) => s.name), ["build", "test", "migrate", "release", "health check"]);
    assert(stages.every((s) => s.status === "pending"));

    let jobs = sql<{ n: number }>(`select count(*)::int as n from elements.jobs where fields->>'deployId' = ${deploy.id}`).firstOrThrow();
    equal(jobs.n, 1);
  });

  test("refuses a second deploy to a busy environment", async () => {
    let f = makeFixture();
    loginAs(f.userId);

    startDeploy({ serviceId: f.serviceId, environment: "production", commitId: f.commits[0] });
    await expectError(() => startDeploy({ serviceId: f.serviceId, environment: "production", commitId: f.commits[1] }), "already running");

    // The other environment is free.
    startDeploy({ serviceId: f.serviceId, environment: "staging", commitId: f.commits[1] });
  });

  test("refuses a commit from another service", async () => {
    let f = makeFixture("checkout");
    let other = makeFixture("search");
    loginAs(f.userId);

    await expectError(() => startDeploy({ serviceId: f.serviceId, environment: "staging", commitId: other.commits[0] }), "pick a commit");
  });

  test("requires a signed-in user", async () => {
    let f = makeFixture();
    session.logout();

    await expectError(() => startDeploy({ serviceId: f.serviceId, environment: "staging", commitId: f.commits[0] }), "");
    equal(sql<{ n: number }>(`select count(*)::int as n from deploys where serviceId = ${f.serviceId}`).firstOrThrow().n, 0);
  });
});

test("rollback", () => {
  test("restores an earlier production release with release and health check stages", () => {
    let f = makeFixture();
    let old = finishedDeploy(f, f.commits[0], "production", "succeeded", 120);
    finishedDeploy(f, f.commits[1], "production", "succeeded", 60);
    loginAs(f.userId);

    let number = rollback(old);
    let { deploy, stages } = loadDeployDetail(number);

    equal(deploy.kind, "rollback");
    equal(deploy.environment, "production");
    equal(deploy.version, "1.0.1");
    equal(stages.map((s) => s.name), ["release", "health check"]);
  });

  test("refuses the release already running", async () => {
    let f = makeFixture();
    let current = finishedDeploy(f, f.commits[1], "production", "succeeded", 60);
    loginAs(f.userId);

    await expectError(() => rollback(current), "already running");
  });

  test("refuses a staging or failed deploy", async () => {
    let f = makeFixture();
    let staging = finishedDeploy(f, f.commits[0], "staging", "succeeded", 90);
    let failed = finishedDeploy(f, f.commits[1], "production", "failed", 60, "test");
    loginAs(f.userId);

    await expectError(() => rollback(staging), "cannot be restored");
    await expectError(() => rollback(failed), "cannot be restored");
  });
});

test("loadServiceDetail lists earlier releases but not the one running", () => {
  let f = makeFixture();
  finishedDeploy(f, f.commits[0], "production", "succeeded", 180);
  finishedDeploy(f, f.commits[1], "production", "succeeded", 120);
  finishedDeploy(f, f.commits[2], "production", "succeeded", 60);

  let detail = loadServiceDetail(f.slug);

  equal(detail.environments.map((e) => e.name), ["staging", "production"]);
  equal(detail.environments[1].currentVersion, "1.0.3");
  equal(detail.releases.map((r) => r.version), ["1.0.2", "1.0.1"]);
});

test("loadOverview pairs every service with both environments", () => {
  let f = makeFixture();
  let id = finishedDeploy(f, f.commits[0], "staging", "succeeded", 1);

  let overview = loadOverview();
  let card = overview.services.find((s) => s.id === f.serviceId)!;

  assert(overview.services.every((s) => s.staging && s.production));
  equal(card.staging.currentVersion, "1.0.1");
  equal(card.production.currentVersion, null);
  equal(overview.recent[0].id, id);
});

test("loadInsights", () => {
  test("counts deploys per day and the success rate", () => {
    let f = makeFixture();
    finishedDeploy(f, f.commits[0], "staging", "succeeded", 30);
    finishedDeploy(f, f.commits[1], "staging", "failed", 20, "test");

    let insights = loadInsights(f.serviceId);
    let today = insights.deploysPerDay.at(-1)!;

    equal(insights.deploysPerDay.length, 30);
    equal(today.succeeded + today.failed, insights.totals.deploys);
    equal(insights.totals.failed, 1);
    equal(Math.round(insights.successRate.at(-1)!.value!), 50);
  });

  test("measures recovery from a failed production deploy to the next success", () => {
    let f = makeFixture();
    finishedDeploy(f, f.commits[0], "production", "failed", 100, "health check");
    finishedDeploy(f, f.commits[1], "production", "succeeded", 60);

    let insights = loadInsights(f.serviceId);

    equal(insights.recoveries.length, 1);
    equal(Math.round(insights.recoveries[0].minutes!), 40);
    equal(Math.round(insights.totals.mttrMinutes!), 40);
  });

  test("leaves an unrecovered failure open", () => {
    let f = makeFixture();
    finishedDeploy(f, f.commits[0], "production", "failed", 30, "release");

    let insights = loadInsights(f.serviceId);

    equal(insights.recoveries[0].minutes, null);
    equal(insights.totals.mttrMinutes, null);
  });
});
