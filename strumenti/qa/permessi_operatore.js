// ============================================================
// COPIA NEL REPOSITORY (versionata dal 11/10/2026, migrazione 20260913).
// Originale: ~/DiarioProvaLocale/strumenti/qa/permessi_operatore.js (si lancia da li o da qui).
// COSA SERVE: la copia di prova locale avviata, cioe
//   - database di prova diario2 (porta 55432) con tutte le migrazioni applicate,
//   - PostgREST (3000) e sito come IIS (8000): bash ~/DiarioProvaLocale/avvia_locale.sh
//   - chiave pubblica di prova in ~/DiarioProvaLocale/pgprova/chiavi_prova.env (la crea avvia_locale.sh),
//   - operatori di prova della copia locale (Camponovo Andrea / ProvaLocale1!, amministratore
//     ProvaAdmin1!, Pistocchi Mara, Bonelli Flavio, HR, Sanvido Paolo).
// COME SI LANCIA:  node strumenti/qa/permessi_operatore.js
// MAI sul database vero: scrive e cancella dati di prova (prefissi 'W1B ', 'W4C ' e 'W5I ').
// ============================================================
// PROVA DEI PERMESSI DEGLI OPERATORI NEL DATABASE (migrazioni 20260911, 20260913 e 20260914)
// Per ogni falla: la prova che la riproduce (deve risultare CHIUSA) e le azioni legittime
// che devono continuare a funzionare (OK). Passa dal servizio REST come il programma
// (http://127.0.0.1:8000/rest/v1/rpc/...), con la chiave pubblica della copia locale.
// Dati di prova con prefisso 'W1B ' e 'W4C ', cancellati alla fine (anche se una prova fallisce).
// Uso: node strumenti/qa/permessi_operatore.js      (copia locale avviata)
// Esito: righe "OK"/"FALLA"/"ROTTO"; codice di uscita 1 se qualcosa non va.
'use strict';
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8000/rest/v1/';
const PSQL = '/Users/bushi/DiarioProvaLocale/psql.sh';
const ANON = fs
  .readFileSync('/Users/bushi/DiarioProvaLocale/pgprova/chiavi_prova.env', 'utf8')
  .match(/^ANON=(.*)$/m)[1]
  .trim();
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const sql = (q) => execFileSync(PSQL, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
async function rpc(fn, params) {
  const r = await fetch(BASE + 'rpc/' + fn, { method: 'POST', headers: H, body: JSON.stringify(params || {}) });
  const t = await r.text();
  let body = null;
  try {
    body = t ? JSON.parse(t) : null;
  } catch (e) {
    body = t;
  }
  return { ok: r.ok, status: r.status, body, msg: body && body.message ? body.message : '' };
}
const pbkdf2 = (pw, salt) =>
  crypto.pbkdf2Sync(pw, 'DiarioCL26_v2_' + String(salt || '').toLowerCase(), 100000, 32, 'sha256').toString('hex');
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

let errori = 0;
// ogni gruppo di prove va fino in fondo anche se un altro si rompe
async function S(fn) {
  try {
    await fn();
  } catch (e) {
    errori++;
    console.log('ROTTO  ' + String((e && e.message) || e).slice(0, 300));
  }
}
const esito = (cond, testo, dettaglio) => {
  if (!cond) errori++;
  console.log((cond ? 'OK     ' : 'NO     ') + testo + (cond || !dettaglio ? '' : '  -> ' + dettaglio));
};
// falla chiusa = la chiamata pericolosa viene rifiutata (o non tocca niente)
const chiusa = (r, testo) => esito(!r.ok, 'CHIUSA  ' + testo, 'accettata: ' + JSON.stringify(r.body).slice(0, 160));
const funziona = (r, testo) => esito(r.ok, 'FUNZIONA ' + testo, r.status + ' ' + (r.msg || JSON.stringify(r.body)).slice(0, 200));

const OP = {}; // nome -> token
const tok = (nome, admin) => sql('select _create_op_session(' + lit(nome) + ', ' + (admin ? 'true' : 'false') + ')');

function pulisci() {
  sql(`
    delete from chat_messages where group_id in (select id from chat_groups where nome like 'W1B %') or messaggio like 'W1B %';
    delete from chat_groups where nome like 'W1B %';
    delete from registrazioni where nome like 'W1B %' or testo like 'W1B %';
    delete from piano where collaboratore like 'W1B %';
    delete from collaboratori where nome like 'W1B %';
    delete from promemoria where titolo like 'W1B %';
    delete from consegne_turno where messaggio like 'W1B %';
    delete from punti_eventi where collaboratore like 'W1B %';
    delete from costi_maison where nome like 'W1B %';
    delete from spese_extra where beneficiario like 'W1B %';
    delete from maison_budget where nome like 'W1B %';
    delete from push_subscriptions where endpoint like 'W1B %';
    delete from operatori_auth where nome like 'W1B %';
    delete from login_attempts where nome like 'W1B %';
    delete from log_attivita where dettaglio like 'W1B %' or operatore like 'W1B %';
    delete from operator_sessions where operatore like 'W1B %' or token like 'w1b%';
    -- 20260913 (W4C)
    delete from piano where collaboratore like 'W4C %';
    delete from piano_storico where collaboratore like 'W4C %';
    delete from registrazioni where nome like 'W4C %' or testo like 'W4C %';
    delete from moduli where collaboratore like 'W4C %';
    delete from rapporti_giornalieri where data_rapporto between '2031-02-01' and '2031-02-28' and (assenze like 'W4C %' or sup_note like 'W4C %');
    delete from punti_eventi where collaboratore like 'W4C %';
    delete from chat_group_members where group_id in (select id from chat_groups where nome like 'W4C %');
    delete from chat_groups where nome like 'W4C %';
    delete from collaboratori where nome like 'W4C %';
    delete from operator_sessions where operatore like 'W4C %' or token like 'w4c%';
    delete from log_attivita where operatore like 'W4C %';
    delete from operatori_auth where nome like 'W4C %';
    update impostazioni set valore = (valore::jsonb - 'W4C Op Slots')::text where chiave = 'operatori_reparto' and valore::jsonb ? 'W4C Op Slots';
  `);
}

(async () => {
  pulisci();
  const D = '2031-01-05';
  try {
    // ---------------- DATI DI PROVA ----------------
    sql(`
      insert into collaboratori (nome, attivo, reparto_dip) values ('W1B Collab Slots', true, 'slots'), ('W1B Collab Tav', true, 'tavoli');
      insert into collaboratori (nome, attivo, reparto_dip, reparti_extra) values ('W1B Collab Multi', true, 'tavoli', 'slots');
      insert into registrazioni (nome, tipo, testo, data, operatore, reparto_dip) values
        ('W1B Collab Slots', 'Nota', 'W1B slots', now(), 'Camponovo Andrea', 'slots'),
        ('W1B Collab Tav', 'Nota', 'W1B tavoli', now(), 'Bonelli Flavio', 'tavoli'),
        ('W1B Collab Multi', 'Nota', 'W1B multi', now(), 'Bonelli Flavio', 'tavoli'),
        ('W1B Collab Slots', 'Nota', 'W1B da cancellare', now(), 'Camponovo Andrea', 'slots'),
        ('W1B Collab Slots', 'Nota', 'W1B da cancellare admin', now(), 'Camponovo Andrea', 'slots');
      insert into piano (collaboratore, data, codice, reparto_dip, protetto, generato) values
        ('W1B Collab Slots', '${D}', 'S5', 'slots', false, false),
        ('W1B Collab Tav', '${D}', 'T1', 'tavoli', false, false),
        ('W1B Collab Tav', '2031-01-06', 'T1', 'tavoli', false, false);
      insert into promemoria (titolo, data_scadenza, creato_da, reparto_dip) values ('W1B prom 1', '${D}', 'Camponovo Andrea', 'slots'), ('W1B prom 2', '${D}', 'Camponovo Andrea', 'slots');
      insert into consegne_turno (data_giornata, turno_uscente, operatore, messaggio, reparto_dip, destinatario) values ('${D}', 'PRESTO', 'Pistocchi Mara', 'W1B consegna', 'slots', 'HR');
      insert into costi_maison (data_giornata, nome, costo, operatore, reparto_dip) values ('${D}', 'W1B Cliente', 10, 'x', 'slots'), ('2031-01-07', 'W1B Cliente', 10, 'x', 'slots'), ('2031-01-08', 'W1B Cliente Tav', 10, 'x', 'tavoli');
      insert into spese_extra (beneficiario, tipo, importo, data_spesa, luogo, operatore, reparto_dip) values ('W1B Ben', 'cena', 5, '${D}', 'Altro', 'x', 'slots');
      insert into maison_budget (nome, budget_chf, data_nascita, reparto_dip) values ('W1B Cliente', 1000, '1980-05-05', 'slots');
      insert into push_subscriptions (operatore, endpoint, p256dh, auth) values ('Bonelli Flavio', 'W1B endpoint bonelli', 'x', 'x'), ('Pistocchi Mara', 'W1B endpoint pistocchi', 'x', 'x');
      insert into punti_eventi (collaboratore, punti, azione, descrizione, data_evento, operatore) values ('W1B Collab Slots', 50, 'apprezzamento', 'W1B manuale', '${D}', 'HR');
    `);
    const gA = sql(`insert into chat_groups (nome, tipo, creato_da) values ('W1B gruppo A', 'custom', 'Sanvido Paolo') returning id`);
    const gB = sql(`insert into chat_groups (nome, tipo, creato_da) values ('W1B gruppo B', 'custom', 'Bonelli Flavio') returning id`);
    sql(`insert into chat_group_members (group_id, operatore) values (${gA}, 'Sanvido Paolo'), (${gA}, 'Pistocchi Mara'), (${gB}, 'Bonelli Flavio')`);
    const id = (q) => sql(q);
    const R_SLOTS = id(`select id from registrazioni where testo = 'W1B slots'`);
    const R_TAV = id(`select id from registrazioni where testo = 'W1B tavoli'`);
    const R_MULTI = id(`select id from registrazioni where testo = 'W1B multi'`);
    const R_DEL = id(`select id from registrazioni where testo = 'W1B da cancellare'`);
    const R_DEL_ADM = id(`select id from registrazioni where testo = 'W1B da cancellare admin'`);
    const P_TAV = id(`select id from piano where collaboratore = 'W1B Collab Tav' and data = '${D}'`);
    const P_TAV2 = id(`select id from piano where collaboratore = 'W1B Collab Tav' and data = '2031-01-06'`);
    const P_SLOTS = id(`select id from piano where collaboratore = 'W1B Collab Slots'`);
    const PUSH_BON = id(`select id from push_subscriptions where endpoint = 'W1B endpoint bonelli'`);
    const CONS = id(`select id from consegne_turno where messaggio = 'W1B consegna'`);

    // sessioni: operatori veri della copia locale (permessi da Impostazioni > Visibilita)
    //  Pistocchi Mara: Slots, gestione piano, Maison, Consegna; NO punti, NO competenze
    //  Bonelli Flavio: Tavoli, gestione piano
    //  HR: entrambi i settori, punti e premi; NO Maison, NO Consegna
    //  Sanvido Paolo: entrambi, NO Consegna (password provvisoria: deve_cambiare_pwd)
    for (const n of ['Pistocchi Mara', 'Bonelli Flavio', 'HR', 'Sanvido Paolo']) OP[n] = tok(n, false);
    const PIS = OP['Pistocchi Mara'],
      BON = OP['Bonelli Flavio'],
      HR = OP['HR'],
      SAN = OP['Sanvido Paolo'];

    // login veri (falla 7): operatore e amministratore
    const campH = pbkdf2('ProvaLocale1!', 'Camponovo Andrea');
    let r = await rpc('verify_login', { p_nome: 'Camponovo Andrea', p_hash: campH });
    if (r.body && r.body.serve_legacy)
      r = await rpc('verify_login', { p_nome: 'Camponovo Andrea', p_hash: campH, p_legacy_hash: sha256('ProvaLocale1!') });
    funziona({ ok: r.ok && r.body && r.body.valid, status: r.status, body: r.body }, 'login operatore Camponovo (ProvaLocale1!)');
    const CAMP = r.body && r.body.session_token;
    const admH = pbkdf2('ProvaAdmin1!', '__master__');
    r = await rpc('verify_master_pwd', { p_hash: admH });
    if (r.body && r.body.serve_legacy) r = await rpc('verify_master_pwd', { p_hash: admH, p_legacy_hash: sha256('ProvaAdmin1!') });
    funziona({ ok: r.ok && r.body && r.body.valid, status: r.status, body: r.body }, 'login amministratore (ProvaAdmin1!)');
    const ADM = r.body && r.body.session_token;
    const tutteSessioni = [PIS, BON, HR, SAN, CAMP, ADM].filter(Boolean);

    const sd = (t, tab, f) => rpc('secure_delete', { p_token: t, p_table: tab, p_filter: f });
    const su = (t, tab, f, d) => rpc('secure_update', { p_token: t, p_table: tab, p_filter: f, p_data: d });
    const si = (t, tab, d) => rpc('secure_insert', { p_token: t, p_table: tab, p_data: d });
    const sr = (t, tab, f, o, l) =>
      rpc('secure_read', { p_token: t, p_table: tab, p_filter: f || '', p_order: o || '', p_limit: l || 5000 });

    await S(async () => {
    console.log('\n== 1) cancellazioni definitive e filtri larghi');
    chiusa(await sd(PIS, 'registrazioni', `id = '${R_DEL}'`), 'operatore cancella definitivamente una registrazione altrui');
    esito(sql(`select count(*) from registrazioni where id = ${R_DEL}`) === '1', '        la registrazione c e ancora');
    chiusa(await sd(PIS, 'promemoria', `titolo LIKE 'W1B%'`), 'promemoria svuotati con un filtro largo');
    chiusa(await sd(PIS, 'costi_maison', `nome LIKE 'W1B%'`), 'costi Maison con un filtro largo');
    chiusa(await sd(PIS, 'spese_extra', `beneficiario LIKE 'W1B%'`), 'spese extra con un filtro largo');
    chiusa(await sd(PIS, 'maison_budget', `nome LIKE 'W1B%'`), 'budget Maison con un filtro largo');
    chiusa(await sd(HR, 'punti_eventi', `collaboratore LIKE 'W1B%'`), 'punti con un filtro largo (anche con Punti e premi)');
    chiusa(await su(PIS, 'registrazioni', `nome LIKE 'W1B%'`, { eliminato: true }), 'registrazioni cestinate in blocco con un filtro largo');
    esito(sql(`select count(*) from registrazioni where nome like 'W1B%' and eliminato`) === '0', '        nessuna cestinata');
    chiusa(await su(PIS, 'registrazioni', `id = '${R_SLOTS}'`, { operatore: 'Altro' }), 'cambio dell autore di una registrazione');
    chiusa(await sd(PIS, 'costi_maison', `data_giornata = '2031-01-08' AND reparto_dip = 'tavoli'`), 'giorno Maison di un altro settore');
    chiusa(await sd(PIS, 'costi_maison', `data_giornata < '2031-12-31'`), 'pulizia Maison con conservazione spenta (data a piacere)');
    // azioni legittime
    funziona(await su(PIS, 'registrazioni', `id = '${R_SLOTS}'`, { testo: 'W1B slots modificata', modificato_da: 'Pistocchi' }), 'operatore modifica una registrazione altrui (id)');
    funziona(await su(PIS, 'registrazioni', `id = '${R_SLOTS}'`, { eliminato: true, eliminato_da: 'Pistocchi Mara', eliminato_at: new Date().toISOString() }), 'operatore cestina una registrazione altrui');
    funziona(await su(PIS, 'registrazioni', `id = '${R_SLOTS}'`, { eliminato: false, eliminato_da: null, eliminato_at: null }), 'operatore la ripristina dal Cestino');
    esito(sql(`select testo||'|'||eliminato from registrazioni where id = ${R_SLOTS}`) === 'W1B slots modificata|false', '        modifica e ripristino salvati');
    funziona(await su(CAMP, 'registrazioni', `id = '${R_TAV}'`, { eliminato: true, eliminato_da: 'Camponovo Andrea', eliminato_at: new Date().toISOString() }), 'operatore con entrambi i settori cestina una registrazione Tavoli');
    r = await si(PIS, 'promemoria', { titolo: 'W1B prom nuovo', data_scadenza: D, creato_da: 'Pistocchi Mara', reparto_dip: 'slots' });
    funziona(r, 'operatore crea un promemoria');
    const PROM = r.body && r.body.id;
    funziona(await su(PIS, 'promemoria', `id = '${PROM}' AND completata = FALSE`, { completata: true, completata_da: 'Pistocchi Mara' }), 'operatore segna fatto il promemoria');
    funziona(await su(PIS, 'promemoria', `id = '${PROM}' AND completata = FALSE`, { completata: true, completata_da: 'Pistocchi Mara' }), 'promemoria gia fatto da un collega: 0 righe senza errore (filtro di valore)');
    funziona(await sd(PIS, 'promemoria', `id = '${PROM}'`), 'operatore elimina il promemoria (per id)');
    funziona(
      await rpc('secure_sostituisci', {
        p_token: PIS,
        p_table: 'costi_maison',
        p_filter: `data_giornata = '2031-01-07' AND reparto_dip = 'slots'`,
        p_rows: [{ data_giornata: '2031-01-07', nome: 'W1B Cliente', costo: 20, operatore: 'Pistocchi Mara', reparto_dip: 'slots' }],
      }),
      'import Maison di un giorno (sostituzione) dal proprio settore',
    );
    funziona(await sd(PIS, 'costi_maison', `data_giornata = '2031-01-07' AND reparto_dip IS NULL`), 'import Maison: righe vecchie senza settore del giorno');
    funziona(await sd(PIS, 'spese_extra', `data_spesa = '2031-01-07' AND luogo = 'Ristorante Seven' AND reparto_dip = 'slots'`), 'import Maison: spese del Seven del giorno');
    funziona(await sd(ADM, 'registrazioni', `id = '${R_DEL_ADM}'`), 'amministratore: cancellazione definitiva');
    esito(sql(`select count(*) from registrazioni where id = ${R_DEL_ADM}`) === '0', '        cancellata davvero');

    });
    await S(async () => {
    console.log('\n== 2) permessi delle pagine e del Diario per settore');
    chiusa(await si(HR, 'consegne_turno', { data_giornata: D, turno_uscente: 'PRESTO', operatore: 'HR', messaggio: 'W1B consegna HR', reparto_dip: 'slots' }), 'consegna scritta senza la pagina Consegna');
    funziona(await su(HR, 'consegne_turno', `id = '${CONS}'`, { letto_da: 'HR', letto_at: new Date().toISOString() }), 'chi riceve la consegna la segna letta (anche senza la pagina)');
    chiusa(await su(HR, 'consegne_turno', `id = '${CONS}'`, { messaggio: 'W1B cambiata' }), 'consegna modificata senza la pagina');
    r = await si(PIS, 'consegne_turno', { data_giornata: D, turno_uscente: 'PRESTO', operatore: 'Pistocchi Mara', messaggio: 'W1B consegna nuova', reparto_dip: 'slots' });
    funziona(r, 'consegna scritta da chi ha la pagina');
    if (r.ok) funziona(await sd(PIS, 'consegne_turno', `id = '${r.body.id}'`), 'consegna eliminata da chi ha la pagina');
    chiusa(await si(PIS, 'punti_eventi', { collaboratore: 'W1B Collab Slots', punti: 100, azione: 'apprezzamento', data_evento: D, operatore: 'Pistocchi Mara' }), 'punti manuali senza Punti e premi');
    chiusa(await si(PIS, 'punti_eventi', { collaboratore: 'W1B Collab Slots', punti: 999, azione: 'copertura', data_evento: D, operatore: 'Pistocchi Mara' }), 'copertura con punti diversi da quelli configurati');
    chiusa(await si(PIS, 'punti_eventi', { collaboratore: 'W1B Collab Slots', punti: 20, azione: 'competenza', data_evento: D, operatore: 'Pistocchi Mara' }), 'punti competenza senza il permesso Competenze');
    const ptCop = JSON.parse(sql(`select valore from impostazioni where chiave = 'punti_config'`)).azioni.find((a) => a.key === 'copertura').punti;
    r = await si(PIS, 'punti_eventi', { collaboratore: 'W1B Collab Slots', punti: ptCop, azione: 'copertura', descrizione: 'W1B cop', data_evento: D, operatore: 'Pistocchi Mara' });
    funziona(r, 'popup copertura: punti configurati da qualsiasi operatore');
    if (r.ok) funziona(await sd(PIS, 'punti_eventi', `id = '${r.body.id}'`), 'e li toglie (Annulla, per id)');
    const PT_MAN = sql(`select id from punti_eventi where descrizione = 'W1B manuale'`);
    await sd(PIS, 'punti_eventi', `id = '${PT_MAN}'`);
    esito(sql(`select count(*) from punti_eventi where id = ${PT_MAN}`) === '1', 'CHIUSA  punti manuali tolti senza Punti e premi');
    funziona(await si(HR, 'punti_eventi', { collaboratore: 'W1B Collab Slots', punti: 7, azione: 'apprezzamento', data_evento: D, operatore: 'HR' }), 'punti manuali con Punti e premi');
    // Registro
    r = await sr(PIS, 'log_attivita', '', 'created_at.desc'.replace('.', ' '), 10000);
    const altrui = (r.body || []).filter((l) => l.operatore !== 'Pistocchi Mara' && !/piano/i.test(l.azione || '') && (l.azione || l.dettaglio));
    esito(r.ok && altrui.length === 0, 'CHIUSA  Registro altrui letto senza la pagina Registro', altrui.length + ' righe altrui con azione/dettaglio');
    esito(r.ok && (r.body || []).some((l) => l.operatore !== 'Pistocchi Mara' && l.azione === ''), 'FUNZIONA ultimo accesso dei colleghi (chat) senza dettagli');
    r = await sr(ADM, 'log_attivita', '', '', 10000);
    esito(r.ok && (r.body || []).some((l) => l.operatore !== 'Admin' && !/piano/i.test(l.azione || '') && l.azione), 'FUNZIONA amministratore legge il Registro intero');
    // Maison
    r = await sr(HR, 'maison_budget', `nome = 'W1B Cliente'`);
    esito(r.ok && r.body.length === 1 && r.body[0].budget_chf == null && r.body[0].data_nascita, 'CHIUSA  budget Maison senza la pagina (resta il compleanno)', JSON.stringify(r.body).slice(0, 160));
    r = await sr(HR, 'costi_maison', `nome LIKE 'W1B%'`);
    esito(r.ok && r.body.length === 0, 'CHIUSA  costi Maison letti senza la pagina', JSON.stringify(r.body).slice(0, 120));
    chiusa(await si(HR, 'costi_maison', { data_giornata: D, nome: 'W1B Cliente HR', costo: 1, operatore: 'HR', reparto_dip: 'slots' }), 'costi Maison scritti senza la pagina');
    r = await sr(PIS, 'maison_budget', `nome = 'W1B Cliente'`);
    esito(r.ok && r.body.length === 1 && Number(r.body[0].budget_chf) === 1000, 'FUNZIONA budget Maison per chi ha la pagina');
    // Diario per settore
    r = await sr(PIS, 'registrazioni', `nome LIKE 'W1B%'`);
    const visti = new Set((r.body || []).map((x) => String(x.id)));
    esito(r.ok && !visti.has(R_TAV), 'CHIUSA  operatore Slots legge il Diario Tavoli', [...visti].join(','));
    esito(r.ok && visti.has(R_SLOTS) && visti.has(R_MULTI), 'FUNZIONA Slots legge il suo Diario e quello di chi lavora anche da lui (reparti extra)');
    chiusa(await su(PIS, 'registrazioni', `id = '${R_TAV}'`, { testo: 'W1B tavoli cambiata' }), 'operatore Slots modifica una registrazione Tavoli (20260913: errore, non 0 righe)');
    esito(sql(`select testo from registrazioni where id = ${R_TAV}`) === 'W1B tavoli', '        la registrazione Tavoli NON e cambiata');
    chiusa(await si(PIS, 'registrazioni', { nome: 'W1B Collab Tav', tipo: 'Nota', testo: 'W1B nuova tav', data: new Date().toISOString(), operatore: 'Pistocchi Mara', reparto_dip: 'tavoli' }), 'registrazione nuova nel Diario Tavoli da Slots');
    r = await sr(CAMP, 'registrazioni', `nome LIKE 'W1B%'`);
    esito(r.ok && r.body.some((x) => String(x.id) === R_TAV), 'FUNZIONA operatore con entrambi i settori legge tutto');
    // assenze dal Rapporto
    chiusa(
      await rpc('parse_assenze_transactional', { p_token: PIS, p_ops: [{ action: 'create', data: { nome: 'W1B Collab Tav', tipo: 'Nota', testo: 'W1B rapporto tav', data: new Date().toISOString(), operatore: 'Pistocchi Mara', reparto_dip: 'tavoli' } }] }),
      'assenze dal Rapporto in un altro settore (prima senza controlli)',
    );
    chiusa(await rpc('parse_assenze_transactional', { p_token: PIS, p_ops: [{ action: 'delete', id: Number(R_DEL) }] }), 'assenze dal Rapporto: cancellazione definitiva');
    r = await rpc('parse_assenze_transactional', {
      p_token: PIS,
      p_ops: [
        { action: 'create', data: { nome: 'W1B Collab Slots', tipo: 'Nota', testo: 'W1B rapporto slots', data: new Date().toISOString(), operatore: 'Pistocchi Mara', reparto_dip: 'slots' } },
        { action: 'update', id: Number(R_SLOTS), data: { testo: 'W1B slots da rapporto' } },
      ],
    });
    esito(r.ok && r.body && r.body.created === 1 && r.body.updated === 1 && r.body.created_ids.length === 1, 'FUNZIONA assenze dal Rapporto nel proprio settore', JSON.stringify(r.body).slice(0, 200));

    });
    await S(async () => {
    console.log('\n== 3) chat');
    chiusa(await su(PIS, 'chat_group_members', `group_id = '${gA}' AND operatore = 'Pistocchi Mara'`, { group_id: Number(gB) }), 'operatore sposta la propria riga in un altro gruppo');
    esito(sql(`select count(*) from chat_group_members where group_id = ${gB} and operatore = 'Pistocchi Mara'`) === '0', '        non e entrata nel gruppo B');
    chiusa(await si(PIS, 'chat_messages', { group_id: Number(gB), messaggio: 'W1B intrusione' }), 'messaggio in un gruppo di cui non si fa parte');
    chiusa(await si(PIS, 'chat_group_members', { group_id: Number(gB), operatore: 'Pistocchi Mara' }), 'entrare da soli in un gruppo altrui');
    r = await si(PIS, 'chat_messages', { group_id: Number(gA), messaggio: 'W1B ciao gruppo' });
    funziona(r, 'messaggio nel proprio gruppo');
    const MSG = r.body && r.body.id;
    chiusa(await su(PIS, 'chat_messages', `id = '${MSG}'`, { group_id: Number(gB) }), 'spostare il proprio messaggio in un altro gruppo');
    funziona(await su(PIS, 'chat_messages', `id = '${MSG}'`, { messaggio: 'W1B ciao corretto' }), 'correggere il proprio messaggio');
    r = await si(SAN, 'chat_message_letti', { message_id: MSG, operatore: 'Bonelli Flavio' });
    esito(r.ok && r.body.operatore === 'Sanvido Paolo', 'CHIUSA  "letto" registrato a nome di un altro (diventa di chi e collegato)', JSON.stringify(r.body));
    funziona(await rpc('chat_mark_letta', { p_token: PIS, p_message_id: MSG }), 'segnare letto un messaggio');
    funziona(await rpc('chat_hide_message', { p_token: PIS, p_message_id: MSG }), 'nascondere un messaggio per se');
    funziona(await sd(PIS, 'chat_group_members', `group_id = '${gA}' AND operatore = 'Pistocchi Mara'`), 'uscire da un gruppo');

    });
    await S(async () => {
    console.log('\n== 4) piano per settore');
    chiusa(await su(PIS, 'piano', `id = '${P_TAV}'`, { codice: 'X9', operatore: 'Pistocchi Mara' }), 'chi gestisce il piano Slots cambia una cella Tavoli (20260913: errore)');
    esito(sql(`select codice from piano where id = ${P_TAV}`) === 'T1', '        la cella Tavoli NON e cambiata');
    chiusa(await si(PIS, 'piano', { collaboratore: 'W1B Collab Tav', data: '2031-01-09', codice: 'T1', reparto_dip: 'tavoli' }), 'cella nuova nel piano Tavoli da Slots');
    chiusa(await rpc('piano_bulk_upsert', { p_token: PIS, p_rows: [{ collaboratore: 'W1B Collab Tav', data: '2031-01-10', codice: 'T1', reparto_dip: 'tavoli' }] }), 'piano in blocco nel settore Tavoli da Slots');
    funziona(await sd(PIS, 'piano', `id = '${P_TAV2}'`), '(cancellazione accettata ma...)');
    esito(sql(`select count(*) from piano where id = ${P_TAV2}`) === '1', 'CHIUSA  ...la cella Tavoli c e ancora');
    funziona(await su(PIS, 'piano', `id = '${P_SLOTS}'`, { codice: 'S7C', operatore: 'Pistocchi Mara' }), 'cella del proprio settore');
    esito(sql(`select codice from piano where id = ${P_SLOTS}`) === 'S7C', '        salvata');
    funziona(await su(PIS, 'piano', `id = '${P_TAV}'`, { codice: 'M', protetto: true, commento: 'Ex T1 - Pistocchi Mara' }), 'malattia dal Diario su una cella di un altro settore (prevale)');
    esito(sql(`select codice from piano where id = ${P_TAV}`) === 'M', '        salvata');
    funziona(await su(BON, 'piano', `id = '${P_TAV2}'`, { codice: 'T2' }), 'chi gestisce il piano Tavoli scrive il suo piano');
    esito(sql(`select codice from piano where id = ${P_TAV2}`) === 'T2', '        salvata');

    });
    await S(async () => {
    console.log('\n== 5) collaboratori');
    chiusa(await si(PIS, 'collaboratori', { nome: 'W1B Nuovo Tav', attivo: true, reparto_dip: 'tavoli' }), 'collaboratore creato in un altro settore');
    chiusa(await si(PIS, 'collaboratori', { nome: 'W1B Nuovo Extra', attivo: true, reparto_dip: 'slots', reparti_extra: 'tavoli', categoria: 1 }), 'collaboratore creato con dati riservati');
    funziona(await si(PIS, 'collaboratori', { nome: 'W1B Nuovo Slots', attivo: true, reparto_dip: 'slots', turni_bloccati: 'S1' }), 'collaboratore nuovo dal Diario nel proprio settore');
    const C_TAV = sql(`select id from collaboratori where nome = 'W1B Collab Tav'`);
    const C_SLOTS = sql(`select id from collaboratori where nome = 'W1B Collab Slots'`);
    chiusa(await su(PIS, 'collaboratori', `id = '${C_TAV}'`, { solo_diurni: true }), 'collaboratore Tavoli modificato da Slots (20260913: errore)');
    esito(sql(`select coalesce(solo_diurni, false) from collaboratori where nome = 'W1B Collab Tav'`) === 'f', '        il collaboratore Tavoli NON e cambiato');
    chiusa(await su(PIS, 'collaboratori', `nome LIKE 'W1B%'`, { solo_diurni: true }), 'collaboratori modificati in blocco con un filtro largo');
    funziona(await su(PIS, 'collaboratori', `id = '${C_SLOTS}'`, { solo_diurni: true }), 'preferenze del piano di un collaboratore del proprio settore');
    esito(sql(`select solo_diurni from collaboratori where nome = 'W1B Collab Slots'`) === 't', '        salvate');

    });
    await S(async () => {
    console.log('\n== 6) notifiche push');
    r = await sr(PIS, 'push_subscriptions', `endpoint LIKE 'W1B%'`);
    esito(r.ok && r.body.length === 1 && r.body[0].operatore === 'Pistocchi Mara', 'CHIUSA  iscrizioni dei colleghi lette', JSON.stringify((r.body || []).map((x) => x.operatore)));
    chiusa(await su(PIS, 'push_subscriptions', `id = '${PUSH_BON}'`, { endpoint: 'W1B rubata' }), 'iscrizione push del collega modificata (20260913: errore)');
    esito(sql(`select endpoint from push_subscriptions where id = ${PUSH_BON}`) === 'W1B endpoint bonelli', '        l iscrizione del collega NON e cambiata');
    await sd(PIS, 'push_subscriptions', `id = '${PUSH_BON}'`);
    esito(sql(`select count(*) from push_subscriptions where id = ${PUSH_BON}`) === '1', 'CHIUSA  iscrizione del collega cancellata');

    });
    await S(async () => {
    console.log('\n== 7) password');
    esito(sql(`select pwd_hash_v2 like '$2_$%' and pwd_hash is null from operatori_auth where nome = 'Camponovo Andrea'`) === 't', 'CHIUSA  impronta operatore salvata con bcrypt, vecchia SHA-256 cancellata');
    const salvata = sql(`select pwd_hash_v2 from operatori_auth where nome = 'Camponovo Andrea'`);
    r = await rpc('verify_login', { p_nome: 'Camponovo Andrea', p_hash: salvata });
    esito(r.ok && r.body && !r.body.valid, 'CHIUSA  il valore salvato non vale come password (operatore)', JSON.stringify(r.body));
    sql(`delete from login_attempts where nome = 'Camponovo Andrea' and not success`);
    esito(sql(`select count(*) from impostazioni where chiave in ('password_hash_v2', 'recovery_code') and valore like '$2_$%'`) === '2', 'CHIUSA  password principale e codice di recupero salvati con bcrypt');
    const salvataM = sql(`select valore from impostazioni where chiave = 'password_hash_v2'`);
    r = await rpc('verify_master_pwd', { p_hash: salvataM });
    esito(r.ok && r.body && !r.body.valid, 'CHIUSA  il valore salvato non vale come password (amministratore)', JSON.stringify(r.body));
    sql(`delete from login_attempts where nome = '__master__' and not success`);
    // operatore con la sola vecchia impronta SHA-256
    sql(`insert into operatori_auth (nome, pwd_hash, ruolo) values ('W1B Legacy', ${lit(sha256('Vecchia1!'))}, 'operatore'); select _password_proteggi_tutte();`);
    const legH = pbkdf2('Vecchia1!', 'W1B Legacy');
    r = await rpc('verify_login', { p_nome: 'W1B Legacy', p_hash: legH });
    esito(r.ok && r.body && r.body.serve_legacy === true && !r.body.valid, 'FUNZIONA vecchia impronta chiesta solo quando serve (serve_legacy)', JSON.stringify(r.body));
    r = await rpc('verify_login', { p_nome: 'W1B Legacy', p_hash: legH, p_legacy_hash: sha256('Vecchia1!') });
    esito(r.ok && r.body && r.body.valid && r.body.upgraded, 'FUNZIONA primo accesso con la vecchia impronta', JSON.stringify(r.body).slice(0, 120));
    esito(sql(`select pwd_hash_v2 like '$2_$%' and pwd_hash is null from operatori_auth where nome = 'W1B Legacy'`) === 't', '        nuova impronta scritta (bcrypt), vecchia cancellata');
    r = await rpc('verify_login', { p_nome: 'W1B Legacy', p_hash: legH });
    esito(r.ok && r.body && r.body.valid, 'FUNZIONA accesso successivo senza vecchia impronta');
    r = await rpc('verify_login', { p_nome: 'W1B Legacy', p_hash: pbkdf2('Sbagliata', 'W1B Legacy') });
    esito(r.ok && r.body && !r.body.valid && !r.body.serve_legacy, 'CHIUSA  password sbagliata rifiutata');
    // cambio password dell operatore (stessa password: non cambia niente per le altre prove)
    r = await rpc('change_op_pwd', { p_nome: 'W1B Legacy', p_old_hash: legH, p_new_hash: pbkdf2('Nuova2!', 'W1B Legacy'), p_token: null });
    esito(r.ok && r.body && r.body.success, 'FUNZIONA cambio password operatore');
    r = await rpc('verify_login', { p_nome: 'W1B Legacy', p_hash: pbkdf2('Nuova2!', 'W1B Legacy') });
    esito(r.ok && r.body && r.body.valid, 'FUNZIONA accesso con la password nuova');
    r = await rpc('force_change_pwd', { p_nome: 'W1B Legacy', p_new_hash: pbkdf2('Reset3!', 'W1B Legacy'), p_deve_cambiare: true, p_token: ADM });
    esito(r.ok && r.body && r.body.success, 'FUNZIONA reimpostazione dall amministratore');
    esito(sql(`select pwd_hash_v2 like '$2_$%' from operatori_auth where nome = 'W1B Legacy'`) === 't', '        salvata con bcrypt');
    // recupero della password principale: in una transazione annullata (non disturba le
    // sessioni amministratore degli altri lavori in corso)
    const rec = sql(`
      begin;
      update impostazioni set valore = _pwd_cifra('CODICEW1') where chiave = 'recovery_code';
      set local role anon;
      select (recovery_master_pwd('SBAGLIAT', null, 'NUOVOCOD', 'x')->>'success') || ',' ||
             (recovery_master_pwd('CODICEW1', null, 'NUOVOCOD', ${lit(admH)})->>'success');
      reset role;
      select (select count(*) from operator_sessions where is_admin)::text || ',' || (select valore like '$2_$%' from impostazioni where chiave = 'recovery_code');
      rollback;`);
    esito(/^false,true\n0,true$/.test(rec), 'FUNZIONA recupero password principale (codice cifrato) e CHIUSE le sessioni amministratore', rec.replace(/\n/g, ' | '));
    sql(`delete from login_attempts where nome = '__recovery__'`);

    });
    await S(async () => {
    console.log('\n== 8) sessioni');
    const tVecchio = sql(`insert into operator_sessions (token, operatore, is_admin, expires_at) values ('w1b' || md5(random()::text), 'Sanvido Paolo', false, now() - interval '3 days') returning token`);
    chiusa(await rpc('renew_op_session', { p_token: tVecchio }), 'rinnovo di una sessione scaduta da 3 giorni');
    const tOra = sql(`insert into operator_sessions (token, operatore, is_admin, expires_at) values ('w1b' || md5(random()::text), 'Sanvido Paolo', false, now() - interval '1 hour') returning token`);
    const r1 = await rpc('renew_op_session', { p_token: tOra });
    funziona(r1, 'rinnovo di una sessione scaduta da 1 ora (margine 12 ore)');
    const r2 = await rpc('renew_op_session', { p_token: tOra });
    esito(r2.ok && r1.body && r2.body.session_token === r1.body.session_token, 'FUNZIONA rinnovo ripetuto subito: stesso token nuovo (risposta persa)');
    sql(`update operator_sessions set created_at = now() - interval '5 minutes' where token = ${lit(r1.body.session_token)}`);
    chiusa(await rpc('renew_op_session', { p_token: tOra }), 'token gia rinnovato che ne crea un altro');
    funziona(await rpc('validate_op_session', { p_token: r1.body.session_token }), 'la sessione nuova vale');
    tutteSessioni.push(r1.body.session_token);

    });
    await S(async () => {
    console.log('\n== 9) diritti diretti sulle tabelle');
    for (const t of ['registrazioni', 'operatori_auth', 'impostazioni', 'log_attivita']) {
      const g = await fetch(BASE + t + '?select=*&limit=1', { headers: H });
      esito(g.status === 401 || g.status === 403, 'CHIUSA  lettura diretta di ' + t + ' con la chiave pubblica', 'HTTP ' + g.status);
    }
    const p = await fetch(BASE + 'promemoria', { method: 'POST', headers: H, body: JSON.stringify({ titolo: 'W1B diretto', data_scadenza: D }) });
    esito(p.status === 401 || p.status === 403, 'CHIUSA  scrittura diretta con la chiave pubblica', 'HTTP ' + p.status);
    esito(sql(`select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')`) === '0', 'CHIUSA  nessun diritto di anon/authenticated sulle tabelle');

    });
    await S(async () => {
    console.log('\n== 10) funzioni aperte senza sessione');
    r = await rpc('check_deve_cambiare', { p_nome: 'Sanvido Paolo' });
    esito(r.ok && r.body && r.body.deve_cambiare_pwd === false, 'CHIUSA  password provvisoria rivelata senza sessione', JSON.stringify(r.body));
    r = await rpc('check_deve_cambiare', { p_nome: 'Sanvido Paolo', p_token: SAN });
    esito(r.ok && r.body && r.body.deve_cambiare_pwd === true, 'FUNZIONA la persona stessa sa di dover cambiare password', JSON.stringify(r.body));
    r = await rpc('list_operators', {});
    esito(r.ok && Array.isArray(r.body) && r.body.length > 0 && Object.keys(r.body[0]).sort().join() === 'nome,ruolo', 'FUNZIONA elenco dei nomi per il login (solo nome e ruolo)');

    });
    await S(async () => {
    console.log('\n== 11) chiusure finali (migrazione 20260913)');
    // dati W4C: un operatore Slots SENZA Piano e senza Rapporto, celle Tavoli, un modulo
    sql(`
      insert into operatori_auth (nome, pwd_hash_v2, ruolo) values ('W4C Op Slots', 'x', 'operatore') on conflict do nothing;
      update impostazioni set valore = (valore::jsonb || '{"W4C Op Slots": "slots"}'::jsonb)::text where chiave = 'operatori_reparto';
      insert into collaboratori (nome, attivo, reparto_dip) values ('W4C Tav', true, 'tavoli'), ('W4C Entrambi', true, 'entrambi');
      insert into piano (collaboratore, data, codice, reparto_dip, protetto, generato, commento) values
        ('W4C Tav', '2031-02-01', 'T1', 'tavoli', false, false, null),
        ('W4C Tav', '2031-02-02', 'T2', 'tavoli', false, true, 'W4C nota'),
        ('W4C Tav', '2031-02-04', 'T1', 'tavoli', false, false, null),
        ('W4C Tav', '2031-02-05', 'T3', 'tavoli', false, false, null),
        ('W4C Tav', '2031-02-06', 'M', 'tavoli', true, false, 'Ex T4 - vecchia');
      -- malattia scritta fra il 01/09 e la 20260912 (senza prima_malattia, nello storico)
      update piano set codice = 'M', protetto = true, commento = 'Ex T3 - x' where collaboratore = 'W4C Tav' and data = '2031-02-05';
      -- malattia di prima dello storico (01/09/2026): vale la nota "Ex"
      delete from piano_storico where collaboratore = 'W4C Tav' and data = '2031-02-06';
      insert into moduli (tipo, collaboratore, operatore, reparto_dip) values ('cambio_turno', 'W4C Tav', 'Camponovo Andrea', 'slots');
    `);
    const W4 = tok('W4C Op Slots', false);
    tutteSessioni.push(W4);
    const cella = (d) => sql(`select id from piano where collaboratore = 'W4C Tav' and data = '${d}'`);
    const riga = (d) => JSON.parse(sql(`select row_to_json(p) from piano p where collaboratore = 'W4C Tav' and data = '${d}'`) || 'null');
    const D1 = cella('2031-02-01'), D2 = cella('2031-02-02'), D4 = cella('2031-02-04'), D5 = cella('2031-02-05'), D6 = cella('2031-02-06');

    // N2: piano di un altro settore dal percorso del Diario
    funziona(await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'M', commento: 'Ex S1', protetto: false, motivo_blocco: 'W4C blocco', prima_malattia: { codice: 'S1', protetto: true } }), 'N2 malattia dal Diario su una cella Tavoli (operatore senza Piano: la malattia prevale)');
    let c = riga('2031-02-01');
    esito(c && c.codice === 'M' && c.protetto === true && c.motivo_blocco === null && c.prima_malattia && c.prima_malattia.codice === 'T1', 'CHIUSA  N2 protetto, blocco e prima_malattia li decide il database (sotto = T1, non S1)', JSON.stringify(c));
    chiusa(await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'S1' }), 'N2 secondo UPDATE: torna una sigla diversa da quella di prima (S1)');
    chiusa(await rpc('piano_scrivi_celle', { p_token: CAMP, p_ops: [{ collaboratore: 'W4C Tav', data: '2031-02-01', dati: { codice: 'S1' } }] }), 'N2 lo stesso da piano_scrivi_celle');
    chiusa(await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'M', reparto_dip: 'slots' }), 'N2 cella spostata in un altro settore dal Diario');
    await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'M', motivo_blocco: 'W4C blocco', protetto: false });
    esito(riga('2031-02-01').motivo_blocco === null && riga('2031-02-01').protetto === true, 'CHIUSA  N2 blocco e protezione cambiati su una M dal Diario (ignorati)');
    await sd(CAMP, 'piano', `id = '${D1}'`).then((x) => chiusa(x, 'N2 cancellata dal Diario una M che copre un turno (il turno sparirebbe)'));
    esito(riga('2031-02-01') && riga('2031-02-01').codice === 'M', '        la M c e ancora');
    funziona(await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'T1', protetto: true, generato: true, commento: 'W4C', motivo_blocco: 'W4C', prima_malattia: null }), 'N2 togliendo la malattia torna la sigla vera (T1)');
    c = riga('2031-02-01');
    esito(c && c.codice === 'T1' && c.protetto === false && c.generato === false && c.motivo_blocco === null && c.prima_malattia === null, '        com era: non protetta, non della bozza, senza blocco', JSON.stringify(c));
    chiusa(await su(CAMP, 'piano', `id = '${D1}'`, { codice: 'S1' }), 'N2 sigla cambiata in un altra dal Diario');
    // il percorso vero del programma (sincronizzaMalattiaPiano), operatore Slots senza Piano
    // su una cella Tavoli della bozza: M con prima_malattia, poi il ritorno tale e quale
    let r0 = riga('2031-02-02');
    funziona(await su(W4, 'piano', `id = '${D2}'`, { codice: 'M', protetto: true, generato: false, motivo_blocco: null, commento: 'Ex T2 - W4C Op Slots', operatore: 'W4C Op Slots', updated_at: new Date().toISOString(), prima_malattia: { codice: r0.codice, protetto: r0.protetto, generato: r0.generato, commento: r0.commento, motivo_blocco: r0.motivo_blocco } }), 'malattia dal Diario: operatore SENZA Piano, in un ALTRO settore (programma)');
    c = riga('2031-02-02');
    const pm = c.prima_malattia || {};
    funziona(await su(W4, 'piano', `id = '${D2}'`, { codice: 'T2', protetto: !!pm.protetto, generato: !!pm.generato, commento: pm.commento || null, motivo_blocco: pm.motivo_blocco || null, prima_malattia: null, operatore: 'W4C Op Slots', updated_at: new Date().toISOString() }), 'malattia tolta dal Diario: la cella torna (programma)');
    c = riga('2031-02-02');
    esito(c && c.codice === 'T2' && c.generato === true && c.commento === 'W4C nota' && c.prima_malattia === null, '        tale e quale: T2 della bozza con la sua nota', JSON.stringify(c));
    // M in un giorno senza cella (piano_scrivi_celle, come _pianoInserisciCella) e poi tolta
    r = await rpc('piano_scrivi_celle', { p_token: W4, p_ops: [{ collaboratore: 'W4C Tav', data: '2031-02-03', atteso: null, dati: { codice: 'M', protetto: false, generato: true, motivo_blocco: 'W4C', reparto_dip: 'tavoli', operatore: 'Bushi Musa' } }] });
    esito(r.ok && r.body && r.body.ok, 'FUNZIONA malattia dal Diario in un giorno senza turno (cella nuova in un altro settore)', JSON.stringify(r.body).slice(0, 200));
    c = riga('2031-02-03');
    esito(c && c.protetto === true && c.generato === false && c.motivo_blocco === null && c.operatore === 'W4C Op Slots', '        protetta, a mano, senza blocco, autore = sessione', JSON.stringify(c));
    chiusa(await si(W4, 'piano', { collaboratore: 'W4C Tav', data: '2031-02-07', codice: 'S1', reparto_dip: 'tavoli' }), 'N2 cella nuova con una sigla dal Diario');
    funziona(await sd(W4, 'piano', `id = '${cella('2031-02-03')}'`), 'malattia senza turno tolta dal Diario (cancellata)');
    esito(!riga('2031-02-03'), '        cancellata');
    // malattie scritte prima della colonna prima_malattia
    chiusa(await su(CAMP, 'piano', `id = '${D5}'`, { codice: 'S1', commento: '' }), 'N2 malattia di prima (storico): sigla diversa da quella dello storico');
    funziona(await su(CAMP, 'piano', `id = '${D5}'`, { codice: 'T3', protetto: false, commento: '' }), 'malattia di prima (storico del piano): torna T3');
    funziona(await su(CAMP, 'piano', `id = '${D6}'`, { codice: 'T4', protetto: false, commento: '' }), 'malattia di prima dello storico (nota "Ex T4"): torna T4');
    // ND dal Diario (chi scrive il piano Slots, su una cella Tavoli)
    funziona(await su(PIS, 'piano', `id = '${D4}'`, { codice: 'ND', protetto: true, generato: false, motivo_blocco: null, commento: 'Ex T1 - ND dal Diario - Pistocchi Mara' }), 'ND dal Diario su una cella di un altro settore');
    funziona(await su(PIS, 'piano', `id = '${D4}'`, { codice: 'T1', protetto: false, generato: false, commento: '' }), 'ND tolta: torna il turno');
    esito(riga('2031-02-04').codice === 'T1', '        T1');

    // N5: Rapporto
    chiusa(await si(HR, 'rapporti_giornalieri', { data_rapporto: '2031-02-01', turno: 'PRESTO', reparto_dip: 'slots', operatore: 'HR', assenze: 'W4C senza pagina' }), 'N5 Rapporto scritto senza la pagina Rapporto');
    chiusa(await si(W4, 'rapporti_giornalieri', { data_rapporto: '2031-02-01', turno: 'PRESTO', reparto_dip: 'slots', operatore: 'W4C Op Slots', assenze: 'W4C senza pagina' }), 'N5 Rapporto scritto senza la pagina (operatore Slots)');
    r = await si(PIS, 'rapporti_giornalieri', { data_rapporto: '2031-02-01', turno: 'PRESTO', reparto_dip: 'slots', operatore: 'Bushi Musa', assenze: 'W4C assenze', updated_at: new Date().toISOString() });
    funziona(r, 'Rapporto scritto da chi ha la pagina');
    esito(r.ok && r.body.operatore === 'Pistocchi Mara', 'CHIUSA  Rapporto a nome di un collega (autore = sessione)', JSON.stringify(r.body).slice(0, 120));
    funziona(await su(PIS, 'rapporti_giornalieri', `data_rapporto = '2031-02-01' AND turno = 'PRESTO' AND reparto_dip = 'slots'`, { sup_note: 'W4C sup', operatore: 'Bushi Musa' }), 'Rapporto aggiornato da chi ha la pagina');
    esito(sql(`select sup_note || '|' || operatore from rapporti_giornalieri where data_rapporto = '2031-02-01' and turno = 'PRESTO' and reparto_dip = 'slots'`) === 'W4C sup|Pistocchi Mara', '        salvato, autore = sessione');
    chiusa(await su(HR, 'rapporti_giornalieri', `data_rapporto = '2031-02-01' AND turno = 'PRESTO' AND reparto_dip = 'slots'`, { sup_note: 'W4C HR' }), 'N5 Rapporto modificato senza la pagina');
    r = await sr(HR, 'rapporti_giornalieri', `data_rapporto = '2031-02-01'`);
    esito(r.ok && r.body.length === 0, 'CHIUSA  N5 Rapporto letto senza la pagina (vuoto, niente errore)', JSON.stringify(r.body).slice(0, 120));
    r = await sr(PIS, 'rapporti_giornalieri', `data_rapporto = '2031-02-01'`);
    esito(r.ok && r.body.length === 1, 'FUNZIONA Rapporto letto da chi ha la pagina');
    // autore = sessione
    r = await si(PIS, 'registrazioni', { nome: 'W4C Tav', tipo: 'Nota', testo: 'W4C autore', data: new Date().toISOString(), operatore: 'Bushi Musa', reparto_dip: 'slots' });
    esito(r.ok && r.body.operatore === 'Pistocchi Mara', 'CHIUSA  registrazione scritta a nome di un collega (autore = sessione)', JSON.stringify(r.body).slice(0, 120));
    r = await rpc('piano_bulk_upsert', { p_token: PIS, p_rows: [{ collaboratore: 'W4C Tav', data: '2031-02-09', codice: 'M', reparto_dip: 'tavoli', operatore: 'Bushi Musa' }] });
    esito(r.ok && sql(`select operatore from piano where collaboratore = 'W4C Tav' and data = '2031-02-09'`) === 'Pistocchi Mara', 'CHIUSA  piano in blocco a nome di un collega (autore = sessione)', JSON.stringify(r.body));
    const MOD = sql(`select id from moduli where collaboratore = 'W4C Tav'`);
    funziona(await su(PIS, 'moduli', `id = '${MOD}'`, { dati: { w4c: 1 }, operatore: 'Camponovo Andrea', modificato_da: 'Pistocchi Mara' }), 'modifica di un modulo altrui (il programma rimanda l autore uguale)');
    chiusa(await su(PIS, 'moduli', `id = '${MOD}'`, { operatore: 'Pistocchi Mara' }), 'autore di un modulo cambiato');
    esito(sql(`select operatore from moduli where id = ${MOD}`) === 'Camponovo Andrea', '        autore invariato');

    // punti: copertura una volta per motivo, massimo 5 in 24 ore
    const ptC = JSON.parse(sql(`select valore from impostazioni where chiave = 'punti_config'`)).azioni.find((a) => a.key === 'copertura').punti;
    const cop = (t, desc) => si(t, 'punti_eventi', { collaboratore: 'W4C Tav', punti: ptC, azione: 'copertura', descrizione: desc, data_evento: D, operatore: 'x' });
    funziona(await cop(PIS, 'W4C copertura del 01.02'), 'punti copertura (popup) senza Punti e premi');
    chiusa(await cop(PIS, 'W4C copertura del 01.02'), 'punti copertura doppi: stesso collaboratore e motivo');
    chiusa(await cop(W4, 'W4C copertura del 01.02'), 'punti copertura doppi da un altro operatore');
    chiusa(await cop(PIS, ''), 'punti copertura senza motivo');
    for (let i = 2; i <= 5; i++) await cop(PIS, 'W4C copertura n.' + i);
    esito(sql(`select count(*) from punti_eventi where collaboratore = 'W4C Tav' and azione = 'copertura'`) === '5', 'FUNZIONA 5 coperture diverse nello stesso giorno');
    chiusa(await cop(PIS, 'W4C copertura n.6'), 'punti copertura: la sesta in 24 ore');
    funziona(await cop(HR, 'W4C copertura del 01.02'), 'doppio accredito consapevole con Punti e premi');

    // chat: un solo gruppo Tutti
    const giaTutti = sql(`select count(*) from chat_groups where tipo = 'tutti'`) !== '0';
    chiusa(await rpc('chat_get_or_create_group', { p_token: PIS, p_tipo: 'tutti', p_legacy_gid: 'W4C altro', p_nome: 'W4C Tutti bis', p_members: ['Pistocchi Mara'] }), 'chat: secondo gruppo "Tutti" con un altro codice');
    chiusa(await rpc('chat_get_or_create_group', { p_token: PIS, p_tipo: 'custom', p_legacy_gid: '__gruppo_tutti', p_nome: 'W4C finto', p_members: ['Pistocchi Mara'] }), 'chat: gruppo personale con il codice del gruppo Tutti');
    chiusa(await rpc('chat_get_or_create_group', { p_token: PIS, p_tipo: 'admin', p_legacy_gid: 'W4C x', p_nome: 'W4C x', p_members: [] }), 'chat: tipo di gruppo inventato');
    chiusa(await si(PIS, 'chat_groups', { nome: 'W4C Tutti diretto', tipo: 'tutti', legacy_gid: 'W4C diretto' }), 'chat: gruppo Tutti creato con secure_insert');
    const g1 = await rpc('chat_get_or_create_group', { p_token: PIS, p_tipo: 'tutti', p_legacy_gid: '__gruppo_tutti', p_nome: 'W4C Tutti', p_members: ['Pistocchi Mara'] });
    const g2 = await rpc('chat_get_or_create_group', { p_token: CAMP, p_tipo: 'tutti', p_legacy_gid: '__gruppo_tutti', p_nome: 'Tutti', p_members: ['Camponovo Andrea'] });
    esito(g1.ok && g2.ok && g1.body === g2.body && sql(`select count(*) from chat_groups where tipo = 'tutti'`) === '1', 'FUNZIONA il gruppo Tutti si crea una volta e tutti ricevono quello', JSON.stringify([g1.body, g2.body]));
    if (!giaTutti) sql(`delete from chat_group_members where group_id = ${Number(g1.body)}; delete from chat_groups where id = ${Number(g1.body)} and nome = 'W4C Tutti';`);

    // sessioni: catena dei rinnovi al massimo 30 giorni
    const tLungo = sql(`insert into operator_sessions (token, operatore, is_admin, created_at, expires_at, catena_inizio) values ('w4c' || md5(random()::text), 'Sanvido Paolo', false, now() - interval '20 hours', now() + interval '4 hours', now() - interval '31 days') returning token`);
    r = await rpc('renew_op_session', { p_token: tLungo });
    esito(!r.ok && /Sessione non valida/.test(r.msg), 'CHIUSA  sessione rinnovata a catena oltre 30 giorni (il programma chiede la password)', r.msg);
    const tMese = sql(`insert into operator_sessions (token, operatore, is_admin, created_at, expires_at, catena_inizio) values ('w4c' || md5(random()::text), 'Sanvido Paolo', false, now() - interval '20 hours', now() + interval '4 hours', now() - interval '29 days 20 hours') returning token`);
    r = await rpc('renew_op_session', { p_token: tMese });
    funziona(r, 'rinnovo a 29 giorni e 20 ore dall accesso');
    if (r.ok) {
      tutteSessioni.push(r.body.session_token);
      const x = sql(`select (catena_inizio < now() - interval '29 days')::text || ',' || (expires_at <= catena_inizio + interval '30 days' and expires_at < now() + interval '5 hours')::text from operator_sessions where token = ${lit(r.body.session_token)}`);
      esito(x === 'true,true', '        la sessione nuova eredita l inizio e finisce ai 30 giorni', x);
    }
    r = await rpc('renew_op_session', { p_token: W4 });
    esito(r.ok && sql(`select catena_inizio > now() - interval '1 minute' from operator_sessions where token = ${lit(r.body.session_token)}`) === 't', 'FUNZIONA rinnovo normale (sessione di oggi)');
    if (r.ok) tutteSessioni.push(r.body.session_token);

    // password principale di fabbrica: no, c e la password (bcrypt)
    r = await rpc('is_default_master_pwd', { p_default_hash: '7310db08dd56916e4ded25837db6cf4ff5005c958fb53e405a62fd10d2009cce' });
    esito(r.ok && r.body && r.body.is_default === false, 'CHIUSA  is_default_master_pwd con password principale impostata (prima: true)', JSON.stringify(r.body));

    // collaboratori "entrambi" e righe escluse dai permessi
    const C_ENT = sql(`select id from collaboratori where nome = 'W4C Entrambi'`);
    const C_WTAV = sql(`select id from collaboratori where nome = 'W4C Tav'`);
    funziona(await su(PIS, 'collaboratori', `id = '${C_ENT}'`, { solo_diurni: true }), 'collaboratore di tutti i settori modificato da Slots (prima 0 righe senza errore)');
    esito(sql(`select solo_diurni from collaboratori where id = ${C_ENT}`) === 't', '        salvato');
    r = await su(PIS, 'collaboratori', `id = '${C_WTAV}'`, { solo_diurni: true });
    esito(!r.ok && /Permesso mancante/.test(r.msg), 'CHIUSA  collaboratore Tavoli da Slots: errore chiaro, non successo finto', r.msg);

    // amministratore: sessione valida anche dopo l accesso da un altro PC (admin_sessions)
    r = await rpc('verify_master_pwd', { p_hash: admH });
    if (r.ok && r.body && r.body.session_token) tutteSessioni.push(r.body.session_token);
    r = await rpc('force_change_pwd', { p_nome: 'W1B Legacy', p_new_hash: pbkdf2('Reset4!', 'W1B Legacy'), p_deve_cambiare: true, p_token: ADM });
    esito(r.ok && r.body && r.body.success, 'FUNZIONA amministratore: Reimposta password anche dopo un accesso da un altro PC', JSON.stringify(r.body));
    });
    await S(async () => {
    console.log('\n== 12) personalizzazioni dalle schermate (migrazione 20260914)');
    // stato di partenza: si rimette tutto com era alla fine (anche se una prova fallisce)
    const visPrima = sql(`select valore from impostazioni where chiave = 'visibilita'`);
    const istrPrima = sql(`select coalesce(json_agg(i), '[]') from istruzioni_settore i`);
    const impPrima = JSON.parse(sql(`select coalesce(json_object_agg(chiave, valore), '{}') from impostazioni where chiave in ('piano_regole_fonte', 'brief_colonne_slots', 'brief_colonne_tavoli')`));
    const inizio = sql(`select now()`);
    const ist = (t, sett, testo, atteso) => rpc('salva_istruzioni_settore', { p_token: t, p_settore: sett, p_testo: testo, p_atteso: atteso === undefined ? null : atteso });
    const quando = (sett) => sql(`select aggiornato_il from istruzioni_settore where settore = ${lit(sett)}`) || null;
    const quandoJs = (sett) => { const r = sql(`select to_json(aggiornato_il) from istruzioni_settore where settore = ${lit(sett)}`); return r ? JSON.parse(r) : null; };
    const imp = (t, k, v) => rpc('upsert_impostazione', { p_token: t, p_chiave: k, p_valore: v });
    try {
      sql(`delete from istruzioni_settore where settore in ('slots', 'tavoli', 'cleaning')`);
      // ISTRUZIONI: senza il permesso (predefinito: solo amministratore) nessuno scrive
      sql(`update impostazioni set valore = (valore::jsonb - 'gestione_istruzioni')::text where chiave = 'visibilita'`);
      chiusa(await ist(PIS, 'slots', 'W5I senza permesso'), 'istruzioni Slots scritte da un responsabile Slots SENZA il permesso (predefinito)');
      chiusa(await ist(CAMP, 'tavoli', 'W5I senza permesso'), 'istruzioni scritte da chi lavora in tutti i settori senza il permesso');
      funziona(await ist(ADM, 'cleaning', 'W5I amministratore'), 'amministratore scrive le istruzioni del Cleaning');
      // permesso dato a Pistocchi (Slots) e Bonelli (Tavoli)
      sql(`update impostazioni set valore = (valore::jsonb || '{"gestione_istruzioni": {"tipo": "selezionati", "operatori": ["Pistocchi Mara", "Bonelli Flavio"]}}'::jsonb)::text where chiave = 'visibilita'`);
      r = await ist(PIS, 'slots', 'W5I # Apertura\n- **cassa**');
      funziona(r, 'responsabile Slots con il permesso scrive le istruzioni Slots');
      esito(sql(`select aggiornato_da from istruzioni_settore where settore = 'slots'`) === 'Pistocchi Mara', 'CHIUSA  autore delle istruzioni = sessione (scritto dal database)');
      esito(sql(`select count(*) from log_attivita where azione = 'Istruzioni del settore modificate' and operatore = 'Pistocchi Mara' and reparto_dip = 'slots' and created_at >= ${lit(inizio)}`) === '1', 'FUNZIONA la modifica finisce nel Registro attivita');
      chiusa(await ist(PIS, 'tavoli', 'W5I Slots scrive Tavoli'), 'responsabile Slots scrive le istruzioni dei TAVOLI');
      chiusa(await ist(BON, 'slots', 'W5I Tavoli scrive Slots', quandoJs('slots')), 'responsabile Tavoli scrive le istruzioni degli SLOTS');
      funziona(await ist(BON, 'tavoli', 'W5I tavoli'), 'responsabile Tavoli con il permesso scrive le istruzioni Tavoli');
      chiusa(await ist(PIS, 'slots', 'W5I sovrascrive senza aver letto'), 'istruzioni sovrascritte senza l ultima versione (chi salva per secondo)');
      chiusa(await ist(PIS, 'slots', 'W5I ora vecchia', '2020-01-01T00:00:00Z'), 'istruzioni salvate con un ora di lettura vecchia');
      funziona(await ist(PIS, 'slots', 'W5I seconda versione', quandoJs('slots')), 'istruzioni salvate con l ultima versione letta');
      chiusa(await ist(ADM, 'inventato', 'W5I'), 'istruzioni di un settore che non esiste');
      chiusa(await ist(ADM, 'cleaning', 'W5I ' + 'x'.repeat(20001), quandoJs('cleaning')), 'istruzioni oltre 20000 caratteri');
      chiusa(await ist('w5i-token-finto', 'slots', 'W5I'), 'istruzioni senza sessione valida');
      // lettura: ognuno i suoi settori
      const settoriLetti = async (t) => { const x = await rpc('leggi_istruzioni_settore', { p_token: t }); return x.ok ? x.body.map((y) => y.settore).sort().join(',') : 'ERRORE ' + x.msg; };
      esito((await settoriLetti(PIS)) === 'slots', 'CHIUSA  responsabile Slots legge solo le istruzioni Slots', await settoriLetti(PIS));
      esito((await settoriLetti(BON)) === 'tavoli', 'CHIUSA  responsabile Tavoli legge solo le istruzioni Tavoli', await settoriLetti(BON));
      esito((await settoriLetti(CAMP)) === 'cleaning,slots,tavoli', 'FUNZIONA chi lavora in tutti i settori le legge tutte', await settoriLetti(CAMP));
      chiusa(await rpc('leggi_istruzioni_settore', { p_token: 'w5i-token-finto' }), 'istruzioni lette senza sessione');
      const dir = await fetch(BASE + 'istruzioni_settore?select=*', { headers: H });
      esito(dir.status === 401 || dir.status === 403, 'CHIUSA  lettura diretta della tabella istruzioni_settore con la chiave pubblica', 'HTTP ' + dir.status);
      const dirW = await fetch(BASE + 'istruzioni_settore', { method: 'POST', headers: H, body: JSON.stringify({ settore: 'slots', testo: 'W5I diretto' }) });
      esito(dirW.status === 401 || dirW.status === 403, 'CHIUSA  scrittura diretta della tabella istruzioni_settore', 'HTTP ' + dirW.status);

      // RIFERIMENTI NORMATIVI DELLE REGOLE: solo amministratore
      chiusa(await imp(PIS, 'piano_regole_fonte', '{"min_riposo_ore":"W5I"}'), 'riferimento normativo di una regola cambiato da un operatore (anche con piano e briefing)');
      chiusa(await imp(CAMP, 'piano_regole_fonte', '{"min_riposo_ore":"W5I"}'), 'riferimento normativo cambiato da un operatore senza permessi');
      funziona(await imp(ADM, 'piano_regole_fonte', '{"min_riposo_ore":"W5I LL art. 15a"}'), 'amministratore cambia il riferimento normativo');

      // COLONNE DEL BRIEFING: chi compila il briefing, solo nei suoi settori
      const col = '[{"id":"e","tit":"E","vis":true},{"id":"nome","tit":"W5I","vis":true},{"id":"turno","tit":"T","vis":true}]';
      chiusa(await imp(CAMP, 'brief_colonne_slots', col), 'colonne del briefing cambiate da chi non compila il briefing');
      chiusa(await imp(HR, 'brief_colonne_slots', col), 'colonne del briefing cambiate senza briefing ne piano (HR)');
      funziona(await imp(PIS, 'brief_colonne_slots', col), 'responsabile Slots (briefing) cambia le colonne del briefing Slots');
      chiusa(await imp(PIS, 'brief_colonne_tavoli', col), 'responsabile Slots cambia le colonne del briefing dei TAVOLI');
      funziona(await imp(BON, 'brief_colonne_tavoli', col), 'responsabile Tavoli cambia le colonne del briefing Tavoli');
      funziona(await imp(PIS, 'brief_colonne_slots', ''), 'responsabile Slots rimette le colonne predefinite (valore vuoto)');
      chiusa(await imp(PIS, 'brief_colonne_slots', '<b>non json</b>'), 'colonne del briefing con un valore che non e un elenco');
      chiusa(await imp(ADM, 'brief_colonne_inventato', col), 'colonne del briefing di un settore che non esiste');
    } finally {
      sql(`update impostazioni set valore = ${lit(visPrima)} where chiave = 'visibilita'`);
      sql(`delete from istruzioni_settore; insert into istruzioni_settore select * from json_populate_recordset(null::istruzioni_settore, ${lit(istrPrima)}::json)`);
      for (const k of ['piano_regole_fonte', 'brief_colonne_slots', 'brief_colonne_tavoli']) {
        if (impPrima[k] == null) sql(`delete from impostazioni where chiave = ${lit(k)}`);
        else sql(`update impostazioni set valore = ${lit(impPrima[k])} where chiave = ${lit(k)}`);
      }
      sql(`delete from log_attivita where azione = 'Istruzioni del settore modificate' and created_at >= ${lit(inizio)}`);
      esito(sql(`select valore from impostazioni where chiave = 'visibilita'`) === visPrima, '        visibilita rimessa com era');
    }
    });
    sql(`delete from operator_sessions where token in (${tutteSessioni.map(lit).join(',') || "''"})`);
  } catch (e) {
    errori++;
    console.log('ROTTO  ' + (e.stack || e));
  } finally {
    for (const t of Object.values(OP)) sql(`delete from operator_sessions where token = ${lit(t)}`);
    pulisci();
  }
  console.log('\n' + (errori ? 'ATTENZIONE: ' + errori + ' prove non superate' : 'TUTTE LE PROVE SUPERATE'));
  process.exit(errori ? 1 : 0);
})();
