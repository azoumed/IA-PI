import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import type { Actor } from "./audit";

export const SESSION_COOKIE = "ompic_session";
const SESSION_DAYS = 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum)");
  return new TextEncoder().encode(s);
}

/**
 * Le cookie n'est marqué « Secure » que si le site est servi en HTTPS (directement ou derrière
 * un reverse proxy qui transmet X-Forwarded-Proto). Sinon le navigateur le refuserait en HTTP
 * et chaque clic renverrait vers la page de connexion. COOKIE_SECURE=true|false force le choix.
 */
async function isSecureRequest() {
  const forced = process.env.COOKIE_SECURE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto) return proto === "https";
  return (h.get("origin") ?? "").startsWith("https://");
}

export async function createSession(userId: number) {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureRequest(),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    return user && user.active ? user : null;
  } catch {
    return null;
  }
}

export async function requireUser(roles?: User["role"][]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

export function actorOf(user: User): Actor {
  return { id: user.id, label: user.name };
}
