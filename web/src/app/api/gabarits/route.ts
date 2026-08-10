import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { FORMES_PROPOSEES } from "@/domain/formalite/formes";
import { documentsAProduire } from "@/domain/formalite/documents";
import { MODIFICATIONS, documentsModification } from "@/domain/formalite/modifications";
import { route } from "@/lib/reponses";

/**
 * Les gabarits employés, par forme et par type de formalité.
 *
 * Sert à vérifier ce que la plateforme sait produire, sans ouvrir un dossier.
 * Réservé aux avocats : c'est un outil de travail, pas une information client.
 */
export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();

  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    return NextResponse.json({ error: "Réservé aux avocats" }, { status: 403 });
  }

  return NextResponse.json({
    creation: FORMES_PROPOSEES.map((forme) => ({
      forme,
      documents: documentsAProduire({ forme, conjointMarie: true }),
    })),
    modification: MODIFICATIONS.map((m) => ({
      type: m.code,
      libelle: m.libelle,
      documents: FORMES_PROPOSEES.map((forme) => ({
        forme,
        gabarits: documentsModification(m.code, forme).map((d) => d.gabarit),
      })),
    })),
  });
});
