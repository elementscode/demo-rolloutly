import { Job, sql } from "@elements/app";
import { deployEvents, healthEvents } from "#app/shared/services/events";
import { DeployStatus, Env, HealthUpdate, LogLine, StageStatus } from "#app/shared/services/models";

export interface RunDeployJobFields {
  deployId: string;

  /** Forces the outcome: a stage name to fail at, or null to succeed. */
  failAt?: string | null;

  /** Scales every pause; 0 runs the pipeline without waiting. */
  pace?: number;
}

interface DeployContext {
  id: string;
  serviceId: string;
  slug: string;
  environment: Env;
  kind: "deploy" | "rollback";
  version: string;
  sha: string;
}

interface StageRow {
  id: string;
  name: string;
}

interface Step {
  line: string;
  level?: "info" | "warn" | "error";
}

const DEPLOY_FAILURE_RATE = 0.22;
const ROLLBACK_FAILURE_RATE = 0.05;

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function between(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Tests fail most often and migrations least, which is roughly how a real
 * pipeline breaks.
 */
function pickFailure(kind: "deploy" | "rollback", stages: string[]): string | null {
  let rate = kind === "rollback" ? ROLLBACK_FAILURE_RATE : DEPLOY_FAILURE_RATE;
  if (Math.random() >= rate) {
    return null;
  }

  let weighted = ["build", "test", "test", "test", "migrate", "release", "health check", "health check"]
    .filter((name) => stages.includes(name));

  return pick(weighted);
}

/**
 * The log a stage prints, as it would print it. The last lines of a failing
 * stage are replaced by its error.
 */
export function stageScript(stage: string, d: DeployContext, fail: boolean): Step[] {
  let image = `registry.internal/${d.slug}:${d.version}`;

  switch (stage) {
    case "build": {
      let steps: Step[] = [
        { line: `Cloning ${d.slug} at ${d.sha.slice(0, 7)}` },
        { line: `Restoring dependency cache (${between(84, 99)}% hit)` },
        { line: `Compiling ${between(120, 260)} modules` },
        { line: `Building image ${image}` },
        { line: `Pushed image layers (${between(2, 6)} new, ${between(8, 14)} cached)` },
      ];

      return fail
        ? [...steps.slice(0, 3), { line: "error: cannot resolve module ./handlers/refund", level: "error" }]
        : steps;
    }

    case "test": {
      let unit = between(380, 460);
      let steps: Step[] = [
        { line: "Running unit tests" },
        { line: `Unit: ${unit} passed` },
        { line: "Running integration suite against an ephemeral database" },
        { line: `Integration: ${between(48, 64)} passed` },
        { line: `Coverage ${(78 + Math.random() * 6).toFixed(1)}%` },
      ];

      return fail
        ? [
          steps[0],
          { line: `Unit: ${unit - 1} passed, 1 failed`, level: "warn" },
          { line: "FAIL TestApplyDiscount: expected 1800, got 1799", level: "error" },
        ]
        : steps;
    }

    case "migrate": {
      let steps: Step[] = [
        { line: "Checking pending migrations" },
        { line: `Applying ${between(1, 2)} migration(s)` },
        { line: "Migrations complete" },
      ];

      return fail
        ? [steps[0], { line: "ERROR: lock timeout acquiring ACCESS EXCLUSIVE on orders", level: "error" }]
        : steps;
    }

    case "release": {
      let steps: Step[] = [
        { line: `Starting ${d.slug} ${d.version} on 3 instances` },
        { line: "Instances ready: 3 of 3" },
        { line: `Shifting traffic to ${d.version}` },
        { line: `Traffic on ${d.version}: 100%` },
      ];

      return fail
        ? [steps[0], { line: "Instances ready: 2 of 3", level: "warn" }, { line: "Instance 2 failed its readiness probe after 60s", level: "error" }]
        : steps;
    }

    default: {
      let steps: Step[] = [
        { line: "Probing /healthz on 3 instances" },
        { line: `p95 latency ${between(95, 180)}ms, error rate ${(Math.random() * 0.5).toFixed(2)}%` },
        { line: "All checks passing" },
      ];

      return fail
        ? [steps[0], { line: `Error rate ${(4 + Math.random() * 5).toFixed(1)}% exceeds the 2% threshold`, level: "error" }]
        : steps;
    }
  }
}

/**
 * Runs a queued deploy's stages in order, each a few seconds long, writing
 * and broadcasting every log line as it goes. Some deploys fail at a random
 * stage so the dashboard has failures to show.
 */
export class RunDeployJob extends Job<RunDeployJobFields> {
  static maxAttempts = 1;
  static timeoutMs = 180_000;

  async run() {
    let d = sql<DeployContext>(`
      select d.id, d.serviceId, s.slug, d.environment, d.kind, c.version, c.sha
        from deploys d
        join services s on s.id = d.serviceId
        join commits c on c.id = d.commitId
       where d.id = ${this.fields.deployId}
         and d.status = 'queued'
    `).first();

    if (!d) {
      return;
    }

    let stages = sql<StageRow>(
      `select id, name from deployStages where deployId = ${d.id} order by position`,
    ).all();

    let failAt = this.fields.failAt !== undefined
      ? this.fields.failAt
      : pickFailure(d.kind, stages.map((s) => s.name));
    let pace = this.fields.pace ?? 1;

    sql(`update deploys set status = 'running', startedAt = now() where id = ${d.id}`);
    this.deployChanged(d, "running");

    for (let i = 0; i < stages.length; i++) {
      let stage = stages[i];
      let fail = stage.name === failAt;

      sql(`update deployStages set status = 'running', startedAt = now() where id = ${stage.id}`);
      this.stageChanged(d, stage.name, "running");

      for (let step of stageScript(stage.name, d, fail)) {
        await sleep(between(450, 1100) * pace);
        this.log(d, stage.name, step);
      }

      await sleep(between(200, 500) * pace);

      if (fail) {
        this.log(d, stage.name, { line: `Stage ${stage.name} failed`, level: "error" });
        sql(`update deployStages set status = 'failed', finishedAt = now() where id = ${stage.id}`);
        sql(`update deployStages set status = 'skipped' where deployId = ${d.id} and status = 'pending'`);
        sql(`update deploys set status = 'failed', failedStage = ${stage.name}, finishedAt = now() where id = ${d.id}`);

        if (stage.name === "health check") {
          this.setHealth(d, "degraded");
        }

        this.stageChanged(d, stage.name, "failed");
        this.deployChanged(d, "failed");
        return;
      }

      sql(`update deployStages set status = 'succeeded', finishedAt = now() where id = ${stage.id}`);

      if (stage.name === "release") {
        sql(`update environments set currentDeployId = ${d.id} where serviceId = ${d.serviceId} and name = ${d.environment}`);
      }

      this.stageChanged(d, stage.name, "succeeded");
    }

    this.setHealth(d, "healthy");
    sql(`update deploys set status = 'succeeded', finishedAt = now() where id = ${d.id}`);
    this.deployChanged(d, "succeeded");
  }

  log(d: DeployContext, stage: string, step: Step) {
    let log = sql<LogLine>(`
      insert into deployLogs (deployId, stage, level, line)
           values (${d.id}, ${stage}, ${step.level ?? "info"}, ${step.line})
        returning id, seq::int as seq, stage, level, line, createdAt
    `).firstOrThrow();

    deployEvents.notify({ type: "log", deployId: d.id, serviceId: d.serviceId, log });
  }

  stageChanged(d: DeployContext, stage: string, status: StageStatus) {
    deployEvents.notify({ type: "stage", deployId: d.id, serviceId: d.serviceId, stage, status });
  }

  deployChanged(d: DeployContext, status: DeployStatus) {
    deployEvents.notify({ type: "deploy", deployId: d.id, serviceId: d.serviceId, status });
  }

  /**
   * A finished health check sets the environment's health at once rather than
   * waiting for the next health tick.
   */
  setHealth(d: DeployContext, health: "healthy" | "degraded") {
    let latencyMs = health === "healthy" ? between(60, 180) : between(480, 780);
    let errorRate = health === "healthy" ? Math.random() * 0.6 : 4 + Math.random() * 5;

    let env = sql<HealthUpdate>(`
      update environments
         set health = ${health},
             latencyMs = ${latencyMs},
             errorRate = ${errorRate},
             healthCheckedAt = now()
       where serviceId = ${d.serviceId} and name = ${d.environment}
   returning id, health, latencyMs, errorRate::float8 as errorRate, healthCheckedAt
    `).firstOrThrow();

    healthEvents.notify({ environments: [env] });
  }
}
