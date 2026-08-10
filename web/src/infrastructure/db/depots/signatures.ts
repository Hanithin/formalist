import { prisma } from "../client";
import { exigerDossier, exigerDossierModifiable } from "./dossiers";
import {
  etatDemande,
  toutLeMondeASigne,
  verifierTrace,
  PHASE_APRES_SIGNATURE,
  type DemandeSignature,
} from "@/domain/formalite/signature";
import { jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Demandes de signature.
 *
 * Les associés n'ont pas de compte : leur jeton est leur seule preuve. Il est donc
 * long, à usage unique, et l'ouverture d'un lien ne révèle que ce qu'il y a à
 * signer - ni le dossier complet, ni les autres signataires.
 */

function versDemande(ligne: {
  id: number;
  associe_name: string;
  associe_email: string | null;
  opened_at: Date | null;
  signed_at: Date | null;
}): DemandeSignature {
  return {
    id: ligne.id,
    nom: ligne.associe_name,
    email: ligne.associe_email ?? "",
    ouverteLe: ligne.opened_at,
    signeeLe: ligne.signed_at,
  };
}

export async function demandesDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId);

  const lignes = await prisma.signature_requests.findMany({
    where: { formalite_id: dossierId },
    orderBy: { associe_index: "asc" },
  });

  return lignes.map((l) => ({
    ...versDemande(l),
    role: l.role,
    etat: etatDemande(versDemande(l)),
  }));
}

/** Ouvre le circuit : une demande par associé. */
export async function demanderSignatures(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  signataires: { nom: string; email: string; role?: string }[]
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  // On repart de zéro : relancer le circuit ne doit pas laisser d'anciens jetons
  // valides en circulation.
  await prisma.signature_requests.deleteMany({
    where: { formalite_id: dossierId, signed_at: null },
  });

  const creees = [];
  for (const [index, signataire] of signataires.entries()) {
    const demande = await prisma.signature_requests.create({
      data: {
        formalite_id: dossierId,
        associe_index: index,
        associe_name: signataire.nom,
        associe_email: signataire.email,
        role: signataire.role ?? "associe",
        token: jeton(),
        status: "pending",
      },
    });
    creees.push({ id: demande.id, nom: demande.associe_name, jeton: demande.token });
  }

  return creees;
}

/**
 * Ce que voit le signataire en ouvrant son lien.
 *
 * On ne rend que son nom, la société et les documents à signer. Un jeton ne donne
 * pas accès au dossier.
 */
export async function ouvrirLienDeSignature(jetonRecu: string) {
  const demande = await prisma.signature_requests.findUnique({
    where: { token: jetonRecu },
    include: { formalites: { select: { id: true, societe: true, forme: true } } },
  });
  if (!demande) return null;

  // La première ouverture est datée : elle sert à savoir si le lien est arrivé.
  if (!demande.opened_at && !demande.signed_at) {
    await prisma.signature_requests.update({
      where: { id: demande.id },
      data: { opened_at: new Date(), status: "opened" },
    });
  }

  return {
    nom: demande.associe_name,
    societe: demande.formalites?.societe ?? "",
    forme: demande.formalites?.forme ?? "",
    dejaSignee: demande.signed_at !== null,
  };
}

/**
 * Enregistre une signature.
 *
 * Le jeton devient inutilisable : une signature ne se rejoue pas. Quand tous ont
 * signé, le dossier avance - c'est le seul moment où il le fait tout seul.
 */
export async function signer(jetonRecu: string, trace: string) {
  verifierTrace(trace);

  const demande = await prisma.signature_requests.findUnique({ where: { token: jetonRecu } });
  if (!demande) return { ok: false as const, raison: "introuvable" as const };
  if (demande.signed_at) return { ok: false as const, raison: "deja_signee" as const };

  await prisma.signature_requests.update({
    where: { id: demande.id },
    data: { signature_data: trace, signed_at: new Date(), status: "signed" },
  });

  const toutes = await prisma.signature_requests.findMany({
    where: { formalite_id: demande.formalite_id },
  });

  const complet = toutLeMondeASigne(toutes.map(versDemande));
  if (complet) {
    await prisma.formalites.update({
      where: { id: demande.formalite_id },
      data: { phase: PHASE_APRES_SIGNATURE, updated_at: new Date() },
    });
  }

  await prisma.audit_log.create({
    data: {
      formalite_id: demande.formalite_id,
      actor_id: null,
      actor_role: "signataire",
      action: "statuts_signes",
      target_field: demande.associe_name,
    },
  });

  return { ok: true as const, complet };
}
