import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  completerModification,
  ouvrirModification,
  type ContratAirDuDossier,
} from "@/infrastructure/db/depots/modifications";
import { deposerPdfProduit } from "@/infrastructure/documents/depot";
import { lireLeTexteDUnPdf, DocumentIllisible } from "@/infrastructure/documents/lecture-bilan";
import { lireUnAir, type AirLu } from "@/domain/modification/lecture-air";
import { verifierDepot, DepotRefuse } from "@/lib/fichiers";
import { PREFIXE_ACCORD } from "@/domain/document/publication";
import { route } from "@/lib/reponses";
import { journal } from "@/lib/journal";

/**
 * Le titre sous lequel chaque accord rejoint le dossier.
 *
 * Le rang suit l'ordre d'arrivée, et le nom du fichier reste dans la liste pour que
 * l'écran sache de quel accord il parle. Le préfixe vient du domaine : c'est lui qui
 * écarte ces documents de la liste des actes produits par le cabinet.
 */
export function titreDeLAccord(rang: number): string {
  return PREFIXE_ACCORD + String(rang).padStart(2, "0");
}

/**
 * Le rang du prochain accord, qui ne revient jamais en arrière.
 *
 * Compter les accords présents suffisait tant qu'on n'en retirait aucun : retirer le
 * deuxième de trois ramenait le compte à deux, et le dépôt suivant reprenait le titre du
 * troisième - dont le fichier était remplacé alors qu'il figurait toujours dans la liste.
 * Le rang se prend donc au-dessus du plus haut déjà employé.
 */
export function rangSuivant(air: ContratAirDuDossier[]): number {
  const rangs = air.map((accord) => {
    const trouve = /(\d+)\s*$/.exec(accord.document ?? "");
    return trouve ? Number(trouve[1]) : 0;
  });
  return Math.max(0, ...rangs) + 1;
}

/** Un tour d'amorçage se compte en dizaines d'accords, pas en centaines. */
const ACCORDS_MAXIMUM = 60;

/**
 * Le dépôt des accords d'investissement rapide.
 *
 * Chaque accord porte quatre données qui décident du tableau de conversion : le
 * souscripteur, le montant, la valorisation retenue et la date. Les retaper vingt fois
 * à la main, c'est vingt occasions de se tromper sur des chiffres que personne ne
 * relira avant le refus du greffe.
 *
 * Ce que la lecture rend n'est jamais posé sans relecture : la réponse revient à
 * l'écran, qui l'affiche champ par champ et laisse corriger. Un accord illisible n'est
 * pas rejeté - il entre avec ses blancs, et la liste dit ce qui manque.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const fichiers = formulaire.getAll("fichiers").filter((f): f is File => f instanceof File);

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (fichiers.length === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const deja = modification.air ?? [];

  if (deja.length + fichiers.length > ACCORDS_MAXIMUM) {
    return NextResponse.json(
      { error: "Un dossier ne porte pas plus de " + ACCORDS_MAXIMUM + " accords" },
      { status: 400 }
    );
  }

  const ajoutes: ContratAirDuDossier[] = [];
  let rang = rangSuivant(deja);
  for (const fichier of fichiers) {
    const contenu = Buffer.from(await fichier.arrayBuffer());
    try {
      verifierDepot(fichier.name, contenu, [".pdf"]);
    } catch (e) {
      if (e instanceof DepotRefuse) {
        return NextResponse.json({ error: fichier.name + " : " + e.message }, { status: 400 });
      }
      throw e;
    }

    const document = titreDeLAccord(rang);
    rang += 1;
    await deposerPdfProduit(dossierId, document, contenu);

    /*
     * Un accord qu'on ne sait pas lire entre quand même.
     *
     * Un PDF numérisé, une signature électronique qui aplatit le texte, un gabarit
     * qu'on n'a jamais vu : la lecture échoue et le dossier n'en est pas moins réel.
     * L'accord rejoint la liste avec ses quatre champs vides, et l'écran les demande.
     */
    let lu: AirLu = { investisseur: null, montant: null, valorisation: null, signeLe: null, manques: [] };
    try {
      const { texte } = await lireLeTexteDUnPdf(contenu);
      lu = lireUnAir(texte);
    } catch (e) {
      if (!(e instanceof DocumentIllisible)) throw e;
      journal.warn({ dossierId, fichier: fichier.name }, "Accord BSA AIR illisible");
      lu.manques = ["tout : le document n'a pas pu être lu"];
    }

    ajoutes.push({
      fichier: fichier.name,
      document,
      investisseur: lu.investisseur ?? "",
      montant: lu.montant ?? 0,
      valorisation: lu.valorisation ?? 0,
      signeLe: lu.signeLe,
      manques: lu.manques,
    });
  }

  const air = [...deja, ...ajoutes];
  await completerModification(utilisateur, dossierId, { air });

  return NextResponse.json({ air }, { status: 201 });
});

/**
 * La correction de la liste, et le retrait d'un accord.
 *
 * La lecture propose, l'avocat dispose : c'est ici que revient la liste relue. Elle
 * remplace l'ancienne en entier plutôt que par différences - une liste de vingt lignes
 * corrigée à trois endroits se transmet mieux entière qu'en trois rustines.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const corps = (await requete.json()) as { dossier?: unknown; air?: unknown };

  const dossierId = Number(corps.dossier);
  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!Array.isArray(corps.air) || corps.air.length > ACCORDS_MAXIMUM) {
    return NextResponse.json({ error: "Liste d'accords invalide" }, { status: 400 });
  }

  await ouvrirModification(utilisateur, dossierId);

  const air: ContratAirDuDossier[] = corps.air.map((brut) => {
    const ligne = brut as Record<string, unknown>;
    return {
      fichier: String(ligne.fichier ?? "").slice(0, 200),
      /* Le titre du document est posé au dépôt : la correction ne doit pas le perdre. */
      document: typeof ligne.document === "string" ? ligne.document.slice(0, 100) : undefined,
      investisseur: String(ligne.investisseur ?? "").slice(0, 200),
      montant: Number(ligne.montant) > 0 ? Number(ligne.montant) : 0,
      valorisation: Number(ligne.valorisation) > 0 ? Number(ligne.valorisation) : 0,
      signeLe: typeof ligne.signeLe === "string" ? ligne.signeLe.slice(0, 10) : null,
    };
  });

  await completerModification(utilisateur, dossierId, { air });
  return NextResponse.json({ air });
});
