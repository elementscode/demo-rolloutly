export type Env = "staging" | "production";
export type Health = "healthy" | "degraded" | "down" | "unknown";
export type DeployKind = "deploy" | "rollback";
export type DeployStatus = "queued" | "running" | "succeeded" | "failed";
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export const ENVIRONMENTS: Env[] = ["staging", "production"];
export const DEPLOY_STAGES = ["build", "test", "migrate", "release", "health check"];
export const ROLLBACK_STAGES = ["release", "health check"];

export interface Service {
  id: string;
  slug: string;
  name: string;
  team: string;
  language: string;
  description: string;
}

export interface EnvState {
  id: string;
  serviceId: string;
  name: Env;
  health: Health;
  latencyMs: number;
  errorRate: number;
  healthCheckedAt: Date | null;
  currentDeployId: string | null;
  currentNumber: number | null;
  currentVersion: string | null;
  currentSha: string | null;
  currentAt: Date | null;
}

/**
 * One deploy or rollback, flattened with its service, commit and author so a
 * row renders without a second lookup.
 */
export interface DeployRow {
  id: string;
  number: number;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  environment: Env;
  commitId: string;
  kind: DeployKind;
  status: DeployStatus;
  failedStage: string | null;
  version: string;
  sha: string;
  message: string;
  userName: string | null;
  restoresNumber: number | null;
  currentStage: string | null;
  stagesDone: number;
  stagesTotal: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface Stage {
  id: string;
  name: string;
  position: number;
  status: StageStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface LogLine {
  id: string;
  seq: number;
  stage: string;
  level: string;
  line: string;
  createdAt: Date;
}

export interface Commit {
  id: string;
  sha: string;
  message: string;
  author: string;
  version: string;
  committedAt: Date;
}

export interface ServiceCard extends Service {
  staging: EnvState;
  production: EnvState;
  running: DeployRow | null;
}

export interface Overview {
  services: ServiceCard[];
  running: DeployRow[];
  recent: DeployRow[];
  today: { deploys: number; failed: number; rollbacks: number };
}

export interface ServiceDetail {
  service: Service;
  environments: EnvState[];
  deploys: DeployRow[];
  commits: Commit[];
  releases: DeployRow[];
}

export interface DeployDetail {
  deploy: DeployRow;
  stages: Stage[];
  logs: LogLine[];
}

export interface HealthUpdate {
  id: string;
  health: Health;
  latencyMs: number;
  errorRate: number;
  healthCheckedAt: Date;
}

export type DeployEvent =
  | { type: "deploy"; deployId: string; serviceId: string; status: DeployStatus }
  | { type: "stage"; deployId: string; serviceId: string; stage: string; status: StageStatus }
  | { type: "log"; deployId: string; serviceId: string; log: LogLine };

export interface HealthEvent {
  environments: HealthUpdate[];
}

export interface DayCount {
  day: Date;
  succeeded: number;
  failed: number;
}

export interface DayValue {
  day: Date;
  value: number | null;
}

export interface Recovery {
  deployId: string;
  number: number;
  serviceName: string;
  failedAt: Date;
  minutes: number | null;
}

export interface Insights {
  serviceId: string;
  deploysPerDay: DayCount[];
  buildSeconds: DayValue[];
  successRate: DayValue[];
  recoveries: Recovery[];
  totals: {
    deploys: number;
    succeeded: number;
    failed: number;
    medianBuildSeconds: number | null;
    mttrMinutes: number | null;
    incidents: number;
  };
}

/**
 * Applies pushed health values onto environment rows in place, so a health
 * tick repaints only the cells that read them.
 */
export function applyHealth(envs: EnvState[], updates: HealthUpdate[]) {
  for (let update of updates) {
    let env = envs.find((e) => e.id === update.id);
    if (!env) {
      continue;
    }

    env.health = update.health;
    env.latencyMs = update.latencyMs;
    env.errorRate = update.errorRate;
    env.healthCheckedAt = update.healthCheckedAt;
  }
}
