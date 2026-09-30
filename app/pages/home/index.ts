import { Request, Response } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import { loadOverview } from "#app/shared/services/deploys";
import { deployEvents, healthEvents } from "#app/shared/services/events";
import html from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  // Listen before the select, so a change landing between the two still
  // reaches the page.
  let deploys = deployEvents.listen({ filter: (e) => e.type !== "log" });
  let health = healthEvents.listen();

  return new html({ user, initial: loadOverview(), deploys, health });
}
