import { session, sql } from "@elements/app";

export interface Fixture {
  userId: string;
  adminId: string;
  serviceId: string;
  slug: string;
  commits: string[];
  stagingId: string;
  productionId: string;
}

/**
 * One service with two environments, three commits and two accounts, for
 * tests. The test database gets no development seed, so each test builds
 * what it reads.
 */
export function makeFixture(slug = "checkout"): Fixture {
  let userId = sql<{ id: string }>(`
    insert into users (email, name, role, passwordHash)
         values (${`eng-${slug}@test.dev`}, 'Test Engineer', 'engineer', crypt('password1', genSalt('bf', 4)))
      returning id
  `).firstOrThrow().id;

  let adminId = sql<{ id: string }>(`
    insert into users (email, name, role, passwordHash)
         values (${`admin-${slug}@test.dev`}, 'Test Admin', 'admin', crypt('password1', genSalt('bf', 4)))
      returning id
  `).firstOrThrow().id;

  let serviceId = sql<{ id: string }>(`
    insert into services (slug, name, team, language)
         values (${slug}, ${slug}, 'Commerce', 'TypeScript')
      returning id
  `).firstOrThrow().id;

  let commits = [1, 2, 3].map((n) => sql<{ id: string }>(`
    insert into commits (serviceId, sha, message, author, version, committedAt)
         values (${serviceId}, ${`${slug}${n}`.padEnd(40, "0")}, ${`change ${n}`}, 'Test', ${`1.0.${n}`}, now() - ${`${4 - n} hours`}::interval)
      returning id
  `).firstOrThrow().id);

  let env = (name: string) => sql<{ id: string }>(`
    insert into environments (serviceId, name, health) values (${serviceId}, ${name}, 'healthy') returning id
  `).firstOrThrow().id;

  return { userId, adminId, serviceId, slug, commits, stagingId: env("staging"), productionId: env("production") };
}

/**
 * A finished deploy, as history. A succeeded one that got past release
 * becomes what its environment runs.
 */
export function finishedDeploy(
  f: Fixture,
  commitId: string,
  environment: "staging" | "production",
  status: "succeeded" | "failed",
  minutesAgo: number,
  failedStage: string | null = null,
): string {
  let id = sql<{ id: string }>(`
    insert into deploys (serviceId, environment, commitId, status, failedStage, userId, createdAt, startedAt, finishedAt)
         values (${f.serviceId}, ${environment}, ${commitId}, ${status}, ${failedStage}, ${f.userId},
                 now() - ${`${minutesAgo} minutes`}::interval,
                 now() - ${`${minutesAgo} minutes`}::interval,
                 now() - ${`${minutesAgo - 5} minutes`}::interval)
      returning id
  `).firstOrThrow().id;

  sql(`
    insert into deployStages (deployId, name, position, status, startedAt, finishedAt)
         values (${id}, 'build', 1, 'succeeded', now() - ${`${minutesAgo} minutes`}::interval, now() - ${`${minutesAgo - 2} minutes`}::interval)
  `);

  if (status === "succeeded" || failedStage === "health check") {
    sql(`update environments set currentDeployId = ${id} where serviceId = ${f.serviceId} and name = ${environment}`);
  }

  return id;
}

export function loginAs(userId: string) {
  session.login({ userId, userName: "Test" });
}
