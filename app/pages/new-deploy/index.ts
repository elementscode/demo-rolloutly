import { Request, Response } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import { loadDeployTargets } from "#app/shared/services/deploys";
import { Env } from "#app/shared/services/models";
import html from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  let targets = loadDeployTargets();
  let slug = String(req.query.service ?? "");
  let service = targets.services.find((s) => s.slug === slug) ?? targets.services[0];
  let environment: Env = req.query.env === "production" ? "production" : "staging";

  return new html({ user, targets, serviceId: service.id, environment });
}
