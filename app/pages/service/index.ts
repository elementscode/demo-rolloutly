import { Request, Response } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import { loadServiceDetail } from "#app/shared/services/deploys";
import { deployEvents, healthEvents } from "#app/shared/services/events";
import html from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  let slug = String(req.params.slug);
  let serviceId = "";

  // Listen before the select; the filter reads serviceId once the select has
  // set it, so nothing between the two is lost.
  let deploys = deployEvents.listen({ filter: (e) => e.serviceId === serviceId && e.type !== "log" });
  let health = healthEvents.listen();
  let initial = loadServiceDetail(slug);
  serviceId = initial.service.id;

  return new html({ user, initial, deploys, health });
}
