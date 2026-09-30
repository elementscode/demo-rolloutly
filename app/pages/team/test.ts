import { test, assert, equal } from "@elements/app";
import { loginAs, makeFixture } from "#app/shared/services/fixtures";
import { addMember, loadTeam, setRole } from "./template";

test("team", () => {
  test("an admin promotes an engineer", () => {
    let f = makeFixture();
    loginAs(f.adminId);

    let team = setRole(f.userId, "admin");

    equal(team.find((m) => m.id === f.userId)!.role, "admin");
  });

  test("an engineer cannot change roles", async () => {
    let f = makeFixture();
    loginAs(f.userId);

    try {
      await setRole(f.userId, "admin");
      assert(false, "engineer changed a role");
    } catch (err: any) {
      equal(err.message, "admin access required");
    }
  });

  test("an admin cannot demote themselves", async () => {
    let f = makeFixture();
    loginAs(f.adminId);

    try {
      await setRole(f.adminId, "engineer");
      assert(false, "admin demoted themselves");
    } catch (err: any) {
      equal(err.message, "you cannot change your own role");
    }
  });

  test("an admin adds an account", () => {
    let f = makeFixture();
    loginAs(f.adminId);

    addMember({ name: "Ada", email: "Ada@Test.dev", password: "long enough", role: "engineer", error: "" });

    let ada = loadTeam().find((m) => m.email === "ada@test.dev");
    equal(ada?.role, "engineer");
  });
});
