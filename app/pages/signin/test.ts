import { test, assert, equal, session } from "@elements/app";
import { signin } from "#app/shared/services/auth";
import { makeFixture } from "#app/shared/services/fixtures";

test("signin", () => {
  test("signs in with the right password, any email case", () => {
    makeFixture();

    signin("ENG-checkout@test.dev ", "password1");

    assert(session.isLoggedIn());
    equal(session.get("userName"), "Test Engineer");
  });

  test("refuses a wrong password without saying which part was wrong", async () => {
    makeFixture();

    try {
      await signin("eng-checkout@test.dev", "nope");
      assert(false, "signed in with a wrong password");
    } catch (err: any) {
      equal(err.message, "invalid email or password");
    }

    assert(!session.isLoggedIn());
  });
});
