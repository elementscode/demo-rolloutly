import { redirect, Request, Response } from "@elements/app";
import { requireUser } from "#app/shared/services/auth";
import html, { loadTeam } from "./template";

export default function route(req: Request, res: Response) {
  let user = requireUser();
  if (!user) {
    return;
  }

  // The Team link only shows for admins; anyone else who types the url goes
  // back to the overview.
  if (user.role !== "admin") {
    redirect("/");
    return;
  }

  return new html({ user, initial: loadTeam() });
}
