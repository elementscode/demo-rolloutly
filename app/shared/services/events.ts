import { Channel } from "@elements/app";
import { DeployEvent, HealthEvent } from "#app/shared/services/models";

/**
 * Every deploy state change, stage transition and log line. Pages filter it
 * down to the deploys they show.
 */
export const deployEvents = new Channel<DeployEvent>("deploys");

/**
 * The health job pushes every environment's values here each tick; the
 * payload is the data, so no page refetches on a health change.
 */
export const healthEvents = new Channel<HealthEvent>("health");
