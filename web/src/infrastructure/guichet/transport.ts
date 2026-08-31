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
  constructor(
    readonly chemin: string,
    readonly statutHttp: number,
    readonly corps: unknown
  ) {
    super("Le guichet unique a refusé la demande");
    this.name = "GuichetRefuse";
    journal.error({ chemin, statutHttp, corps }, "Guichet unique : demande refusée");
  }
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

let jeton: string | null = null;
let echeance: number | null = null;
let compte: unknown = null;

/** Pour les tests, et pour un changement d'environnement en développement. */
export function oublierLeJeton(): void {
  jeton = null;
  echeance = null;
  compte = null;
}

/**
 * Le compte tel que la connexion l'a décrit.
 *
 * La réponse d'authentification porte le nom, la société et les rôles de l'utilisateur.
 * Les garder évite un second appel pour une chose que le guichet vient de dire - et il
 * n'existe d'ailleurs pas de point d'accès « qui suis-je » dans le contrat.
 */
export function compteDeLaSession(): unknown {
  return compte;
}

interface Identifiants {
  username: string;
  password: string;
}

function identifiants(): Identifiants {
  const username = (process.env.GUICHET_USERNAME ?? "").trim();
  const password = process.env.GUICHET_PASSWORD ?? "";
  if (!username || !password) throw new GuichetNonConfigure();
  return { username, password };
}

async function appeler(
  chemin: string,
  init: RequestInit
): Promise<{ statut: number; corps: unknown }> {
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
  return { statut: reponse.status, corps };
}

/**
 * Ouvre une session et garde le jeton.
 *
 * `POST /api/user/login/sso` rend un JWT à placer dans l'en-tête `Authorization`. Le
 * guichet distingue les personnes physiques, qui reçoivent un cookie, des systèmes
 * externes, qui reçoivent le jeton dans le corps : c'est ce second cas qui nous
 * concerne.
 *
 * Un compte dont les conditions particulières d'utilisation n'ont pas été validées
 * échoue ici, et non plus loin. Le message le dit : c'est une première connexion par
 * l'interface web qui les valide, pas un réglage de notre côté.
 */
export async function ouvrirUneSession(force = false): Promise<string> {
  const maintenant = Date.now();
  if (!force && jeton && (echeance === null || maintenant + MARGE < echeance)) return jeton;

  const { username, password } = identifiants();
  const { statut, corps } = await appeler("/api/user/login/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const donne = corps as { token?: unknown } | null;
  const recu = typeof donne?.token === "string" ? donne.token : null;
  if (statut >= 400 || !recu) throw new GuichetRefuse("/api/user/login/sso", statut, corps);

  jeton = recu;
  echeance = echeanceDuJeton(recu);
  compte = corps;
  journal.info(
    { hote: hoteDuGuichet(), production: enProduction(), echeance },
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
  init: RequestInit = {}
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

  let reponse = await avec(await ouvrirUneSession(false));
  if (reponse.statut === 401) reponse = await avec(await ouvrirUneSession(true));

  if (reponse.statut >= 400) throw new GuichetRefuse(chemin, reponse.statut, reponse.corps);
  return reponse.corps;
}
