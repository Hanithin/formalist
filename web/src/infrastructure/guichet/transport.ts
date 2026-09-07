import { journal } from "@/lib/journal";

/**
 * Le transport vers le guichet unique des formalités d'entreprises.
 *
 * Ce n'est pas le registre national. `infrastructure/inpi` lit un registre public -
 * capital d'une société, actes déposés - avec un compte data.inpi.fr. Ici on dépose au
 * nom du cabinet, avec un compte e-procedures, sur un autre hôte et selon un autre
 * contrat. Les mêler ferait qu'une panne de l'un ressemble à une panne de l'autre : un
 * identifiant de dépôt périmé casserait la recherche de société d'un client.
 *
 * Deux environnements, deux comptes distincts - l'INPI ne partage pas les
 * identifiants entre la démonstration et la production.
 *
 * Contrat d'interface : https://guichet-unique.inpi.fr/api/docs/mandataire
 */

/**
 * La démonstration est le défaut.
 *
 * Une configuration incomplète ne doit jamais déposer en production. C'est le seul
 * défaut acceptable pour ce réglage-là : au pire on écrit dans un bac à sable, au
 * mieux on s'aperçoit que l'hôte n'a pas été déclaré.
 */
const HOTE_DEMONSTRATION = "guichet-unique-demo.inpi.fr";

export function hoteDuGuichet(): string {
  return (process.env.GUICHET_HOTE ?? "").trim() || HOTE_DEMONSTRATION;
}

/** L'environnement se lit sur l'hôte, sans second réglage à tenir en cohérence. */
export function enProduction(): boolean {
  return !hoteDuGuichet().includes("-demo");
}

export class GuichetNonConfigure extends Error {
  readonly statut = 503;
  constructor() {
    super("Le guichet unique n'est pas configuré");
    this.name = "GuichetNonConfigure";
  }
}

/**
 * Une réponse que le guichet a refusée, avec ce qu'il en dit.
 *
 * Le contrat d'interface publie une table de codes d'erreur - formalité, paiement,
 * pièces jointes, signature. On garde le statut HTTP et le corps tel quel : c'est ce
 * qui permettra de les traduire plus tard sans avoir à reproduire l'appel.
 */
export class GuichetRefuse extends Error {
  readonly statut = 502;
  /**
   * Ce que le guichet reproche, champ par champ.
   *
   * Il ne rend pas une phrase mais une liste de violations, chacune nommant le chemin
   * fautif et ce qui ne va pas - « Le code commune 98392 n'est pas compatible avec la
   * commune de naissance Lyon ». Ce détail restait dans le journal du serveur, et
   * l'écran n'affichait que « la demande a été refusée » : l'avocat voyait un mur.
   *
   * `route()` transmet `details` au navigateur : c'est par là qu'il ressort.
   */
  readonly details?: Record<string, string[]>;

  constructor(
    readonly chemin: string,
    readonly statutHttp: number,
    readonly corps: unknown
  ) {
    super("Le guichet unique a refusé la demande");
    this.name = "GuichetRefuse";
    this.details = violationsDe(corps);
    journal.error({ chemin, statutHttp, corps }, "Guichet unique : demande refusée");
  }
}

/**
 * Les violations d'une réponse, sous la forme que les réponses HTTP attendent.
 *
 * Le chemin sert de clé : deux reproches peuvent viser le même champ - un code invalide
 * et une incompatibilité avec un autre - et les écraser en perdrait un.
 */
export function violationsDe(corps: unknown): Record<string, string[]> | undefined {
  const liste = (corps as { violations?: unknown } | null)?.violations;
  if (!Array.isArray(liste)) return undefined;

  const details: Record<string, string[]> = {};
  for (const brut of liste) {
    const v = brut as { propertyPath?: unknown; message?: unknown };
    const chemin = typeof v.propertyPath === "string" ? v.propertyPath : "";
    const message = typeof v.message === "string" ? v.message.trim() : "";
    if (!message) continue;
    (details[chemin] ??= []).push(message);
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

export class GuichetInjoignable extends Error {
  readonly statut = 502;
  constructor(
    readonly chemin: string,
    cause: unknown
  ) {
    super("Le guichet unique est injoignable");
    this.name = "GuichetInjoignable";
    journal.error({ err: cause, chemin }, "Guichet unique : injoignable");
  }
}

/**
 * L'échéance d'un jeton, lue dans le jeton lui-même.
 *
 * Le contrat ne dit pas combien de temps un jeton vit. Le client du registre présume
 * cinquante minutes ; recopier ce chiffre ici le transformerait en fait. Un JWT porte
 * son échéance dans sa charge utile : on la lit, sans vérifier la signature - on ne
 * cherche pas à valider le jeton, seulement à savoir quand le remplacer.
 *
 * Un jeton illisible ne fait pas échouer la connexion : il vaut « pas d'échéance
 * connue », et c'est le 401 qui décidera.
 */
export function echeanceDuJeton(jeton: string): number | null {
  const parts = jeton.split(".");
  if (parts.length !== 3) return null;
  try {
    const charge = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const exp = (charge as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/* Une minute de marge : un jeton qui expire pendant l'appel ne sert à rien. */
const MARGE = 60_000;

export interface Identifiants {
  username: string;
  password: string;
}

interface Session {
  jeton: string;
  echeance: number | null;
  compte: unknown;
}

/**
 * Une session par compte, et non une pour le processus.
 *
 * Le jeton tenait dans trois variables de module : il n'y avait qu'un compte, celui du
 * `.env`, et cela suffisait. Depuis que chaque avocat dépose sous son propre compte
 * e-procedures, deux dépôts simultanés se voleraient leur session - le second écraserait
 * le jeton du premier, qui déposerait alors au nom d'un autre. La clé porte l'hôte
 * autant que l'identifiant : la démonstration et la production ont des comptes distincts
 * qui peuvent porter le même nom.
 */
const sessions = new Map<string, Session>();

function cleDeSession(identifiants: Identifiants): string {
  return identifiants.username + "@" + hoteDuGuichet();
}

/** Pour les tests, et pour un changement d'environnement en développement. */
export function oublierLeJeton(): void {
  sessions.clear();
}

/**
 * Le compte tel que la connexion l'a décrit.
 *
 * La réponse d'authentification porte le nom, la société et les rôles de l'utilisateur.
 * Les garder évite un second appel pour une chose que le guichet vient de dire - et il
 * n'existe d'ailleurs pas de point d'accès « qui suis-je » dans le contrat.
 */
export function compteDeLaSession(compte?: Identifiants): unknown {
  const identifiants = compte ?? identifiantsDeLEnvironnement(false);
  return identifiants ? (sessions.get(cleDeSession(identifiants))?.compte ?? null) : null;
}

/**
 * Le compte du serveur, s'il en porte un.
 *
 * Il reste le défaut : les vérifications manuelles et le développement s'en servent, et
 * un cabinet qui n'a qu'un compte n'a pas à le saisir dans l'application. Ce n'est plus
 * le seul chemin pour autant - c'est celui qu'on prend quand personne n'a donné le sien.
 */
export function identifiantsDeLEnvironnement(): Identifiants;
export function identifiantsDeLEnvironnement(exiger: true): Identifiants;
export function identifiantsDeLEnvironnement(exiger: false): Identifiants | null;
export function identifiantsDeLEnvironnement(exiger = true): Identifiants | null {
  const username = (process.env.GUICHET_USERNAME ?? "").trim();
  const password = process.env.GUICHET_PASSWORD ?? "";
  if (!username || !password) {
    if (exiger) throw new GuichetNonConfigure();
    return null;
  }
  return { username, password };
}

async function appeler(
  chemin: string,
  init: RequestInit
): Promise<{ statut: number; corps: unknown; cookies: string[] }> {
  const url = "https://" + hoteDuGuichet() + chemin;
  let reponse: Response;
  try {
    reponse = await fetch(url, init);
  } catch (e) {
    throw new GuichetInjoignable(chemin, e);
  }

  /* Une page d'erreur en HTML n'est pas du JSON : on rend le texte plutôt que de lever. */
  const brut = await reponse.text();
  let corps: unknown = null;
  if (brut) {
    try {
      corps = JSON.parse(brut);
    } catch {
      corps = brut;
    }
  }
  return { statut: reponse.status, corps, cookies: reponse.headers.getSetCookie() };
}

/**
 * Le jeton posé en cookie, quand le corps n'en porte pas.
 *
 * La valeur est encodée pour voyager dans un en-tête `Set-Cookie` : un JWT n'a rien
 * qui l'exige, mais le guichet l'encode tout de même, et un jeton laissé tel quel se
 * ferait refuser sur le premier caractère échappé.
 */
export function jetonDuCookie(cookies: string[]): string | null {
  for (const cookie of cookies) {
    const trouve = /^\s*BEARER=([^;]+)/.exec(cookie);
    if (trouve) return decodeURIComponent(trouve[1]);
  }
  return null;
}

/**
 * Ouvre une session et garde le jeton.
 *
 * `POST /api/user/login/sso` rend un JWT à placer dans l'en-tête `Authorization`, et il
 * le rend de deux façons selon le compte. Le contrat le dit sans ambiguïté : « le token
 * JWT sera retourné par défaut dans un cookie BEARER et non dans le champ token de la
 * réponse ; si l'utilisateur est considéré comme API only, le token sera retourné dans
 * le champ token ». Un compte ordinaire relève donc du premier cas.
 *
 * Ne lire que le champ `token` faisait échouer la connexion sur un 200 : le guichet
 * avait ouvert la session, posé le cookie, et nous rendions « demande refusée » sur une
 * réponse qui n'avait rien refusé. Les deux voies sont lues, le corps d'abord - il est
 * explicite là où le cookie est un effet de bord.
 *
 * Un compte dont les conditions particulières d'utilisation n'ont pas été validées
 * échoue ici, et non plus loin. Le message le dit : c'est une première connexion par
 * l'interface web qui les valide, pas un réglage de notre côté.
 */
export async function ouvrirUneSession(force = false, compte?: Identifiants): Promise<string> {
  const identifiants = compte ?? identifiantsDeLEnvironnement();
  const cle = cleDeSession(identifiants);
  const maintenant = Date.now();

  const ouverte = sessions.get(cle);
  if (!force && ouverte && (ouverte.echeance === null || maintenant + MARGE < ouverte.echeance)) {
    return ouverte.jeton;
  }

  const { username, password } = identifiants;
  const { statut, corps, cookies } = await appeler("/api/user/login/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const donne = corps as { token?: unknown } | null;
  const recu =
    typeof donne?.token === "string" && donne.token ? donne.token : jetonDuCookie(cookies);
  if (statut >= 400 || !recu) throw new GuichetRefuse("/api/user/login/sso", statut, corps);

  const echeance = echeanceDuJeton(recu);
  sessions.set(cle, { jeton: recu, echeance, compte: corps });

  /* L'identifiant est journalisé, le mot de passe ne l'est jamais. */
  journal.info(
    { hote: hoteDuGuichet(), production: enProduction(), echeance, username },
    "Guichet unique : session ouverte"
  );
  return recu;
}

/**
 * Un appel authentifié, qui refait sa session une fois si elle a expiré.
 *
 * Une seule fois : un 401 qui persiste après renouvellement vient des identifiants ou
 * des conditions d'utilisation, non d'un jeton périmé. Réessayer indéfiniment
 * transformerait une erreur de configuration en boucle.
 */
export async function demander(
  chemin: string,
  init: RequestInit = {},
  compte?: Identifiants
): Promise<unknown> {
  const avec = async (porteur: string) =>
    appeler(chemin, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
        Authorization: "Bearer " + porteur,
      },
    });

  let reponse = await avec(await ouvrirUneSession(false, compte));
  if (reponse.statut === 401) reponse = await avec(await ouvrirUneSession(true, compte));

  if (reponse.statut >= 400) throw new GuichetRefuse(chemin, reponse.statut, reponse.corps);
  return reponse.corps;
}
