import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerContrats } from "@/infrastructure/db/depots/documents";
import { FILTRES_CONTRATS, filtreValide, statutContrat } from "@/domain/document/statuts";
import { accorder } from "@/domain/formalite/etapes";
import { Filtres } from "@/components/liste/Filtres";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";

export const metadata: Metadata = {
  title: "Contrats - Formalist",
  robots: { index: false, follow: false },
};

export default async function Contrats({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { filtre } = await searchParams;
  const actif = filtreValide(FILTRES_CONTRATS, filtre);
  const contrats = await listerContrats(utilisateur, actif);

  return (
    <main>
      <h1>Contrats</h1>

      <Filtres filtres={FILTRES_CONTRATS} actif={actif} base="/contrats" />

      {contrats.length === 0 ? (
        <Vide
          titre={actif === "tous" ? "Aucun contrat" : "Aucun contrat dans ce filtre"}
          texte="NDA, CGV, CGU, prestation : rédigés et conformes, relus par un avocat."
        />
      ) : (
        <>
          <p>{accorder(contrats.length, "contrat", "contrats")}</p>
          <ul>
            {contrats.map((c) => {
              const etat = statutContrat(c.status);
              return (
                <li key={c.id}>
                  <strong>{c.titre}</strong>
                  <span>{c.type}</span>
                  <Etat libelle={etat.libelle} ton={etat.ton} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
