import { sql, session, redirect, AuthError, ForbiddenError } from "@elements/app";

export type Role = "engineer" | "admin";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface DemoLogin {
  email: string;
  password: string;
  name: string;
  role: Role;
}

/**
 * The seeded accounts, shown on the sign-in page. The passwords live in the
 * development seed migration, which never reaches production.
 */
export const DEMO_LOGINS: DemoLogin[] = [
  { email: "priya@rolloutly.dev", password: "rollout-admin", name: "Priya Raman", role: "admin" },
  { email: "maya@rolloutly.dev", password: "rollout-demo", name: "Maya Chen", role: "engineer" },
  { email: "diego@rolloutly.dev", password: "rollout-demo", name: "Diego Alvarez", role: "engineer" },
  { email: "sam@rolloutly.dev", password: "rollout-demo", name: "Sam Okafor", role: "engineer" },
];

function loadUser(id: string): CurrentUser | undefined {
  return sql<CurrentUser>(`select id, name, email, role from users where id = ${id}`).first();
}

/**
 * For routes: the signed-in user, or a redirect to the sign-in page.
 */
export function requireUser(): CurrentUser | undefined {
  let id = session.get("userId");
  let user = id ? loadUser(id) : undefined;

  if (!user) {
    redirect("/signin");
    return undefined;
  }

  return user;
}

/**
 * For rpc: the signed-in user, or a 401.
 */
export function requireUserOrThrow(): CurrentUser {
  session.isLoggedInOrThrow();

  let user = loadUser(session.getOrThrow("userId"));
  if (!user) {
    throw new AuthError("sign in again");
  }

  return user;
}

export function requireAdminOrThrow(): CurrentUser {
  let user = requireUserOrThrow();
  if (user.role !== "admin") {
    throw new ForbiddenError("admin access required");
  }

  return user;
}

/** @rpc */
export function signin(email: string, password: string) {
  let address = email.trim().toLowerCase();

  if (!address || !password) {
    throw new AuthError("enter your email and password");
  }

  let user = sql<{ id: string; name: string }>(
    `select id, name from users
      where email = ${address}
        and passwordHash = crypt(${password}, passwordHash)`,
  ).first();

  if (!user) {
    throw new AuthError("invalid email or password");
  }

  session.login({ userId: user.id, userName: user.name });
}

/** @rpc */
export function signout() {
  session.logout();
}
