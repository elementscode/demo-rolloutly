/**
 * The keys the app stores in the session, so `session.get("userId")` is
 * typed.
 */
declare module "@elements/app" {
  interface SessionData {
    userId: string;
    userName: string;
  }
}

export {};
