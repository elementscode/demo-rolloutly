import { test, assert } from "@elements/app";
import { makeFixture } from "#app/shared/services/fixtures";
import { loadServiceDetail } from "#app/shared/services/deploys";

test("service detail 404s an unknown slug", async () => {
  makeFixture();

  try {
    await loadServiceDetail("nope");
    assert(false, "loaded a missing service");
  } catch (err: any) {
    assert(err.statusCode === 404, `status ${err.statusCode}`);
  }
});
