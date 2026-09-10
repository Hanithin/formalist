import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const requerir = createRequire(import.meta.url);
const inpi = requerir("../../src/infrastructure/inpi/inpi.cjs");

/**
 * Le dictionnaire des `typeDocument`, reconstitué depuis les dépôts réels.
 *
 * L'INPI ne publie pas la feuille des codes de pièces jointes, et `/api/data_dictionary`
 * ne rend pas cette table : nous avancions par essai, un code refusé ne se voyant qu'au
 * dépôt. La liste des actes d'une société, elle, rend pour chaque pièce son code **et**
 * son libellé officiel. Assez de sociétés parcourues, et le dictionnaire se reconstitue.
 *
 * Hors de la suite : appelle un tiers, et n'a de sens que lancé à la main.
 */
it("reconstitue le dictionnaire des codes de pièces", async () => {
  const sirens = [
    "940577380", "899979934", "552032534", "552100554", "775665019",
    "542107651", "632012100", "572062594", "542051180", "662042449",
    "380129866", "552144503", "421203163", "444608442", "775670417",
  ];

  const dictionnaire = new Map<string, string>();
  for (const siren of sirens) {
    const reponse = (await inpi.inpiJson("/api/companies/" + siren + "/attachments")) as {
      status: number;
      json?: { actes?: { typeDocument?: string; libelle?: string }[] };
    };
    for (const acte of reponse.json?.actes ?? []) {
      if (acte.typeDocument && acte.libelle) dictionnaire.set(acte.typeDocument, acte.libelle);
    }
  }

  const trie = [...dictionnaire.entries()].sort(
    (a, b) => Number(a[0].slice(3)) - Number(b[0].slice(3))
  );
  writeFileSync("/tmp/inpi-dictionnaire.json", JSON.stringify(Object.fromEntries(trie), null, 2));
  console.log(trie.map(([code, libelle]) => code + "  " + libelle).join("\n"));
}, 180_000);
