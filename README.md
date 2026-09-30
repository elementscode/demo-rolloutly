![Rolloutly, a deploy dashboard built with Elements: the overview with a deploy running through its pipeline stages, another queued, service health for staging and production, and the latest deploys and rollbacks.](POSTER_URL)

# Rolloutly

> A demo app built with [Elements](https://elements.dev).

Deploy pipelines with streaming logs, production rollbacks, live service health, and charts of deploys per day, build time, success rate and time to recovery.

**Demo:** [Rolloutly](TBD)

## Agent specs

What one run of the prompt below took, from an empty Elements project to this
app.

- **Agent:** Claude Code, Opus 5.5 Medium
- **Time:** 29 min
- **Cost:** $9.68 at API rates, September 2026

## Get started

```bash
elements create rolloutly -scaffold=elementscode/demo-rolloutly
```

## Seed data and demo accounts

The seed creates twelve services, each with a staging and a production
environment, and thirty days of deploy history up to the day you run it:
about 650 deploys with stage timings, logs, failures and rollbacks, plus a
build slowdown in mid-September so the build duration chart has something to
show. The sign-in page lists the four accounts; click one to sign in.

| Email               | Password        | Role     |
| ------------------- | --------------- | -------- |
| priya@rolloutly.dev | `rollout-admin` | admin    |
| maya@rolloutly.dev  | `rollout-demo`  | engineer |
| diego@rolloutly.dev | `rollout-demo`  | engineer |
| sam@rolloutly.dev   | `rollout-demo`  | engineer |

Engineers deploy and roll back. The admin also manages accounts on the Team
page.

## The prompt

```text
Build a deploy dashboard named rolloutly for a platform team running a dozen
services.

Accounts: admin and engineer.

- Services, each with environments (staging, production), the release running
  in each, and its health.
- Deploy: pick a service, environment and commit. A background job runs the
  pipeline stages (build, test, migrate, release, health check), each taking
  a few seconds, with log lines streaming as it goes. Some deploys fail at a
  random stage so the dashboard has failures to show.
- Deploy detail: stages with durations and the full log.
- Roll back production to any earlier release, with a confirm step.
- Charts, drawn in SVG: deploys per day, build duration over time, success
  rate, and mean time to recovery after a failed production deploy.
- An activity feed of every deploy and rollback across all services.

Seed one admin, three engineers, twelve services, and thirty days of deploy
history with some failures and rollbacks. Show the seeded logins on the sign-in
page.

Running deploys, log lines, health and charts update in real time on every
open screen.
```

## License

MIT. See [LICENSE](LICENSE).
