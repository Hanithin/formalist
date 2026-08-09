import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revoquerSession } from "@/infrastructure/db/sessions";
import { route } from "@/lib/reponses";
import { NOM_COOKIE } from "@/lib/cookies";

export const POST = route(async () => {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  // La session est révoquée en base, pas seulement oubliée par le navigateur :
  // effacer le cookie seul laisserait le jeton utilisable s'il a été copié.
  if (jeton) await revoquerSession(jeton);

  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(NOM_COOKIE, "", { path: "/", maxAge: 0 });
  return reponse;
});
