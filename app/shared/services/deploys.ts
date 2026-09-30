import { sql, tx, NotFoundError, ValidationError } from "@elements/app";
import { requireUserOrThrow } from "#app/shared/services/auth";
import { deployEvents } from "#app/shared/services/events";
import { RunDeployJob } from "#app/jobs/run-deploy";
import {
  Commit,
  DayCount,
  DayValue,
  DEPLOY_STAGES,
  DeployDetail,
  DeployRow,
  Env,
  ENVIRONMENTS,
  EnvState,
  Insights,
  LogLine,
  Overview,
  Recovery,
  ROLLBACK_STAGES,
  Service,
  ServiceCard,
  ServiceDetail,
  Stage,
} from "#app/shared/services/models";

const DEPLOY_SELECT = sql.raw(`
  select d.id,
         d.number,
         d.serviceId,
         s.slug as serviceSlug,
         s.name as serviceName,
         d.environment,
         d.commitId,
         d.kind,
         d.status,
         d.failedStage,
         c.version,
         c.sha,
         c.message,
         u.name as userName,
         r.number as restoresNumber,
         (select st.name from deployStages st
           where st.deployId = d.id and st.status in ('running', 'failed')
           order by st.position limit 1) as currentStage,
         (select count(*)::int from deployStages st
           where st.deployId = d.id and st.status = 'succeeded') as stagesDone,
         (select count(*)::int from deployStages st
           where st.deployId = d.id) as stagesTotal,
         d.createdAt,
         d.startedAt,
         d.finishedAt
    from deploys d
    join services s on s.id = d.serviceId
    join commits c on c.id = d.commitId
    left join users u on u.id = d.userId
    left join deploys r on r.id = d.restoresDeployId
`);

const ENV_SELECT = sql.raw(`
  select e.id,
         e.serviceId,
         e.name,
         e.health,
         e.latencyMs,
         e.errorRate::float8 as errorRate,
         e.healthCheckedAt,
         e.currentDeployId,
         d.number as currentNumber,
         c.version as currentVersion,
         c.sha as currentSha,
         d.createdAt as currentAt
    from environments e
    left join deploys d on d.id = e.currentDeployId
    left join commits c on c.id = d.commitId
`);

function envOrder(name: Env): number {
  return ENVIRONMENTS.indexOf(name);
}

export function loadOverview(): Overview {
  let services = sql<Service>(`select id, slug, name, team, language, description from services order by team, name`).all();
  let envs = sql<EnvState>(`${ENV_SELECT}`).all();
  let running = sql<DeployRow>(`${DEPLOY_SELECT} where d.status in ('queued', 'running') order by d.createdAt`).all();
  let recent = sql<DeployRow>(`${DEPLOY_SELECT} where d.status in ('succeeded', 'failed') order by d.createdAt desc limit 8`).all();

  let today = sql<{ deploys: number; failed: number; rollbacks: number }>(`
    select count(*) filter (where kind = 'deploy')::int as deploys,
           count(*) filter (where status = 'failed')::int as failed,
           count(*) filter (where kind = 'rollback')::int as rollbacks
      from deploys
     where createdAt >= date_trunc('day', now())
  `).firstOrThrow();

  let cards: ServiceCard[] = services.map((service) => ({
    ...service,
    staging: envs.find((e) => e.serviceId === service.id && e.name === "staging")!,
    production: envs.find((e) => e.serviceId === service.id && e.name === "production")!,
    running: running.find((d) => d.serviceId === service.id) ?? null,
  }));

  return { services: cards, running, recent, today };
}

/** @rpc */
export function fetchOverview(): Overview {
  requireUserOrThrow();

  return loadOverview();
}

export function loadServiceDetail(slug: string): ServiceDetail {
  let service = sql<Service>(
    `select id, slug, name, team, language, description from services where slug = ${slug}`,
  ).first();

  if (!service) {
    throw new NotFoundError("no such service");
  }

  let environments = sql<EnvState>(`${ENV_SELECT} where e.serviceId = ${service.id}`).all()
    .sort((a, b) => envOrder(a.name) - envOrder(b.name));

  let deploys = sql<DeployRow>(
    `${DEPLOY_SELECT} where d.serviceId = ${service.id} order by d.createdAt desc limit 40`,
  ).all();

  let commits = sql<Commit>(`
    select id, sha, message, author, version, committedAt
      from commits
     where serviceId = ${service.id}
     order by committedAt desc
     limit 12
  `).all();

  let releases = loadReleases(service.id);

  return { service, environments, deploys, commits, releases };
}

/**
 * Earlier production releases a rollback can restore: one row per version,
 * the most recent successful deploy of it, newest first, minus the version
 * running now.
 */
function loadReleases(serviceId: string): DeployRow[] {
  let current = sql<{ commitId: string }>(`
    select d.commitId
      from environments e
      join deploys d on d.id = e.currentDeployId
     where e.serviceId = ${serviceId} and e.name = 'production'
  `).first();

  return sql<DeployRow>(`
    ${DEPLOY_SELECT}
     where d.id in (
       select distinct on (commitId) id
         from deploys
        where serviceId = ${serviceId}
          and environment = 'production'
          and status = 'succeeded'
        order by commitId, createdAt desc
     )
       and d.commitId is distinct from ${current?.commitId ?? null}::uuid
     order by d.createdAt desc
     limit 10
  `).all();
}

/** @rpc */
export function fetchServiceDetail(slug: string): ServiceDetail {
  requireUserOrThrow();

  return loadServiceDetail(slug);
}

export function findDeployId(number: number): string {
  let row = sql<{ id: string }>(`select id from deploys where number = ${number}`).first();

  if (!row) {
    throw new NotFoundError("no such deploy");
  }

  return row.id;
}

export function loadDeployDetail(number: number): DeployDetail {
  let deploy = sql<DeployRow>(`${DEPLOY_SELECT} where d.number = ${number}`).first();

  if (!deploy) {
    throw new NotFoundError("no such deploy");
  }

  let stages = sql<Stage>(`
    select id, name, position, status, startedAt, finishedAt
      from deployStages
     where deployId = ${deploy.id}
     order by position
  `).all();

  let logs = sql<LogLine>(`
    select id, seq::int as seq, stage, level, line, createdAt
      from deployLogs
     where deployId = ${deploy.id}
     order by seq
  `).all();

  return { deploy, stages, logs };
}

/**
 * The deploy row and its stages without the log, for a refresh on a stage
 * change: log lines arrive on the channel one at a time.
 */
export interface DeployProgress {
  deploy: DeployRow;
  stages: Stage[];
}

/** @rpc */
export function fetchDeployProgress(number: number): DeployProgress {
  requireUserOrThrow();

  let { deploy, stages } = loadDeployDetail(number);

  return { deploy, stages };
}

export function loadActivity(limit = 60): DeployRow[] {
  return sql<DeployRow>(`${DEPLOY_SELECT} order by d.createdAt desc limit ${limit}`).all();
}

/** @rpc */
export function fetchActivity(limit: number): DeployRow[] {
  requireUserOrThrow();

  return loadActivity(Math.min(Math.max(limit, 1), 500));
}

export interface DeployTargets {
  services: Service[];
  environments: EnvState[];
  commits: (Commit & { serviceId: string })[];
}

export function loadDeployTargets(): DeployTargets {
  let services = sql<Service>(`select id, slug, name, team, language, description from services order by name`).all();
  let environments = sql<EnvState>(`${ENV_SELECT}`).all();

  let commits = sql<Commit & { serviceId: string }>(`
    select id, serviceId, sha, message, author, version, committedAt
      from (
        select *, row_number() over (partition by serviceId order by committedAt desc) as n
          from commits
      ) c
     where n <= 8
     order by committedAt desc
  `).all();

  return { services, environments, commits };
}

export interface StartDeployForm {
  serviceId: string;
  environment: Env;
  commitId: string;
}

function assertIdle(serviceId: string, environment: Env) {
  let busy = sql(`
    select 1 from deploys
     where serviceId = ${serviceId}
       and environment = ${environment}
       and status in ('queued', 'running')
  `).empty();

  if (!busy) {
    throw new ValidationError(`a deploy is already running on ${environment}`);
  }
}

function enqueue(
  serviceId: string,
  environment: Env,
  commitId: string,
  kind: "deploy" | "rollback",
  userId: string,
  restoresDeployId: string | null,
): number {
  let stages = kind === "rollback" ? ROLLBACK_STAGES : DEPLOY_STAGES;

  let deploy = tx(() => {
    let row = sql<{ id: string; number: number }>(`
      insert into deploys (serviceId, environment, commitId, kind, restoresDeployId, userId)
           values (${serviceId}, ${environment}, ${commitId}, ${kind}, ${restoresDeployId}, ${userId})
        returning id, number
    `).firstOrThrow();

    stages.forEach((name, i) => {
      sql(`insert into deployStages (deployId, name, position) values (${row.id}, ${name}, ${i + 1})`);
    });

    new RunDeployJob({ deployId: row.id }).schedule();

    return row;
  });

  deployEvents.notify({ type: "deploy", deployId: deploy.id, serviceId, status: "queued" });

  return deploy.number;
}

/**
 * Queues a deploy and returns its number for the redirect to its detail page.
 * @rpc
 */
export function startDeploy(form: StartDeployForm): number {
  let user = requireUserOrThrow();

  if (!ENVIRONMENTS.includes(form.environment)) {
    throw new ValidationError("pick an environment");
  }

  let commit = sql<{ id: string }>(
    `select id from commits where id = ${form.commitId} and serviceId = ${form.serviceId}`,
  ).first();

  if (!commit) {
    throw new ValidationError("pick a commit from this service");
  }

  assertIdle(form.serviceId, form.environment);

  return enqueue(form.serviceId, form.environment, commit.id, "deploy", user.id, null);
}

/**
 * Rolls production back to the release an earlier deploy shipped.
 * @rpc
 */
export function rollback(restoreDeployId: string): number {
  let user = requireUserOrThrow();

  let target = sql<{ id: string; serviceId: string; commitId: string }>(`
    select id, serviceId, commitId
      from deploys
     where id = ${restoreDeployId}
       and environment = 'production'
       and status = 'succeeded'
  `).first();

  if (!target) {
    throw new ValidationError("that release cannot be restored");
  }

  let running = sql(`
    select 1
      from environments e
      join deploys d on d.id = e.currentDeployId
     where e.serviceId = ${target.serviceId}
       and e.name = 'production'
       and d.commitId = ${target.commitId}
  `).empty();

  if (!running) {
    throw new ValidationError("that release is already running in production");
  }

  assertIdle(target.serviceId, "production");

  return enqueue(target.serviceId, "production", target.commitId, "rollback", user.id, target.id);
}

export function loadInsights(serviceId: string): Insights {
  let deploysPerDay = sql<DayCount>(`
    select g.day,
           count(d.id) filter (where d.status = 'succeeded')::int as succeeded,
           count(d.id) filter (where d.status = 'failed')::int as failed
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as g(day)
      left join deploys d
        on date_trunc('day', d.createdAt) = g.day
       and (${serviceId}::text = '' or d.serviceId::text = ${serviceId})
     group by g.day
     order by g.day
  `).all();

  let buildSeconds = sql<DayValue>(`
    select g.day,
           avg(extract(epoch from st.finishedAt - st.startedAt))::float8 as value
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as g(day)
      left join deploys d
        on date_trunc('day', d.createdAt) = g.day
       and (${serviceId}::text = '' or d.serviceId::text = ${serviceId})
      left join deployStages st
        on st.deployId = d.id
       and st.name = 'build'
       and st.status = 'succeeded'
     group by g.day
     order by g.day
  `).all();

  let successRate: DayValue[] = deploysPerDay.map((d) => ({
    day: d.day,
    value: d.succeeded + d.failed === 0 ? null : (100 * d.succeeded) / (d.succeeded + d.failed),
  }));

  let recoveries = sql<Recovery>(`
    select f.id as deployId,
           f.number,
           s.name as serviceName,
           f.finishedAt as failedAt,
           (extract(epoch from (
             select min(r.finishedAt)
               from deploys r
              where r.serviceId = f.serviceId
                and r.environment = 'production'
                and r.status = 'succeeded'
                and r.createdAt > f.createdAt
           ) - f.finishedAt) / 60)::float8 as minutes
      from deploys f
      join services s on s.id = f.serviceId
     where f.environment = 'production'
       and f.status = 'failed'
       and f.createdAt >= date_trunc('day', now()) - interval '29 days'
       and (${serviceId}::text = '' or f.serviceId::text = ${serviceId})
     order by f.finishedAt
  `).all();

  let median = sql<{ value: number | null }>(`
    select percentile_cont(0.5) within group (order by extract(epoch from st.finishedAt - st.startedAt))::float8 as value
      from deployStages st
      join deploys d on d.id = st.deployId
     where st.name = 'build'
       and st.status = 'succeeded'
       and d.createdAt >= date_trunc('day', now()) - interval '29 days'
       and (${serviceId}::text = '' or d.serviceId::text = ${serviceId})
  `).firstOrThrow();

  let succeeded = deploysPerDay.reduce((n, d) => n + d.succeeded, 0);
  let failed = deploysPerDay.reduce((n, d) => n + d.failed, 0);
  let recovered = recoveries.filter((r) => r.minutes !== null);

  return {
    serviceId,
    deploysPerDay,
    buildSeconds,
    successRate,
    recoveries,
    totals: {
      deploys: succeeded + failed,
      succeeded,
      failed,
      medianBuildSeconds: median.value,
      mttrMinutes: recovered.length === 0
        ? null
        : recovered.reduce((n, r) => n + r.minutes!, 0) / recovered.length,
      incidents: recoveries.length,
    },
  };
}

/** @rpc */
export function fetchInsights(serviceId: string): Insights {
  requireUserOrThrow();

  return loadInsights(serviceId);
}
