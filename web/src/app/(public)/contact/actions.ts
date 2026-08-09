"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { QUOTA_CONTACT, TropDeTentatives } from "@/domain/contenu/limitation";
import { valider, schemas, EntreeInvalide } from "@/lib/valider";
import { journal } from "@/lib/journal";

const SUJETS = ["creation", "contrat", "facturation", "technique", "partenariat", "autre"] as const;

const SCHEMA = z.object({
  prenom: schemas.nom,
  nom: schemas.nom,
  email: schemas.email,
  sujet: z.enum(SUJETS, { message: "Choisissez un sujet" }),
  message: z
    .string()
    .trim()
    .min(10, "Votre message est trop court")
    .max(5000, "Votre message est trop long"),
  // Champ invisible : seuls les robots le remplissent. Voir plus bas.
  website: z.string().max(0).optional(),
});

export interface ResultatContact {
  ok: boolean;
  message?: string;
  details?: Record<string, string[]>;
}

/**
 * Réception d'un message de contact.
 *
 * S'exécute sur le serveur : ni la limitation, ni l'accès en base, ni le piège à
 * robots ne partent au navigateur.
 */
export async function envoyerMessage(donnees: unknown): Promise<ResultatContact> {
  try {
    const message = valider(SCHEMA, donnees);

    // Piège à robots : le champ est masqué, un humain ne le remplit jamais. On
    // répond comme si l'envoi avait réussi, pour ne pas apprendre au robot qu'il
    // a été repéré.
    if (message.website) return { ok: true, message: "Message envoyé." };

    // La limite porte sur l'adresse IP : limiter par email laisserait quelqu'un
    // en changer à chaque envoi.
    const entetes = await headers();
    const ip = entetes.get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnue";

    await verifierQuota("contact", ip, QUOTA_CONTACT);
    await enregistrerTentative("contact", ip);

    await prisma.contact_messages.create({
      data: {
        prenom: message.prenom,
        nom: message.nom,
        email: message.email,
        sujet: message.sujet,
        message: message.message,
      },
    });

    return { ok: true, message: "Message envoyé. Nous répondons sous 24 heures ouvrées." };
  } catch (e) {
    if (e instanceof EntreeInvalide) return { ok: false, details: e.details };
    if (e instanceof TropDeTentatives) return { ok: false, message: e.message };

    journal.error({ err: e }, "Message de contact non enregistré");
    return { ok: false, message: "Envoi interrompu. Réessayez dans un instant." };
  }
}
