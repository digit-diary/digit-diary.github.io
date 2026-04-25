/**
 * Diario Collaboratori — Casino Lugano SA
 * File: crypto.js
 * Righe originali: 37
 * Estratto automaticamente da index.html
 */
// SEZIONE 2: CIFRATURA MESSAGGI (AES-GCM)
// Cifratura e decifratura note colleghi
// ================================================================
// --- CRITTOGRAFIA NOTE AES-GCM ---
// MODELLO DI SICUREZZA (importante - leggere prima di modificare):
// Questa NON e' cifratura end-to-end. La chiave AES-GCM e' derivata da una costante
// hardcoded (_k + _NOTE_ENC_SALT) ed e' identica per tutti gli operatori. Chiunque
// scarichi il bundle JS pubblico puo' estrarre la chiave e decifrare i messaggi che
// possiede.
//
// COSA PROTEGGE:
//   - Backup file (es. dump JSON su USB): senza la chiave, i messaggi nei backup
//     restano illeggibili a chi li ottiene senza accedere all'app.
//   - Database leak isolato: se SOLO il DB venisse esfiltrato senza il codice JS,
//     i messaggi restano cifrati.
//
// COSA NON PROTEGGE:
//   - Attaccante che scarica il JS pubblico (puo' derivare la chiave)
//   - Insider con accesso alla codebase
//   - Intercettazione network (gia' protetto da HTTPS, non c'entra la cifratura app)
//
// La protezione reale dei dati passa per:
//   - Row Level Security deny_all_anon su Supabase (autenticazione token)
//   - HTTPS/TLS sul trasporto
//   - Hashing password operatori
//
// PER MIGRARE A E2E REALE servirebbe: chiave per-utente derivata da segreto server-side
// fetchato post-login + key exchange Signal-style per gruppi. Refactor significativo
// con migrazione delicata dei messaggi storici (re-encrypt o keep dual-key fallback).
// Vedere documentazione tecnica per il piano di migrazione completo.
const _NOTE_ENC_SALT = 'DiarioCL26_NoteEnc_v1';
let _noteEncKey = null;
async function _getNoteKey() {
  if (_noteEncKey) return _noteEncKey;
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(_k + _NOTE_ENC_SALT), 'PBKDF2', false, ['deriveKey']);
  _noteEncKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(_NOTE_ENC_SALT), iterations: 50000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return _noteEncKey;
}
async function encryptNota(testo) {
  try {
    const key = await _getNoteKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(testo);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
    const buf = new Uint8Array(iv.length + ct.byteLength);
    buf.set(iv);
    buf.set(new Uint8Array(ct), iv.length);
    return 'ENC:' + btoa(String.fromCharCode(...buf));
  } catch (e) {
    console.error('Encrypt error:', e);
    return testo;
  }
}
async function decryptNota(data) {
  if (!data || !data.startsWith('ENC:')) return data;
  try {
    const key = await _getNoteKey();
    const raw = atob(data.substring(4));
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    const iv = buf.slice(0, 12),
      ct = buf.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(dec);
  } catch (e) {
    console.error('Decrypt error:', e);
    return data.substring(4);
  }
}
async function decryptNoteCache() {
  for (const n of noteColleghiCache) {
    if (n.messaggio && n.messaggio.startsWith('ENC:') && !n._decrypted) {
      n.messaggio = await decryptNota(n.messaggio);
      n._decrypted = true;
    }
  }
}
// ================================================================
