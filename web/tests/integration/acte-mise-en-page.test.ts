import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDuGabarit, gabaritProcesVerbal } from "@/domain/modification/gabarit";

/**
 * La mise en page que la passe de génération impose aux actes.
 *
 * Elle reconnaît les titres pour leur donner de l'air, et se trompe parfois de client :
 * une valeur mise en avant est courte et grasse comme un intertitre.
 */

const CONTEXTE = {
  societe: {
    denomination: "BLUE SHARK ADVISORY",
    forme: "SAS",
    siren: "100442326",
    adresse: "34 rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    capital: 100,
    villeRcs: "Paris",
  },
  assemblee: {
    date: "2026-09-04",
    totalParts: 10000,
    associes: [
      { nature: "physique", civilite: "Monsieur", prenom: "Hai", nom: "LAFOFA", parts: 10000 },
    ],
  },
  codes: ["transfert_siege"],
  valeurs: {
    nouvelleAdresse: "12 Rue de Saint-Pétersbourg",
    nouveauCodePostal: "75008",
    nouvelleVille: "Paris",
    dateEffetTransfert: "2026-09-15",
  },
};

/** Les paragraphes de l'acte, avec leur texte et leur espacement. */
function paragraphes(): { texte: string; avant: number | null; apres: number | null }[] {
  const xml = new PizZip(
    genererDocument(gabaritProcesVerbal("SAS", 1), donneesDuGabarit(CONTEXTE as never))
  )
    .file("word/document.xml")!
    .asText();

  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => {
    const espacement = /<w:spacing\b[^/]*\/>/.exec(p)?.[0] ?? "";
    const lire = (cle: string) => {
      const trouve = new RegExp('w:' + cle + '="(\\d+)"').exec(espacement);
      return trouve ? Number(trouve[1]) : null;
    };
    return {
      texte: p.replace(/<[^>]*>/g, "").replace(/&apos;/g, "'").trim(),
      avant: lire("before"),
      apres: lire("after"),
    };
  });
}

describe("l'espacement d'un acte", () => {
  /*
   * « L'associé unique décide de transférer le siège social à l'adresse suivante : »
   * puis, en gras et centrée, la nouvelle adresse. Courte et grasse, elle était prise
   * pour un intertitre et recevait l'écart d'une coupure - dix-huit points au-dessus
   * contre six au-dessous : elle flottait loin de la phrase qui l'introduit et collait
   * à celle qui la suit.
   */
  it("ne coupe pas entre un deux-points et ce qu'il annonce", () => {
    const paras = paragraphes();
    const rang = paras.findIndex((p) => /^12 Rue de Saint-Pétersbourg, 75008 Paris$/.test(p.texte));

    expect(rang).toBeGreaterThan(0);
    expect(paras[rang - 1].texte).toMatch(/adresse suivante\s?:$/);
    /* Autant d'air au-dessus qu'au-dessous : la valeur appartient à sa phrase. */
    expect(paras[rang].avant).toBe(120);
  });

  /* Un vrai intertitre, lui, garde sa coupure. */
  it("garde de l'air au-dessus d'un intertitre de décision", () => {
    const paras = paragraphes();
    const titre = paras.find((p) => /DÉCISION - TRANSFERT DU SIÈGE SOCIAL/.test(p.texte));

    expect(titre).toBeTruthy();
    expect(titre!.avant).toBeGreaterThanOrEqual(360);
  });
});
