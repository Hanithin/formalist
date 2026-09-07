import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  demander,
  echeanceDuJeton,
  enProduction,
  GuichetNonConfigure,
  GuichetRefuse,
  hoteDuGuichet,
  oublierLeJeton,
  ouvrirUneSession,
} from "@/infrastructure/guichet/transport";
import {
  depotsDeLaReponse,
  dossierDeLaReference,
  referenceDuDossier,
} from "@/infrastructure/guichet/formalites";

/**
 * Le transport vers le guichet, contre un réseau simulé.
 *
 * Aucun appel réel : la démonstration de l'INPI est un service tiers, et un test qui en
 * dépend échoue les jours où il est indisponible. La vérification contre le service
 * réel existe, mais se lance à la main - `npm run guichet:ping`.
 */

function jetonAvec(exp: number | null): string {
  const charge = Buffer.from(JSON.stringify(exp === null ? {} : { exp })).toString("base64url");
  return "entete." + charge + ".signature";
}

/**
 * Une réponse HTTP simulée, comme `fetch` la rendrait.
 *
 * Les en-têtes en font partie : le guichet rend le jeton dans un cookie `BEARER` pour
 * un compte ordinaire, et le transport les lit à chaque appel. Une fausse réponse sans
 * en-têtes faisait donc échouer le transport sur un `TypeError` plutôt que sur ce que
 * le test observait - `cookies` porte ce qu'un `Set-Cookie` aurait apporté.
 */
function reponse(statut: number, corps: unknown, cookies: string[] = []): Response {
  return {
    status: statut,
    text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)),
    headers: { getSetCookie: () => cookies } as unknown as Headers,
  } as Response;
}

const ENV = { ...process.env };

beforeEach(() => {
  oublierLeJeton();
  process.env.GUICHET_USERNAME = "cabinet";
  process.env.GUICHET_PASSWORD = "secret";
  delete process.env.GUICHET_HOTE;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ENV };
  oublierLeJeton();
});

describe("l'environnement", () => {
  /* Une configuration incomplète ne doit jamais déposer en production. */
  it("vise la démonstration tant qu'on n'a rien déclaré", () => {
    expect(hoteDuGuichet()).toBe("guichet-unique-demo.inpi.fr");
    expect(enProduction()).toBe(false);
  });

  it("se lit sur l'hôte, sans second réglage", () => {
    process.env.GUICHET_HOTE = "guichet-unique.inpi.fr";
    expect(enProduction()).toBe(true);
  });

  it("refuse de se connecter sans identifiants", async () => {
    delete process.env.GUICHET_USERNAME;
    await expect(ouvrirUneSession(true)).rejects.toBeInstanceOf(GuichetNonConfigure);
  });
});

describe("l'échéance d'un jeton", () => {
  it("se lit dans le jeton", () => {
    expect(echeanceDuJeton(jetonAvec(1_700_000_000))).toBe(1_700_000_000_000);
  });

  /*
   * Le contrat ne donne pas la durée de vie d'un jeton. Un jeton illisible vaut donc
   * « pas d'échéance connue » : c'est le 401 qui décidera, pas un délai inventé.
   */
  it("vaut « inconnue » quand le jeton ne la porte pas", () => {
    expect(echeanceDuJeton(jetonAvec(null))).toBeNull();
    expect(echeanceDuJeton("pas-un-jwt")).toBeNull();
    expect(echeanceDuJeton("a.!!!.c")).toBeNull();
  });
});

describe("la session", () => {
  /*
   * Le jeton arrive de deux façons, et une seule était lue.
   *
   * Le contrat le dit : « le token JWT sera retourné par défaut dans un cookie BEARER
   * et non dans le champ token de la réponse ; si l'utilisateur est considéré comme API
   * only, le token sera retourné dans le champ token ». Un compte ordinaire relève du
   * premier cas - et la connexion échouait donc sur un 200, en annonçant un refus que
   * le guichet n'avait pas prononcé.
   */
  it("prend le jeton dans le cookie quand le corps n'en porte pas", async () => {
    const attendu = jetonAvec(Date.now() / 1000 + 3600);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reponse(200, { name: "MADFAI", roles: ["ROLE_AGENT"] }, [
          "REFRESH_TOKEN=autre; path=/; httponly",
          "BEARER=" + attendu + "; Max-Age=7200; path=/; secure; httponly",
        ])
      )
    );

    expect(await ouvrirUneSession(true)).toBe(attendu);
  });

  /* La valeur voyage encodée dans l'en-tête : un jeton laissé tel quel serait refusé. */
  it("décode le jeton que le cookie a encodé", async () => {
    const attendu = jetonAvec(Date.now() / 1000 + 3600);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(reponse(200, {}, ["BEARER=" + encodeURIComponent(attendu) + "; path=/"]))
    );

    expect(await ouvrirUneSession(true)).toBe(attendu);
  });

  /* Le corps l'emporte : il est explicite là où le cookie est un effet de bord. */
  it("préfère le jeton du corps quand les deux sont là", async () => {
    const duCorps = jetonAvec(Date.now() / 1000 + 3600);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reponse(200, { token: duCorps }, ["BEARER=celui-du-cookie"]))
    );

    expect(await ouvrirUneSession(true)).toBe(duCorps);
  });

  /* Ni corps ni cookie : là, c'est bien un refus. */
  it("échoue quand aucune des deux voies ne porte de jeton", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(200, { name: "MADFAI" }, [])));

    await expect(ouvrirUneSession(true)).rejects.toBeInstanceOf(GuichetRefuse);
  });

  it("garde son jeton d'un appel à l'autre", async () => {
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(reponse(201, { token: jetonAvec(Date.now() / 1000 + 3600) }))
      .mockResolvedValue(reponse(200, []));
    vi.stubGlobal("fetch", fetchSimule);

    await demander("/api/formalities");
    await demander("/api/formalities");

    const connexions = fetchSimule.mock.calls.filter((c) =>
      String(c[0]).endsWith("/api/user/login/sso")
    );
    expect(connexions).toHaveLength(1);
  });

  it("la refait une fois sur un 401, et une seule", async () => {
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(reponse(201, { token: jetonAvec(null) }))
      .mockResolvedValueOnce(reponse(401, { detail: "Expired JWT Token" }))
      .mockResolvedValueOnce(reponse(201, { token: jetonAvec(null) }))
      .mockResolvedValueOnce(reponse(401, { detail: "Expired JWT Token" }));
    vi.stubGlobal("fetch", fetchSimule);

    await expect(demander("/api/formalities")).rejects.toBeInstanceOf(GuichetRefuse);
    /* Deux connexions, deux tentatives : pas de boucle sur une erreur de compte. */
    expect(fetchSimule).toHaveBeenCalledTimes(4);
  });

  /* Les CPU non validées répondent ici, pas plus loin. */
  it("échoue à la connexion quand le guichet refuse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(401, { detail: "CPU" })));
    await expect(ouvrirUneSession(true)).rejects.toBeInstanceOf(GuichetRefuse);
  });

  /* Une page d'erreur en HTML ne doit pas casser la lecture de la réponse. */
  it("survit à une réponse qui n'est pas du JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(503, "<html>maintenance</html>")));
    await expect(ouvrirUneSession(true)).rejects.toMatchObject({
      statutHttp: 503,
      corps: "<html>maintenance</html>",
    });
  });
});

describe("la liste des dépôts", () => {
  /*
   * Le guichet est bâti sur API Platform : selon la négociation de contenu, il rend un
   * tableau nu ou une collection Hydra. Ne lire qu'une des deux formes ferait conclure
   * à un compte vide - le défaut qui a fait croire, côté registre, que l'INPI ne
   * publiait aucun acte.
   */
  it("se lit en tableau nu comme en collection Hydra", () => {
    const brut = [{ id: 7, status: "VALIDATED", referenceMandataire: "FORMALIST-42" }];
    expect(depotsDeLaReponse(brut)).toHaveLength(1);
    expect(depotsDeLaReponse({ "hydra:member": brut })).toHaveLength(1);
    expect(depotsDeLaReponse({ member: brut })).toHaveLength(1);
  });

  it("rend une liste vide plutôt que de lever", () => {
    expect(depotsDeLaReponse(null)).toEqual([]);
    expect(depotsDeLaReponse({ "hydra:totalItems": 0 })).toEqual([]);
  });

  it("écarte ce qui n'a pas d'identifiant", () => {
    expect(depotsDeLaReponse([{ status: "VALIDATED" }])).toEqual([]);
  });

  /*
   * Le champ s'appelle `referenceMandataire` à l'envoi et `referenceClientMandataire`
   * au filtre : deux noms pour la même chose, dans le même contrat.
   */
  it("pose et relit la référence d'un dossier", () => {
    expect(referenceDuDossier(42)).toBe("FORMALIST-42");
    expect(dossierDeLaReference("FORMALIST-42")).toBe(42);
    expect(dossierDeLaReference("  FORMALIST-42 ")).toBe(42);
    expect(dossierDeLaReference("DOSSIER-42")).toBeNull();
    expect(dossierDeLaReference(null)).toBeNull();
  });

  it("porte les filtres du contrat dans la requête", async () => {
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(reponse(201, { token: jetonAvec(null) }))
      .mockResolvedValue(reponse(200, []));
    vi.stubGlobal("fetch", fetchSimule);

    const { listerLesDepots } = await import("@/infrastructure/guichet/formalites");
    await listerLesDepots({ statuts: ["VALIDATED", "REJECTED"], typeFormalite: "C", reference: "FORMALIST-9" });

    const url = String(fetchSimule.mock.calls.at(-1)?.[0]);
    expect(url).toContain("status%5B%5D=VALIDATED");
    expect(url).toContain("status%5B%5D=REJECTED");
    expect(url).toContain("typeFormalite=C");
    expect(url).toContain("referenceClientMandataire=FORMALIST-9");
  });
});
