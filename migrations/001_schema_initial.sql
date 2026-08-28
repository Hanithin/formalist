-- Schéma Postgres de Formalist, converti depuis SQLite.
-- Généré depuis le schéma en place ; à relire avant application.
--
-- Écarts assumés par rapport à SQLite :
--   - les identifiants sont des IDENTITY, non des rowid réutilisables ;
--   - les dates sont des TIMESTAMPTZ et non du texte ISO ;
--   - les drapeaux 0/1 sont des BOOLEAN.
-- Les trois demandent une conversion des données à la reprise, pas seulement une copie.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','avocat','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  total_time_seconds INTEGER DEFAULT 0,
  suspended BOOLEAN DEFAULT FALSE,
  roles TEXT,
  first_name TEXT,
  last_name TEXT,
  email_verified BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'client' CHECK(type IN ('client','cabinet')),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS formalites (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  forme TEXT NOT NULL,
  societe TEXT NOT NULL,
  capital REAL,
  status TEXT NOT NULL DEFAULT 'en_cours',
  offer TEXT NOT NULL DEFAULT 'starter',
  phase INTEGER NOT NULL DEFAULT 1,
  business_sub_phase TEXT,
  data_json TEXT,
  assigned_avocat_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sub_type TEXT,
  created_by_avocat INTEGER DEFAULT 0,
  finalized_at TIMESTAMPTZ,
  annonce_text TEXT,
  reference TEXT,
  team_id INTEGER REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Facultatif : les actions de plateforme - accorder un rôle, suspendre un
  -- compte - ne concernent aucun dossier, et ce sont les plus sensibles.
  formalite_id INTEGER REFERENCES formalites(id),
  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_field TEXT,
  before_value TEXT,
  after_value TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avocat_availability (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avocat_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avocat_blocked_dates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avocat_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT NOT NULL,
  sujet TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nouveau' CHECK(status IN ('nouveau','lu','traite')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contrats (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','genere','en_validation','valide','signe')),
  data_json TEXT,
  file_path TEXT,
  assigned_avocat_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formalite_id INTEGER NOT NULL REFERENCES formalites(id),
  name TEXT NOT NULL,
  type TEXT,
  file_path TEXT,
  uploaded_by TEXT NOT NULL DEFAULT 'user' CHECK(uploaded_by IN ('user','avocat','system')),
  status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','uploaded','signed','verified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejection_reason TEXT,
  rejected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'verify',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lawyer_consultations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  avocat_id INTEGER REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','done','cancelled','no_show')),
  price_cents INTEGER DEFAULT 0,
  topic TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  domain TEXT,
  description TEXT,
  documents_json TEXT,
  meeting_link TEXT,
  payment_status TEXT DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  rating INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formalite_id INTEGER NOT NULL REFERENCES formalites(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path TEXT,
  kind TEXT DEFAULT 'text',
  reply_to_id INTEGER
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  formalite_id INTEGER REFERENCES formalites(id),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  formalite_id INTEGER REFERENCES formalites(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('pending','paid','refunded','failed')),
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sacem_declarations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'oeuvre' CHECK(type IN ('oeuvre','edition','cession','artiste_producteur')),
  titre TEXT NOT NULL,
  sous_titre TEXT,
  nature TEXT CHECK(nature IN ('musique_seule','paroles_seules','chanson')),
  statut_oeuvre TEXT DEFAULT 'originale' CHECK(statut_oeuvre IN ('originale','arrangement','adaptation','domaine_public')),
  duree TEXT,
  bpm INTEGER,
  genre TEXT,
  date_creation TEXT,
  statut_editorial TEXT DEFAULT 'inedite' CHECK(statut_editorial IN ('inedite','editee')),
  code_iswc TEXT,
  createurs_json TEXT,
  repartition_json TEXT,
  editeur_json TEXT,
  fichiers_json TEXT,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','complet','en_validation','valide','soumis')),
  data_json TEXT,
  file_path TEXT,
  assigned_avocat_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS signature_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formalite_id INTEGER NOT NULL REFERENCES formalites(id),
  associe_index INTEGER NOT NULL,
  associe_name TEXT NOT NULL,
  associe_email TEXT,
  token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','opened','signed')),
  signature_data TEXT,
  paraphe_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  role TEXT DEFAULT 'Associé'
);

CREATE TABLE IF NOT EXISTS support_conversations (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT,
  file_path TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_invitations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'collaborateur' CHECK(role IN ('admin','collaborateur','avocat')),
  can_create BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_all BOOLEAN NOT NULL DEFAULT FALSE,
  token TEXT NOT NULL UNIQUE,
  invited_by INTEGER REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'collaborateur' CHECK(role IN ('admin','collaborateur','avocat')),
  can_create BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_all BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_notes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formalite_id INTEGER NOT NULL REFERENCES formalites(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  filename TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  formalite_id INTEGER REFERENCES formalites(id),
  original_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('entreprise','contrat','sacem','upload')),
  source_id INTEGER,
  name TEXT NOT NULL,
  type TEXT,
  file_path TEXT,
  status TEXT DEFAULT 'actif',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  session_token TEXT
);

-- Index
CREATE INDEX IF NOT EXISTS idx_audit_formalite ON audit_log(formalite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_formalite ON payments(formalite_id);
CREATE INDEX IF NOT EXISTS idx_consultations_user ON lawyer_consultations(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_avocat ON lawyer_consultations(avocat_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_availability_avocat ON avocat_availability(avocat_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_blocked_avocat ON avocat_blocked_dates(avocat_id, start_date);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_invit_team ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_notes ON team_notes(formalite_id, team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user ON uploaded_files(user_id);;
