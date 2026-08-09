import { NextResponse, type NextRequest } from "next/server";
import { estPublic } from "@/domain/acces/routes-publiques";
import { NOM_COOKIE } from "@/lib/cookies";

/**
 * Protection par défaut.
 *
 * Toute adresse qui n'est pas déclarée publique exige un cookie de session. Une
 * page ajoutée sans y penser est donc fermée, pas ouverte - c'est l'inverse du
 * serveur d'origine, où oublier une garde rendait la route accessible à tous.
 *
 * Le contrôle est volontairement grossier ici : le cadre exécute ce fichier sur un
 * environnement restreint, sans accès à la base. La validité réelle de la session
 * est vérifiée par exigerUtilisateur, côté serveur. Ce filtre écarte le trafic non
 * authentifié avant qu'il n'atteigne quoi que ce soit ; il ne le remplace pas.
 */
export default function proxy(requete: NextRequest) {
  const { pathname, search } = requete.nextUrl;

  // Le chemin courant est transmis aux composants serveur, qui ne peuvent pas le
  // lire autrement : ils reçoivent les entêtes, pas l'adresse demandée.
  const entetes = new Headers(requete.headers);
  entetes.set("x-chemin", pathname);
  const laisserPasser = () => NextResponse.next({ request: { headers: entetes } });

  if (estPublic(pathname)) return laisserPasser();

  if (requete.cookies.get(NOM_COOKIE)?.value) return laisserPasser();

  // Une requête d'API reçoit un refus, pas une redirection : rediriger une requête
  // en arrière-plan rend une page de connexion là où du JSON est attendu.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const versConnexion = requete.nextUrl.clone();
  versConnexion.pathname = "/connexion";
  versConnexion.search = "";
  // On garde la destination pour y revenir après la connexion
  versConnexion.searchParams.set("suite", pathname + search);
  return NextResponse.redirect(versConnexion);
}

export const config = {
  // Tout passe par ici sauf les ressources du cadre, qui ne portent pas de données
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
