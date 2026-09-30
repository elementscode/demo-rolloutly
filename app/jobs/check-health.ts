import { Job, sql } from "@elements/app";
import { healthEvents } from "#app/shared/services/events";
import { HealthUpdate } from "#app/shared/services/models";

/**
 * Probes every environment and pushes the readings to every open screen.
 *
 * The probe is simulated: latency and error rate drift around where they
 * were, an environment whose running release failed its health check stays
 * degraded until something replaces it, and a healthy one occasionally blips.
 */
export class CheckHealthJob extends Job {
  static maxAttempts = 1;
  static timeoutMs = 75_000;

  /**
   * Cron ticks once a minute, so each run takes a reading every ten seconds
   * until the next tick.
   */
  async run() {
    for (let i = 0; i < 6; i++) {
      this.probe();

      if (i < 5) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  }

  probe() {
    let environments = sql<HealthUpdate>(`
      update environments e
         set health = case
               when d.failedStage = 'health check' then 'degraded'
               when random() < 0.015 then 'degraded'
               else 'healthy'
             end::healthState,
             latencyMs = case
               when d.failedStage = 'health check' then 480 + floor(random() * 300)
               else greatest(40, least(260, e.latencyMs * 0.7 + (60 + random() * 120) * 0.3))
             end,
             errorRate = case
               when d.failedStage = 'health check' then 4 + random() * 5
               else least(1.5, e.errorRate * 0.6 + random() * 0.6 * 0.4)
             end,
             healthCheckedAt = now()
        from deploys d
       where d.id = e.currentDeployId
         and not exists (
           select 1 from deploys r
            where r.serviceId = e.serviceId
              and r.environment = e.name
              and r.status in ('queued', 'running')
         )
   returning e.id, e.health, e.latencyMs, e.errorRate::float8 as errorRate, e.healthCheckedAt
    `).all();

    if (environments.length > 0) {
      healthEvents.notify({ environments });
    }
  }
}
