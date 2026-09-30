import { test, assert, equal, sql } from "@elements/app";
import { finishedDeploy, loginAs, makeFixture } from "#app/shared/services/fixtures";
import { loadDeployDetail, startDeploy } from "#app/shared/services/deploys";
import { RunDeployJob, stageScript } from "#app/jobs/run-deploy";

function envState(serviceId: string, name: string) {
  return sql<{ currentDeployId: string | null; health: string }>(
    `select currentDeployId, health from environments where serviceId = ${serviceId} and name = ${name}`,
  ).firstOrThrow();
}

test("RunDeployJob", () => {
  test("runs every stage, writes the log and releases the commit", () => {
    let f = makeFixture();
    loginAs(f.userId);
    let number = startDeploy({ serviceId: f.serviceId, environment: "staging", commitId: f.commits[2] });
    let id = loadDeployDetail(number).deploy.id;

    new RunDeployJob({ deployId: id, failAt: null, pace: 0 }).run();

    let { deploy, stages, logs } = loadDeployDetail(number);
    equal(deploy.status, "succeeded");
    assert(stages.every((s) => s.status === "succeeded" && s.startedAt && s.finishedAt));
    assert(logs.length >= 18, `only ${logs.length} log lines`);
    equal(envState(f.serviceId, "staging").currentDeployId, id);
    equal(envState(f.serviceId, "staging").health, "healthy");
  });

  test("a failing stage skips the rest and leaves the environment alone", () => {
    let f = makeFixture();
    let before = finishedDeploy(f, f.commits[0], "production", "succeeded", 60);
    loginAs(f.userId);
    let number = startDeploy({ serviceId: f.serviceId, environment: "production", commitId: f.commits[2] });

    new RunDeployJob({ deployId: loadDeployDetail(number).deploy.id, failAt: "test", pace: 0 }).run();

    let { deploy, stages, logs } = loadDeployDetail(number);
    equal(deploy.status, "failed");
    equal(deploy.failedStage, "test");
    equal(stages.map((s) => s.status), ["succeeded", "failed", "skipped", "skipped", "skipped"]);
    equal(logs.at(-1)!.level, "error");
    equal(envState(f.serviceId, "production").currentDeployId, before);
  });

  test("a failed health check leaves the new release live and degraded", () => {
    let f = makeFixture();
    loginAs(f.userId);
    let number = startDeploy({ serviceId: f.serviceId, environment: "production", commitId: f.commits[2] });
    let id = loadDeployDetail(number).deploy.id;

    new RunDeployJob({ deployId: id, failAt: "health check", pace: 0 }).run();

    equal(envState(f.serviceId, "production").currentDeployId, id);
    equal(envState(f.serviceId, "production").health, "degraded");
  });

  test("ignores a deploy that is no longer queued", () => {
    let f = makeFixture();
    let done = finishedDeploy(f, f.commits[0], "staging", "succeeded", 10);

    new RunDeployJob({ deployId: done, failAt: null, pace: 0 }).run();

    equal(sql<{ n: number }>(`select count(*)::int as n from deployLogs where deployId = ${done}`).firstOrThrow().n, 0);
  });
});

test("stageScript ends a failing stage on its error", () => {
  let d = { id: "d", serviceId: "s", slug: "checkout", environment: "staging" as const, kind: "deploy" as const, version: "1.0.0", sha: "abcdef1234" };

  for (let stage of ["build", "test", "migrate", "release", "health check"]) {
    let ok = stageScript(stage, d, false);
    let bad = stageScript(stage, d, true);

    assert(ok.every((s) => (s.level ?? "info") === "info"), `${stage} succeeded with an error line`);
    equal(bad.at(-1)!.level, "error", `${stage} failure`);
  }
});
