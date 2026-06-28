const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "data", "formalist.db");
const fs = require("fs");
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ============================================================
   SCHEMA
   ============================================================ */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','avocat','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS formalites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formalite_id INTEGER NOT NULL REFERENCES formalites(id),
    name TEXT NOT NULL,
    type TEXT,
    file_path TEXT,
    uploaded_by TEXT NOT NULL DEFAULT 'user' CHECK(uploaded_by IN ('user','avocat','system')),
    status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','uploaded','signed','verified')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formalite_id INTEGER NOT NULL REFERENCES formalites(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    formalite_id INTEGER REFERENCES formalites(id),
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT,
    file_path TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_conversations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS signature_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formalite_id INTEGER NOT NULL REFERENCES formalites(id),
    associe_index INTEGER NOT NULL,
    associe_name TEXT NOT NULL,
    associe_email TEXT,
    token TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','opened','signed')),
    signature_data TEXT,
    paraphe_data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    opened_at TEXT,
    signed_at TEXT,
    role TEXT DEFAULT 'Associé'
  );

  CREATE TABLE IF NOT EXISTS contrats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    titre TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','genere','en_validation','valide','signe')),
    data_json TEXT,
    file_path TEXT,
    assigned_avocat_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT NOT NULL,
    sujet TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nouveau' CHECK(status IN ('nouveau','lu','traite')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    source_type TEXT NOT NULL CHECK(source_type IN ('entreprise','contrat','upload')),
    category TEXT,
    source_id INTEGER,
    name TEXT NOT NULL,
    type TEXT,
    file_path TEXT,
    status TEXT DEFAULT 'actif',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations (safe to re-run)
try { db.exec("ALTER TABLE signature_requests ADD COLUMN role TEXT DEFAULT 'Associé'"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE formalites ADD COLUMN sub_type TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE messages ADD COLUMN file_path TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'text'"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE formalites ADD COLUMN created_by_avocat INTEGER DEFAULT 0"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE documents ADD COLUMN rejection_reason TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE documents ADD COLUMN rejected_at TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE formalites ADD COLUMN finalized_at TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE user_documents ADD COLUMN category TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN total_time_seconds INTEGER DEFAULT 0"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE user_sessions ADD COLUMN session_token TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN roles TEXT"); } catch (e) { /* column already exists */ }
// Backfill `roles` from `role` for legacy rows
try { db.exec("UPDATE users SET roles = '[\"' || role || '\"]' WHERE roles IS NULL OR roles = ''"); } catch (e) {}
try { db.exec("ALTER TABLE formalites ADD COLUMN reference TEXT"); } catch (e) { /* column already exists */ }
// Backfill : génère une référence 6 chars stable depuis l'id pour les formalités existantes
try {
  const rows = db.prepare("SELECT id FROM formalites WHERE reference IS NULL OR reference = ''").all();
  const upd = db.prepare("UPDATE formalites SET reference = ? WHERE id = ?");
  const CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L pour lisibilité
  for (const r of rows) {
    let n = (r.id * 2654435761) >>> 0;
    let s = '';
    for (let i = 0; i < 6; i++) { s += CHARS[n % CHARS.length]; n = Math.floor(n / CHARS.length); }
    upd.run(s, r.id);
  }
} catch (e) { /* best-effort */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, started_at DESC);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    formalite_id INTEGER REFERENCES formalites(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('pending','paid','refunded','failed')),
    stripe_payment_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, paid_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_formalite ON payments(formalite_id);

  CREATE TABLE IF NOT EXISTS lawyer_consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    avocat_id INTEGER REFERENCES users(id),
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','done','cancelled','no_show')),
    price_cents INTEGER DEFAULT 0,
    topic TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_consultations_user ON lawyer_consultations(user_id, scheduled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_consultations_avocat ON lawyer_consultations(avocat_id, scheduled_at DESC);

  CREATE TABLE IF NOT EXISTS avocat_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    avocat_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_availability_avocat ON avocat_availability(avocat_id, day_of_week);

  CREATE TABLE IF NOT EXISTS avocat_blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    avocat_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_blocked_avocat ON avocat_blocked_dates(avocat_id, start_date);
`);
try { db.exec("ALTER TABLE formalites ADD COLUMN annonce_text TEXT"); } catch (e) { /* column already exists */ }
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN domain TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN description TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN documents_json TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN meeting_link TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN payment_status TEXT DEFAULT 'pending'"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN accepted_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN done_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE lawyer_consultations ADD COLUMN rating INTEGER"); } catch (e) {}

// Audit log : trace toutes les actions sur les dossiers
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formalite_id INTEGER NOT NULL REFERENCES formalites(id),
    actor_id INTEGER REFERENCES users(id),
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_field TEXT,
    before_value TEXT,
    after_value TEXT,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_formalite ON audit_log(formalite_id, created_at DESC);
`);

// Documents : autoriser le status 'rejected' (la contrainte CHECK ne l'inclut pas)
// On ne peut pas modifier un CHECK en SQLite, donc on accepte que la valeur soit 'rejected'
// en pratique au niveau applicatif (le CHECK ne sera pas violé si on met un status valide).
// Pour stocker 'rejected', on utilisera plutôt un flag séparé via rejection_reason !== null.

/* ============================================================
   SEED
   ============================================================ */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { hash, salt };
}

const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@formalist.fr");
if (!existingAdmin) {
  const adminPwd = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const avocatPwd = process.env.SEED_AVOCAT_PASSWORD || "avocat123";
  const userPwd = process.env.SEED_USER_PASSWORD || "test123";

  const admin = hashPassword(adminPwd);
  const avocat = hashPassword(avocatPwd);
  const user = hashPassword(userPwd);

  const insert = db.prepare("INSERT INTO users (email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)");
  insert.run("admin@formalist.fr", admin.hash, admin.salt, "Administrateur", "admin");
  insert.run("avocat@formalist.fr", avocat.hash, avocat.salt, "Me. Sophie Martin", "avocat");
  insert.run("test@formalist.fr", user.hash, user.salt, "Jean Dupont", "user");
  console.log("DB seeded: 3 users created");
}

/* ============================================================
   PREPARED STATEMENTS
   ============================================================ */

// Users
const stmts = {
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserById: db.prepare("SELECT id, email, name, role, created_at FROM users WHERE id = ?"),
  createUser: db.prepare("INSERT INTO users (email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)"),
  getAvocats: db.prepare("SELECT id, email, name, created_at FROM users WHERE role = 'avocat' OR (roles IS NOT NULL AND roles LIKE '%\"avocat\"%') ORDER BY name ASC"),
  getAdmins: db.prepare("SELECT id, email, name FROM users WHERE role = 'admin' OR (roles IS NOT NULL AND roles LIKE '%\"admin\"%') ORDER BY name ASC"),
  updateUserProfile: db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?"),
  updateUserPassword: db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?"),
  updateUserRole: db.prepare("UPDATE users SET role = ? WHERE id = ?"),
  updateUserRoles: db.prepare("UPDATE users SET roles = ?, role = ? WHERE id = ?"),
  updateUserSuspended: db.prepare("UPDATE users SET suspended = ? WHERE id = ?"),
  updateUserLastLogin: db.prepare("UPDATE users SET last_login_at = datetime('now'), last_seen_at = datetime('now') WHERE id = ?"),
  updateUserLastSeen: db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?"),
  bumpUserTotalTime: db.prepare("UPDATE users SET total_time_seconds = COALESCE(total_time_seconds, 0) + ? WHERE id = ?"),
  getAllUsersWithStats: db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.roles, u.suspended, u.created_at,
           u.last_login_at, u.last_seen_at, COALESCE(u.total_time_seconds, 0) as total_time_seconds,
           (SELECT COUNT(*) FROM formalites WHERE user_id = u.id) as formalites_count,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE user_id = u.id AND status = 'paid') as total_paid_cents,
           (SELECT id FROM user_sessions WHERE user_id = u.id ORDER BY started_at DESC LIMIT 1) as last_session_id
    FROM users u
    ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
  `),

  // User sessions
  createUserSession: db.prepare("INSERT INTO user_sessions (user_id, ip, user_agent, session_token) VALUES (?, ?, ?, ?)"),
  touchUserSessionByToken: db.prepare("UPDATE user_sessions SET last_seen_at = datetime('now'), duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER) WHERE session_token = ? AND ended_at IS NULL"),
  endUserSessionByToken: db.prepare("UPDATE user_sessions SET ended_at = datetime('now'), duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER) WHERE session_token = ? AND ended_at IS NULL"),
  getUserSessions: db.prepare("SELECT * FROM user_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 50"),
  getLatestUserSession: db.prepare("SELECT * FROM user_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1"),

  // Payments
  createPayment: db.prepare("INSERT INTO payments (user_id, formalite_id, amount_cents, currency, description, status, stripe_payment_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  getPaymentsByUser: db.prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY paid_at DESC, created_at DESC"),
  getPaymentsByFormalite: db.prepare("SELECT * FROM payments WHERE formalite_id = ? ORDER BY paid_at DESC"),
  getAllPayments: db.prepare(`
    SELECT p.*, u.name as user_name, u.email as user_email, f.societe as societe, f.offer as offer, f.forme as forme
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN formalites f ON p.formalite_id = f.id
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC
  `),
  getPaymentById: db.prepare("SELECT * FROM payments WHERE id = ?"),
  refundPayment: db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?"),

  // Consultations
  createConsultation: db.prepare("INSERT INTO lawyer_consultations (user_id, avocat_id, scheduled_at, duration_minutes, status, price_cents, topic, notes, domain, description, documents_json, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  getAllConsultations: db.prepare(`
    SELECT c.*, u.name as user_name, u.email as user_email, a.name as avocat_name
    FROM lawyer_consultations c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN users a ON c.avocat_id = a.id
    ORDER BY c.scheduled_at DESC
  `),
  getConsultationsByUser: db.prepare("SELECT c.*, a.name as avocat_name FROM lawyer_consultations c LEFT JOIN users a ON c.avocat_id = a.id WHERE c.user_id = ? ORDER BY c.scheduled_at DESC"),
  getConsultationsByAvocat: db.prepare("SELECT c.*, u.name as user_name, u.email as user_email FROM lawyer_consultations c LEFT JOIN users u ON c.user_id = u.id WHERE c.avocat_id = ? ORDER BY c.scheduled_at DESC"),
  getConsultationById: db.prepare("SELECT c.*, u.name as user_name, u.email as user_email, a.name as avocat_name FROM lawyer_consultations c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN users a ON c.avocat_id = a.id WHERE c.id = ?"),
  acceptConsultation: db.prepare("UPDATE lawyer_consultations SET status = 'scheduled', meeting_link = ?, accepted_at = datetime('now') WHERE id = ?"),
  markConsultationDone: db.prepare("UPDATE lawyer_consultations SET status = 'done', notes = ?, done_at = datetime('now') WHERE id = ?"),
  cancelConsultation: db.prepare("UPDATE lawyer_consultations SET status = 'cancelled' WHERE id = ?"),
  rateConsultation: db.prepare("UPDATE lawyer_consultations SET rating = ? WHERE id = ?"),

  // Avocat availability (weekly recurring)
  createAvailability: db.prepare("INSERT INTO avocat_availability (avocat_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES (?, ?, ?, ?, ?)"),
  getAvailabilityByAvocat: db.prepare("SELECT * FROM avocat_availability WHERE avocat_id = ? ORDER BY day_of_week, start_time"),
  deleteAvailability: db.prepare("DELETE FROM avocat_availability WHERE id = ? AND avocat_id = ?"),

  // Vacations / blocked dates
  createBlockedDate: db.prepare("INSERT INTO avocat_blocked_dates (avocat_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)"),
  getBlockedDatesByAvocat: db.prepare("SELECT * FROM avocat_blocked_dates WHERE avocat_id = ? ORDER BY start_date DESC"),
  getBlockedDatesInRange: db.prepare("SELECT * FROM avocat_blocked_dates WHERE avocat_id = ? AND end_date >= ? AND start_date <= ?"),
  deleteBlockedDate: db.prepare("DELETE FROM avocat_blocked_dates WHERE id = ? AND avocat_id = ?"),

  // Slot lookup for booking
  getConsultationsInRange: db.prepare("SELECT scheduled_at, duration_minutes FROM lawyer_consultations WHERE avocat_id = ? AND status = 'scheduled' AND scheduled_at >= ? AND scheduled_at < ?"),

  // Assignment
  assignFormaliteAvocat: db.prepare("UPDATE formalites SET assigned_avocat_id = ?, updated_at = datetime('now') WHERE id = ?"),

  // Sessions
  createSession: db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"),
  getSession: db.prepare("SELECT s.*, u.id as uid, u.email, u.name, u.role, u.roles FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  cleanSessions: db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),

  // Formalites
  createFormalite: db.prepare("INSERT INTO formalites (user_id, type, forme, societe, capital, offer, phase, data_json, reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  updateFormaliteReference: db.prepare("UPDATE formalites SET reference = ? WHERE id = ?"),
  getFormaliteById: db.prepare("SELECT * FROM formalites WHERE id = ?"),
  getFormalitesByUser: db.prepare(`
    SELECT f.*, u.name as user_name, a.name as avocat_name,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id AND sr.signed_at IS NULL) AS pending_signatures,
      (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id AND d.rejection_reason IS NOT NULL) AS rejected_docs
    FROM formalites f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN users a ON f.assigned_avocat_id = a.id
    WHERE f.user_id = ?
    ORDER BY f.updated_at DESC
  `),
  getFormalitesByAvocat: db.prepare(`SELECT f.*, u.name as user_name, u.email as user_email FROM formalites f LEFT JOIN users u ON f.user_id = u.id WHERE f.assigned_avocat_id = ? ORDER BY f.updated_at DESC`),
  getAllFormalites: db.prepare(`
    SELECT f.*, u.name as user_name, u.email as user_email, a.name as avocat_name,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE formalite_id = f.id AND status = 'paid') as total_paid_cents,
           (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures,
           (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id AND sr.signed_at IS NULL) AS pending_signatures,
           (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id AND d.rejection_reason IS NOT NULL) AS rejected_docs
    FROM formalites f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN users a ON f.assigned_avocat_id = a.id
    ORDER BY f.updated_at DESC
  `),
  updateFormalite: db.prepare("UPDATE formalites SET phase = ?, status = ?, business_sub_phase = ?, data_json = ?, updated_at = datetime('now') WHERE id = ?"),
  updateFormaliteStatus: db.prepare("UPDATE formalites SET status = ?, updated_at = datetime('now') WHERE id = ?"),
  assignAvocat: db.prepare("UPDATE formalites SET assigned_avocat_id = ?, business_sub_phase = '5b', updated_at = datetime('now') WHERE id = ?"),
  validateFormalite: db.prepare("UPDATE formalites SET business_sub_phase = ?, updated_at = datetime('now') WHERE id = ?"),
  upgradeOffer: db.prepare("UPDATE formalites SET offer = ?, business_sub_phase = ?, updated_at = datetime('now') WHERE id = ?"),

  // Formalite with client info
  getFormaliteWithClient: db.prepare(`SELECT f.*, u.name as user_name, u.email as user_email
    FROM formalites f JOIN users u ON f.user_id = u.id WHERE f.id = ?`),
  getFormalitesByAvocatWithClient: db.prepare(`SELECT f.*, u.name as user_name, u.email as user_email,
    (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures,
    (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id AND sr.signed_at IS NULL) AS pending_signatures,
    (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id AND d.rejection_reason IS NOT NULL) AS rejected_docs
    FROM formalites f JOIN users u ON f.user_id = u.id
    WHERE f.assigned_avocat_id = ? OR f.created_by_avocat = 1 AND f.user_id = ?
    ORDER BY f.updated_at DESC`),
  searchFormalites: db.prepare(`SELECT f.*, u.name as user_name, u.email as user_email
    FROM formalites f JOIN users u ON f.user_id = u.id
    WHERE (f.assigned_avocat_id = ? OR (f.created_by_avocat = 1 AND f.user_id = ?))
    AND (f.societe LIKE ? OR u.name LIKE ?)
    ORDER BY f.updated_at DESC`),

  // Documents
  getDocsByFormalite: db.prepare(`SELECT d.*,
    CASE d.uploaded_by
      WHEN 'user' THEN (SELECT u.name FROM users u JOIN formalites f ON f.user_id = u.id WHERE f.id = d.formalite_id)
      WHEN 'avocat' THEN (SELECT u.name FROM users u JOIN formalites f ON f.assigned_avocat_id = u.id WHERE f.id = d.formalite_id)
      ELSE 'Système'
    END as uploader_name
    FROM documents d WHERE d.formalite_id = ? ORDER BY d.created_at DESC`),
  createDocument: db.prepare("INSERT INTO documents (formalite_id, name, type, file_path, uploaded_by, status) VALUES (?, ?, ?, ?, ?, ?)"),
  updateDocumentStatus: db.prepare("UPDATE documents SET status = ? WHERE id = ?"),
  getDocumentById: db.prepare("SELECT * FROM documents WHERE id = ?"),

  // Messages
  getMessagesByFormalite: db.prepare("SELECT m.*, u.name as sender_name, u.role as sender_role FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.formalite_id = ? ORDER BY m.created_at ASC"),
  createMessage: db.prepare("INSERT INTO messages (formalite_id, sender_id, content) VALUES (?, ?, ?)"),
  createMessageWithFile: db.prepare("INSERT INTO messages (formalite_id, sender_id, content, file_path) VALUES (?, ?, ?, ?)"),
  createMessageWithReply: db.prepare("INSERT INTO messages (formalite_id, sender_id, content, reply_to_id) VALUES (?, ?, ?, ?)"),
  createTypedMessage: db.prepare("INSERT INTO messages (formalite_id, sender_id, content, kind) VALUES (?, ?, ?, ?)"),
  updateMessageKindAndReply: db.prepare("UPDATE messages SET kind = ?, reply_to_id = ? WHERE id = ?"),
  markMessagesRead: db.prepare("UPDATE messages SET read = 1 WHERE formalite_id = ? AND sender_id != ?"),
  countUnreadMessages: db.prepare("SELECT COUNT(*) as count FROM messages WHERE formalite_id = ? AND sender_id != ? AND read = 0"),
  getConversationsList: db.prepare(`
    SELECT f.id as formalite_id, f.societe, f.type, f.sub_type, f.forme,
      u.name as client_name, u.email as client_email,
      (SELECT content FROM messages WHERE formalite_id = f.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE formalite_id = f.id ORDER BY created_at DESC LIMIT 1) as last_date,
      (SELECT COUNT(*) FROM messages WHERE formalite_id = f.id AND sender_id != ? AND read = 0) as unread
    FROM formalites f
    JOIN users u ON f.user_id = u.id
    WHERE f.assigned_avocat_id = ?
    AND EXISTS (SELECT 1 FROM messages WHERE formalite_id = f.id)
    ORDER BY last_date DESC
  `),

  // Notifications
  createNotification: db.prepare("INSERT INTO notifications (user_id, type, content, formalite_id) VALUES (?, ?, ?, ?)"),
  getUnreadNotifications: db.prepare("SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC"),
  markNotificationsRead: db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?"),

  // Support messages
  getSupportMessages: db.prepare("SELECT sm.*, u.name as sender_name, u.role as sender_role FROM support_messages sm JOIN users u ON sm.sender_id = u.id WHERE sm.user_id = ? ORDER BY sm.created_at ASC"),
  createSupportMessage: db.prepare("INSERT INTO support_messages (user_id, sender_id, content, file_path) VALUES (?, ?, ?, ?)"),
  markSupportRead: db.prepare("UPDATE support_messages SET read = 1 WHERE user_id = ? AND sender_id != ?"),
  countUnreadSupport: db.prepare("SELECT COUNT(*) as count FROM support_messages WHERE user_id = ? AND sender_id != ? AND read = 0"),

  // Support conversations (admin) — enrichi avec société et offre du dernier dossier
  getAllSupportConversations: db.prepare(`
    SELECT sc.user_id, sc.archived, sc.archived_at,
      u.name as user_name, u.email as user_email,
      (SELECT content FROM support_messages WHERE user_id = sc.user_id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM support_messages WHERE user_id = sc.user_id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT COUNT(*) FROM support_messages WHERE user_id = sc.user_id AND sender_id = sc.user_id AND read = 0) as unread_count,
      (SELECT societe FROM formalites WHERE user_id = sc.user_id ORDER BY updated_at DESC LIMIT 1) as societe,
      (SELECT forme   FROM formalites WHERE user_id = sc.user_id ORDER BY updated_at DESC LIMIT 1) as forme,
      (SELECT offer   FROM formalites WHERE user_id = sc.user_id ORDER BY updated_at DESC LIMIT 1) as offer
    FROM support_conversations sc
    JOIN users u ON sc.user_id = u.id
    ORDER BY last_message_at DESC
  `),
  ensureSupportConversation: db.prepare("INSERT OR IGNORE INTO support_conversations (user_id) VALUES (?)"),
  reactivateSupportConversation: db.prepare("UPDATE support_conversations SET archived = 0, archived_at = NULL WHERE user_id = ?"),
  archiveSupport: db.prepare("UPDATE support_conversations SET archived = 1, archived_at = datetime('now') WHERE user_id = ?"),
  unarchiveSupport: db.prepare("UPDATE support_conversations SET archived = 0, archived_at = NULL WHERE user_id = ?"),

  // API usage
  logApiUsage: db.prepare("INSERT INTO api_usage (user_id, model, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?)"),
  getApiUsageStats: db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens
    FROM api_usage
  `),
  getApiUsageByDay: db.prepare(`
    SELECT date(created_at) as day,
      COUNT(*) as calls,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as tokens
    FROM api_usage
    GROUP BY date(created_at)
    ORDER BY day DESC
    LIMIT 30
  `),
  getApiUsageToday: db.prepare(`
    SELECT COUNT(*) as calls,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as tokens
    FROM api_usage WHERE date(created_at) = date('now')
  `),
  getApiUsageWeek: db.prepare(`
    SELECT COUNT(*) as calls,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as tokens
    FROM api_usage WHERE created_at >= datetime('now', '-7 days')
  `),

  // Signature requests
  createSignatureRequest: db.prepare("INSERT INTO signature_requests (formalite_id, associe_index, associe_name, associe_email, token, role) VALUES (?, ?, ?, ?, ?, ?)"),
  getSignatureRequestsByFormalite: db.prepare("SELECT id, associe_index, associe_name, associe_email, token, status, role, created_at, opened_at, signed_at FROM signature_requests WHERE formalite_id = ? ORDER BY associe_index"),
  getSignatureRequestByToken: db.prepare("SELECT sr.*, f.societe, f.forme, f.data_json FROM signature_requests sr JOIN formalites f ON sr.formalite_id = f.id WHERE sr.token = ?"),
  markSignatureOpened: db.prepare("UPDATE signature_requests SET status = 'opened', opened_at = datetime('now') WHERE token = ? AND status = 'pending'"),
  submitSignature: db.prepare("UPDATE signature_requests SET status = 'signed', signature_data = ?, paraphe_data = ?, signed_at = datetime('now') WHERE token = ?"),
  submitCreatorSignature: db.prepare("INSERT INTO signature_requests (formalite_id, associe_index, associe_name, associe_email, token, status, signature_data, paraphe_data, signed_at) VALUES (?, 0, ?, ?, ?, 'signed', ?, ?, datetime('now'))"),
  getSignedSignatures: db.prepare("SELECT associe_index, associe_name, signature_data, paraphe_data FROM signature_requests WHERE formalite_id = ? AND status = 'signed' AND signature_data IS NOT NULL ORDER BY associe_index"),
  countUnsignedRequests: db.prepare("SELECT COUNT(*) as count FROM signature_requests WHERE formalite_id = ? AND status != 'signed' AND associe_index > 0"),
  deleteSignatureRequestsByFormalite: db.prepare("DELETE FROM signature_requests WHERE formalite_id = ?"),

  // Contrats
  createContrat: db.prepare("INSERT INTO contrats (user_id, type, titre, data_json) VALUES (?, ?, ?, ?)"),
  getContratById: db.prepare("SELECT * FROM contrats WHERE id = ?"),
  getContratsByUser: db.prepare("SELECT * FROM contrats WHERE user_id = ? ORDER BY updated_at DESC"),
  getAllContrats: db.prepare("SELECT c.*, u.name as user_name FROM contrats c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.updated_at DESC"),
  updateContrat: db.prepare("UPDATE contrats SET titre = ?, status = ?, data_json = ?, file_path = ?, updated_at = datetime('now') WHERE id = ?"),
  assignContratAvocat: db.prepare("UPDATE contrats SET assigned_avocat_id = ?, status = 'en_validation', updated_at = datetime('now') WHERE id = ?"),

  // User Documents (vault)
  createUserDocument: db.prepare("INSERT INTO user_documents (user_id, source_type, source_id, name, type, file_path, category) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  getUserDocuments: db.prepare("SELECT * FROM user_documents WHERE user_id = ? ORDER BY created_at DESC"),
  getUserDocumentsByType: db.prepare("SELECT * FROM user_documents WHERE user_id = ? AND source_type = ? ORDER BY created_at DESC"),

  // Contact messages
  createContactMessage: db.prepare("INSERT INTO contact_messages (nom, prenom, email, sujet, message) VALUES (?, ?, ?, ?, ?)"),
  getContactMessages: db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC"),
  updateContactStatus: db.prepare("UPDATE contact_messages SET status = ? WHERE id = ?"),

  // Admin stats
  statsTotal: db.prepare("SELECT COUNT(*) as count FROM formalites"),
  statsAwaitingAssignment: db.prepare("SELECT COUNT(*) as count FROM formalites WHERE offer != 'starter' AND assigned_avocat_id IS NULL AND phase >= 5"),
  statsInProgress: db.prepare("SELECT COUNT(*) as count FROM formalites WHERE status = 'en_cours'"),
  statsCompleted: db.prepare("SELECT COUNT(*) as count FROM formalites WHERE status = 'terminee'"),

  // Audit log
  createAuditEntry: db.prepare(`INSERT INTO audit_log
    (formalite_id, actor_id, actor_role, action, target_field, before_value, after_value, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  getAuditByFormalite: db.prepare(`SELECT a.*, u.name as actor_name
    FROM audit_log a LEFT JOIN users u ON a.actor_id = u.id
    WHERE a.formalite_id = ? ORDER BY a.created_at DESC`),

  // Activité globale admin : audit + paiements + consultations + signups + messages
  getRecentAuditActivity: db.prepare(`SELECT a.id, a.formalite_id, a.actor_id, a.actor_role,
    a.action, a.target_field, a.before_value, a.after_value, a.comment, a.created_at,
    u.name as actor_name, f.societe as formalite_societe
    FROM audit_log a
    LEFT JOIN users u ON a.actor_id = u.id
    LEFT JOIN formalites f ON a.formalite_id = f.id
    WHERE a.created_at >= ?
    ORDER BY a.created_at DESC
    LIMIT ?`),
  getRecentPayments: db.prepare(`SELECT p.id, p.user_id, p.formalite_id, p.amount_cents, p.currency,
    p.description, p.status, p.paid_at, u.name as user_name, f.societe as formalite_societe
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN formalites f ON p.formalite_id = f.id
    WHERE p.paid_at >= ? AND p.status = 'paid'
    ORDER BY p.paid_at DESC
    LIMIT ?`),
  getRecentConsultations: db.prepare(`SELECT c.id, c.user_id, c.avocat_id, c.scheduled_at, c.status,
    c.domain, c.created_at, u.name as user_name, a.name as avocat_name
    FROM lawyer_consultations c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN users a ON c.avocat_id = a.id
    WHERE c.created_at >= ?
    ORDER BY c.created_at DESC
    LIMIT ?`),
  getRecentSignups: db.prepare(`SELECT id, name, email, role, roles, created_at
    FROM users
    WHERE created_at >= ?
    ORDER BY created_at DESC
    LIMIT ?`),
  getRecentFormaliteCreations: db.prepare(`SELECT f.id, f.user_id, f.societe, f.forme, f.created_at,
    u.name as user_name
    FROM formalites f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.created_at >= ?
    ORDER BY f.created_at DESC
    LIMIT ?`),

  // Documents enrichis (rejection)
  rejectDocument: db.prepare(`UPDATE documents
    SET status = 'uploaded', rejection_reason = ?, rejected_at = datetime('now') WHERE id = ?`),
  clearDocumentRejection: db.prepare(`UPDATE documents
    SET rejection_reason = NULL, rejected_at = NULL WHERE id = ?`),

  // Formalité : finalisation + annonce
  finalizeFormalite: db.prepare(`UPDATE formalites
    SET status = 'terminee', business_sub_phase = '5e', finalized_at = datetime('now'),
        updated_at = datetime('now') WHERE id = ?`),
  saveAnnonceText: db.prepare(`UPDATE formalites
    SET annonce_text = ?, updated_at = datetime('now') WHERE id = ?`),
};

module.exports = { db, stmts, hashPassword };
