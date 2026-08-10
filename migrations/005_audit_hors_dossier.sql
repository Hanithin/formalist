-- Traces d'audit qui ne concernent aucun dossier.
--
-- audit_log.formalite_id était obligatoire : le journal ne savait tracer que ce
-- qui touche un dossier. Or les actions les plus sensibles n'en touchent aucun -
-- accorder le rôle avocat, suspendre un compte - et c'est précisément d'elles
-- qu'on veut garder trace.
--
-- La colonne devient facultative. Les traces existantes ne changent pas.

ALTER TABLE audit_log ALTER COLUMN formalite_id DROP NOT NULL;

-- Retrouver l'historique d'un compte, et pas seulement celui d'un dossier.
CREATE INDEX IF NOT EXISTS idx_audit_acteur ON audit_log(actor_id, created_at DESC);
