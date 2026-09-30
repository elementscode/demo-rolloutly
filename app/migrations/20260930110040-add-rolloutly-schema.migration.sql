-- add rolloutly schema

-- Auto-update updatedAt on row changes.
create or replace function touchUpdatedAt()
returns trigger
language plpgsql
as $$
begin
  new.updatedAt = now();
  return new;
end;
$$;

create type userRole as enum ('engineer', 'admin');
create type envName as enum ('staging', 'production');
create type healthState as enum ('healthy', 'degraded', 'down', 'unknown');
create type deployKind as enum ('deploy', 'rollback');
create type deployStatus as enum ('queued', 'running', 'succeeded', 'failed');
create type stageStatus as enum ('pending', 'running', 'succeeded', 'failed', 'skipped');

create table users (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  email text not null unique,
  name text not null,
  passwordHash text not null,
  role userRole not null default 'engineer'
);

create trigger usersTouchUpdatedAt
  before update on users
  for each row execute function touchUpdatedAt();

create table services (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  slug text not null unique,
  name text not null,
  team text not null,
  language text not null,
  description text not null default ''
);

create trigger servicesTouchUpdatedAt
  before update on services
  for each row execute function touchUpdatedAt();

create table commits (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  serviceId uuid not null references services(id) on delete cascade,
  sha text not null,
  message text not null,
  author text not null,
  version text not null,
  committedAt timestamptz not null default now(),
  unique (serviceId, sha)
);

create index commitsServiceCommittedAtIdx on commits (serviceId, committedAt desc);

create trigger commitsTouchUpdatedAt
  before update on commits
  for each row execute function touchUpdatedAt();

create table deploys (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  number integer generated always as identity unique,
  serviceId uuid not null references services(id) on delete cascade,
  environment envName not null,
  commitId uuid not null references commits(id),
  kind deployKind not null default 'deploy',
  restoresDeployId uuid references deploys(id),
  status deployStatus not null default 'queued',
  failedStage text,
  userId uuid references users(id) on delete set null,
  startedAt timestamptz,
  finishedAt timestamptz
);

create index deploysCreatedAtIdx on deploys (createdAt desc);
create index deploysServiceEnvIdx on deploys (serviceId, environment, createdAt desc);

create trigger deploysTouchUpdatedAt
  before update on deploys
  for each row execute function touchUpdatedAt();

create table environments (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  serviceId uuid not null references services(id) on delete cascade,
  name envName not null,
  currentDeployId uuid references deploys(id) on delete set null,
  health healthState not null default 'unknown',
  latencyMs integer not null default 0,
  errorRate numeric(5, 2) not null default 0,
  healthCheckedAt timestamptz,
  unique (serviceId, name)
);

create trigger environmentsTouchUpdatedAt
  before update on environments
  for each row execute function touchUpdatedAt();

create table deployStages (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  deployId uuid not null references deploys(id) on delete cascade,
  name text not null,
  position integer not null,
  status stageStatus not null default 'pending',
  startedAt timestamptz,
  finishedAt timestamptz,
  unique (deployId, position)
);

create trigger deployStagesTouchUpdatedAt
  before update on deployStages
  for each row execute function touchUpdatedAt();

create table deployLogs (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  seq bigint generated always as identity,
  deployId uuid not null references deploys(id) on delete cascade,
  stage text not null,
  level text not null default 'info',
  line text not null
);

create index deployLogsDeploySeqIdx on deployLogs (deployId, seq);

create trigger deployLogsTouchUpdatedAt
  before update on deployLogs
  for each row execute function touchUpdatedAt();
