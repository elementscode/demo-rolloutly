import { test, equal, sql } from "@elements/app";
import { finishedDeploy, makeFixture } from "#app/shared/services/fixtures";
import { findDeployId, loadDeployDetail } from "#app/shared/services/deploys";

test("deploy detail returns stages in order and the log by sequence", () => {
  let f = makeFixture();
  let id = finishedDeploy(f, f.commits[0], "staging", "succeeded", 20);
  let number = sql<{ number: number }>(`select number from deploys where id = ${id}`).firstOrThrow().number;

  sql(`insert into deployLogs (deployId, stage, line) values (${id}, 'build', 'first'), (${id}, 'build', 'second')`);

  let detail = loadDeployDetail(number);

  equal(findDeployId(number), id);
  equal(detail.stages.map((s) => s.name), ["build"]);
  equal(detail.logs.map((l) => l.line), ["first", "second"]);
});
