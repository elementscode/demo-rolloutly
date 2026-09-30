-- seed demo data: one admin, three engineers, twelve services, and thirty
-- days of deploy history with failures and rollbacks.
/** @env development */

insert into users (email, name, role, passwordHash)
     values ('priya@rolloutly.dev', 'Priya Raman', 'admin', crypt('rollout-admin', genSalt('bf', 10))),
            ('maya@rolloutly.dev', 'Maya Chen', 'engineer', crypt('rollout-demo', genSalt('bf', 10))),
            ('diego@rolloutly.dev', 'Diego Alvarez', 'engineer', crypt('rollout-demo', genSalt('bf', 10))),
            ('sam@rolloutly.dev', 'Sam Okafor', 'engineer', crypt('rollout-demo', genSalt('bf', 10)));

insert into services (slug, name, team, language, description)
     values ('api-gateway', 'API Gateway', 'Platform', 'Go', 'Edge routing, auth checks and rate limits for every public request.'),
            ('auth', 'Auth', 'Platform', 'Go', 'Sessions, tokens and single sign-on.'),
            ('billing', 'Billing', 'Revenue', 'TypeScript', 'Invoices, plans and usage metering.'),
            ('payments', 'Payments', 'Revenue', 'Go', 'Card processing and payouts.'),
            ('checkout', 'Checkout', 'Commerce', 'TypeScript', 'Cart, pricing and order placement.'),
            ('catalog', 'Catalog', 'Commerce', 'TypeScript', 'Products, variants and pricing rules.'),
            ('inventory', 'Inventory', 'Commerce', 'Rust', 'Stock levels and warehouse reservations.'),
            ('search', 'Search', 'Discovery', 'Rust', 'Query parsing, ranking and the product index.'),
            ('notifications', 'Notifications', 'Growth', 'TypeScript', 'Email, push and in-app messages.'),
            ('user-profile', 'User Profile', 'Growth', 'TypeScript', 'Accounts, preferences and addresses.'),
            ('analytics-ingest', 'Analytics Ingest', 'Data', 'Go', 'Event collection into the warehouse.'),
            ('web', 'Web Frontend', 'Web', 'TypeScript', 'The storefront and account pages.');

insert into environments (serviceId, name)
     select s.id, e.name
       from services s
 cross join (values ('staging'::envName), ('production'::envName)) as e(name);

do $$
declare
  messages text[] := array[
    'fix race in connection pool shutdown',
    'bump grpc to 1.66',
    'add request id to structured logs',
    'retry idempotent calls on 503',
    'cache feature flags for 30s',
    'drop legacy v1 endpoints',
    'tighten input validation on create',
    'add p95 latency metric',
    'paginate list responses',
    'upgrade base image to debian 12.7',
    'handle null region in address lookup',
    'reduce allocations in hot path',
    'add index on createdAt',
    'feature: bulk export',
    'rename config key for timeouts',
    'fix off-by-one in pagination cursor',
    'move secrets to vault paths',
    'add circuit breaker around downstream',
    'log slow queries over 200ms',
    'refactor handler middleware chain'
  ];
  authors text[] := array['Maya Chen', 'Diego Alvarez', 'Sam Okafor', 'Priya Raman', 'Lena Fischer', 'Tomás Ruiz'];
  failWeights text[] := array['build', 'test', 'test', 'test', 'migrate', 'release', 'health check', 'health check'];
  deployStagesList text[] := array['build', 'test', 'migrate', 'release', 'health check'];
  rollbackStagesList text[] := array['release', 'health check'];
  userIds uuid[];
  svc record;
  cm record;
  p record;
  i integer;
  major integer;
  svcIndex integer := 0;
  commitCount integer := 46;
  startAt timestamptz := now() - interval '30 days';
  stagingAt timestamptz;
  prodAt timestamptz;
  stagingFail text;
  prodFail text;
  newDeployId uuid;
  restoreId uuid;
  restoreCommit uuid;
  currentId uuid;
  stages text[];
  stageName text;
  pos integer;
  t timestamptz;
  secs numeric;
  daysAgo numeric;
  failed boolean;
  releaseDone boolean;
  shortSha text;
  ver text;
  endAt timestamptz;
begin
  perform setseed(0.4242);

  select array_agg(id order by email) into userIds from users;

  create temporary table plan (
    at timestamptz not null,
    serviceId uuid not null,
    commitId uuid,
    environment envName not null,
    kind deployKind not null,
    failStage text
  ) on commit drop;

  for svc in select id, slug from services order by slug loop
    svcIndex := svcIndex + 1;
    major := 1 + (svcIndex % 4);

    for i in 0..commitCount - 1 loop
      insert into commits (serviceId, sha, message, author, version, committedAt)
           values (svc.id,
                   md5(svc.slug || i::text) || substr(md5(i::text || svc.slug), 1, 8),
                   messages[1 + floor(random() * array_length(messages, 1))::int],
                   authors[1 + floor(random() * array_length(authors, 1))::int],
                   format('%s.%s.%s', major, 8 + i / 7, i % 7),
                   case
                     when i < commitCount - 3
                       then startAt + (now() - interval '3 hours' - startAt) * i / (commitCount - 4) - random() * interval '5 hours'
                     else now() - interval '150 minutes' + (i - commitCount + 3) * interval '45 minutes'
                   end);
    end loop;

    for cm in
      select id, committedAt, row_number() over (order by committedAt) as n
        from commits
       where serviceId = svc.id
       order by committedAt
    loop
      -- The newest commits have not shipped yet, so the deploy picker has
      -- something new to offer.
      continue when cm.n > commitCount - 3;

      if cm.n = 1 then
        insert into plan values (cm.committedAt + interval '10 minutes', svc.id, cm.id, 'staging', 'deploy', null);
        insert into plan values (cm.committedAt + interval '50 minutes', svc.id, cm.id, 'production', 'deploy', null);
        continue;
      end if;

      continue when random() > 0.72;

      stagingAt := cm.committedAt + (10 + random() * 30) * interval '1 minute';
      stagingFail := case when random() < 0.12 then failWeights[1 + floor(random() * 8)::int] end;

      insert into plan values (stagingAt, svc.id, cm.id, 'staging', 'deploy', stagingFail);

      continue when stagingFail is not null or random() > 0.7;

      prodAt := stagingAt + (25 + random() * 180) * interval '1 minute';
      prodFail := case when random() < 0.13 then failWeights[1 + floor(random() * 8)::int] end;

      insert into plan values (prodAt, svc.id, cm.id, 'production', 'deploy', prodFail);

      if prodFail = 'health check' then
        insert into plan values (prodAt + (12 + random() * 40) * interval '1 minute', svc.id, null, 'production', 'rollback', null);
      elsif prodFail is not null then
        insert into plan values (prodAt + (20 + random() * 120) * interval '1 minute', svc.id, cm.id, 'production', 'deploy', null);
      elsif random() < 0.04 then
        insert into plan values (prodAt + (40 + random() * 150) * interval '1 minute', svc.id, null, 'production', 'rollback', null);
      end if;
    end loop;
  end loop;

  delete from plan where at > now() - interval '5 minutes';

  for p in select * from plan order by at loop
    select currentDeployId into currentId
      from environments
     where serviceId = p.serviceId and name = p.environment;

    restoreId := null;
    restoreCommit := p.commitId;

    if p.kind = 'rollback' then
      select d.id, d.commitId into restoreId, restoreCommit
        from deploys d
       where d.serviceId = p.serviceId
         and d.environment = 'production'
         and d.status = 'succeeded'
         and d.commitId <> (select commitId from deploys where id = currentId)
         and d.createdAt < p.at
       order by d.createdAt desc
       limit 1;

      continue when restoreId is null;
    end if;

    select substr(sha, 1, 7), version into shortSha, ver from commits where id = restoreCommit;

    insert into deploys (createdAt, serviceId, environment, commitId, kind, restoresDeployId, status, failedStage, userId, startedAt)
         values (p.at, p.serviceId, p.environment, restoreCommit, p.kind, restoreId,
                 case when p.failStage is null then 'succeeded' else 'failed' end::deployStatus,
                 p.failStage,
                 userIds[1 + floor(random() * array_length(userIds, 1))::int],
                 p.at + interval '4 seconds')
      returning id into newDeployId;

    stages := case when p.kind = 'rollback' then rollbackStagesList else deployStagesList end;
    t := p.at + interval '4 seconds';
    failed := false;
    releaseDone := false;
    daysAgo := extract(epoch from now() - p.at) / 86400;
    pos := 0;

    foreach stageName in array stages loop
      pos := pos + 1;

      if failed then
        insert into deployStages (createdAt, deployId, name, position, status)
             values (p.at, newDeployId, stageName, pos, 'skipped');
        continue;
      end if;

      secs := case stageName
        when 'build' then (70 + random() * 45) * case when daysAgo between 11 and 19 then 1.7 else 1 end
        when 'test' then 90 + random() * 110
        when 'migrate' then 6 + random() * 30
        when 'release' then 25 + random() * 40
        else 30 + random() * 45
      end;

      if stageName = p.failStage then
        secs := secs * (0.3 + random() * 0.6);
      end if;

      endAt := t + secs * interval '1 second';

      insert into deployStages (createdAt, deployId, name, position, status, startedAt, finishedAt)
           values (p.at, newDeployId, stageName, pos,
                   case when stageName = p.failStage then 'failed' else 'succeeded' end::stageStatus,
                   t, endAt);

      insert into deployLogs (createdAt, deployId, stage, level, line)
      select t + (endAt - t) * (l.n::numeric / (l.total + 1)), newDeployId, stageName, l.level, l.line
        from (
          select row_number() over () as n, count(*) over () as total, x.level, x.line
            from (
              select 'info' as level, format(v.line, (select slug from services where id = p.serviceId), shortSha, ver) as line
                from unnest(case stageName
                  when 'build' then array[
                    'Cloning %1$s at %2$s',
                    'Restoring dependency cache',
                    'Compiling %1$s',
                    'Building image registry.internal/%1$s:%3$s',
                    'Pushed image layers (4 new, 11 cached)']
                  when 'test' then array[
                    'Running unit tests',
                    'Unit: 412 passed',
                    'Running integration suite against an ephemeral database',
                    'Integration: 57 passed',
                    'Coverage 81.4%%']
                  when 'migrate' then array[
                    'Checking pending migrations',
                    'Applying 1 migration',
                    'Migrations complete']
                  when 'release' then array[
                    'Starting %1$s %3$s on 3 instances',
                    'Instances ready: 3 of 3',
                    'Shifting traffic to %3$s',
                    'Traffic on %3$s: 100%%']
                  else array[
                    'Probing /healthz on 3 instances',
                    'p95 latency 138ms, error rate 0.2%%',
                    'All checks passing']
                end) with ordinality as v(line, ord)
               where stageName <> coalesce(p.failStage, '') or v.ord <= 2
              union all
              select 'error', case stageName
                  when 'build' then 'error: cannot resolve module ./handlers/refund'
                  when 'test' then 'FAIL TestApplyDiscount: expected 1800, got 1799'
                  when 'migrate' then 'ERROR: lock timeout acquiring ACCESS EXCLUSIVE on orders'
                  when 'release' then 'Instance 2 failed its readiness probe after 60s'
                  else 'Error rate 7.8% exceeds the 2% threshold'
                end
               where stageName = p.failStage
              union all
              select 'error', format('Stage %s failed', stageName)
               where stageName = p.failStage
            ) x
        ) l;

      if stageName = 'release' and stageName is distinct from p.failStage then
        releaseDone := true;
      end if;

      t := endAt + interval '2 seconds';

      if stageName = p.failStage then
        failed := true;
      end if;
    end loop;

    update deploys set finishedAt = t where id = newDeployId;

    if releaseDone then
      update environments
         set currentDeployId = newDeployId,
             health = case when p.failStage = 'health check' then 'degraded' else 'healthy' end::healthState
       where serviceId = p.serviceId and name = p.environment;
    end if;
  end loop;

  update environments
     set latencyMs = case when health = 'degraded' then 480 + floor(random() * 300) else 60 + floor(random() * 120) end,
         errorRate = case when health = 'degraded' then 4 + random() * 5 else 0.05 + random() * 0.6 end,
         health = case when health = 'unknown' then 'healthy' else health end,
         healthCheckedAt = now();
end;
$$;
