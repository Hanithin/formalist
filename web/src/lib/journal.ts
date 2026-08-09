import pino from "pino";

/**
 * Journalisation structurée.
 *
 * Les données personnelles n'ont rien à faire dans un journal : il est conservé,
 * copié, et lu par des gens qui n'ont pas à voir les dossiers des clients. Les
 * champs listés ici sont remplacés avant écriture, à la source - compter sur
 * l'appelant pour ne pas les passer ne marche jamais longtemps.
 */
const CHAMPS_MASQUES = [
  "password",
  "motDePasse",
  "password_hash",
  "salt",
  "token",
  "email",
  "first_name",
  "last_name",
  "name",
  "*.password",
  "*.motDePasse",
  "*.token",
  "*.email",
  "req.headers.cookie",
  "req.headers.authorization",
];

export const journal = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: { paths: CHAMPS_MASQUES, censor: "[masqué]" },
  base: { service: "formalist" },
});
