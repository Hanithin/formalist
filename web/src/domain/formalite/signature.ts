/**
 * Circuit de signature des statuts.
 *
 * Chaque associé reçoit un lien portant un jeton. Il n'a pas de compte : le jeton
 * est sa seule preuve, ce qui impose qu'il soit long, à usage unique, et que
 * l'accès à un lien ne révèle rien d'autre que ce qu'il y a à signer.
 *
 * Porté depuis routes/signature.js.
 */

export type EtatSignature = "en_attente" | "ouverte" | "signee";

export interface DemandeSignature {
  id: number;
  nom: string;
  email: string;
  ouverteLe: Date | null;
  signeeLe: Date | null;
}

export function etatDemande(demande: DemandeSignature): EtatSignature {
  if (demande.signeeLe) return "signee";
  if (demande.ouverteLe) return "ouverte";
  return "en_attente";
}

export function libelleEtat(etat: EtatSignature): string {
  if (etat === "signee") return "Signé";
  if (etat === "ouverte") return "Lien ouvert";
  return "En attente";
}

/** Le dossier avance quand tout le monde a signé, pas avant. */
export function toutLeMondeASigne(demandes: DemandeSignature[]): boolean {
  return demandes.length > 0 && demandes.every((d) => d.signeeLe !== null);
}

export function resteASigner(demandes: DemandeSignature[]): number {
  return demandes.filter((d) => d.signeeLe === null).length;
}

/**
 * Ce qu'on dit de l'avancement, du point de vue du client.
 */
export function resumeSignatures(demandes: DemandeSignature[]): string {
  if (demandes.length === 0) return "Aucune signature demandée";

  const restant = resteASigner(demandes);
  if (restant === 0) return "Tous les associés ont signé";
  if (restant === 1) return "Il reste une signature";
  return "Il reste " + restant + " signatures";
}

/**
 * Une signature est un tracé : on n'accepte qu'une image PNG en ligne, produite
 * par la zone de signature. Refuser le reste évite qu'un contenu arbitraire soit
 * stocké puis réinjecté dans un document Word.
 */
const PREFIXE_PNG = "data:image/png;base64,";
const TAILLE_MAXIMALE = 512 * 1024;

export class SignatureRefusee extends Error {
  readonly statut = 400;
  constructor(message: string) {
    super(message);
    this.name = "SignatureRefusee";
  }
}

export function verifierTrace(trace: string): void {
  if (!trace || !trace.startsWith(PREFIXE_PNG)) {
    throw new SignatureRefusee("Signature invalide");
  }
  if (trace.length > TAILLE_MAXIMALE) {
    throw new SignatureRefusee("Signature trop volumineuse");
  }

  const donnees = trace.slice(PREFIXE_PNG.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(donnees)) {
    throw new SignatureRefusee("Signature invalide");
  }
}

/** Phase du dossier une fois toutes les signatures recueillies. */
export const PHASE_APRES_SIGNATURE = 5;
