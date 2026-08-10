import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { societesModifiables, ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { MODIFICATIONS, definitionModification } from "@/domain/formalite/modifications";
import { Vide } from "@/components/liste/Vide";
import { ChoixModification } from "./ChoixModification";
import { FormulaireModification } from "./FormulaireModification";

export const metadata: Metadata = {
  title: "Modifier ma société - Formalist",
  robots: { index: false, follow: false },
};

export default async function Modification({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await searchParams;

  // Une modification en cours : on reprend là où elle en était.
  if (dossier) {
    const { brouillon } = await ouvrirModification(utilisateur, Number(dossier));
    const definition = definitionModification(brouillon.typeModification ?? "");

    if (definition) {
      return (
        <main>
          <h1>{definition.libelle}</h1>
          <p>{brouillon.denomination}</p>
          <FormulaireModification
            dossierId={Number(dossier)}
            champs={definition.champs}
            valeurs={brouillon.valeurs ?? {}}
          />
        </main>
      );
    }
  }

  const societes = await societesModifiables(utilisateur);

  return (
    <main>
      <h1>Modifier ma société</h1>

      {societes.length === 0 ? (
        <Vide
          icone="/modification"
          titre="Aucune société à modifier"
          texte="Une modification porte sur une société déjà immatriculée : changement de siège, de dénomination ou de dirigeant. Créez-en une d'abord."
          action={{ libelle: "Créer une société", lien: "/creation?type=creation" }}
          secondaire={{ libelle: "Voir mes formalités", lien: "/formalites" }}
        />
      ) : (
        <ChoixModification societes={societes} modifications={MODIFICATIONS} />
      )}
    </main>
  );
}
