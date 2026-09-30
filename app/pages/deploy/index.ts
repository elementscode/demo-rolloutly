import { Request, Response } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import { findDeployId, loadDeployDetail } from "#app/shared/services/deploys";
import { deployEvents } from "#app/shared/services/events";
import html from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  let number = Number(req.params.number);
  let deployId = findDeployId(number);

  // Listen before the select so no log line falls between the two; the page
  // drops the overlap by sequence number.
  let events = deployEvents.listen({ filter: (e) => e.deployId === deployId });

  return new html({ user, detail: loadDeployDetail(number), events });
}
