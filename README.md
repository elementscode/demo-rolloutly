![A deploy dashboard with live logs, built by Claude Code on Elements: the overview with a deploy running through its pipeline stages, another queued, service health for staging and production, and the latest deploys and rollbacks.](https://elements.dev/demos/01a0f39c-487d-75b7-9ff3-7b29c3d07711/poster?v=7849fc57890b)

# A deploy dashboard with live logs, built by Claude Code on Elements

> Rolloutly is a full-stack app built with Claude Code on Elements.

Deploy pipelines with streaming logs, production rollbacks, live service health, and charts of deploys per day, build time, success rate and time to recovery.

[Run this app on your machine](https://elements.dev/demos/01a0f39c-487d-75b7-9ff3-7b29c3d07711). Use this demo as inspiration, or as the starting point for your own app. Your agent creates a new app with this one as the scaffold, and you prompt it to add whatever features you want.

## How it's built

Rolloutly needed deploy pipelines that stream their logs, production rollbacks, service health that refreshes itself, charts of a month of deploys and roles for the team. Each of those is a part of Elements, so the agent spent its 29 minutes on the dashboard itself.

- **Streaming deploys.** A deploy is a job that walks each stage and sends every log line, stage change and final status on a channel. The deploy page prints the log as it runs, and the overview, service and activity pages pick up each status change.

- **Live service health.** A one-line cron schedule runs a health job every minute that takes a reading every ten seconds and pushes it to every open screen on a second channel. A release that failed its health check stays degraded until a new deploy or a rollback replaces it.

- **Rollbacks.** Rolling back checks that the chosen release ran in production and that nothing else is deploying, then sends it through the same pipeline as a deploy.

- **Charts from the data.** The insights page computes deploys per day, build time, success rate and time to recovery in SQL and draws them as SVG, and refreshes when a deploy finishes.

- **Server calls as function calls.** Starting a deploy, rolling back and managing the team call server functions straight from the page with `@rpc`.

- **Data and roles from SQL.** Migrations define the platform and seed one admin, three engineers, twelve services and thirty days of deploy history with failures and rollbacks. Sessions and roles give admins the team page.

## Why Elements

Elements is an integrated full-stack app framework and a project server. The project server checks the agent's work as it builds: it type-checks the server and browser code, analyzes the program, applies migrations and runs the tests, then reports the results to the agent. A security mistake, such as calling a server-only function from the browser, is a compile error. The agent reads the report and fixes its own mistakes before it tells you a feature is done. The same checks run on every feature you ask for next.
