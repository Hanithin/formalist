import { NextResponse, type NextRequest } from "next/server";
import { estPublic } from "@/domain/acces/routes-publiques";
import { nouvelleAdresse } from "@/domain/navigation/anciennes-adresses";
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
/**
 * Politique de sécurité de contenu.
 *
 * Le serveur d'origine devait autoriser 'unsafe-inline' : tout son JavaScript
 * était écrit dans les pages, ce qui annulait l'essentiel de la protection. Ici,
 * seuls les scripts portant le jeton de la requête s'exécutent - un script
 * injecté dans une page ne l'a pas.
 *
 * 'strict-dynamic' laisse les scripts autorisés en charger d'autres : Next
 * charge ses fragments ainsi, et les énumérer serait intenable.
 */
function politiqueDeSecurite(jeton: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + jeton + "' 'strict-dynamic'",
    // Les styles restent en ligne : les modules CSS de Next les injectent, et il
    // n'existe pas d'équivalent de strict-dynamic pour eux.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://api-adresse.data.gouv.fr https://geo.api.gouv.fr https://recherche-entreprises.api.gouv.fr",
    "frame-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export default function proxy(requete: NextRequest) {
  const { pathname, search } = requete.nextUrl;

  // Le chemin courant est transmis aux composants serveur, qui ne peuvent pas le
  // lire autrement : ils reçoivent les entêtes, pas l'adresse demandée.
  // Ancienne adresse : redirection permanente, pour que les liens déjà envoyés
  // continuent de fonctionner et que les moteurs enregistrent le changement.
  const cible = nouvelleAdresse(pathname, requete.nextUrl.searchParams);
  if (cible) {
    return NextResponse.redirect(new URL(cible, requete.url), 308);
  }

  const jeton = crypto.randomUUID().replace(/-/g, "");

  const entetes = new Headers(requete.headers);
  entetes.set("x-chemin", pathname);
  // Next lit cet en-tête et appose le jeton sur les scripts qu'il produit.
  entetes.set("x-nonce", jeton);

  const laisserPasser = () => {
    const reponse = NextResponse.next({ request: { headers: entetes } });
    reponse.headers.set("Content-Security-Policy", politiqueDeSecurite(jeton));
    reponse.headers.set("X-Content-Type-Options", "nosniff");
    reponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    reponse.headers.set("X-Frame-Options", "SAMEORIGIN");
    return reponse;
  };

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
