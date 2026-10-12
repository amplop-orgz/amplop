// Route guards (06 S06-8). For the person's comfort only: the contract and the signed API are the control.
export type Role = { studentAccountId?: bigint; trustedAccountId?: bigint };
export type Guard = "student" | "trusted" | "onboarding" | "signedIn" | "none";
export type GuardState = { session: null | { role: Role } };
export type Decision = { allow: true } | { unlock: true } | { redirect: string };

const ALLOW: Decision = { allow: true };

export function guardFor(path: string): Guard {
  if (path === "/app/name" || path === "/app/setup") return "onboarding";
  if (path === "/app/parent" || path.startsWith("/app/parent/")) return "trusted";
  if (path === "/app") return "none"; // /app picks Welcome, home or parent home itself
  if (path.startsWith("/app/")) return "student";
  if (path.startsWith("/approve/") || /^\/recover\/[^/]+$/.test(path)) return "signedIn";
  return "none";
}

export function decideRoute(path: string, state: GuardState): Decision {
  const guard = guardFor(path);
  if (guard === "none") return ALLOW;
  if (!state.session) return { unlock: true };
  const { studentAccountId, trustedAccountId } = state.session.role;
  const student = studentAccountId !== undefined;
  const trusted = trustedAccountId !== undefined;
  switch (guard) {
    case "student":
      if (student) return ALLOW;
      return { redirect: trusted ? "/app/parent" : "/app" };
    case "trusted":
      if (trusted) return ALLOW;
      // 14 S14-1, J6: someone no longer linked sees "You are not linked to a student" there.
      if (!student && path === "/app/parent") return ALLOW;
      return { redirect: "/app" };
    case "onboarding":
      if (trusted && !student) return { redirect: "/app/parent" };
      return ALLOW;
    case "signedIn":
      return ALLOW;
  }
}

/** Where `/app` itself sends a signed-in person. null means Welcome (role none). */
export function appHome(role: Role): "/app/parent" | "home" | null {
  if (role.studentAccountId !== undefined) return "home";
  if (role.trustedAccountId !== undefined) return "/app/parent";
  return null;
}
