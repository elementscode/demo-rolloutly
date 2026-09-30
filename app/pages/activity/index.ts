import { Request, Response, sql } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import { loadActivity } from "#app/shared/services/deploys";
import { deployEvents } from "#app/shared/services/events";
import { Service } from "#app/shared/services/models";
import html from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  let events = deployEvents.listen({ filter: (e) => e.type === "deploy" || e.type === "stage" });
  let services = sql<Service>(`select id, slug, name, team, language, description from services order by name`).all();

  return new html({ user, services, initial: loadActivity(150), events });
}
