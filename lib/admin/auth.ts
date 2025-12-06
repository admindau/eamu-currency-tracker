// lib/admin/auth.ts
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "fx_admin_session";

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies(); // cookies() is async in route handlers
  const session = store.get(ADMIN_COOKIE_NAME);
  return !!session && session.value === "ok";
}
