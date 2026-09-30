import { App } from "@elements/app";
import config from "#config";
import { CheckHealthJob } from "#app/jobs/check-health";
import home from "#app/pages/home";
import signin from "#app/pages/signin";
import deploy from "#app/pages/deploy";
import newDeploy from "#app/pages/new-deploy";
import service from "#app/pages/service";
import activity from "#app/pages/activity";
import insights from "#app/pages/insights";
import team from "#app/pages/team";
import notFound from "#app/pages/errors/not-found";
import unhandled from "#app/pages/errors/unhandled";

const app = new App();

app.route("/", home);
app.route("/signin", signin);
app.route("/services/:slug", service);
app.route("/activity", activity);
app.route("/insights", insights);
app.route("/team", team);
app.route("/deploys/new", newDeploy);
app.route("/deploys/:number(\\d+)", deploy);

app.cron("every 1m", "check health", () => new CheckHealthJob().schedule());

app.error((req, res, err) => {
  switch (err.statusCode) {
    case 404:
      return notFound(req, res, err);

    default:
      return unhandled(req, res, err);
  }
});

app.start(config);
