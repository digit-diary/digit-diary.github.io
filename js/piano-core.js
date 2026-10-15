/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano.js
 */

// ================================================================
// SEZIONE 25: PIANO DI LAVORO (ereditato dal progetto Turnivo)
// Griglia mensile collaboratori × giorni: codici turno (S22, R4...)
// e codici speciali (V, M, C, F...). Dati on-demand, NON in loadAll.
// Fase 1: griglia + modifica manuale + malattie dal Diario +
// tabella fabbisogno vs assegnati. (Fase 2: validatore + bozza)
// ================================================================

let _pianoCfgCaricata = false;
let pianoTurniCache = [];
let pianoCodiciCache = [];
let pianoFestiviCache = [];
let pianoRegoleCache = [];
let _pianoCongediNp = []; // congedi non pagati (RAP 5.14), tutti i settori
let _pianoRighe = []; // righe del mese/settore correnti
// Data di oggi in ORA LOCALE: toISOString() e' UTC e fra mezzanotte e le 2
// del 1 del mese restituiva ancora il mese prima.
function _pianoOggiStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _pianoYmOggi() {
  return _pianoOggiStr().substring(0, 7);
}
let _pianoMeseSel = _pianoYmOggi();
let _pianoCellaSel = null; // {nome, data} in modifica
// UN SOLO SETTORE: porta il programma (barra in alto) e il Piano sul settore rep, per
// esempio quando Annulla torna a un operazione fatta in un altro settore. Se la barra non
// lo permette, il Piano lo mostra lo stesso (come prima).
function _pianoVaiAlSettore(rep) {
  if (!rep) return;
  if (rep !== currentReparto && typeof setReparto === 'function') setReparto(rep);
  _pianoRepartoSel = rep === currentReparto ? null : rep;
}
// SETTORE DI UNA RIGA (turno, collaboratore, cella, regola...): le righe scritte prima
// che esistessero i settori non hanno reparto_dip e sono delle Slots. Un solo punto per
// questa regola, cosi un settore nuovo non dipende da copie sparse del valore.
function _repartoDi(r) {
  return (r && r.reparto_dip) || 'slots';
}

// Colori dei codici speciali · PALETTE ORIGINALE TURNIVO (= formattazione
// condizionale dell'Excel del casinò). I codici non elencati restano bianchi.
const PIANO_COLORI_SPECIALI = {
  V: '#00B0F0',
  V1: '#00B0F0',
  CGF: '#00B0F0',
  M: '#FFFF00',
  M1: '#FFFF00',
  I: '#FFFF00',
  I1: '#FFFF00',
  LRD: '#FFFF00',
  JG: '#FFFF00',
  C: '#FBD4B4',
  RC: '#FFC000',
  ND: '#F2DBDB',
  // assenza in attesa di certificato: colore proprio, diverso dalla M (giallo)
  ASS: '#D7B8F3',
};

// REGOLE e FESTIVI: erano riservati ad admin e per gli altri la scheda restava
// completamente vuota, senza spiegazione. Ora sono permessi delegabili (es. al
// responsabile o a HR) dalle Impostazioni, e chi non li ha legge il perche'.
function puoGestireRegole() {
  return (isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_regole'))) && _pianoModTabOk();
}
function puoGestireFestivi() {
  return (isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_festivi'))) && _pianoModTabOk();
}
function _pianoSchedaRiservata(titolo, permesso) {
  return (
    '<div class="main-card"><div class="card-header">' +
    titolo +
    '</div><div style="padding:18px 20px;font-size:var(--fs-md,.875rem);line-height:1.6">' +
    '<p>Questa scheda e riservata. Serve il permesso <b>' +
    permesso +
    '</b>.</p>' +
    '<p style="color:var(--muted);font-size:var(--fs-md,.875rem);margin-top:8px">Lo assegna un amministratore da <b>Impostazioni · Visibilità e permessi</b>, scegliendo "Operatori selezionati" e aggiungendo il tuo nome.</p>' +
    '</div></div>'
  );
}
// GIORNI CHIUSI: passata la giornata di gioco (piu' il respiro fino all'ora
// limite del giorno dopo), il piano di quel giorno si modifica solo con uno
// sblocco motivato e tracciato. Permesso dedicato, assegnabile per nome.
// SCHEDE DEL PIANO personalizzabili (Impostazioni · Visibilita e permessi):
// ogni scheda puo' essere nascosta, visibile a tutti o a operatori scelti, e la
// modifica puo' essere ristretta separatamente (chi resta fuori vede in sola
// lettura). L'admin vede e modifica sempre; i permessi esistenti (gestione
// piano, regole, festivi...) continuano a valere IN AGGIUNTA.
function _pianoVisOk(chiave) {
  if (isAdmin()) return true;
  const v = typeof visGet === 'function' ? visGet(chiave) : 'tutti';
  if (v === 'nascosto' || v === 'admin') return false;
  if (v && typeof v === 'object' && v.tipo === 'selezionati')
    return !!(v.operatori && v.operatori.includes(getOperatore()));
  return true;
}
function pianoTabVisibile(id) {
  return _pianoVisOk('ptab_' + id);
}
function pianoTabModificabile(id) {
  return _pianoVisOk('ptabmod_' + id);
}
// La restrizione di modifica vale per le AZIONI fatte dentro la pagina Piano:
// le scritture di sistema (es. la malattia registrata dal Diario che si
// sincronizza nel piano) non c'entrano con la scheda aperta e passano.
function _pianoModTabOk() {
  if (isAdmin()) return true;
  const pg = document.querySelector('.page.active');
  if (pg && pg.id && pg.id !== 'page-piano') return true;
  return pianoTabModificabile(_pianoTab);
}
function puoSbloccareGiorniChiusi() {
  return isAdmin() || (typeof puoModificare === 'function' && puoModificare('sblocco_piano_chiuso'));
}
// Cella che coperture, scambi e ricerche NON devono usare: bloccata con
// motivo (visita medica, corso...) oppure il congedo del compleanno.
function _pianoCellaRiservata(r) {
  if (!r) return '';
  if (r.motivo_blocco) return r.motivo_blocco;
  if (
    String(r.commento || '')
      .trim()
      .toLowerCase() === 'compleanno'
  )
    return 'Compleanno';
  return '';
}
function _pianoGiornoBloccato(dstr) {
  return PianoRegole.giornoBloccato(dstr, new Date(), {
    attivo: String(_pianoRegolaVal('blocco_giorni_chiusi')).toUpperCase() !== 'FALSE',
    oraLimite: parseFloat(_pianoRegolaVal('blocco_ora_limite')) || 12,
  });
}
// giorni sbloccati in questa sessione: { 'YYYY-MM-DD': scadenza in ms }
let _pianoSbloccati = {};
function _pianoGiornoSbloccato(dstr) {
  const fino = _pianoSbloccati[dstr];
  if (!fino) return false;
  if (Date.now() > fino) {
    delete _pianoSbloccati[dstr];
    return false;
  }
  return true;
}
// Controllo unico prima di ogni scrittura sul piano. Ritorna true se si puo'
// procedere; se il giorno e' chiuso e l'operatore ha il permesso, chiede il
// motivo e sblocca per dieci minuti (tutto finisce nel registro).
// MESE CHIUSO: stesso principio dei giorni, applicato al saldo del mese.
// Passato il mese (piu' il respiro), il saldo di quel mese si corregge solo con
// motivo tracciato: e' un dato che finisce in busta paga.
function _pianoMeseBloccato(ym) {
  return PianoRegole.meseBloccato(ym, new Date(), {
    attivo: String(_pianoRegolaVal('blocco_giorni_chiusi')).toUpperCase() !== 'FALSE',
    oraLimite: parseFloat(_pianoRegolaVal('blocco_ora_limite')) || 12,
  });
}
async function _pianoConsentiSaldoMese(ym) {
  if (!_pianoMeseBloccato(ym)) return true;
  const chiave = 'mese-' + ym;
  if (_pianoGiornoSbloccato(chiave)) return true;
  const MESI = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const lbl = (MESI[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  if (!puoSbloccareGiorniChiusi()) {
    toast('Il mese di ' + lbl + ' e chiuso: per correggerlo serve il permesso "Giorni chiusi"');
    return false;
  }
  const motivo = await chiediTesto(
    'MESE CHIUSO \u00b7 ' +
      lbl +
      '\n\nIl saldo di un mese passato è un dato consolidato: si corregge solo con un motivo, che resta nel registro.\n\nScrivi il MOTIVO della correzione (obbligatorio):',
  );
  if (motivo === null || !String(motivo).trim()) {
    toast('Correzione annullata: senza motivo il mese resta chiuso');
    return false;
  }
  _pianoSbloccati[chiave] = Date.now() + 10 * 60 * 1000;
  logAzione('Mese chiuso sbloccato', ym + ': ' + String(motivo).trim().substring(0, 200));
  toast('Mese ' + lbl + ' sbloccato per 10 minuti');
  return true;
}
// controllo senza finestre: il giorno si puo scrivere adesso (aperto o gia sbloccato)?
function _pianoGiornoScrivibile(dstr) {
  return !dstr || !_pianoGiornoBloccato(dstr) || _pianoGiornoSbloccato(dstr);
}
async function _pianoConsentiScrittura(dstr, silenzioso) {
  if (!dstr || !_pianoGiornoBloccato(dstr)) return true;
  if (_pianoGiornoSbloccato(dstr)) return true;
  const dataIt = String(dstr).split('-').reverse().join('.');
  if (!puoSbloccareGiorniChiusi()) {
    if (!silenzioso) toast('Giornata del ' + dataIt + ' chiusa: per correggerla serve il permesso "Giorni chiusi"');
    return false;
  }
  if (silenzioso) return false;
  const motivo = await chiediTesto(
    'GIORNATA CHIUSA \u00b7 ' +
      dataIt +
      "\n\nIl piano dei giorni passati non si modifica più per distrazione: è un documento.\n\nScrivi il MOTIVO della correzione (obbligatorio, resta nel registro).\nIl giorno restera' sbloccato per dieci minuti:",
  );
  if (motivo === null || !String(motivo).trim()) {
    toast('Correzione annullata: senza motivo il giorno resta chiuso');
    return false;
  }
  _pianoSbloccati[dstr] = Date.now() + 10 * 60 * 1000;
  logAzione('Giorno chiuso sbloccato', dstr + ': ' + String(motivo).trim().substring(0, 200));
  toast('Giorno ' + dataIt + ' sbloccato per 10 minuti');
  return true;
}
// AZIONI AUTOMATICHE DEL PIANO (genera bozza, vacanze, CGF, migliora ore,
// cancella, importazioni): permessi appositi, oltre a poter modificare il piano. Cosi chi corregge le
// celle non lancia per sbaglio un azione che cambia tutto il mese. Il database
// blocca anche le cancellazioni a intervallo (migrazione 20260888).
// v356: quattro permessi invece di uno. Copiare e incollare il fabbisogno e
// esportare restano a chi modifica il piano.
const PIANO_AUTO_PERMESSI = {
  genera: 'piano_auto_genera', // genera bozza, solver, coperture, migliora ore, cancella la bozza
  vacanze: 'piano_auto_vacanze', // applica e importa vacanze, metti V, assegna CGF
  import: 'piano_auto_import', // importa piano, fabbisogno e timbrature da file
  cancella: 'piano_auto_cancella', // cancella il piano intero, tutte le vacanze, il fabbisogno, pulizia
  fabbisogno: 'piano_fabbisogno', // modificare il fabbisogno a mano (celle, incolla, copia dal mese prima)
  formazioni: 'piano_formazioni', // pianificare formazioni (proposte di cambi, applica, annulla, svolta)
};
const PIANO_AUTO_NOMI = {
  genera: 'Piano: preparare il mese (bozza)',
  vacanze: 'Piano: vacanze e CGF automatici',
  import: 'Piano: import da file',
  cancella: 'Piano: cancellazioni di massa',
  fabbisogno: 'Piano: modificare il fabbisogno',
  formazioni: 'Piano: pianificare formazioni',
};
// senza tipo: almeno una delle quattro
function puoAzioniAutoPiano(tipo) {
  if (isAdmin()) return true;
  if (!puoGestirePiano() || typeof puoModificare !== 'function') return false;
  if (!tipo) return Object.keys(PIANO_AUTO_PERMESSI).some((k) => puoModificare(PIANO_AUTO_PERMESSI[k]));
  return puoModificare(PIANO_AUTO_PERMESSI[tipo]);
}
function _pianoAzioneAutoConsentita(tipo) {
  if (puoAzioniAutoPiano(tipo)) return true;
  toast(
    'Serve il permesso ' +
      (PIANO_AUTO_NOMI[tipo] || 'azioni automatiche del piano') +
      ' (Impostazioni > Visibilità e permessi)',
  );
  return false;
}
function puoGestirePiano() {
  const base = typeof puoModificare === 'function' ? puoModificare('gestione_piano') : isAdmin();
  return base && _pianoModTabOk();
}
// BRIEFING: permesso separato dal piano · gli operatori possono compilare e
// modificare il foglio del giorno senza toccare la griglia dei turni
function puoGestireBriefing() {
  return (
    (puoGestirePiano() || (typeof puoModificare === 'function' && puoModificare('gestione_briefing'))) &&
    _pianoModTabOk()
  );
}

let pianoMappatureCache = [];
let pianoRegoleGruppoCache = [];
// regole attive per un gruppo (maiuscolo), port di eligibility.py
// regole "chi fa cosa" del settore aperto (turni_solo_funzioni, funzione_turni_giorni)
function _pianoRegoleTurnoFunzione() {
  return pianoRegoleGruppoCache.filter(
    (r) =>
      r.attivo !== false &&
      _repartoDi(r) === _pianoReparto() &&
      /^(turni_solo_funzioni|funzione_turni_giorni|livello_turni|turni_solo_collaboratori)$/.test(
        String(r.tipo_regola || '').toLowerCase(),
      ),
  );
}
// Funzioni che a mano possono fare qualsiasi turno (regola funzioni_fanno_tutto):
// il Supervisor copre anche i livelli sotto, come in Formazione
function _pianoFunzioniFannoTutto() {
  // senza regola vale il predefinito del catalogo (piano-config.js, PIANO_REGOLE_GUIDA)
  const v = _pianoRegolaVal('funzioni_fanno_tutto');
  const testo = v == null ? String(_pianoRegolaPredefinita('funzioni_fanno_tutto') || '') : String(v);
  return new Set(
    testo
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );
}
// motivo della violazione per 'nome' con il turno t nel giorno dow (JS, 0=dom), o null.
// automatica = true quando decide la bozza: li' le regole del settore valgono
// per tutti; a mano (scrittura, validatore, cambi) chi "fa tutto" passa.
// LIVELLO DI FORMAZIONE nel settore del piano (come in Formazione: L(n) = tutte le
// competenze di livello <= n certificate; Extra fuori dalla scala). null = il settore
// non ha competenze a livelli: le regole di livello non si applicano.
// COORDINATORI (regola di gruppo "coordinatori", v417, richiesta del titolare 08/10/2026):
// ogni giorno UN coordinatore di giorno (fra chi ha un turno di apertura, es. X1) e UNO di
// notte (fra chi ha un turno di chiusura, es. X3 o X4: vale quello che finisce piu tardi,
// quindi X4 venerdi e sabato, X3 negli altri giorni). Prima i collaboratori scelti nella
// regola, nel loro ordine; se quel giorno non ce n e nessuno, un altro di chi fa il turno
// (proposto, e Valida lo dice). Il coordinatore esce in rosso nel piano e nel briefing
// senza scrivere colori nelle celle: se le persone cambiano, il rosso le segue. Una cella
// di apertura o chiusura colorata a mano decide lei per quel giorno.
// Valore salvato: "X1|X3,X4|NOME COGNOME;NOME COGNOME" (giorno | notte | coordinatori).
function _pianoRegolaCoordinatori(rep) {
  rep = rep || _pianoReparto();
  const r = (pianoRegoleGruppoCache || []).find(
    (x) => x.attivo !== false && String(x.tipo_regola || '').toLowerCase() === 'coordinatori' && _repartoDi(x) === rep,
  );
  if (!r) return null;
  const [g, n, c] = String(r.valore || '').split('|');
  const lista = (s) =>
    String(s || '')
      .split(/[,;]/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
  return {
    giorno: lista(g),
    notte: lista(n),
    nomi: String(c || '')
      .split(';')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}
// colore del coordinatore: quello delle Evidenziazioni del briefing con "coord" nel
// significato (cosi sul foglio diventa il colore scelto li), altrimenti rosso
function _pianoColoreCoordinatore(rep) {
  try {
    const ev = typeof _briefEvidenziazioni === 'function' ? _briefEvidenziazioni(rep) : [];
    const x = (ev || []).find((e) => /coord/i.test(e.label || '') && e.da);
    if (x) return x.da;
  } catch (e) {}
  return '#FF6B6B';
}
// righe di un periodo -> { mappa: {'nome|data': 'giorno'|'notte'}, note: [{data, fascia, nome, sostituto}] }
function _pianoCoordinatoriDa(righe, rep) {
  rep = rep || _pianoReparto();
  const regola = _pianoRegolaCoordinatori(rep);
  const out = { mappa: {}, note: [] };
  if (!regola || (!regola.giorno.length && !regola.notte.length)) return out;
  const fineAbs = (cod) => {
    const t = _pianoTurnoInfo(cod);
    if (!t || !t.ora_fine) return 0;
    const f = _pianoOra(t.ora_fine);
    return f <= _pianoOra(t.ora_inizio) ? 24 + f : f;
  };
  const perData = {};
  (righe || []).forEach((r) => {
    if (!r || !r.codice) return;
    const d = String(r.data).substring(0, 10);
    (perData[d] = perData[d] || []).push(r);
  });
  const posto = (n) => {
    const i = regola.nomi.indexOf(String(n).toLowerCase());
    return i < 0 ? 999 : i;
  };
  Object.keys(perData)
    .sort()
    .forEach((d) => {
      [
        ['giorno', regola.giorno],
        ['notte', regola.notte],
      ].forEach(([fascia, codici]) => {
        if (!codici.length) return;
        let cand = perData[d].filter((r) => codici.includes(String(r.codice).toUpperCase()));
        if (!cand.length) return;
        // di notte vale solo il turno che finisce piu tardi quel giorno (X4 ven-sab, X3 gli altri)
        if (fascia === 'notte') {
          const max = Math.max(...cand.map((r) => fineAbs(r.codice)));
          cand = cand.filter((r) => fineAbs(r.codice) === max);
        }
        const aMano = cand.find((r) => r.colore);
        let scelto = aMano;
        if (!scelto) {
          const ordinati = cand.slice().sort((a, b) => posto(a.collaboratore) - posto(b.collaboratore));
          scelto = ordinati[0];
        }
        if (!aMano) out.mappa[scelto.collaboratore + '|' + d] = fascia;
        if (posto(scelto.collaboratore) === 999 && !aMano)
          out.note.push({ data: d, fascia: fascia, nome: scelto.collaboratore, sostituto: true });
      });
    });
  return out;
}
// colore con cui disegnare una cella: il suo, oppure quello del coordinatore
function _pianoColoreCella(r, mappaCoord) {
  if (!r) return '';
  if (r.colore) return r.colore;
  const m = mappaCoord || window._pianoCoordMappa || {};
  return m[r.collaboratore + '|' + String(r.data).substring(0, 10)] ? _pianoColoreCoordinatore(r.reparto_dip) : '';
}
// STORIA DEI GRUPPI per l idoneita delle PROPOSTE (cerca cambio, copertura malattia e
// ND, Migliora ore, copertura dal Diario). Per chi non ha settori ne competenze la
// bozza ammette solo i gruppi gia fatti (prima del mese e nel mese stesso); le proposte
// invece lo davano idoneo a tutto (es. un HOST nuovo proposto in cassa senza formazione).
// Ora la stessa regola: per settore, il primo giorno in cui ognuno ha fatto ogni gruppo.
const _pianoStoriaGruppiCache = {}; // reparto -> { quando, primo: { nome: { GRUPPO: 'YYYY-MM-DD' } } }
async function _pianoCaricaStoriaGruppi(rep) {
  rep = rep || _pianoReparto();
  const c = _pianoStoriaGruppiCache[rep];
  if (c && Date.now() - c.quando < 10 * 60000) return c.primo;
  const righe =
    (await secGet(
      'piano?reparto_dip=eq.' +
        encodeURIComponent(rep) +
        '&order=data.desc&limit=30000&select=collaboratore,codice,data',
    )) || [];
  const primo = {};
  righe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t || !t.gruppo) return;
    const g = String(t.gruppo).toUpperCase();
    const d = String(r.data).substring(0, 10);
    const per = (primo[r.collaboratore] = primo[r.collaboratore] || {});
    if (!per[g] || d < per[g]) per[g] = d;
  });
  _pianoStoriaGruppiCache[rep] = { quando: Date.now(), primo: primo };
  return primo;
}
// gruppi fatti da una persona fino alla fine del mese di dstr; null = storia non letta
// (allora vale la regola di prima: idoneo se non ha settori)
// solo il settore aperto (o quello indicato), come la bozza: prima si univano tutti i
// settori gia letti e un area con lo stesso nome in un altro settore valeva anche qui
function _pianoStoriaGruppiDi(nome, dstr, rep) {
  const c = _pianoStoriaGruppiCache[rep || _pianoReparto()];
  if (!c) return null;
  const ym = String(dstr || _pianoMeseSel || '').substring(0, 7);
  const fine = ym ? ym + '-31' : '9999-12-31';
  const per = c.primo[nome] || {};
  return new Set(Object.keys(per).filter((g) => per[g] <= fine));
}
// IDONEITA: contesto comune del motore unico (PianoRegole.idoneita) per bozza, proposte,
// scrittura a mano e "Chi puo fare cosa". extra: dow, storiaDi, modo, coperturaDi...
function _pianoCtxIdoneita(extra) {
  return Object.assign(
    {
      settoriDi: (i) => _pianoSettoriEffettivi(i),
      regoleGruppoDi: (gr) => _pianoRegoleGruppoDi(gr),
      campoOk: (i, v) => _pianoCampoOk(i, v),
      mappFunzione: (fz) => _pianoMappFunzione(fz),
      regoleTurnoFunzione: () => _pianoRegoleTurnoFunzione(),
      livelloDi: (i) => _pianoLivelloNelSettore(i),
      fannoTutto: (fz) => _pianoFunzioniFannoTutto().has(fz),
      accompagnamentoDi: (i) => _pianoAccompagnamentoDi(i),
    },
    extra || {},
  );
}
// LIVELLO PER IL PIANO = gradino piu alto certificato nella scala del settore (anche se
// mancano gradini sotto: chi arriva da un altro casino e va subito in cassa e formato in
// cassa). Unico punto da cui livello_turni, minimo_livello_giorno, equilibrio_livelli,
// chi fa cosa e le metriche leggono il livello. null = il settore non ha scala.
function _pianoLivelloNelSettore(info, rep) {
  const s = _pianoScalaDi(info, rep);
  return s ? s.effettivo : null;
}
// livello COMPLETO (tutti i gradini sotto certificati): solo per incentivi e passaggi di
// livello (punti, premi, Storico HR), mai per il Piano
function _pianoLivelloCompletoNelSettore(info, rep) {
  const s = _pianoScalaDi(info, rep);
  return s ? s.completo : null;
}
function _pianoScalaDi(info, rep) {
  if (!info || typeof getCompetenzeConfigAll !== 'function') return null;
  return PianoRegole.livelloScala(getCompetenzeConfigAll()[rep || _pianoReparto()] || [], info.competenze);
}
// "L3" o "3" -> 3 (livello minimo nelle regole di livello)
function _pianoLivelloDaTesto(v) {
  const n = parseInt(String(v || '').replace(/^L/i, ''));
  return n > 0 ? n : 0;
}
function _pianoViolazioneFunzioneTurno(nome, t, dow, automatica) {
  const info = _pianoCollabInfo(nome) || {};
  const fz = String(info.funzione || '').toUpperCase();
  if (!automatica && fz && _pianoFunzioniFannoTutto().has(fz)) return null;
  const infoS = Object.assign({}, info, {
    _settori: _pianoSettoriEffettivi(info) || [],
    _livello: _pianoLivelloNelSettore(info),
  });
  return PianoRegole.violazioneFunzioneTurno(infoS, t, dow, _pianoRegoleTurnoFunzione());
}
function _pianoRegoleGruppoDi(gruppo) {
  const g = (gruppo || '').toUpperCase();
  return pianoRegoleGruppoCache.filter(
    (r) => r.attivo !== false && (r.gruppo || '').toUpperCase() === g && _repartoDi(r) === _pianoReparto(),
  );
}
// Competenze certificate in Formazione -> gruppi del piano.
// Mappatura personalizzabile (imp 'piano_competenze_gruppi'); default per
// le competenze standard dei reparti.
const _COMPETENZE_GRUPPI_DEFAULT = {
  sala: 'SALA',
  reception: 'REC',
  cassa: 'CASSA',
  bo: 'BO',
  sup: 'SUP',
  // Tavoli e Valet: i loro turni hanno un solo gruppo (TAVOLI, VALET). Prima i Tavoli
  // puntavano a SALA e CASSA e il Valet ad ACCOGLIENZA, gruppi delle Slots: chi aveva
  // le competenze certificate risultava non idoneo ai turni del proprio settore.
  croupier: 'TAVOLI',
  ispettore: 'TAVOLI',
  cassa_tavoli: 'TAVOLI',
  valet_servizio: 'VALET',
  valet_accoglienza: 'VALET',
};
// SETTORE NUOVO CON UN SOLO GRUPPO DI TURNI: le sue competenze di Formazione senza
// collegamento (ne predefinito ne scelto in Piano > Impostazioni) aprono quell unico
// gruppo. I settori che esistevano gia restano come sono (ai Tavoli, per esempio, le
// competenze non collegate lasciano decidere i Settori della persona e la storia dei
// turni): per loro i collegamenti si scelgono a mano. Le competenze rimaste scollegate
// le elenca _pianoCompetenzeScollegate (avviso in Formazione).
const _PIANO_SETTORI_COLLEGAMENTI_A_MANO = ['slots', 'tavoli', 'valet', 'cleaning'];
function _pianoCompetenzeGruppoUnico() {
  const out = {};
  const tutte = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {};
  Object.keys(tutte || {}).forEach((rep) => {
    if (_PIANO_SETTORI_COLLEGAMENTI_A_MANO.includes(rep)) return;
    const gruppi = [
      ...new Set(
        (pianoTurniCache || [])
          .filter((t) => t.attivo !== false && _repartoDi(t) === rep)
          .map((t) => String(t.gruppo || '').toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (gruppi.length !== 1) return;
    (tutte[rep] || []).forEach((k) => {
      if (k && k.key) out[k.key] = gruppi[0];
    });
  });
  return out;
}
function _pianoCompetenzeGruppiGrezze() {
  const cfg = window._pianoCompGruppiCfg;
  return Object.assign(
    {},
    _pianoCompetenzeGruppoUnico(),
    _COMPETENZE_GRUPPI_DEFAULT,
    cfg && typeof cfg === 'object' ? cfg : {},
  );
}
// COMPETENZE SCOLLEGATE di un settore: quelle della scala di Formazione (livello 1 o piu)
// che non aprono nessun gruppo di turni del settore, quindi non abilitano a nessun turno.
// Per l avviso in Formazione: _pianoCompetenzeScollegate(rep) -> [{ key, label }]
// (vuoto = tutto collegato). Si collegano in Piano > Impostazioni, competenze e gruppi.
function _pianoCompetenzeScollegate(rep) {
  const tutte = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {};
  const mappa = _pianoCompetenzeGruppi();
  return ((tutte || {})[rep] || [])
    .filter((k) => k && k.key && (parseInt(k.livello) || 0) >= 1 && !mappa[k.key])
    .map((k) => ({ key: k.key, label: k.label || k.key }));
}
// Un collegamento vale solo se il gruppo esiste fra i turni del settore a cui la
// competenza appartiene in Formazione (es. Croupier dei Tavoli -> TAVOLI). Un gruppo di
// un altro settore (Croupier -> SALA delle Slots) non conta: la persona resta come se
// la competenza non fosse collegata (settori assegnati o storia dei turni).
function _pianoCollegamentoValido(chiave, gruppo) {
  const g = String(gruppo || '').toUpperCase();
  if (!g) return false;
  const tutte = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {};
  const reps = Object.keys(tutte).filter((r) => (tutte[r] || []).some((k) => k.key === chiave));
  if (!reps.length) return true; // competenza non configurata: si lascia com e
  return pianoTurniCache.some(
    (t) => t.attivo !== false && reps.includes(_repartoDi(t)) && (t.gruppo || '').toUpperCase() === g,
  );
}
// in memoria finche non cambiano collegamenti, turni o competenze (la bozza la chiama
// per ogni candidato)
let _pianoCompGruppiMemo = null;
function _pianoCompetenzeGruppi() {
  const grezze = _pianoCompetenzeGruppiGrezze();
  if (!pianoTurniCache.length) return grezze;
  const comp = typeof competenzeConfig !== 'undefined' ? competenzeConfig : null;
  const m = _pianoCompGruppiMemo;
  if (
    m &&
    m.cfg === window._pianoCompGruppiCfg &&
    m.turni === pianoTurniCache &&
    m.nTurni === pianoTurniCache.length &&
    m.comp === comp
  )
    return m.out;
  const out = {};
  Object.keys(grezze).forEach((k) => (out[k] = _pianoCollegamentoValido(k, grezze[k]) ? grezze[k] : ''));
  _pianoCompGruppiMemo = {
    cfg: window._pianoCompGruppiCfg,
    turni: pianoTurniCache,
    nTurni: pianoTurniCache.length,
    comp: comp,
    out: out,
  };
  return out;
}
// Settori EFFETTIVI: settori assegnati (fonte di verità, M2M Turnivo) +
// gruppi sbloccati dalle competenze CERTIFICATE in Formazione.
// null = nessuna configurazione (si usa la storia dei turni).
function _pianoSettoriEffettivi(info) {
  if (!info) return null;
  let base = info.settori_piano
    ? info.settori_piano
        .toUpperCase()
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const mappa = _pianoCompetenzeGruppi();
  const comp = info.competenze || {};
  const chiaviMappate = Object.keys(mappa).filter((k) => mappa[k]);
  const haFormazione = chiaviMappate.some((k) => comp[k] === true);
  if (haFormazione) {
    // La FORMAZIONE comanda sui gruppi collegati: spunta = idoneo, senza
    // spunta = escluso (es. tolto dalla cassa). I settori importati restano
    // validi solo per i gruppi NON collegati a una competenza.
    const gruppiMappati = [...new Set(chiaviMappate.map((k) => mappa[k].toUpperCase()))];
    base = base.filter((g) => !gruppiMappati.includes(g));
    chiaviMappate.forEach((k) => {
      if (comp[k] === true && !base.includes(mappa[k].toUpperCase())) base.push(mappa[k].toUpperCase());
    });
  }
  return base.length || info.settori_piano != null ? base : null;
}
function _pianoCampoOk(info, valore) {
  // REQUISITO SULLA SCHEDA (regola richiede_campo): 'campo OPERATORE valore', per esempio
  // accoglienza>0, categoria>=3, lingue=EN, impiego!=jolly. true = il collaboratore PASSA.
  // Il nome del campo vale senza maiuscole/minuscole: il modulo salva la regola in
  // maiuscolo (ACCOGLIENZA>0) e prima il campo non si trovava, valeva 0 e il gruppo si
  // chiudeva a tutti. Tutti i confronti offerti dal modulo funzionano (prima solo > e >=:
  // gli altri passavano sempre). Controllo del 09/10/2026.
  const m = String(valore || '')
    .trim()
    .match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|>|<|=)\s*(.*)$/);
  if (!m) return true;
  const chiave = Object.keys(info || {}).find((k) => k.toLowerCase() === m[1].toLowerCase());
  const grezzo = chiave ? info[chiave] : null;
  const op = m[2];
  const atteso = m[3].trim();
  const nA = parseFloat(String(atteso).replace(',', '.'));
  // confronto numerico quando il valore richiesto e un numero (campo vuoto = 0)
  if (!isNaN(nA) && /^-?\d+([.,]\d+)?$/.test(atteso)) {
    const v = parseFloat(String(grezzo == null ? '' : grezzo).replace(',', '.')) || 0;
    if (op === '>=') return v >= nA;
    if (op === '>') return v > nA;
    if (op === '<=') return v <= nA;
    if (op === '<') return v < nA;
    if (op === '=') return v === nA;
    return v !== nA;
  }
  // testo: uguale o diverso, senza maiuscole; un campo con piu valori (lingue "IT, EN")
  // e uguale se contiene il valore richiesto
  const voci = String(grezzo == null ? '' : grezzo)
    .split(/[,;/]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const c = voci.includes(atteso.toLowerCase());
  if (op === '=') return c;
  if (op === '!=') return !c;
  return true; // > e < su un testo non hanno senso: non si blocca nessuno
}
let _pianoOreSett = 41; // ore settimanali contratto (imp 'piano_ore_settimanali')
async function _pianoCaricaCfg() {
  if (_pianoCfgCaricata) return;
  const [
    turni,
    codici,
    festivi,
    regole,
    mappature,
    oreSett,
    funzioni,
    ordineCollab,
    regoleGruppo,
    compGruppi,
    maxCambi,
    giorniWk,
    giornoMarker,
    corsiOrari,
    ggFormazione,
    cdConfig,
    evidCfg,
    solverUrl,
    fonteCfg,
  ] = await Promise.all([
    secGet('piano_turni?order=ordine.asc&limit=500'),
    secGet('piano_codici?order=codice.asc&limit=200'),
    secGet('piano_festivi?order=data.asc&limit=200'),
    secGet('piano_regole?order=id.asc&limit=200'),
    secGet('piano_mappature?order=funzione.asc&limit=500'),
    getImp('piano_ore_settimanali'),
    getImp('piano_funzioni'),
    getImp('piano_ordine_collab'),
    secGet('piano_regole_gruppo?order=gruppo.asc,id.asc&limit=200'),
    getImp('piano_competenze_gruppi'),
    getImp('piano_max_cambi_mese'),
    getImp('piano_giorni_weekend'),
    getImp('piano_giorno_marker'),
    getImp('piano_corsi_orari'),
    getImp('piano_giorni_formazione'),
    getImp('piano_cd_config'),
    getImp('brief_evidenziazioni'),
    getImp('piano_solver_url'),
    getImp('piano_regole_fonte'),
  ]);
  // riferimenti normativi delle regole cambiati dall amministratore (piano-config.js)
  try {
    window._pianoRegoleFonteCfg = fonteCfg ? JSON.parse(fonteCfg) || {} : {};
  } catch (e) {
    window._pianoRegoleFonteCfg = {};
  }
  pianoRegoleGruppoCache = regoleGruppo || [];
  try {
    window._pianoCompGruppiCfg = compGruppi ? JSON.parse(compGruppi) : null;
  } catch (e) {
    window._pianoCompGruppiCfg = null;
  }
  try {
    window._briefEvidCfg = evidCfg ? JSON.parse(evidCfg) : {};
  } catch (e) {
    window._briefEvidCfg = {};
  }
  window._pianoMaxCambiCfg = parseInt(maxCambi) || 0;
  window._pianoSolverUrl = (solverUrl || '').trim(); // motore esterno (server interno), vuoto = non collegato
  try {
    window._pianoWeekendCfg = giorniWk ? JSON.parse(giorniWk) : null;
  } catch (e) {
    window._pianoWeekendCfg = null;
  }
  try {
    window._pianoGiornoMarker = giornoMarker ? JSON.parse(giornoMarker) : {};
  } catch (e) {
    window._pianoGiornoMarker = {};
  }
  try {
    window._pianoCorsiOrari = corsiOrari ? JSON.parse(corsiOrari) : {};
  } catch (e) {
    window._pianoCorsiOrari = {};
  }
  if (!window._pianoCorsiOrari.CS) window._pianoCorsiOrari.CS = '14:30-17:30';
  // lista CORSI personalizzabile (admin): solo queste sigle appaiono nel
  // pianificatore corsi; gli altri codici restano codici normali
  try {
    const cl = await getImp('piano_corsi_lista');
    window._pianoCorsiLista = cl
      ? cl
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean)
      : ['CS', 'LRD', 'ANTINCENDIO'];
  } catch (e) {
    window._pianoCorsiLista = ['CS', 'LRD', 'ANTINCENDIO'];
  }
  window._pianoGgFormazione = parseInt(ggFormazione) || 5;
  try {
    window._pianoCdCfg = cdConfig ? JSON.parse(cdConfig) : null;
  } catch (e) {
    window._pianoCdCfg = null;
  }
  if (!window._pianoCdCfg || !Array.isArray(window._pianoCdCfg.coppie))
    window._pianoCdCfg = {
      coppie: [
        { cd: ['2', '7'], apre: 'C0', chiude: 'C5' },
        { cd: ['3', '4'], apre: 'C23', chiude: 'C20' },
        { cd: ['8', '9'], apre: 'C4', chiude: 'C15' },
      ],
    };
  if (!window._pianoCorsiOrari.LRD) window._pianoCorsiOrari.LRD = '';
  try {
    window._pianoOrdineCollab = ordineCollab ? JSON.parse(ordineCollab) : {};
  } catch (e) {
    window._pianoOrdineCollab = {};
  }
  pianoTurniCache = turni || [];
  pianoCodiciCache = codici || [];
  pianoFestiviCache = festivi || [];
  pianoRegoleCache = regole || [];
  pianoMappatureCache = mappature || [];
  try {
    _pianoCongediNp = (await secGet('collab_congedi_np?order=dal.desc')) || [];
  } catch (e) {
    _pianoCongediNp = [];
  }
  _pianoOreSett = parseFloat(oreSett) || 41;
  // analisi dell organico: attiva salvo che l amministratore l abbia spenta
  try {
    window._organicoAttivo = (await getImp('piano_organico_attivo')) !== 'false';
  } catch (e) {
    window._organicoAttivo = true;
  }
  try {
    window._pianoFunzioni = funzioni ? JSON.parse(funzioni) : null;
  } catch (e) {}
  // nomi per esteso delle funzioni (Piano › Impostazioni › Funzioni del settore)
  try {
    window._pianoFunzioniNomi = JSON.parse((await getImp('piano_funzioni_nomi')) || '{}') || {};
  } catch (e) {
    window._pianoFunzioniNomi = window._pianoFunzioniNomi || {};
  }
  // elenco (formato di prima, vale per le Slot) oppure oggetto per settore
  const fzCfg = window._pianoFunzioni;
  const fzOggetto = fzCfg && typeof fzCfg === 'object' && !Array.isArray(fzCfg);
  if (!fzOggetto && (!Array.isArray(fzCfg) || !fzCfg.length))
    window._pianoFunzioni = _PIANO_FUNZIONI_SLOTS_PREDEFINITE.slice();
  _pianoCfgCaricata = true;
}
// funzioni predefinite quando l impostazione piano_funzioni manca: e il formato di prima
// (un elenco), che vale solo per le Slots. Ogni altro settore, anche nuovo, parte
// dall elenco vuoto piu le funzioni che i suoi collaboratori hanno gia (_pianoFunzioniDi)
const _PIANO_FUNZIONI_SLOTS_PREDEFINITE = ['RESP', 'SUP', 'BO', 'HOST'];
// NOME PER ESTESO DI UNA FUNZIONE: quello scritto in Funzioni del settore, altrimenti i nomi
// noti; soloScritto = true restituisce vuoto se non c e un nome (per la casella da compilare)
const _PIANO_FUNZIONI_NOMI_NOTI = {
  RESP: 'Responsabile',
  SUP: 'Supervisore',
  BO: 'Back Office',
  HOST: 'Host',
  CR: 'Croupier',
  ISP: 'Ispettore',
};
function funzioneNomeEsteso(sigla, soloScritto) {
  const f = String(sigla || '').toUpperCase();
  const scritto = (window._pianoFunzioniNomi || {})[f];
  if (scritto) return scritto;
  return _PIANO_FUNZIONI_NOMI_NOTI[f] || (soloScritto ? '' : '');
}
// COLORE DELLA RIGA PER FUNZIONE nel calendario: SUP verdino e BO arancio chiaro come
// sempre (Turnivo); un altra funzione che ha un gruppo di turni con lo stesso nome nel
// settore (per esempio in un settore nuovo) prende il colore di quel gruppo, se ne ha uno.
function _pianoRigaFunzioneAttr(infoC) {
  const fz = String((infoC && infoC.funzione) || '');
  if (fz === 'SUP') return ' class="piano-row-sup"';
  if (fz === 'BO') return ' class="piano-row-bo"';
  if (!fz) return '';
  const rep = _pianoReparto();
  const t = (pianoTurniCache || []).find(
    (x) =>
      x.attivo !== false &&
      _repartoDi(x) === rep &&
      String(x.gruppo || '').toUpperCase() === fz.toUpperCase() &&
      /^#[0-9a-f]{3,8}$/i.test(String(x.colore || '').trim()),
  );
  return t ? ' class="piano-row-gruppo" style="--riga-col:' + String(t.colore).trim() + '"' : '';
}
// FUNZIONI DISPONIBILI PER SETTORE (v427, segnalazione del titolare: nei Tavoli i menu
// mostravano le funzioni delle Slot e non CR, DI). L impostazione piano_funzioni e un
// oggetto { slots: [...], tavoli: [...] }; il formato di prima (un elenco) vale per le
// Slot. A ogni settore si aggiungono le funzioni che i suoi collaboratori hanno gia,
// cosi nessun menu perde la funzione di qualcuno.
function _pianoFunzioniConfig(rep) {
  const cfg = window._pianoFunzioni;
  let lista = [];
  if (Array.isArray(cfg)) lista = rep === 'slots' ? cfg : [];
  else if (cfg && typeof cfg === 'object') lista = Array.isArray(cfg[rep]) ? cfg[rep] : [];
  return lista.map((f) => String(f).toUpperCase()).filter(Boolean);
}
function _pianoFunzioniDi(rep) {
  rep = rep || (typeof _pianoReparto === 'function' ? _pianoReparto() : 'slots');
  const out = _pianoFunzioniConfig(rep);
  (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : [])
    .filter((c) => c.attivo !== false && _repartoDi(c) === rep && c.funzione)
    .forEach((c) => {
      const f = String(c.funzione).toUpperCase();
      if (!out.includes(f)) out.push(f);
    });
  return out;
}
// tutte le funzioni di tutti i settori (controlli che valgono per l intero programma)
function _pianoFunzioniTutte() {
  const out = new Set();
  const cfg = window._pianoFunzioni;
  if (Array.isArray(cfg)) cfg.forEach((f) => out.add(String(f).toUpperCase()));
  else if (cfg && typeof cfg === 'object')
    Object.values(cfg).forEach((l) => (Array.isArray(l) ? l : []).forEach((f) => out.add(String(f).toUpperCase())));
  (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : []).forEach(
    (c) => c.funzione && out.add(String(c.funzione).toUpperCase()),
  );
  return [...out];
}
// mappature del SETTORE aperto: ogni settore ha le sue sigle
function _pianoMappFunzione(funzione, rep) {
  if (!funzione) return null;
  const settore = rep || _pianoReparto();
  const m = pianoMappatureCache.filter((x) => x.funzione === funzione && _repartoDi(x) === settore);
  return m.length ? m : null;
}
// multi-reparto: appartiene al reparto corrente se è il suo principale
// oppure se elencato nei suoi "reparti extra" (es. valet che fa anche slots)
// Condizioni di copertura in un settore che NON e' il suo (impostate in
// Gestione collaboratori): tetto mensile di turni, gruppi ammessi, accompagnato
function _pianoCoperturaCfg(info, rep) {
  const r = rep || _pianoReparto();
  if (!info || _repartoDi(info) === r) return null;
  let o = info.copertura_reparti;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch (e) {
      o = null;
    }
  }
  return (o && o[r]) || {};
}
function _pianoAppartieneAlReparto(c, rep) {
  const r = rep || _pianoReparto();
  if (_repartoDi(c) === r) return true;
  return String(c.reparti_extra || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .includes(r);
}
// accompagnamento_settori: accetta CSV ("REC") e vecchio JSON (["REC"])
function _pianoAccompagnamentoDi(info) {
  const raw = info && info.accompagnamento_settori;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim().toUpperCase());
  const str = String(raw).trim();
  if (str.startsWith('[')) {
    try {
      return JSON.parse(str).map((x) => String(x).trim().toUpperCase());
    } catch (e) {}
  }
  return str
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}
// loadAll tiene in memoria solo i collaboratori ATTIVI: per distinguere
// "non attivo" da "non esiste" si tiene un elenco leggero dei disattivati
async function _pianoCaricaInattivi() {
  if (window._collabInattivi) return;
  window._collabInattivi = [];
  try {
    window._collabInattivi = (await secGet('collaboratori?attivo=eq.false&select=nome,reparto_dip')) || [];
  } catch (e) {}
}
function _pianoInattivoInfo(nome) {
  return (window._collabInattivi || []).find((c) => (c.nome || '').toLowerCase() === nome.toLowerCase());
}
// CGF = riposo compensativo per i festivi (RAP 4.3): spetta al personale
// d'esercizio FISSO. Il personale ausiliario (jolly) non lo matura: per il
// RAP Allegato 1 prende il supplemento del 50% sul salario orario.
function _pianoMaturaCgf(info) {
  if (!info) return false;
  if (info.impiego === 'jolly') return false;
  if (info.impiego === 'fisso') return true;
  return !info.is_jolly; // schede senza impiego indicato: vale il vecchio campo
}
function _pianoCollabInfo(nome) {
  return collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
}

function _pianoTurniReparto() {
  return pianoTurniCache.filter((t) => t.attivo !== false && _repartoDi(t) === _pianoReparto());
}
// SETTORE DEL TURNO di una cella: la sigla dice di quale settore e il posto
// coperto, qualunque foglio l abbia scritta (Balliu e Papa al Valet con R22/R23,
// che sono turni della Reception Slots). Stessa regola del briefing: se la sigla
// esiste nel settore della riga vale quello (es. "9" in Slots e in Tavoli),
// altrimenti il settore aperto se la conosce, altrimenti l unico che la conosce.
// Celle senza turno (C, V, M...) restano al settore della riga.
function _pianoSettoreTurno(r, repAperto) {
  const qui = repAperto || _pianoReparto();
  const repRiga = (r && r.reparto_dip) || 'slots';
  const cod = r && r.codice;
  const settori = new Set(
    (pianoTurniCache || []).filter((t) => t.attivo !== false && t.codice === cod).map((t) => _repartoDi(t)),
  );
  if (!settori.size || settori.has(repRiga)) return repRiga;
  if (settori.has(qui)) return qui;
  return settori.size === 1 ? [...settori][0] : repRiga;
}
// la cella copre un posto del settore aperto?
function _pianoCopreQui(r, repAperto) {
  const qui = repAperto || _pianoReparto();
  return _pianoSettoreTurno(r, qui) === qui;
}
// Definizione del turno di una RIGA: quella del settore a cui il turno appartiene
// (oggi solo "9" ha due orari: Slots 06-14, Tavoli 21-05). Tutti i settori leggono
// ore e orari di tutti i turni del casino.
function _pianoTurnoInfoRiga(r) {
  if (!r || !r.codice) return null;
  const s = _pianoSettoreTurno(r);
  return (
    (pianoTurniCache || []).find((t) => t.attivo !== false && t.codice === r.codice && _repartoDi(t) === s) ||
    _pianoTurnoInfo(r.codice)
  );
}
function _pianoTurnoInfo(codice) {
  return _pianoTurniReparto().find((t) => t.codice === codice) || pianoTurniCache.find((t) => t.codice === codice);
}
function _pianoCodiceInfo(codice) {
  return pianoCodiciCache.find((c) => c.codice === codice);
}
// Giorni in cui una certa sigla e' presente nel piano: { 'Z12': {'2026-09-11':1} }.
// Si riempie con le righe che vengono caricate, cosi' vale anche per i mesi che
// il saldo annuale e le statistiche attraversano.
let _pianoGiorniConTurno = {};
function _pianoRegistraGiorniTurno(righe) {
  const sigle = (pianoTurniCache || []).map((t) => t.prolunga_se_turno).filter(Boolean);
  if (!sigle.length || !righe || !righe.length) return;
  const cerca = new Set(sigle.map((x) => String(x).toUpperCase()));
  righe.forEach((r) => {
    const cod = String(r.codice || '').toUpperCase();
    if (!cerca.has(cod)) return;
    if (!_pianoGiorniConTurno[cod]) _pianoGiorniConTurno[cod] = {};
    _pianoGiorniConTurno[cod][String(r.data).substring(0, 10)] = 1;
  });
}
function _pianoTurnoPresenteIlGiorno(codice, dstr) {
  if (!codice || !dstr) return false;
  const m = _pianoGiorniConTurno[String(codice).toUpperCase()];
  return !!(m && m[dstr]);
}
// GIORNI DI CHIUSURA TARDI: venerdi e sabato per prassi, le vigilie di
// festivita' e il 31 dicembre. Sono i giorni in cui alcuni turni finiscono piu'
// tardi (es. Z0 alle 20:30 invece che alle 19:45).
function _pianoGiornoChiusuraTardi(dstr) {
  if (!dstr) return false;
  try {
    const cfg = _pianoChiusuraCfg();
    return _pianoChiusuraGiorno(dstr).ora > cfg.oraNormale;
  } catch (e) {
    return false;
  }
}
// Orario e durata EFFETTIVI di un turno in un dato giorno: se il turno ha un
// orario prolungato e quel giorno si chiude tardi, valgono quelli.
function _pianoTurnoDelGiorno(t, dstr) {
  if (!t) return null;
  const base = {
    ora_inizio: t.ora_inizio,
    ora_fine: t.ora_fine,
    durata: parseFloat(t.durata_ore) || 0,
    prolungato: false,
    oltre23: t.oltre23,
    tipo: t.tipo,
  };
  // due criteri, uno solo basta: il giorno chiude tardi, oppure nel piano di
  // quel giorno c'e' il turno che da' il cambio (es. Z12 per Z0)
  const siProlunga =
    !!t.ora_fine_tardi && (_pianoGiornoChiusuraTardi(dstr) || _pianoTurnoPresenteIlGiorno(t.prolunga_se_turno, dstr));
  if (!siProlunga) return base;
  const durataTardi =
    t.durata_ore_tardi != null && t.durata_ore_tardi !== ''
      ? parseFloat(t.durata_ore_tardi)
      : (() => {
          // senza durata scritta si somma la differenza fra i due orari di fine,
          // cosi' resta dentro qualunque correzione gia' presente nella durata
          const f1 = _pianoOra(t.ora_fine);
          const f2 = _pianoOra(t.ora_fine_tardi);
          if (f1 == null || f2 == null) return base.durata;
          const extra = f2 >= f1 ? f2 - f1 : 24 + f2 - f1;
          return Math.round((base.durata + extra) * 100) / 100;
        })();
  return {
    ora_inizio: t.ora_inizio,
    ora_fine: t.ora_fine_tardi,
    durata: durataTardi,
    prolungato: true,
    oltre23: t.oltre23,
    tipo: t.tipo,
  };
}
// ORE DI UN GIORNO DI MALATTIA (regola del titolare, 30.09.2026). Malattia CONTINUA =
// giorni di calendario uno dopo l altro con malattia (Diario o M nel piano); un
// prolungamento attaccato e la stessa malattia; un giorno senza malattia in mezzo,
// anche un riposo, la interrompe e il conteggio riparte.
//  - dal 1. al 14. giorno: le ore del turno che la persona aveva quel giorno (da
//    orologio, MAI con il 10% notturno); un riposo (C) vale 0 ore (MC) ma conta
//    come giorno; una vacanza (V) vale le ore della V e la vacanza torna da
//    recuperare; senza la sigla coperta si usa il valore del codice M;
//  - dal 15. giorno: 41 ore settimanali / 7 = 5.857 ore per OGNI giorno di
//    calendario, che lavorasse o no (per la percentuale se il codice M la usa).
const PIANO_MALATTIA_GIORNI_TURNO = 14;
const PIANO_MALATTIA_ORE_GIORNO = 41 / 7;
let _pianoMalMemo = { t: 0, giorni: {} };
// M del piano di tutto l anno del settore (anche i mesi non aperti e le M importate
// dall Excel senza registrazione nel Diario): 'nome minuscolo' -> Set di date
let _pianoMalCelle = {};
let _pianoMalCelleChiave = '';
async function _pianoCaricaMalattieAnno(anno, rep) {
  rep = rep || _pianoReparto();
  const chiave = anno + '|' + rep;
  const da = anno - 1 + '-12-01';
  const a = anno + '-12-31';
  const righe = [];
  const lette = await Promise.all(
    ['M', 'M1'].map((cod) =>
      secGet('piano?codice=eq.' + cod + '&data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + rep + '').catch(
        () => [],
      ),
    ),
  );
  lette.forEach((l) => (l || []).forEach((r) => righe.push(r)));
  const celle = {};
  righe.forEach((r) => {
    const k = String(r.collaboratore || '').toLowerCase();
    (celle[k] = celle[k] || new Set()).add(String(r.data).substring(0, 10));
  });
  _pianoMalCelle = celle;
  _pianoMalCelleChiave = chiave;
  _pianoMalMemo = { t: 0, giorni: {} };
}
function _pianoGiorniMalattiaDi(nome) {
  const ora = Date.now();
  if (ora - _pianoMalMemo.t > 1500) _pianoMalMemo = { t: ora, giorni: {} };
  const k = String(nome || '').toLowerCase();
  if (_pianoMalMemo.giorni[k]) return _pianoMalMemo.giorni[k];
  const set = new Set();
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.eliminato || e.tipo !== tipoMal || String(e.nome || '').toLowerCase() !== k) return;
    _pianoDateMalattia(e.testo || '', e.data).forEach((d) => set.add(d));
  });
  (typeof _pianoRighe !== 'undefined' ? _pianoRighe : []).forEach((r) => {
    if ((r.codice === 'M' || r.codice === 'M1') && String(r.collaboratore || '').toLowerCase() === k)
      set.add(String(r.data).substring(0, 10));
  });
  (_pianoMalCelle[k] || new Set()).forEach((d) => set.add(d));
  _pianoMalMemo.giorni[k] = set;
  return set;
}
// giorno numero quanti della malattia continua (0 se quel giorno non e malattia)
function _pianoGiornoDiMalattia(nome, dstr) {
  const set = _pianoGiorniMalattiaDi(nome);
  if (!set.has(dstr)) return 0;
  let n = 0;
  const d = new Date(dstr + 'T12:00:00');
  while (n < 400 && set.has(d.toISOString().substring(0, 10))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function _pianoOreMalattiaLunga(info) {
  const cs = _pianoCodiceInfo('M');
  const jolly = !!(info && (info.is_jolly || info.impiego === 'jolly'));
  const pct = cs && cs.scala_percentuale && !jolly ? parseFloat(info && info.percentuale) || 1 : 1;
  return Math.round(PIANO_MALATTIA_ORE_GIORNO * pct * 1000) / 1000;
}
// COM ERA LA CELLA SOTTO LA MALATTIA (colonna prima_malattia, migrazione 20260912): chi
// scrive la M conserva sigla, protetto, generato, nota e blocco della cella; togliendo la
// malattia la cella torna tale e quale (una cella della bozza resta della bozza: la
// generazione automatica e Migliora la possono ancora spostare)
function _pianoPrimaMalattiaDi(r) {
  return {
    codice: r.codice,
    protetto: !!r.protetto,
    generato: !!r.generato,
    commento: r.commento || null,
    motivo_blocco: r.motivo_blocco || null,
  };
}
// i dati per riportare la cella r (M o ND con la nota "Ex <sigla>") alla sigla di prima
function _pianoRitornoDaMalattia(r, sigla) {
  const pm = r && r.prima_malattia;
  if (pm && typeof pm === 'object' && pm.codice === sigla)
    return {
      codice: sigla,
      protetto: !!pm.protetto,
      generato: !!pm.generato,
      commento: pm.commento || null,
      motivo_blocco: pm.motivo_blocco || null,
      prima_malattia: null,
    };
  // celle scritte prima della colonna: come prima (protette solo V, V1 e CGF)
  const out = { codice: sigla, protetto: ['V', 'V1', 'CGF'].includes(sigla), commento: '' };
  if (r && r.prima_malattia !== undefined) out.prima_malattia = null;
  return out;
}
// sigla coperta dalla malattia, dalla nota della cella ("Ex R23 - Admin" o la vecchia
// "Malattia dal Diario · era R23")
function _pianoSiglaSottoMalattia(r) {
  const m = String((r && r.commento) || '').match(/^(?:Malattia dal Diario · era|Ex) ([A-Z0-9]+)\b/);
  return m ? m[1] : '';
}
// ASS = ASSENZA IN ATTESA DI CERTIFICATO (decisione del titolare 15.10): come la M lascia
// scoperto il turno della persona (Copertura, Avvisi), ma vale 0 ore e non e malattia.
// Il tipo di registrazione del Diario e «Assenza» (rinominabile come gli altri).
function _pianoTipoAssenza() {
  return typeof nomeCorrente === 'function' ? nomeCorrente('Assenza') : 'Assenza';
}
// celle che lasciano scoperto il turno: malattia (M, M1) e assenza in attesa di certificato
function _pianoCodiceAssenteTurno(c) {
  return c === 'M' || c === 'M1' || c === 'ASS';
}
// ore di una cella in un giorno di malattia; null se il giorno non e malattia
function _pianoOreGiornoMalattia(r, info) {
  if (!r || !r.collaboratore || !r.data) return null;
  if (r.codice === 'ASS') return null; // l ASS non e malattia: valore del codice (0 ore)
  const dstr = String(r.data).substring(0, 10);
  const eM = r.codice === 'M' || r.codice === 'M1';
  const n = _pianoGiornoDiMalattia(r.collaboratore, dstr) || (eM ? 1 : 0);
  if (!n) return null;
  if (n > PIANO_MALATTIA_GIORNI_TURNO) return _pianoOreMalattiaLunga(info);
  // primi 14 giorni: la sigla che la persona aveva quel giorno
  const sotto = eM ? _pianoSiglaSottoMalattia(r) : r.codice;
  const t = sotto ? _pianoTurnoInfo(sotto) : null;
  if (t) return _pianoOreEffettiveTurno(t, { data: dstr });
  if (sotto === 'C' || (!eM && !sotto)) return 0;
  const csS = sotto ? _pianoCodiceInfo(sotto) : null;
  if (csS && sotto !== 'M' && sotto !== 'M1') return _pianoOreCodiceSpeciale(csS, info, sotto);
  if (!eM) return null;
  // M senza sigla coperta (dati vecchi o M su giorno vuoto): valore del codice M
  return _pianoOreCodiceSpeciale(_pianoCodiceInfo(r.codice), info, r.codice);
}
// ore di un codice speciale in un giorno preciso: come _pianoOreCodiceSpeciale, ma
// nei giorni di malattia segue la regola della malattia (anche un C dal 15. giorno)
function _pianoOreSpecialeDelGiorno(r, cs, info) {
  const oreMal = _pianoOreGiornoMalattia(r, info);
  if (oreMal != null) return oreMal;
  return _pianoOreCodiceSpeciale(cs, info, r.codice);
}
// Ore pianificate di una RIGA del piano: turno → durata del turno;
// codice con orario personalizzato (es. JG con inizio/fine) → differenza;
// altrimenti ore CCL del codice speciale (scalate per percentuale se previsto)
function _pianoOreDiRiga(r, pct) {
  const t = _pianoTurnoInfoRiga(r);
  if (t) {
    // il turno puo' finire piu' tardi nei giorni di chiusura alle 5
    const eff = _pianoTurnoDelGiorno(t, r.data ? String(r.data).substring(0, 10) : '');
    return eff ? eff.durata : parseFloat(t.durata_ore) || 0;
  }
  if (r.ora_inizio && r.ora_fine) {
    // JG con piu fasce: la somma delle fasce (l intervallo fra le fasce non conta)
    const ore = _pianoFasceRiga(r).reduce((tot, x) => tot + _pianoDurataFascia(x), 0);
    if (ore > 0) return Math.round(ore * 100) / 100;
  }
  const cs = _pianoCodiceInfo(r.codice);
  const infoR = r && r.collaboratore ? _pianoCollabInfo(r.collaboratore) : null;
  // giorno di malattia (M, o un riposo dal 15. giorno): regola della malattia
  const oreMal = cs ? _pianoOreGiornoMalattia(r, infoR || { percentuale: pct }) : null;
  if (oreMal != null) return oreMal;
  if (cs && parseFloat(cs.ore) > 0) return _pianoOreCodiceSpeciale(cs, infoR || { percentuale: pct }, r.codice);
  return 0;
}
// Codici che per gli AUSILIARI (jolly) valgono ZERO ore, perche' l'indennita'
// e' gia' compresa e pagata nel salario orario dei giorni lavorati (RAP
// Allegato 1): le vacanze di un jolly non sono giornate pagate a parte, quindi
// contarle in ore le farebbe risultare due volte. Elenco modificabile dalle
// regole (jolly_codici_gia_pagati) senza toccare il programma.
function _pianoCodiciGiaNellaPagaJolly() {
  const v = _pianoRegolaVal('jolly_codici_gia_pagati');
  return String(v == null || v === '' ? 'V,V1' : v)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
// Ore di un codice speciale per un dato collaboratore. Unico punto di verita':
// lo usano sia il piano mensile sia le statistiche dell'anno.
function _pianoOreCodiceSpeciale(cs, info, codice) {
  if (!cs) return 0;
  const ore = parseFloat(cs.ore) || 0;
  if (!ore) return 0;
  const jolly = !!(info && (info.is_jolly || info.impiego === 'jolly'));
  const cod = String(codice || cs.codice || '').toUpperCase();
  if (jolly && _pianoCodiciGiaNellaPagaJolly().indexOf(cod) >= 0) return 0;
  if (!cs.scala_percentuale) return ore;
  // AUSILIARI (jolly): non hanno una percentuale contrattuale. Quella scritta
  // in scheda serve solo da indicazione per la generazione del piano, quindi
  // NON deve ridurre il valore delle assenze: per loro si conta il valore
  // pieno, e le indennita' si calcolano in percentuale sulle ore lavorate.
  if (jolly) return ore;
  return ore * (parseFloat(info && info.percentuale) || 1);
}
function _pianoColore(codice) {
  const t = _pianoTurnoInfo(codice);
  if (t) return t.colore || '';
  return PIANO_COLORI_SPECIALI[codice] || ''; // '' = cella bianca (come Turnivo/Excel)
}
// marcatore del giorno importato dall'Excel (riga 2 del foglio: CS = concessione
// sociale, MN, LRD...) · mostrato nelle intestazioni dei giorni
function _pianoMarkerGiorno(ym, g) {
  const m = (window._pianoGiornoMarker || {})[ym];
  return m ? m[g] || m[String(g)] || '' : '';
}
// colonne a larghezza FISSA condivise da griglia/fabbisogno/differenze/
// effettivi: i giorni si incolonnano alla perfezione tra le tabelle
function _pianoColgroupGiorni(nGiorni) {
  let cg = '';
  for (let g = 1; g <= nGiorni; g++) cg += '<col style="width:37px">';
  return cg;
}
// modifica manuale del marcatore (doppio click sull'intestazione del giorno)
async function pianoMarkerEdit(g) {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const attuale = _pianoMarkerGiorno(ym, g);
  const v = await chiediTesto('Marcatore per il giorno ' + g + ' (es. CS, MN, LRD · vuoto per togliere):', attuale);
  if (v === null) return;
  const tutti = window._pianoGiornoMarker || {};
  tutti[ym] = tutti[ym] || {};
  if (v.trim()) tutti[ym][g] = v.trim().toUpperCase();
  else {
    delete tutti[ym][g];
    delete tutti[ym][String(g)];
  }
  window._pianoGiornoMarker = tutti;
  if (!(await salvaImp('piano_giorno_marker', JSON.stringify(tutti)))) return;
  logAzione('Marcatore giorno', ym + '-' + g + ': ' + (v.trim() || '(rimosso)'));
  renderPiano();
}
function _pianoUltimoGiorno(ym) {
  const p = ym.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]), 0).getDate();
}

// Malattie registrate nel Diario → celle "M" automatiche (solo visuali, non salvate).
// Legge le registrazioni tipo Malattia: range "dal gg/mm/aaaa al gg/mm/aaaa" nel testo,
// oppure "N giorni" dalla data della registrazione, altrimenti il singolo giorno.
// NON DISPONIBILITA' dal Diario: le date sono scritte nel testo della
// registrazione ("(2 giorni: 05/10/2026, 07/10/2026)"): si estraggono e la
// cella del piano mostra ND in automatico; il generatore non assegna turni
function _pianoNdMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoNd = typeof nomeCorrente === 'function' ? nomeCorrente('Non Disponibilità') : 'Non Disponibilità';
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoNd || e.eliminato) return;
    // l ND vale solo per i jolly (decisione del titolare): quelle vecchie di un fisso
    // non entrano nel piano (bozza, Valida, allineamento)
    if (typeof _pianoEJolly === 'function' && _pianoCollabInfo(e.nome) && !_pianoEJolly(e.nome)) return;
    const m = String(e.testo || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g);
    if (!m) return;
    m.forEach((dd) => {
      const par = dd.split('/');
      const dstr = par[2] + '-' + par[1].padStart(2, '0') + '-' + par[0].padStart(2, '0');
      if (dstr.startsWith(ym)) out[e.nome + '|' + dstr] = true;
    });
  });
  return out;
}
// Date coperte da una registrazione di malattia: "dal X al Y", "il X (1
// giorno)", "N giorni" dalla data della registrazione
function _pianoDateMalattia(testo, dataReg) {
  testo = String(testo || '');
  // giorno svizzero della registrazione (non quello UTC dei primi 10 caratteri)
  let da = typeof giornoDi === 'function' ? giornoDi(dataReg) : String(dataReg || '').substring(0, 10);
  let a = da;
  const mRange = testo.match(/dal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+al\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  const mIl = testo.match(/\bil\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  // "dal X" senza "al" (Rapporto: un giorno solo diverso da quello del rapporto, «malato
  // domani»): vale da quel giorno. Prima si leggeva il giorno della registrazione.
  const mDal = testo.match(/\bdal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  const mGiorni = testo.match(/(\d+)\s*giorn[oi]/i);
  if (mRange) {
    da = mRange[3] + '-' + mRange[2].padStart(2, '0') + '-' + mRange[1].padStart(2, '0');
    a = mRange[6] + '-' + mRange[5].padStart(2, '0') + '-' + mRange[4].padStart(2, '0');
  } else if (mIl) {
    da = mIl[3] + '-' + mIl[2].padStart(2, '0') + '-' + mIl[1].padStart(2, '0');
    a = da;
  } else if (mDal) {
    da = mDal[3] + '-' + mDal[2].padStart(2, '0') + '-' + mDal[1].padStart(2, '0');
    a = da;
    if (mGiorni) {
      const d = new Date(da + 'T12:00:00');
      d.setDate(d.getDate() + parseInt(mGiorni[1]) - 1);
      a = d.toISOString().substring(0, 10);
    }
  } else if (mGiorni && da) {
    const d = new Date(da + 'T12:00:00');
    d.setDate(d.getDate() + parseInt(mGiorni[1]) - 1);
    a = d.toISOString().substring(0, 10);
  }
  const out = [];
  if (!da) return out;
  const cur = new Date(da + 'T12:00:00');
  let n = 0;
  while (cur.toISOString().substring(0, 10) <= a && n < 400) {
    out.push(cur.toISOString().substring(0, 10));
    cur.setDate(cur.getDate() + 1);
    n++;
  }
  return out;
}
// SINCRONIZZAZIONE PIANO dopo la correzione di una malattia nel Diario:
// le M salvate nei giorni non piu' coperti vengono tolte, i giorni nuovi
// ricevono la M protetta. Chiamata da salvaModificaRegistrazione
// opz.senzaDomande: niente finestre (Rapporto, che si salva mentre si scrive): una copertura
// da togliere diventa un avviso nella pagina
// opz.codice 'ASS': ASSENZA IN ATTESA DI CERTIFICATO (registrazione «Assenza»): l ASS va
// SOLO sui giorni con un turno (nei riposi, vacanze, CGF e celle vuote niente), toglierla
// rimette il turno. Malattia (codice M, come prima): sopra un ASS la cella diventa M solo
// con Storico HR · modificare (Certificato ricevuto) e tiene il turno sotto; una M tolta
// dove c e ancora un Assenza torna ASS. opz.idReg: la registrazione che cambia (le altre
// che coprono lo stesso giorno lo tengono; senza, vale la data come prima).
async function sincronizzaMalattiaPiano(nome, testoVecchio, dataVecchia, testoNuovo, opz) {
  opz = opz || {};
  const modoAss = opz.codice === 'ASS';
  try {
    // testo vuoto = nessun giorno (malattia nuova o cancellata). Prima un testo vuoto
    // valeva come "il giorno della registrazione": una malattia di un giorno appena
    // creata non riceveva la M e una cancellata non restituiva il turno
    const vecchie = String(testoVecchio || '').trim() ? _pianoDateMalattia(testoVecchio, dataVecchia) : [];
    const nuove = String(testoNuovo || '').trim() ? _pianoDateMalattia(testoNuovo, dataVecchia) : [];
    if (!vecchie.length && !nuove.length) return null;
    const daTogliere = vecchie.filter((d) => !nuove.includes(d));
    const daMettere = nuove.filter((d) => !vecchie.includes(d));
    if (!daTogliere.length && !daMettere.length) return null;
    const info = collaboratoriCache.find((c) => c.nome.toLowerCase() === String(nome).toLowerCase());
    const rep = (info && info.reparto_dip) || 'slots';
    // via le M salvate nei giorni sbagliati, MA solo se nessun'altra
    // registrazione di malattia copre ancora quel giorno: un periodo lungo e'
    // salvato nel Diario come una registrazione per giorno, e accorciarne una
    // non deve cancellare le M dei giorni delle altre
    const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
    const tipoAss = _pianoTipoAssenza();
    const tipoReg = modoAss ? tipoAss : tipoMal;
    const dataVecchiaStr = String(dataVecchia || '').substring(0, 10);
    const copertoDa = (tipo, d, escludi) =>
      (typeof datiCache !== 'undefined' ? datiCache : []).some(
        (e) =>
          e.tipo === tipo &&
          !e.eliminato &&
          String(e.nome || '').toLowerCase() === String(nome).toLowerCase() &&
          (!escludi ||
            (opz.idReg != null ? e.id !== opz.idReg : String(e.data || '').substring(0, 10) !== dataVecchiaStr)) &&
          _pianoDateMalattia(e.testo || '', e.data).includes(d),
      );
    const copertoAltrove = (d) => copertoDa(tipoReg, d, true);
    // M tolta in un giorno dove resta un Assenza: torna ASS (il turno resta scoperto)
    const restaAss = (d) => !modoAss && copertoDa(tipoAss, d, false);
    // ASS da mettere in un giorno gia di malattia: resta la M
    const giaMal = (d) => modoAss && copertoDa(tipoMal, d, false);
    const puoCert = typeof puoModificareStoricoHr === 'function' && puoModificareStoricoHr();
    // le scritture del Diario non entrano nell Annulla dell ultima operazione del Piano
    _pianoFuoriDalPasso();
    // MALATTIA TOLTA CHE QUALCUNO COPRIVA: si chiede se rimettere tutto com era (anche le
    // celle di chi copre, nella stessa scrittura). Senza finestre (Rapporto): avviso.
    // Una M che torna ASS (o un ASS sotto una malattia) lascia il turno scoperto: la
    // copertura resta valida.
    const giorniVia = daTogliere.filter((d) => !copertoAltrove(d) && !restaAss(d) && !giaMal(d));
    let togliCop = false;
    let passoCop = null;
    let cop0 = { ops: [] };
    if (giorniVia.length && typeof _pianoOpsTogliCopertura === 'function' && puoGestirePiano()) {
      cop0 = await _pianoOpsTogliCopertura(info ? info.nome : nome, giorniVia).catch(() => ({ ops: [] }));
      if (cop0.ops.length && opz.senzaDomande) {
        if (typeof _pianoAvvisoTogliCopertura === 'function')
          _pianoAvvisoTogliCopertura(info ? info.nome : nome, giorniVia);
      } else if (cop0.ops.length) {
        togliCop = await chiediConferma(_pianoTestoTogliCopertura(info ? info.nome : nome, [], cop0), {
          titolo: (modoAss ? 'Assenza' : 'Malattia') + ' tolta: copertura',
          ok: 'Sì, rimetti com era',
          annulla: 'No, resta la copertura',
        });
        // con Annulla: diventa un passo del Piano (malato e sostituti insieme)
        if (togliCop)
          passoCop = _pianoUndoSnap('tolta copertura ' + (modoAss ? 'assenza ' : 'malattia ') + nome.split(' ')[0]);
      }
    }
    const festCgf = typeof _pianoFestiviCgfSet === 'function' ? _pianoFestiviCgfSet() : new Set();
    // giorni chiusi: un inserimento li chiede come sempre (le M sopra una sigla no)
    const nuoveSenzaCella = [];
    // LE CELLE DA SCRIVERE, dalla lettura appena fatta: tolte e messe in UNA scrittura
    // (tutto o niente) e solo se le celle sono ancora come lette. Prima erano scritture
    // una alla volta senza controllo: un errore a meta lasciava meta periodo in M e la
    // nota "Ex" scritta su una sigla vecchia se un collega l aveva appena cambiata.
    const prepara = async () => {
      const ops = [];
      const festiviPersi = []; // festivi con diritto al recupero persi per la malattia
      const cgfPersi = []; // giorni di CGF caduti in malattia: il recupero va rimesso
      let tolte = 0;
      let messe = 0;
      const assFerme = []; // ASS che senza certificato (HR) restano ASS
      const op = getOperatore();
      const ora = new Date().toISOString();
      const daLeggere = [...new Set(daTogliere.filter((d) => !copertoAltrove(d)).concat(daMettere))];
      const lette = await Promise.all(
        daLeggere.map((d) =>
          secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + d + '&limit=2').then(
            (x) => (x || [])[0] || null,
          ),
        ),
      );
      const cellaDi = new Map(daLeggere.map((d, i) => [d, lette[i]]));
      for (const d of daTogliere) {
        if (copertoAltrove(d)) continue;
        const r = cellaDi.get(d);
        if (!r || !(modoAss ? r.codice === 'ASS' : r.codice === 'M' || r.codice === 'M1')) continue;
        // la M aveva coperto un altra sigla (turno, V, CGF, JG...): quella torna al suo posto
        // nota "Ex C0 - operatore" (dal 30.09) o quella vecchia "Malattia dal Diario · era C0"
        // (torna la cella com era: bozza o a mano, protetta, nota, blocco)
        const era = String(r.commento || '').match(/^(?:Malattia dal Diario \u00b7 era|Ex) ([A-Z0-9]+)\b/);
        // M tolta dove resta un Assenza sopra un turno: torna ASS, con la stessa cella sotto
        if (era && era[1] && restaAss(d) && _pianoTurnoInfo(era[1])) {
          const dA = { codice: 'ASS', commento: r.commento || null, operatore: op, updated_at: ora };
          if (r.prima_malattia !== undefined) dA.prima_malattia = r.prima_malattia;
          ops.push({ collaboratore: r.collaboratore, data: d, atteso: _pianoAttesoDi(r), dati: dA });
          tolte++;
          continue;
        }
        ops.push({
          collaboratore: r.collaboratore,
          data: d,
          atteso: _pianoAttesoDi(r),
          dati:
            era && era[1] && era[1] !== 'M'
              ? Object.assign(_pianoRitornoDaMalattia(r, era[1]), { operatore: op, updated_at: ora })
              : null,
        });
        tolte++;
      }
      // M protetta su QUALSIASI sigla del giorno: turno, vacanza V, CGF, JG, C...
      // La malattia prevale (regola del casino): il giorno di vacanza viene
      // restituito, il CGF resta a credito, il turno perso diventa malattia.
      // La sigla coperta resta scritta nel commento ("Ex V - operatore") cosi, se la
      // malattia viene tolta dal Diario, torna al suo posto. Senza cella si scrive la M
      // (decisione del titolare 08/10/2026: la malattia conta come M, anche nei giorni
      // senza turno; prima restava la M solo disegnata e valeva 0 ore). Togliendo la
      // malattia dal Diario la M senza nota si cancella (sopra).
      for (const d of daMettere) {
        const r = cellaDi.get(d);
        // ASSENZA IN ATTESA DI CERTIFICATO: solo sopra un turno (nei giorni liberi niente) e
        // non dove c e gia una malattia. Il turno resta da coprire; un festivo non e lavorato.
        if (modoAss) {
          if (!r || !_pianoTurnoInfo(r.codice) || giaMal(d)) continue;
          if (festCgf.has(d)) festiviPersi.push(d);
          const pA = {
            codice: 'ASS',
            protetto: true,
            generato: false,
            motivo_blocco: null,
            commento: ('Ex ' + r.codice + ' - ' + op).substring(0, 400),
            operatore: op,
            updated_at: ora,
          };
          if (r.prima_malattia !== undefined) pA.prima_malattia = _pianoPrimaMalattiaDi(r);
          ops.push({ collaboratore: r.collaboratore, data: d, atteso: _pianoAttesoDi(r), dati: pA });
          messe++;
          continue;
        }
        // MALATTIA SOPRA UN ASS: diventa M solo con il certificato (Storico HR · modificare,
        // come nel database) e tiene il turno sotto e la nota ("Ex S7 - coperto da ...")
        if (r && r.codice === 'ASS') {
          if (!puoCert) {
            assFerme.push(d);
            continue;
          }
          const pC = { codice: 'M', commento: r.commento || null, operatore: op, updated_at: ora };
          if (r.prima_malattia !== undefined) pC.prima_malattia = r.prima_malattia;
          ops.push({ collaboratore: r.collaboratore, data: d, atteso: _pianoAttesoDi(r), dati: pC });
          messe++;
          continue;
        }
        if (r && festCgf.has(d) && _pianoTurnoInfo(r.codice)) festiviPersi.push(d);
        if (r && r.codice === 'CGF') cgfPersi.push(d);
        if (r && r.codice !== 'M' && r.codice !== 'M1') {
          const pM = {
            codice: 'M',
            protetto: true,
            generato: false,
            motivo_blocco: null, // la malattia scioglie il blocco con motivo
            commento: ('Ex ' + r.codice + ' - ' + op).substring(0, 400),
            operatore: op,
            updated_at: ora,
          };
          // com era la cella sotto la malattia: torna tale e quale quando la malattia si toglie
          if (r.prima_malattia !== undefined) pM.prima_malattia = _pianoPrimaMalattiaDi(r);
          ops.push({ collaboratore: r.collaboratore, data: d, atteso: _pianoAttesoDi(r), dati: pM });
          messe++;
        } else if (!r && (typeof _pianoOperativoIl !== 'function' || _pianoOperativoIl(nome, d))) {
          ops.push({
            collaboratore: info ? info.nome : nome,
            data: d,
            atteso: null,
            dati: { codice: 'M', protetto: true, generato: false, reparto_dip: rep, operatore: op },
          });
          nuoveSenzaCella.push(d);
          messe++;
        }
      }
      // le celle di chi copre come lette alla domanda: cambiate nel frattempo = niente scritto
      if (togliCop) cop0.ops.forEach((o) => ops.push(o));
      return { ops, festiviPersi, cgfPersi, tolte, messe, assFerme };
    };
    let p = await prepara();
    for (const d of [...new Set(nuoveSenzaCella)])
      if (!(await _pianoConsentiScrittura(d))) throw new Error('giorno chiuso: ' + d);
    let es;
    try {
      es = await _pianoScriviCelle(p.ops);
    } catch (e) {
      if (passoCop) _pianoUndoScarta(passoCop);
      throw e;
    }
    // COPERTURA DA TOGLIERE e una cella cambiata nel frattempo: niente e scritto, si dice
    // quale (nessun secondo tentativo alla cieca sulle celle dei colleghi)
    if (!es.ok && togliCop) {
      _pianoUndoScarta(passoCop);
      throw new Error(
        'niente è stato scritto nel piano: ' +
          (es.conflitti || []).map(_pianoConflittoTesto).join('; ') +
          '. La M e la copertura sono rimaste: ricarica il piano e sistemale a mano',
      );
    }
    if (passoCop) _pianoUndoChiudi(passoCop);
    // una cella cambiata da un collega fra la lettura e la scrittura: si rilegge e si
    // riprova UNA volta (la malattia prevale, la nota "Ex" prende la sigla nuova)
    if (!es.ok) {
      p = await prepara();
      es = await _pianoScriviCelle(p.ops);
      if (!es.ok) throw _pianoErroreConflitto(es.conflitti);
    }
    const { festiviPersi, cgfPersi, tolte, messe, assFerme } = p;
    if (typeof _pianoRighe !== 'undefined') _pianoMemoriaDopo(es.ops, es.righe);
    // festivo saltato per malattia: i recuperi automatici in piu' tornano C
    for (const ymM of new Set(festiviPersi.map((d) => d.substring(0, 7))))
      await _pianoRiconciliaCgf(nome, ymM, { festivi: festiviPersi.filter((d) => d.startsWith(ymM)) });
    // CGF caduto in malattia: si propone subito un giorno sostitutivo nello stesso mese
    if (cgfPersi.length && typeof _pianoRimettiCgf === 'function')
      for (const d of cgfPersi) await _pianoRimettiCgf(nome, d);
    // avviso dei turni da coprire nella pagina: si aggiorna (o sparisce) con la malattia
    if (typeof _pianoAvvisoCoperturaAggiorna === 'function' && window._copAvvisi && window._copAvvisi[nome])
      _pianoAvvisoCoperturaAggiorna(nome);
    if (tolte || messe) {
      if (modoAss)
        logAzione('Assenza: piano allineato', nome + ' · ' + tolte + ' ASS tolte, ' + messe + ' turni diventati ASS');
      else logAzione('Malattia: piano allineato', nome + ' · ' + tolte + ' M tolte, ' + messe + ' celle diventate M');
      if (typeof _pianoRighe !== 'undefined' && _pianoRighe.length && typeof renderPiano === 'function') renderPiano();
    }
    // ASS rimaste: la malattia sopra un assenza la registra l HR con Certificato ricevuto
    if (assFerme && assFerme.length)
      toast(
        nome +
          ': ASS restano il ' +
          assFerme.map((d) => d.substring(8, 10) + '.' + d.substring(5, 7)).join(', ') +
          ' (assenza in attesa di certificato): le trasforma in malattia chi ha Storico HR · modificare, con «Certificato ricevuto».',
        9000,
      );
    return { tolte: tolte, messe: messe, assFerme: assFerme || [] };
  } catch (e) {
    // l errore arriva a chi chiama, che lo mostra ("Piano non allineato alla malattia"):
    // prima si scriveva solo in console e l utente leggeva "salvato" con le M sbagliate
    console.error('sync malattia piano', e);
    throw e;
  }
}
// ND DAL DIARIO NEL PIANO (05.10, segnalazione del titolare): un giorno di non
// disponibilita registrato nel Diario sopra un turno gia pianificato diventa ND
// (protetta) con la nota "Ex <turno> - ND dal Diario - operatore": il posto resta da
// coprire (Copertura, Valida, Migliora lo vedono). Senza turno basta la ND automatica
// del calendario. Tolta o cambiata la registrazione (elimina, modifica, Annulla) le
// ND scritte da qui tornano al turno di prima. Giorni chiusi: non si toccano.
const _ND_NOTA_DIARIO = 'ND dal Diario';
async function ndAllineaPiano(nome, ym) {
  if (!nome || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const voluti = new Set(
    Object.keys(_pianoNdMese(ym))
      .filter((k) => k.substring(0, k.lastIndexOf('|')) === nome)
      .map((k) => k.substring(k.lastIndexOf('|') + 1)),
  );
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const righe =
    (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=gte.' + ym + '-01&data=lte.' + fine)) ||
    [];
  const chiuso = (d) =>
    typeof _pianoGiornoBloccato === 'function' && _pianoGiornoBloccato(d) && !_pianoGiornoSbloccato(d);
  const op = getOperatore();
  const out = { messe: 0, tolte: 0, scoperti: [], riservate: [] };
  // le scritture del Diario non entrano nell Annulla dell ultima operazione del Piano
  _pianoFuoriDalPasso();
  // tutte le celle del mese in UNA scrittura (tutto o niente), solo se sono ancora come
  // lette: prima una alla volta, un errore a meta lasciava meta delle ND
  const ops = [];
  const ora = new Date().toISOString();
  for (const r of righe) {
    const d = String(r.data).substring(0, 10);
    if (chiuso(d)) continue;
    const mia = r.codice === 'ND' && String(r.commento || '').includes(_ND_NOTA_DIARIO);
    if (mia && !voluti.has(d)) {
      const era = String(r.commento || '').match(/^Ex ([A-Z0-9]+)\b/);
      ops.push({
        collaboratore: r.collaboratore,
        data: d,
        atteso: _pianoAttesoDi(r),
        dati:
          era && era[1] !== 'ND'
            ? {
                codice: era[1],
                protetto: false,
                // "(bozza)" = era una cella scritta dal programma: torna tale (Cancella piano,
                // Migliora la possono ancora spostare)
                generato: /\(bozza\)/.test(String(r.commento || '')),
                commento: '',
                operatore: op,
                updated_at: ora,
              }
            : null,
      });
      out.tolte++;
    } else if (!mia && voluti.has(d) && r.codice !== 'ND' && _pianoIsLavoro(r.codice)) {
      // cella con lucchetto (visita medica, corso...): resta, si segnala
      if (_pianoCellaRiservata(r)) {
        out.riservate.push({ data: d, codice: r.codice, motivo: _pianoCellaRiservata(r) });
        continue;
      }
      ops.push({
        collaboratore: r.collaboratore,
        data: d,
        atteso: _pianoAttesoDi(r),
        dati: {
          codice: 'ND',
          protetto: true,
          generato: false,
          motivo_blocco: null,
          commento: (
            'Ex ' +
            r.codice +
            ' - ' +
            _ND_NOTA_DIARIO +
            (r.generato ? ' (bozza)' : '') +
            ' - ' +
            op
          ).substring(0, 400),
          operatore: op,
          updated_at: ora,
        },
      });
      out.messe++;
      out.scoperti.push({ data: d, codice: r.codice, reparto: _repartoDi(r) });
    }
  }
  const es = await _pianoScriviOps(ops);
  if (typeof _pianoRighe !== 'undefined') _pianoMemoriaDopo(es.ops, es.righe);
  if (out.messe || out.tolte)
    logAzione(
      'ND: piano allineato',
      nome + ' ' + ym + ' · ' + out.messe + ' turni diventati ND, ' + out.tolte + ' tornati',
    );
  return out;
}
// turni gia pianificati nei giorni di ND indicati: [{ data, codice, reparto }]
async function ndTurniNeiGiorni(nome, giorni) {
  if (!giorni.length) return [];
  const righe =
    (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=in.(' + giorni.join(',') + ')')) || [];
  return righe
    .filter((r) => _pianoIsLavoro(r.codice) && r.codice !== 'ND')
    .map((r) => ({ data: String(r.data).substring(0, 10), codice: r.codice, reparto: _repartoDi(r) }))
    .sort((x, y) => x.data.localeCompare(y.data));
}
function _pianoMalattieMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  // stesso parser della sincronizzazione (_pianoDateMalattia): "dal X al Y",
  // "il X" (giorno singolo corretto dal Diario) e "N giorni". Prima "il X"
  // non veniva capito e la M restava sul giorno della registrazione.
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoMal || e.eliminato) return;
    _pianoDateMalattia(e.testo || '', e.data).forEach((d) => {
      if (d >= inizio && d <= fine) out[e.nome + '|' + d] = true;
    });
  });
  return out;
}

// Tab della sezione Piano (come la navbar di Turnivo: ogni voce una schermata)
let _pianoTab = localStorage.getItem('piano_tab') || 'calendario';
// Icone = Bootstrap Icons (le stesse della navbar di Turnivo), incorporate SVG
const _PIANO_TABS = [
  [
    'congedi',
    'Congedi',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4zm5.15 3.15a.5.5 0 0 1 .7 0L8 8.29l1.15-1.14a.5.5 0 0 1 .7.7L8.71 9l1.14 1.15a.5.5 0 0 1-.7.7L8 9.71l-1.15 1.14a.5.5 0 0 1-.7-.7L7.29 9 6.15 7.85a.5.5 0 0 1 0-.7"/></svg>',
  ],
  [
    'avvisi',
    'Avvisi',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6"/></svg>',
  ],
  [
    'cambi',
    'Cambi turno',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5m14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5"/></svg>',
  ],
  [
    'crediti',
    'Crediti',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1H1zm7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V5zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V7a2 2 0 0 1-2-2H3z"/></svg>',
  ],
  [
    'recupero',
    'Recupero ore',
    // freccia che torna indietro: le ore che si recuperano (prima aveva l orologio dei Turni)
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466"/></svg>',
  ],
  [
    'calendario',
    'Calendario',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/></svg>',
  ],
  [
    'briefing',
    'Briefing',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M13 2.5a1.5 1.5 0 0 1 3 0v11a1.5 1.5 0 0 1-3 0v-.214c-2.162-1.241-4.49-1.843-6.912-2.083l.405 2.712A1 1 0 0 1 5.51 15.1h-.548a1 1 0 0 1-.916-.599l-1.85-3.49-.202-.003A2.014 2.014 0 0 1 0 9V7a2.02 2.02 0 0 1 1.992-2.013 75 75 0 0 0 2.483-.075c3.043-.154 6.148-.849 8.525-2.199zm1 0v11a.5.5 0 0 0 1 0v-11a.5.5 0 0 0-1 0m-1 1.35c-2.344 1.205-5.209 1.842-8 2.033v4.233q.27.015.537.036c2.568.189 5.093.744 7.463 1.993zm-9 6.215v-4.13a95 95 0 0 1-1.992.052A1.02 1.02 0 0 0 1 7v2c0 .55.448 1.002 1.006 1.009A61 61 0 0 1 4 10.065m1.09 1.047 1.278.245.401 2.688-.548.002z"/></svg>',
  ],
  [
    'vacanze',
    'Vacanze',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>',
  ],
  [
    'turni',
    'Turni',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>',
  ],
  [
    'regole',
    'Regole',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M9.05 3a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0V3zM4.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M2.05 8a2.5 2.5 0 0 1 4.9 0H16v1H6.95a2.5 2.5 0 0 1-4.9 0H0V8zm9.45 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m-2.45 1a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0v-1z"/></svg>',
  ],
  [
    'festivi',
    'Festivi',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4 .5a.5.5 0 0 0-1 0V1H2a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V1H4zM1 14V4h14v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1m7-6.507c1.664-1.711 5.825 1.283 0 5.132-5.825-3.85-1.664-6.843 0-5.132"/></svg>',
  ],
  [
    'timbrature',
    'Timbrature',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.06 6.5a.5.5 0 0 1 .5.5v.776a11.5 11.5 0 0 1-.552 3.519l-1.331 4.14a.5.5 0 0 1-.952-.305l1.33-4.141a10.5 10.5 0 0 0 .504-3.213V7a.5.5 0 0 1 .5-.5Z"/><path d="M6.06 7a2 2 0 1 1 4 0 .5.5 0 1 1-1 0 1 1 0 1 0-2 0v.332q0 .613-.066 1.221A.5.5 0 0 1 6 8.447q.06-.555.06-1.115zm3.509 1a.5.5 0 0 1 .487.513 11.5 11.5 0 0 1-.587 3.339l-1.266 3.8a.5.5 0 0 1-.949-.317l1.267-3.8a10.5 10.5 0 0 0 .535-3.048A.5.5 0 0 1 9.569 8m-3.356 2.115a.5.5 0 0 1 .33.626L5.24 14.939a.5.5 0 1 1-.955-.296l1.303-4.199a.5.5 0 0 1 .625-.329"/><path d="M4.759 5.833A3.501 3.501 0 0 1 11.559 7a.5.5 0 0 1-1 0 2.5 2.5 0 0 0-4.857-.833.5.5 0 1 1-.943-.334m.3 1.67a.5.5 0 0 1 .449.546 10.7 10.7 0 0 1-.4 2.031l-1.222 4.072a.5.5 0 1 1-.958-.287L4.15 9.793a9.7 9.7 0 0 0 .363-1.842.5.5 0 0 1 .546-.449Zm6 .647a.5.5 0 0 1 .5.5c0 1.28-.213 2.552-.632 3.762l-1.09 3.145a.5.5 0 0 1-.944-.327l1.089-3.145c.382-1.105.578-2.266.578-3.435a.5.5 0 0 1 .5-.5Z"/><path d="M3.902 4.222a5 5 0 0 1 5.202-2.113.5.5 0 0 1-.208.979 4 4 0 0 0-4.163 1.69.5.5 0 0 1-.831-.556m6.72-.955a.5.5 0 0 1 .705-.052A4.99 4.99 0 0 1 13.059 7v1.5a.5.5 0 1 1-1 0V7a3.99 3.99 0 0 0-1.386-3.028.5.5 0 0 1-.051-.705M3.68 5.842a.5.5 0 0 1 .422.568q-.044.289-.044.59c0 .71-.1 1.417-.298 2.1l-1.14 3.923a.5.5 0 1 1-.96-.279L2.8 8.821A6.5 6.5 0 0 0 3.058 7q0-.375.054-.736a.5.5 0 0 1 .568-.422m8.882 3.66a.5.5 0 0 1 .456.54c-.084 1-.298 1.986-.64 2.934l-.744 2.068a.5.5 0 0 1-.941-.338l.745-2.07a10.5 10.5 0 0 0 .584-2.678.5.5 0 0 1 .54-.456"/><path d="M4.81 1.37A6.5 6.5 0 0 1 14.56 7a.5.5 0 1 1-1 0 5.5 5.5 0 0 0-8.25-4.765.5.5 0 0 1-.5-.865m-.89 1.257a.5.5 0 0 1 .04.706A5.48 5.48 0 0 0 2.56 7a.5.5 0 0 1-1 0c0-1.664.626-3.184 1.655-4.333a.5.5 0 0 1 .706-.04ZM1.915 8.02a.5.5 0 0 1 .346.616l-.779 2.767a.5.5 0 1 1-.962-.27l.778-2.767a.5.5 0 0 1 .617-.346m12.15.481a.5.5 0 0 1 .49.51c-.03 1.499-.161 3.025-.727 4.533l-.07.187a.5.5 0 0 1-.936-.351l.07-.187c.506-1.35.634-2.74.663-4.202a.5.5 0 0 1 .51-.49"/></svg>',
  ],
  [
    'saldo',
    'Saldo',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/><path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/><path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/></svg>',
  ],
  [
    'statistiche',
    'Statistiche',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/></svg>',
  ],
  [
    'organico',
    'Organico',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>',
  ],
  [
    'formazioni',
    // etichetta "Affiancamenti" (revisione UX 11/10): "Formazioni" si confondeva con la
    // pagina Formazione e competenze. L id resta 'formazioni' (codice, permessi, prove)
    'Affiancamenti',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.211 2.047a.5.5 0 0 0-.422 0l-7.5 3.5a.5.5 0 0 0 .025.917l7.5 3a.5.5 0 0 0 .372 0L14 7.14V13a1 1 0 0 0-1 1v2h3v-2a1 1 0 0 0-1-1V6.739l.686-.275a.5.5 0 0 0 .025-.917zM8 8.46 1.758 5.965 8 3.052l6.242 2.913z"/><path d="M4.176 9.032a.5.5 0 0 0-.656.327l-.5 1.7a.5.5 0 0 0 .294.605l4.5 1.8a.5.5 0 0 0 .372 0l4.5-1.8a.5.5 0 0 0 .294-.605l-.5-1.7a.5.5 0 0 0-.656-.327L8 10.466zm-.068 1.873.22-.748 3.496 1.311a.5.5 0 0 0 .352 0l3.496-1.311.22.748L8 12.46z"/></svg>',
  ],
  [
    'benessere',
    'Benessere',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"/></svg>',
  ],
  [
    'storico',
    'Storico',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/></svg>',
  ],
  [
    'formulari',
    'Formulari',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/><path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/></svg>',
  ],
  [
    'guida',
    'Guida',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783"/></svg>',
  ],
  [
    'impostazioni',
    'Impostazioni',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/></svg>',
  ],
];
function pianoCambiaTab(t) {
  _pianoFlushSalva();
  if (!pianoTabVisibile(t)) {
    toast('Questa scheda non e visibile per il tuo operatore');
    return;
  }
  _pianoTab = t;
  localStorage.setItem('piano_tab', t);
  renderPiano();
}
// Le 13 tab raggruppate in 3 famiglie: si trova tutto a colpo d'occhio
const PIANO_TAB_GRUPPI = [
  // sei gruppi brevi invece di tre lunghi (controllo del 09/10/2026): si trova tutto a colpo d occhio
  ['Giornata', ['calendario', 'briefing', 'avvisi']],
  ['Assenze', ['vacanze', 'congedi', 'festivi']],
  ['Ore', ['saldo', 'crediti', 'recupero', 'timbrature']],
  ['Persone', ['formazioni', 'benessere', 'organico', 'cambi']],
  ['Archivio', ['storico', 'statistiche', 'formulari']],
  ['Configurazione', ['turni', 'regole', 'impostazioni', 'guida']],
];
// CONTATORE UNICO DEGLI AVVISI (revisione UX 11/10). Prima la campanella (92), la riga
// "In sintesi" (153) e la sotto-scheda Regole del mese (99+) contavano cose diverse.
// Ora tutti i numeri vengono da qui, con la stessa definizione:
//  - da risolvere (rosso): ore della settimana oltre il massimo, riposo attorno alla
//    domenica, regole di legge del mese (riposi, giorni di fila), chiusura dell anno in
//    rosso, posti scoperti, malattie oltre il 14. giorno;
//  - da controllare (arancio): le altre regole del mese (ore del mese, preferenze,
//    formazione), chiusura dell anno in arancio, vacanze non nel piano.
// Il numero sulla scheda Avvisi e sulla voce Piano e quello rosso; le sotto-schede
// mostrano la loro parte rossa e quella arancio, che sommate danno i due totali.
// v = _pianoAvvisiVeloci(), l = _pianoAvvisiLenti() (null se non ancora calcolate)
function _pianoProblemiMese(v, l) {
  const regL = (v.regole || []).filter((x) => _pianoViolDiLegge(x.msg)).length;
  const anno = l ? l.anno.length : 0;
  const annoG = l ? l.anno.filter((x) => x.voci.some((y) => y.grave)).length : 0;
  const per = {
    sett: { r: v.sett.length, c: 0 },
    riposo: { r: v.riposo.length, c: 0 },
    regole: { r: regL, c: (v.regole || []).length - regL },
    anno: { r: annoG, c: anno - annoG },
    scoperti: { r: l ? l.scoperti.length : 0, c: 0 },
    malattie: { r: l ? l.malattie.filter((m) => m.giorno > 14).length : 0, c: 0 },
    // turni rimasti scoperti per una malattia (avviso "Più tardi" nella pagina)
    malcop: { r: (v.malcop || []).length, c: 0 },
    // ASS da regolarizzare (solo chi ha il permesso HR: per gli altri la lista e vuota)
    assreg: { r: 0, c: typeof _pianoAssDaRegolarizzareN === 'function' ? _pianoAssDaRegolarizzareN(v.assreg) : 0 },
    vacanze: { r: 0, c: l && l.vacanze ? l.vacanze.length : 0 },
  };
  let r = 0;
  let c = 0;
  Object.values(per).forEach((x) => {
    r += x.r;
    c += x.c;
  });
  return { daRisolvere: r, daControllare: c, per: per, completo: !!l };
}
// la spiegazione che compare al passaggio del mouse, uguale ovunque
function _pianoProblemiSpiega(p) {
  const n = (x, uno, molti) => x + ' ' + (x === 1 ? uno : molti);
  return (
    n(p.daRisolvere, 'problema da risolvere', 'problemi da risolvere') +
    ' (regole di legge, posti scoperti, malattie lunghe, chiusura anno in rosso) + ' +
    n(p.daControllare, 'cosa da controllare', 'cose da controllare') +
    ' nel mese. Il numero rosso conta solo i problemi da risolvere.'
  );
}

// RIGA DEGLI AVVISI DEL MESE (revisione UX 11/10) ---------------------------------
function _pianoAvvisiMeseAperta() {
  try {
    return sessionStorage.getItem('piano_avvisi_mese_aperta') === '1';
  } catch (e) {
    return false;
  }
}
function _pianoAvvisiMeseInizio() {
  const aperta = _pianoAvvisiMeseAperta();
  return (
    '<div class="pam' +
    (aperta ? ' aperta' : '') +
    '" id="piano-avvisi-mese" hidden><button type="button" class="pam-riga" aria-expanded="' +
    aperta +
    '" aria-controls="pam-corpo" onclick="pianoAvvisiMeseApri()"><i class="icx icx-avviso" aria-hidden="true"></i>' +
    '<span class="pam-tit">Avvisi del mese</span><span class="pam-sommario" id="pam-sommario"></span>' +
    '<span class="pam-azione">' +
    (aperta ? 'Nascondi' : 'Mostra') +
    '</span><i class="icx icx-giu pam-freccia" aria-hidden="true"></i></button>' +
    '<div class="pam-corpo" id="pam-corpo"' +
    (aperta ? '' : ' hidden') +
    '><div id="pam-avvisi"></div><div id="pam-compleanno"></div><div id="pam-segn"></div>'
  );
}
// apre o chiude la riga (forza = true: la apre, per esempio dopo Controlla le regole)
function pianoAvvisiMeseApri(forza) {
  const box = document.getElementById('piano-avvisi-mese');
  const aperta = forza === true ? true : !_pianoAvvisiMeseAperta();
  try {
    sessionStorage.setItem('piano_avvisi_mese_aperta', aperta ? '1' : '0');
  } catch (e) {}
  if (!aperta) document.body.classList.remove('piano-segn-mostra');
  if (!box) return;
  box.classList.toggle('aperta', aperta);
  const corpo = document.getElementById('pam-corpo');
  if (corpo) corpo.hidden = !aperta;
  const btn = box.querySelector('.pam-riga');
  if (btn) btn.setAttribute('aria-expanded', String(aperta));
  const az = box.querySelector('.pam-azione');
  if (az) az.textContent = aperta ? 'Nascondi' : 'Mostra';
  if (aperta) box.hidden = false;
}
// il compleanno di oggi (la fascia in cima alla pagina, nel Piano si nasconde: vedi CSS)
function _pianoCompleanniOggi() {
  const b = document.getElementById('compleanni-banner');
  if (!b || b.classList.contains('hidden') || b.style.display === 'none') return '';
  const t = b.querySelector('.compleanni-testo');
  return t ? t.textContent.trim() : '';
}
// scrive solo se cambia: l osservatore della riga non deve ripartire per niente
function _pianoScriviSeDiverso(el, html) {
  if (el._pamHtml === html) return;
  el._pamHtml = html;
  el.innerHTML = html;
}
// riassunto della riga: numeri del contatore unico, segnalazioni, compleanno
function _pianoAvvisiMeseSommario() {
  const box = document.getElementById('piano-avvisi-mese');
  const som = document.getElementById('pam-sommario');
  if (!box || !som) return;
  const parti = [];
  let grave = false;
  const p = window._pianoProblemiUltimi;
  if (p && (p.daRisolvere || p.daControllare)) {
    const spiega = escP(_pianoProblemiSpiega(p));
    if (p.daRisolvere) {
      grave = true;
      parti.push('<span class="pavv-chip pavv-legge" title="' + spiega + '">' + p.daRisolvere + ' da risolvere</span>');
    }
    if (p.daControllare)
      parti.push(
        '<span class="pavv-chip pavv-contr" title="' + spiega + '">' + p.daControllare + ' da controllare</span>',
      );
  }
  // ASS da regolarizzare (assenze in attesa di certificato, solo chi ha il permesso HR)
  const nAss = p && p.per && p.per.assreg ? p.per.assreg.c : 0;
  if (nAss) parti.push('<span class="pam-voce">ASS da regolarizzare: ' + nAss + '</span>');
  // i numeri sono quelli della scheda Avvisi: di la l elenco completo
  const aEl = document.getElementById('pam-avvisi');
  if (aEl)
    _pianoScriviSeDiverso(
      aEl,
      p && (p.daRisolvere || p.daControllare) && pianoTabVisibile('avvisi')
        ? '<div class="pam-compleanno">' +
            escP(_pianoProblemiSpiega(p)) +
            ' <button type="button" class="btn-act" onclick="pianoCambiaTab(\'avvisi\')">Apri la scheda Avvisi</button></div>'
        : '',
    );
  // segnalazioni scritte nella riga: controllo delle regole, confine, generazione, non disponibilita
  const corpo = document.getElementById('pam-corpo');
  let seg = 0;
  if (corpo)
    [...corpo.children].forEach((c) => {
      if (c.id === 'pam-compleanno' || c.id === 'pam-segn' || c.id === 'pam-avvisi') return;
      const blocchi = c.matches('.pavv,[style]') ? [c] : [...c.children];
      blocchi.forEach((x) => {
        if (x.offsetParent === null && !x.textContent.trim()) return;
        if (x.classList && x.classList.contains('pavv-ok')) return;
        if (x.textContent.trim()) seg++;
      });
    });
  if (seg) parti.push('<span class="pam-voce">' + seg + (seg === 1 ? ' segnalazione' : ' segnalazioni') + '</span>');
  // segnalazioni operative (cassa, rischio): nel calendario la striscia in cima si
  // nasconde (vedi CSS) e si apre da qui
  const nOp = typeof _navContaSegnalazioni === 'function' ? _navContaSegnalazioni() : 0;
  const sEl = document.getElementById('pam-segn');
  if (sEl)
    _pianoScriviSeDiverso(
      sEl,
      nOp
        ? '<div class="pam-compleanno"><i class="icx icx-avviso" aria-hidden="true"></i> ' +
            (nOp === 1 ? '1 segnalazione operativa' : nOp + ' segnalazioni operative') +
            ' (cassa e rischio) <button type="button" class="btn-act" onclick="pianoSegnalazioniMostra()">Mostra in cima alla pagina</button></div>'
        : '',
    );
  if (nOp)
    parti.push(
      '<span class="pam-voce">' +
        (nOp === 1 ? '1 segnalazione operativa' : nOp + ' segnalazioni operative') +
        '</span>',
    );
  const comp = _pianoCompleanniOggi();
  const cEl = document.getElementById('pam-compleanno');
  if (cEl)
    _pianoScriviSeDiverso(
      cEl,
      comp
        ? '<div class="pam-compleanno"><i class="icx icx-torta" aria-hidden="true"></i> ' + escP(comp) + '</div>'
        : '',
    );
  if (comp)
    parti.push(
      '<span class="pam-voce pam-comp"><i class="icx icx-torta" aria-hidden="true"></i>' +
        escP(comp.replace(/^Buon compleanno a\s*/i, '').replace(/!$/, '')) +
        '</span>',
    );
  som.innerHTML = parti.join('');
  box.classList.toggle('pam-grave', grave);
  // niente da dire: la riga non compare (resta visibile se l utente l ha aperta)
  box.hidden = !parti.length && !box.classList.contains('aperta');
  if (parti.length) box.hidden = false;
}
// rimette in vista le segnalazioni operative in cima alla pagina (aperte)
function pianoSegnalazioniMostra() {
  document.body.classList.add('piano-segn-mostra');
  window._alertEspansi = true;
  if (typeof renderAlertCompatti === 'function') renderAlertCompatti();
  const el = document.getElementById('alert-compatto') || document.getElementById('cassa-alerts-container');
  if (el) el.scrollIntoView({ block: 'nearest' });
}
// dopo ogni disegno del calendario: riassunto subito e ogni volta che un pezzo cambia
// (confine, controllo delle regole e generazione scrivono da soli nei loro riquadri)
function _pianoAvvisiMeseAvvia() {
  const corpo = document.getElementById('pam-corpo');
  if (!corpo) return;
  _pianoAvvisiMeseSommario();
  // compleanno e segnalazioni operative arrivano anche dopo: un solo osservatore per sessione
  if (window.MutationObserver && !window._pianoAvvisiMeseOss) {
    let t2 = null;
    window._pianoAvvisiMeseOss = new MutationObserver(() => {
      clearTimeout(t2);
      t2 = setTimeout(_pianoAvvisiMeseSommario, 120);
    });
    ['compleanni-banner', 'cassa-alerts-container', 'rischio-alerts-container'].forEach((id) => {
      const x = document.getElementById(id);
      if (x)
        window._pianoAvvisiMeseOss.observe(x, {
          childList: true,
          subtree: true,
          attributes: id === 'compleanni-banner',
          attributeFilter: id === 'compleanni-banner' ? ['class', 'style'] : undefined,
        });
    });
  }
  if (window.MutationObserver) {
    let t = null;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(_pianoAvvisiMeseSommario, 60);
    }).observe(corpo, { childList: true, subtree: true, characterData: true });
  }
}
// SETTORE: al computer la barra in alto (Slots, Tavoli...) e gia visibile, la tendina del
// Piano diceva la stessa cosa. Si mostra solo quando quella barra non si vede.
function _pianoSettoreDoppio() {
  const sel = document.querySelector('#piano-content .pbar-settore-scelta');
  if (!sel) return;
  const sw = document.getElementById('reparto-switch');
  const visibile = !!(sw && sw.offsetParent !== null && sw.getBoundingClientRect().height > 0);
  sel.hidden = visibile;
}
if (typeof window !== 'undefined' && window.addEventListener) {
  let _pianoRidT = null;
  window.addEventListener('resize', () => {
    clearTimeout(_pianoRidT);
    _pianoRidT = setTimeout(() => {
      _pianoSettoreDoppio();
      const att = document.querySelector('#piano-content .piano-tab.attiva');
      if (att) _pianoTabInVista(att);
    }, 150);
  });
}

// BARRA DELLE SCHEDE (revisione UX 11/10): ogni scheda e un <button role="tab">, si
// raggiunge con Tab (si entra sulla scheda aperta), le frecce passano alle altre e
// Invio o Spazio la aprono. Al telefono la barra scorre da sola fino alla scheda aperta.
function _pianoTabBar() {
  const tabHtml = (k) => {
    const t = _PIANO_TABS.find((x) => x[0] === k);
    if (!t) return '';
    if (!pianoTabVisibile(k)) return ''; // scheda nascosta a questo operatore
    if (k === 'organico' && typeof organicoAttivo === 'function' && !organicoAttivo()) return ''; // disattivata
    const att = k === _pianoTab;
    return (
      '<button type="button" role="tab" class="piano-tab' +
      (att ? ' attiva' : '') +
      '" data-tab="' +
      k +
      '" aria-selected="' +
      (att ? 'true' : 'false') +
      '" tabindex="' +
      (att ? '0' : '-1') +
      '" onclick="pianoCambiaTab(\'' +
      k +
      '\')">' +
      (t[2] || '') +
      ' ' +
      t[1] +
      '</button>'
    );
  };
  const gruppo = (lbl, dentro) =>
    '<div class="piano-tabgroup" role="presentation"><span class="piano-tabgroup-label" aria-hidden="true">' +
    lbl +
    '</span><div class="piano-tabgroup-tabs" role="presentation">' +
    dentro +
    '</div></div>';
  const inGruppi = PIANO_TAB_GRUPPI.flatMap(([, keys]) => keys);
  const fuori = _PIANO_TABS.map(([k]) => k).filter((k) => !inGruppi.includes(k));
  return (
    // l id cambia con la scheda: posizione.js rimette lo scorrimento della barra solo se
    // si ridisegna la stessa scheda (aprendone un altra la barra va su quella aperta)
    '<div class="piano-tabs" id="piano-tabs-' +
    _pianoTab +
    '" role="tablist" aria-label="Schede del Piano" onkeydown="_pianoTabTasti(event)">' +
    PIANO_TAB_GRUPPI.map(([lbl, keys]) => {
      const dentro = keys.map(tabHtml).join('');
      if (!dentro) return ''; // nessuna scheda visibile in questo gruppo
      return gruppo(lbl, dentro);
    })
      .filter(Boolean)
      .join('<div class="piano-tabsep" aria-hidden="true"></div>') +
    (fuori.length
      ? '<div class="piano-tabsep" aria-hidden="true"></div>' + gruppo('&nbsp;', fuori.map(tabHtml).join(''))
      : '') +
    '</div>'
  );
}
// frecce, Inizio e Fine spostano il fuoco fra le schede; Invio e Spazio le aprono (sono pulsanti)
function _pianoTabTasti(ev) {
  const tasti = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'inizio', End: 'fine' };
  const mossa = tasti[ev.key];
  if (!mossa || !ev.target.classList || !ev.target.classList.contains('piano-tab')) return;
  const tutte = [...ev.currentTarget.querySelectorAll('.piano-tab')];
  const i = tutte.indexOf(ev.target);
  if (i < 0) return;
  ev.preventDefault();
  const n = mossa === 'inizio' ? 0 : mossa === 'fine' ? tutte.length - 1 : (i + mossa + tutte.length) % tutte.length;
  tutte.forEach((b, x) => (b.tabIndex = x === n ? 0 : -1));
  tutte[n].focus();
  _pianoTabInVista(tutte[n]);
}
// porta in vista una scheda dentro la barra (che al telefono scorre di lato), senza
// muovere la pagina
function _pianoTabInVista(tab) {
  const bar = tab && tab.closest('.piano-tabs');
  if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
  const b = bar.getBoundingClientRect();
  const r = tab.getBoundingClientRect();
  if (r.left >= b.left + 8 && r.right <= b.right - 8) return;
  bar.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
}
// dopo ogni disegno: la scheda aperta in vista nella barra e il fuoco rimesso se era su una scheda
function _pianoTabBarDopo(fuocoSuScheda) {
  const att = document.querySelector('#piano-content .piano-tab.attiva');
  if (!att) return;
  _pianoTabInVista(att);
  if (fuocoSuScheda) att.focus({ preventScroll: true });
}

// ORE REALI DEL MESE scritte a mano (tabella piano_ore_mese). Finche' la
// timbratrice non e' collegata, chi gestisce il piano puo' correggere il totale
// del mese: dove esiste una rettifica, saldo del mese e YTD usano quella invece
// delle ore pianificate. Si tiene traccia di chi ha scritto e quando.
let _pianoOreMese = {}; // 'nome|YYYY-MM' -> record
let _pianoOreMeseKey = '';
async function _pianoCaricaOreMese(ym) {
  if (_pianoOreMeseKey === ym) return;
  _pianoOreMeseKey = ym;
  _pianoOreMese = {};
  const r = (await secGet('piano_ore_mese?anno_mese=eq.' + ym + '&limit=3000')) || [];
  r.forEach((x) => (_pianoOreMese[x.collaboratore + '|' + x.anno_mese] = x));
}
// Rettifica del mese per un collaboratore (null se non c'e')
function _pianoRettificaMese(nome, ym) {
  return _pianoOreMese[nome + '|' + (ym || _pianoMeseSel)] || null;
}

// YTD saldo cumulato da gennaio al mese precedente (port di
// compute_ytd_saldo_map di Turnivo): per ogni mese usa le ore timbrate se
// presenti, altrimenti le ore piano (turni + codici speciali scalati);
// saldo_mese = ore - dovute; jolly esclusi.
// Dal 02.10.2026 comprende il RIPORTO della scheda Saldo (piano_saldo_iniziale):
// riporto + mesi non gia compresi nel riporto, esattamente come la scheda Saldo.
// Lo usano il calendario (colonna YTD) e la bozza (chi e in piu riceve meno ore).
let _pianoYtdMap = {};
let _pianoYtdRip = {}; // nome -> riporto compreso nell YTD (per la finestrella)
let _pianoYtdKey = '';
// YTD fino a fine mese aperto: si aggiunge il saldo del mese solo se il mese
// non e gia dentro il riporto (es. agosto con riporto al 31.08)
function _pianoYtdConMese(nome, saldoMese, oreMese) {
  const ym = _pianoMeseSel;
  // mese senza ore (non ancora pianificato): come nella scheda Saldo non conta
  if (oreMese !== undefined && !oreMese) return Math.round((_pianoYtdMap[nome] || 0) * 10) / 10;
  const dentro =
    typeof _pianoMeseDentroRiporto === 'function' &&
    _pianoMeseDentroRiporto(nome, parseInt(ym.split('-')[0]), ym.split('-')[1]);
  return Math.round(((_pianoYtdMap[nome] || 0) + (dentro ? 0 : saldoMese)) * 10) / 10;
}
function _pianoTestoYtd(nome, saldo, ytd, ore) {
  const f = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1);
  const rip = _pianoYtdRip[nome] || 0;
  const mesi = (_pianoYtdMap[nome] || 0) - rip;
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const rec = typeof _pianoSaldoIniz !== 'undefined' ? _pianoSaldoIniz[nome + '|' + anno] : null;
  const dataRip =
    rec && rec.data_riferimento
      ? ' al ' + String(rec.data_riferimento).substring(0, 10).split('-').reverse().join('.')
      : '';
  const dentro = _pianoMeseDentroRiporto(nome, anno, _pianoMeseSel.split('-')[1]);
  return (
    'Saldo ore dell anno (come la scheda Saldo)\n' +
    (rip ? 'Riporto' + dataRip + ': ' + f(rip) + '\n' : 'Nessun riporto registrato\n') +
    'Mesi precedenti' +
    (rip && dataRip ? ' dopo il riporto' : ' da gennaio') +
    ': ' +
    f(mesi) +
    '\n' +
    'Questo mese: ' +
    (dentro ? 'già compreso nel riporto' : !ore ? 'senza ore, non conta' : f(saldo)) +
    '\n' +
    'Totale: ' +
    f(ytd)
  );
}
async function _pianoAggiornaYtd(nomi) {
  const ym = _pianoMeseSel;
  // servono per sapere quali giorni chiudono tardi (turni con orario prolungato)
  await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
  const chiave = ym + '|' + _pianoReparto();
  if (_pianoYtdKey === chiave) return;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  _pianoYtdMap = {};
  _pianoYtdRip = {};
  _pianoYtdKey = chiave;
  await _pianoCaricaSaldoIniziale(anno);
  const _conRiporto = () =>
    nomi.forEach((n) => {
      const info = _pianoCollabInfo(n) || {};
      if (info.is_jolly) return;
      const rip = _pianoRiporto(n, anno);
      if (!rip) return;
      _pianoYtdRip[n] = rip;
      _pianoYtdMap[n] = Math.round(((_pianoYtdMap[n] || 0) + rip) * 100) / 100;
    });
  if (mese <= 1) {
    _conRiporto();
    return;
  }
  const fine = ym + '-01';
  // SCALA CON MOLTI SETTORI: le ore YTD di un collaboratore possono stare in
  // piu reparti (coperture), quindi si leggono per NOME (solo i nomi del settore
  // corrente), non l anno intero di tutti i settori. Una lettura sola per tutti i
  // nomi (a pagine, senza tagli): prima era una lettura per persona, oltre 120
  // richieste a ogni cambio mese ai Tavoli.
  const _daA = anno + '-01-01';
  const lista = nomi.map((n) => encodeURIComponent(n)).join(',');
  const [righe, timbrate] = nomi.length
    ? await Promise.all([
        secGet('piano?collaboratore=in.(' + lista + ')&data=gte.' + _daA + '&data=lt.' + fine),
        secGet('piano_timbrature?collaboratore=in.(' + lista + ')&data=gte.' + _daA + '&data=lt.' + fine),
      ])
    : [[], []];
  _pianoRegistraGiorniTurno(righe || []);
  const perMese = {}; // nome|m -> ore piano
  (righe || []).forEach((r) => {
    const m = parseInt(r.data.split('-')[1]);
    const info = _pianoCollabInfo(r.collaboratore) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const o = _pianoOreDiRiga(r, pct);
    if (o) perMese[r.collaboratore + '|' + m] = (perMese[r.collaboratore + '|' + m] || 0) + o;
  });
  const timbMese = {}; // nome|m -> ore timbrate
  (timbrate || []).forEach((t) => {
    const m = parseInt(t.data.split('-')[1]);
    timbMese[t.collaboratore + '|' + m] = (timbMese[t.collaboratore + '|' + m] || 0) + (parseFloat(t.ore) || 0);
  });
  // ore reali scritte a mano nei mesi passati: hanno la precedenza su tutto,
  // perche' sono il totale verificato da chi gestisce il piano
  const rettMese = {}; // nome|m -> ore reali
  const rett = (await secGet('piano_ore_mese?anno_mese=gte.' + anno + '-01&anno_mese=lt.' + ym + '')) || [];
  rett.forEach((x) => {
    const m = parseInt(String(x.anno_mese).split('-')[1]);
    rettMese[x.collaboratore + '|' + m] = parseFloat(x.ore_reali) || 0;
  });
  // scostamenti giornalieri dei mesi gia' passati (scheda Recupero ore)
  const recMese = {}; // nome|m -> ore in piu'/in meno
  const recAnno =
    (await secGet(
      'piano_recupero_ore?data=gte.' + _daA + '&data=lt.' + fine + '&reparto_dip=eq.' + _pianoReparto() + '',
    )) || [];
  recAnno.forEach((x) => {
    const m = parseInt(String(x.data).split('-')[1]);
    const k = x.collaboratore + '|' + m;
    recMese[k] = (recMese[k] || 0) + (parseFloat(x.ore) || 0);
  });
  // STESSA REGOLA DELLA SCHEDA SALDO (_pianoSaldoDelMese): un mese conta solo se
  // ha un piano e la persona ha ore (altrimenti un mese non pianificato, o prima
  // dell assunzione, risultava un buco di 175 ore); saldo del mese arrotondato
  // a un decimale come nella scheda Saldo.
  const mesiConPiano = {};
  (righe || []).forEach((r) => (mesiConPiano[parseInt(r.data.split('-')[1])] = true));
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    if (info.is_jolly) return;
    const pct = parseFloat(info.percentuale) || 1; // senza percentuale vale 100%, come nel calcolo del mese
    let cum = 0;
    for (let m = 1; m < mese; m++) {
      if (_pianoMeseDentroRiporto(n, anno, String(m).padStart(2, '0'))) continue; // gia nel riporto
      if (!mesiConPiano[m]) continue;
      const k = n + '|' + m;
      const effettive =
        rettMese[k] != null ? rettMese[k] : timbMese[k] != null ? timbMese[k] : (perMese[k] || 0) + (recMese[k] || 0);
      if (!effettive) continue;
      const dim = _pianoGgDovuti(n, anno + '-' + String(m).padStart(2, '0')); // meno i giorni di congedo non pagato
      const dovute = Math.round((dim / 7) * _pianoOreSett * pct * 10) / 10;
      cum += Math.round((Math.round(effettive * 100) / 100 - dovute) * 10) / 10;
    }
    _pianoYtdMap[n] = Math.round(cum * 100) / 100;
  });
  _conRiporto();
}

// Scrive le ORE REALI di un mese per un collaboratore. Il saldo del mese e'
// un valore calcolato (ore meno dovute): si corregge la causa, cioe' le ore,
// non l'effetto. Cosi' il numero resta spiegabile e continua ad aggiornarsi.
async function pianoScriviOreMese(nome) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return;
  }
  const ym = _pianoMeseSel;
  const info = _pianoCollabInfo(nome) || {};
  if (info.is_jolly) {
    // per gli ausiliari non esistono ore dovute, quindi non esiste un saldo da
    // correggere: le loro ore sono quelle che risultano dai turni fatti
    toast('Gli ausiliari non hanno ore dovute: il saldo non si applica');
    return;
  }
  // mese passato: si corregge solo con motivo tracciato
  if (!(await _pianoConsentiSaldoMese(ym))) return;
  const att = _pianoRettificaMese(nome, ym);
  const riga = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(nome) + '"]');
  const pianificate = riga ? (riga.querySelector('td[data-tot="4"]') || {}).textContent : '';
  const val = await chiediTesto(
    'Ore realmente lavorate da ' +
      nome +
      ' nel mese ' +
      ym +
      '.\n\nPianificate dal programma: ' +
      String(pianificate || '').replace('*', '') +
      ' ore.\nScrivi il totale reale (vuoto = torna alle ore del piano):',
    att ? String(att.ore_reali) : '',
  );
  if (val === null) return;
  const testo = String(val).trim().replace(',', '.');
  try {
    if (testo === '') {
      if (att) {
        await secDel('piano_ore_mese', 'id=eq.' + att.id);
        delete _pianoOreMese[nome + '|' + ym];
        logAzione('Ore reali del mese tolte', nome + ' ' + ym + ' (erano ' + att.ore_reali + 'h)');
        _pianoRegistraModifica('Saldo ore', nome, 'ore reali ' + ym, att.ore_reali + 'h', 'ore del piano');
        toast('Salvato \u00b7 rettifica tolta: ' + nome + ' torna alle ore del piano');
      }
    } else {
      // ore decimali (160.5 o 160,5) oppure ore e minuti (160:30): prima "160:30" valeva 160
      const mHm = String(testo)
        .trim()
        .match(/^(\d{1,3}):([0-5]\d)$/);
      const ore = mHm
        ? parseInt(mHm[1]) + parseInt(mHm[2]) / 60
        : /^\d{1,3}([.,]\d+)?$/.test(String(testo).trim())
          ? parseFloat(String(testo).trim().replace(',', '.'))
          : NaN;
      if (isNaN(ore) || ore < 0 || ore > 400) {
        toastErrore('Valore non valido: scrivi le ore come 160.5 oppure 160:30');
        return;
      }
      const nota = await chiediTesto(
        'Motivo della correzione (facoltativo, resta nello storico):',
        (att && att.nota) || '',
      );
      if (nota === null) return;
      const dati = {
        collaboratore: nome,
        anno_mese: ym,
        ore_reali: ore,
        nota: String(nota).trim() || null,
        operatore: getOperatore(),
        reparto_dip: _pianoReparto(),
        modificato_il: new Date().toISOString(),
      };
      if (att) {
        await secPatch('piano_ore_mese', 'id=eq.' + att.id, dati);
        _pianoOreMese[nome + '|' + ym] = Object.assign({}, att, dati);
      } else {
        const nuovo = await secPost('piano_ore_mese', dati);
        _pianoOreMese[nome + '|' + ym] = (nuovo && nuovo[0]) || Object.assign({ creato_il: dati.modificato_il }, dati);
      }
      logAzione(
        'Ore reali del mese',
        nome +
          ' ' +
          ym +
          ': ' +
          (att ? att.ore_reali + 'h' : 'ore del piano') +
          ' \u2192 ' +
          ore +
          'h' +
          (dati.nota ? ' (' + dati.nota + ')' : ''),
      );
      _pianoRegistraModifica(
        'Saldo ore',
        nome,
        'ore reali ' + ym,
        att ? att.ore_reali + 'h' : 'ore del piano',
        ore + 'h',
      );
      toast('Salvato \u00b7 ' + nome + ' ' + ym + ': ' + ore + 'h (' + _pianoOreHm(ore) + ')');
    }
    _pianoYtdKey = ''; // l'YTD dei mesi seguenti cambia: si ricalcola
    renderPiano();
  } catch (e) {
    toastErrore('Ore del mese NON salvate: ' + ((e && e.message) || e) + '. Riprova.', 8000);
    console.error('pianoScriviOreMese', e);
  }
}

// ============================================================
// SCRITTURE SICURE DEL PIANO CON PIU PC SULLO STESSO MESE (11/10/2026)
// Ogni scrittura a mano passa da piano_scrivi_celle (migrazione 20260912): il database
// scrive SOLO se ogni cella e ancora come la vedeva chi scrive ("atteso": sigla,
// protetto, motivo del blocco; null = cella vuota) e, con piu celle, tutto o niente.
// Se un collega l ha cambiata nel frattempo non si scrive niente: si dice chi e cosa e
// si ricarica. Prima la modifica per numero di riga non guardava il valore (scrittura
// persa con "Piano modificato" nel Registro, o V protetta di un collega sovrascritta) e
// scambi e coperture facevano 2-4 scritture in fila senza ritorno.
// Database senza la migrazione: la strada di prima (una scrittura alla volta, con il
// controllo letto subito prima).
// ============================================================
const PIANO_CAMPI_CELLA = [
  'codice',
  'protetto',
  'generato',
  'ora_inizio',
  'ora_fine',
  'commento',
  'colore',
  'motivo_blocco',
  'fasce',
  'reparto_dip',
  'prima_malattia',
];
let _pianoScriviCelleManca = false;
// cosa deve trovare il database perche la scrittura valga: la cella come la vede chi
// scrive (null = vuota)
function _pianoAttesoDi(r) {
  if (!r) return null;
  return { codice: r.codice, protetto: !!r.protetto, motivo_blocco: r.motivo_blocco || null };
}
// la cella come l ha vista chi scrive: dalla memoria se il mese e il collaboratore sono
// caricati (assente = vuota), altrimenti dalla lettura appena fatta (rigaDb)
function _pianoAttesoVisto(nome, dstr, rigaDb) {
  const mem = (_pianoRighe || []).find((x) => x.collaboratore === nome && x.data === dstr);
  if (mem) return _pianoAttesoDi(mem);
  const info = typeof _pianoCollabInfo === 'function' ? _pianoCollabInfo(nome) : null;
  if (String(dstr).startsWith(_pianoMeseSel + '-') && info && _pianoAppartieneAlReparto(info)) return null;
  return _pianoAttesoDi(rigaDb || null);
}
// REGOLE PER UNA SCRITTURA DI PIU CELLE (corsi, incolla, copertura, scambi con
// restituzione): per ogni persona toccata le violazioni NUOVE che TUTTE le sue celle nuove
// insieme creerebbero, con il motore di Valida (_pianoViolazioniPersona: riposo minimo con
// gli orari veri, giorni di fila anche a cavallo del mese, riposo singolo dopo 4 giorni,
// riposo attorno alla domenica, ore della settimana, chi fa cosa, ND del Diario). Prima
// ogni percorso controllava a modo suo (o non controllava): il corso nessuna regola,
// l incolla nessuna, la restituzione dello scambio senza lo scambio del primo giorno.
// mosse: [{ nome, data, codice, ora_inizio?, ora_fine? }] (codice '' = cella vuota).
// Ritorna { nome: [{ data, msg, ore }] } solo per chi ha violazioni nuove; ore = true per
// le ore del mese oltre la tolleranza (regola aziendale, non di legge).
async function _pianoViolazioniMosse(mosse) {
  const out = {};
  if (!mosse || !mosse.length) return out;
  const sposta = (d, n) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + n);
    return dataLocaleISO(x);
  };
  const perNome = {};
  mosse.forEach((m) => {
    const d = String(m.data).substring(0, 10);
    (perNome[m.nome] = perNome[m.nome] || {})[d] = m;
  });
  const date = mosse.map((m) => String(m.data).substring(0, 10)).sort();
  // il mese di ogni giorno toccato e quelli accanto, con le due settimane a cavallo
  const da = sposta(sposta(date[0], -14).substring(0, 7) + '-01', -14);
  const a = sposta(date[date.length - 1], 14 + 31 + 14);
  const nomi = Object.keys(perNome);
  // tutti i settori: chi lavora in due settori ha celle anche nell altro piano
  const righe = [];
  for (let i = 0; i < nomi.length; i += 40) {
    const lista = nomi
      .slice(i, i + 40)
      .map((n) => encodeURIComponent(n))
      .join(',');
    const parte = (await secGet('piano?collaboratore=in.(' + lista + ')&data=gte.' + da + '&data=lte.' + a)) || [];
    parte.forEach((r) => righe.push(r));
  }
  const reali = {};
  righe.forEach((r) => ((reali[r.collaboratore] = reali[r.collaboratore] || {})[String(r.data).substring(0, 10)] = r));
  const chiave = (v) => v.giorno + '|' + v.msg.replace(/[0-9]+([.,][0-9]+)?/g, '#');
  const ctxPer = {};
  for (const nome of nomi) {
    const prima = reali[nome] || {};
    const dopo = Object.assign({}, prima);
    Object.keys(perNome[nome]).forEach((d) => {
      const m = perNome[nome][d];
      if (!m.codice) {
        delete dopo[d];
        return;
      }
      const r0 = prima[d];
      const riga = Object.assign({}, r0 || {}, { collaboratore: nome, data: d, codice: m.codice });
      // una cella che cambia sigla non tiene l orario della sigla vecchia
      if (!r0 || r0.codice !== m.codice || m.ora_inizio !== undefined) {
        riga.ora_inizio = m.ora_inizio || null;
        riga.ora_fine = m.ora_fine || null;
      }
      if (!r0 || r0.codice !== m.codice) riga.protetto = true;
      dopo[d] = riga;
    });
    const mesi = new Set();
    Object.keys(perNome[nome]).forEach((d) => [-14, 0, 14].forEach((o) => mesi.add(sposta(d, o).substring(0, 7))));
    const viste = new Set();
    for (const ym of [...mesi].sort()) {
      const ctx = ctxPer[ym] || (ctxPer[ym] = _pianoCtxViolazioni(ym));
      const nG = _pianoUltimoGiorno(ym);
      const viol = (stato) => {
        const mese = [];
        const sett = [];
        for (let k = -13; k <= nG + 14; k++) {
          const r = stato[sposta(ym + '-01', k - 1)];
          if (!r || !r.codice) continue;
          sett.push(r);
          if (k >= 1 && k <= nG) mese.push(r);
        }
        return _pianoViolazioniPersona(nome, mese, sett, ctx).filter((v) => !/SOTTO il minimo/.test(v.msg));
      };
      const gia = new Set(viol(prima).map(chiave));
      viol(dopo).forEach((v) => {
        const k = ym + '|' + chiave(v);
        if (gia.has(chiave(v)) || viste.has(k)) return;
        viste.add(k);
        const dataV = (v.celle && v.celle[0]) || (v.giorno > 0 ? ym + '-' + String(v.giorno).padStart(2, '0') : ym);
        (out[nome] = out[nome] || []).push({ data: dataV, msg: v.msg, ore: /^ore mese/.test(v.msg) });
      });
    }
  }
  return out;
}
// i campi di una cella (per ripristini e confronti); solo le colonne che la riga ha
function _pianoCampiDi(r) {
  const o = {};
  PIANO_CAMPI_CELLA.forEach((k) => {
    if (r && r[k] !== undefined) o[k] = r[k];
  });
  return o;
}
// valore per il confronto: vuoto, falso, null e lista vuota sono "niente" (come _piano_norm)
function _pianoValNorm(v) {
  if (v == null || v === false || v === '') return '';
  if (typeof v === 'string') return v.trim() === '' ? '' : v;
  if (typeof v === 'object') {
    const canon = (x) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.keys(x)
            .sort()
            .reduce((o, k) => ((o[k] = canon(x[k])), o), {})
        : Array.isArray(x)
          ? x.map(canon)
          : x;
    const s = JSON.stringify(canon(v));
    return s === '[]' || s === '{}' ? '' : s;
  }
  return String(v);
}
function _pianoCelleUguali(a, b) {
  if (!a || !b) return !a && !b;
  return PIANO_CAMPI_CELLA.every((k) => _pianoValNorm(a[k]) === _pianoValNorm(b[k]));
}
// stessa cella due volte nella stessa scrittura (es. catena e sostituto nello stesso
// giorno): resta UNA operazione, con il controllo della prima e i dati dell ultima.
// CANCELLA POI SCRIVE la stessa cella: la cella nuova SOSTITUISCE quella vecchia (i campi
// non scritti tornano vuoti). Prima diventava una modifica parziale: commento, blocco,
// protezione e "com era sotto la malattia" della cella cancellata restavano.
const PIANO_CELLA_VUOTA = {
  codice: '',
  protetto: false,
  generato: false,
  ora_inizio: null,
  ora_fine: null,
  commento: null,
  colore: null,
  motivo_blocco: null,
  fasce: null,
  prima_malattia: null,
};
function _pianoOpsUnisci(ops) {
  const per = new Map();
  ops.forEach((o) => {
    const k = o.collaboratore + '|' + String(o.data).substring(0, 10);
    const g = per.get(k);
    if (!g) per.set(k, Object.assign({}, o));
    else if (o.dati === null) {
      g.dati = null;
      delete g.sostituisce;
    } else if (g.dati === null) {
      g.dati = Object.assign({}, PIANO_CELLA_VUOTA, o.dati);
      g.sostituisce = true;
    } else g.dati = Object.assign({}, g.dati, o.dati);
  });
  return [...per.values()];
}
// descrizione di una cella cambiata da un collega: "Rossi Mario 03.12.2026: cambiata da
// Bianchi in S1 (protetta)" oppure "... svuotata da un collega"
function _pianoConflittoTesto(c) {
  const d = String(c.data).substring(0, 10).split('-').reverse().join('.');
  const a = c.attuale;
  if (!a) return c.collaboratore + ' ' + d + ': svuotata da un collega';
  return (
    c.collaboratore +
    ' ' +
    d +
    ': cambiata' +
    (a.operatore ? ' da ' + a.operatore : '') +
    ' in ' +
    (a.codice || 'vuota') +
    (a.motivo_blocco ? ' (bloccata: ' + a.motivo_blocco + ')' : a.protetto ? ' (protetta)' : '')
  );
}
function _pianoErroreConflitto(conflitti) {
  const lista = conflitti || [];
  const e = new Error(
    (lista.length === 1 ? 'cella cambiata mentre lavoravi: ' : lista.length + ' celle cambiate mentre lavoravi: ') +
      lista.slice(0, 6).map(_pianoConflittoTesto).join('; ') +
      (lista.length > 6 ? '; ...' : '') +
      '. Niente e stato scritto: ricarico il piano.',
  );
  e.conflitti = lista;
  e.pianoConflitto = true;
  return e;
}
// rete caduta durante una scrittura del piano: UN solo messaggio, chiaro
function _pianoErroreRete(e) {
  if (!e || e.pianoConflitto || e.rete) return e;
  if (!/Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) return e;
  const err = new Error(
    'connessione assente: la modifica del piano non e stata salvata (controlla la rete e ricarica il piano prima di riprovare)',
  );
  err.rete = true;
  return err;
}
// ERRORE DI UNA SCRITTURA DEL PIANO: UN messaggio. Senza rete il programma ha gia detto
// "Connessione assente: le modifiche non vengono salvate finche la rete non torna" (una
// lettura prima della scrittura, es. il controllo delle regole): non se ne aggiunge un
// secondo. avvisoPrima = window._sessioneScadutaAvvisata all inizio dell operazione.
function _pianoErroreScrittura(prefisso, e, avvisoPrima) {
  if (e && e.rete && !avvisoPrima && window._sessioneScadutaAvvisata) return;
  toastErrore(prefisso + ((e && e.message) || e), 9000);
}
// esito dopo le scritture: le celle nuove in memoria (quelle del mese aperto)
function _pianoMemoriaDopo(ops, righe) {
  (ops || []).forEach((o, i) => {
    const dstr = String(o.data).substring(0, 10);
    const nuova = righe && righe[i];
    const k = (_pianoRighe || []).findIndex((x) => x.collaboratore === o.collaboratore && x.data === dstr);
    if (k >= 0) {
      if (nuova) _pianoRighe[k] = nuova;
      else _pianoRighe.splice(k, 1);
    } else if (nuova && dstr.startsWith(_pianoMeseSel + '-')) _pianoRighe.push(nuova);
  });
}
// SCRIVE UNA O PIU CELLE: [{ collaboratore, data, atteso, dati }]
//   atteso: assente = nessun controllo; null = la cella deve essere vuota; oggetto = la cella
//           deve avere questi valori. dati: null = cancella; oggetto = modifica o inserisce.
// Ritorna { ok: true, righe } oppure { ok: false, conflitti } (niente scritto). Lancia
// solo per errori veri (permessi, rete: _pianoErroreRete).
async function _pianoScriviCelle(ops) {
  ops = _pianoOpsUnisci(ops || []);
  if (!ops.length) return { ok: true, righe: [] };
  const tk = getOpToken();
  if (tk && !_pianoFunzioneAssente('scrivi')) {
    const inviate = ops.map((o) => {
      const x = Object.assign({}, o);
      delete x.sostituisce;
      return x;
    });
    // FUNZIONE NON TROVATA (404, PGRST202): succede anche per pochi secondi mentre il
    // database rilegge l elenco delle funzioni (dopo un aggiornamento). Niente e stato
    // scritto: si riprova dopo un attimo. Prima un 404 passeggero spegneva la strada
    // sicura per tutta la sessione.
    for (let tentativo = 0; ; tentativo++) {
      try {
        const r = await _conSessione(
          (t) => _rpcSicura('piano_scrivi_celle', { p_token: t, p_ops: inviate }),
          tk,
          true, // rete caduta: niente secondo tentativo alla cieca (la prima potrebbe essere arrivata)
        );
        if (!r || typeof r.ok !== 'boolean') throw new Error('il database non ha confermato la scrittura del piano');
        _pianoFunzionePresente('scrivi');
        r.ops = ops;
        if (r.ok && typeof _pianoPassoRegistra === 'function') _pianoPassoRegistra(ops, r.fine);
        return r;
      } catch (e) {
        if (!_pianoErroreFunzioneAssente(e)) throw _pianoErroreRete(e);
        if (tentativo < PIANO_RIPROVE_FUNZIONE.length) {
          await new Promise((x) => setTimeout(x, PIANO_RIPROVE_FUNZIONE[tentativo]));
          continue;
        }
        _pianoFunzioneMancante('scrivi');
        break;
      }
    }
  }
  try {
    const r = await _pianoScriviCelleVecchio(ops);
    if (r.ok && typeof _pianoPassoRegistra === 'function') _pianoPassoRegistra(ops, null);
    return r;
  } catch (e) {
    throw _pianoErroreRete(e);
  }
}
// FUNZIONI DEL DATABASE PER IL PIANO (piano_scrivi_celle, piano_ora): assenti solo se lo
// restano dopo qualche secondo; e anche allora si ricontrolla ogni 5 minuti (migrazione
// lanciata mentre il programma e aperto). L assenza si dice in modo visibile, una volta.
const PIANO_RIPROVE_FUNZIONE = [700, 1500, 2500];
const _pianoFunzioniAssenti = {}; // { scrivi: ms, ora: ms }
let _pianoAvvisoFunzioneAssente = false;
function _pianoErroreFunzioneAssente(e) {
  return !!(e && (e.status === 404 || /PGRST202|Could not find the function/i.test(e.message || '')));
}
function _pianoFunzioneAssente(k) {
  const t = _pianoFunzioniAssenti[k];
  if (!t) return false;
  if (Date.now() - t > 5 * 60 * 1000) {
    delete _pianoFunzioniAssenti[k];
    return false;
  }
  return true;
}
function _pianoFunzionePresente(k) {
  delete _pianoFunzioniAssenti[k];
  if (k === 'scrivi') _pianoScriviCelleManca = false;
}
function _pianoFunzioneMancante(k) {
  _pianoFunzioniAssenti[k] = Date.now();
  if (k === 'scrivi') _pianoScriviCelleManca = true;
  console.warn('[piano] funzione del database assente (' + k + '): migrazione 20260912 da lanciare');
  if (_pianoAvvisoFunzioneAssente) return;
  _pianoAvvisoFunzioneAssente = true;
  if (typeof toastErrore === 'function')
    toastErrore(
      k === 'scrivi'
        ? 'Database non aggiornato (manca la scrittura sicura del piano, migrazione 20260912): le modifiche del piano non controllano quelle dei colleghi su altri PC. Avvisa l IT.'
        : 'Database non aggiornato (manca l ora del database, migrazione 20260912): Annulla del piano usa la fotografia del mese. Avvisa l IT.',
      15000,
    );
}
// SCRITTURA VERIFICATA: celle scritte (o cancellate) davvero. Il canale del database
// scarta in silenzio una modifica fuori dai permessi (0 righe toccate): qui diventa
// "Permesso mancante" invece di un "salvato" falso.
function _pianoVerificaScritte(ops, righe) {
  const ignora = ['updated_at', 'operatore'];
  ops.forEach((o, i) => {
    const r = righe[i];
    const giusta =
      o.dati === null
        ? !r
        : !!r &&
          Object.keys(o.dati)
            .filter((k) => !ignora.includes(k) && k in r)
            .every((k) => _pianoValNorm(r[k]) === _pianoValNorm(o.dati[k]));
    if (!giusta)
      throw new Error(
        'Permesso mancante: cella di ' +
          o.collaboratore +
          ' il ' +
          String(o.data).substring(0, 10).split('-').reverse().join('.') +
          ' non scritta',
      );
  });
}
// UNA O PIU CELLE, tutto o niente: una cella cambiata da un collega e un errore
// (niente scritto, con chi e cosa)
async function _pianoScriviOps(ops) {
  const es = await _pianoScriviCelle(ops);
  if (!es.ok) throw _pianoErroreConflitto(es.conflitti);
  return es;
}
// MODIFICA DI UNA CELLA come la vede chi scrive (r): se un collega l ha cambiata
// nel frattempo niente e scritto (errore con chi e cosa); la cella nuova torna e va
// anche in memoria
async function _pianoAggiornaCella(r, dati) {
  const es = await _pianoScriviOps([
    { collaboratore: r.collaboratore, data: String(r.data).substring(0, 10), atteso: _pianoAttesoDi(r), dati: dati },
  ]);
  _pianoMemoriaDopo(es.ops, es.righe);
  return es.righe && es.righe[0] ? es.righe[0] : null;
}
// database non aggiornato: controllo letto subito prima e scritture una alla volta
async function _pianoScriviCelleVecchio(ops) {
  const filtro = (o) =>
    'collaboratore=eq.' + encodeURIComponent(o.collaboratore) + '&data=eq.' + String(o.data).substring(0, 10);
  const attuali = await Promise.all(ops.map((o) => secGet('piano?' + filtro(o) + '&limit=1').then((x) => x[0])));
  const conflitti = [];
  ops.forEach((o, i) => {
    if (!('atteso' in o)) return;
    const cur = attuali[i] || null;
    const ok =
      o.atteso === null
        ? !cur
        : !!cur && Object.keys(o.atteso).every((k) => _pianoValNorm(cur[k]) === _pianoValNorm(o.atteso[k]));
    if (!ok) conflitti.push({ collaboratore: o.collaboratore, data: String(o.data).substring(0, 10), attuale: cur });
  });
  if (conflitti.length) return { ok: false, conflitti: conflitti, ops: ops };
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    let cur = attuali[i];
    // cancella poi scrive: si cancella davvero e si inserisce la cella nuova
    let dati = o.dati;
    if (o.sostituisce && dati) {
      if (cur) await secDel('piano', 'id=eq.' + cur.id);
      cur = null;
      dati = Object.fromEntries(Object.entries(dati).filter(([, v]) => v !== null));
    }
    if (dati === null) {
      if (cur) await secDel('piano', 'id=eq.' + cur.id);
    } else if (cur) await secPatch('piano', 'id=eq.' + cur.id, dati);
    else
      await secPost(
        'piano',
        Object.assign({}, dati, { collaboratore: o.collaboratore, data: String(o.data).substring(0, 10) }),
      );
  }
  const righe = await Promise.all(ops.map((o) => secGet('piano?' + filtro(o) + '&limit=1').then((x) => x[0] || null)));
  _pianoVerificaScritte(ops, righe);
  return { ok: true, righe: righe, ops: ops };
}
// celle cambiate da un collega: un solo avviso con chi e cosa, poi si ricarica
async function _pianoAvvisaConflitti(conflitti, titolo) {
  const err = _pianoErroreConflitto(conflitti);
  if ((conflitti || []).length <= 1) toastErrore((titolo ? titolo + ': ' : '') + err.message, 9000);
  else
    await mostraAvviso(
      (titolo ? titolo + '\n\n' : '') +
        'Mentre lavoravi un collega ha cambiato ' +
        conflitti.length +
        ' celle:\n\n• ' +
        conflitti.slice(0, 15).map(_pianoConflittoTesto).join('\n• ') +
        (conflitti.length > 15 ? '\n... e altre ' + (conflitti.length - 15) : '') +
        '\n\nNon ho scritto niente: ricarico il piano, controlla e riprova.',
      { titolo: 'Piano cambiato da un collega' },
    );
  if (typeof renderPiano === 'function') await renderPiano();
}

// INSERISCE una cella che chi scrive vede VUOTA. Se nel database c e gia (messa nel
// frattempo da un collega o di un altro settore): una cella scritta dal programma
// (bozza, non protetta, senza blocco) si aggiorna, se e ancora quella; una cella scritta a
// mano, protetta o bloccata NON si sovrascrive (errore con chi e cosa). Prima si
// riscriveva per collaboratore e giorno qualsiasi cosa ci fosse: una V protetta messa da
// un collega spariva sotto la vista vecchia di un altro PC.
async function _pianoInserisciCella(dati) {
  // stessa regola dei giorni chiusi per OGNI inserimento, da qualunque flusso
  // arrivi (bozza, scambi, coperture): il controllo sta nel punto unico
  if (dati && dati.data && !(await _pianoConsentiScrittura(String(dati.data).substring(0, 10))))
    throw new Error('giorno chiuso: ' + dati.data);
  const corpo = Object.assign({}, dati);
  delete corpo.collaboratore;
  delete corpo.data;
  const op = { collaboratore: dati.collaboratore, data: String(dati.data).substring(0, 10), atteso: null, dati: corpo };
  const es = await _pianoScriviCelle([op]);
  if (es.ok) return es.righe && es.righe[0] ? es.righe[0] : null;
  const att = es.conflitti && es.conflitti[0] ? es.conflitti[0].attuale : null;
  if (!att || att.protetto || att.motivo_blocco || !att.generato) throw _pianoErroreConflitto(es.conflitti);
  const es2 = await _pianoScriviCelle([
    Object.assign({}, op, {
      atteso: Object.assign(_pianoAttesoDi(att), { generato: true }),
      dati: Object.assign({}, corpo, { updated_at: new Date().toISOString() }),
    }),
  ]);
  if (!es2.ok) throw _pianoErroreConflitto(es2.conflitti);
  return es2.righe && es2.righe[0] ? es2.righe[0] : null;
}

// SCRITTURE DEL PIANO IN CORSO SU QUESTO PC (a mano, scambi, coperture...): la
// generazione automatica aspetta che finiscano prima di cambiare mese, settore e celle
// in memoria. Prima poteva partire mentre una scrittura era ferma su una conferma: la
// cella finiva nel settore della generazione.
let _pianoScrittureInCorso = 0;
async function _pianoConScrittura(fn) {
  if (window._pianoAutoInCorso) {
    toastErrore(
      (window._pianoAutoInCorso.mesi ? 'Prepara più mesi' : 'Generazione automatica del piano') +
        ' in corso su questo PC: riprova fra qualche minuto.',
    );
    return false;
  }
  _pianoScrittureInCorso++;
  try {
    return await _pianoOperazione(fn);
  } finally {
    _pianoScrittureInCorso--;
  }
}
// UN OPERAZIONE DEL PIANO (scambio, cella, colore, incolla, Sistema le ore...): alla
// fine il suo passo di Annulla si CHIUDE. Prima restava aperto fino all operazione
// dopo: le scritture fatte nel frattempo da questa sessione fuori dal Piano (malattia
// dal Diario, generazione automatica) finivano nel suo Annulla e tornavano indietro.
let _pianoOperazioniInCorso = 0;
async function _pianoOperazione(fn) {
  _pianoOperazioniInCorso++;
  try {
    return await fn();
  } finally {
    _pianoOperazioniInCorso--;
    if (!_pianoOperazioniInCorso && typeof _pianoUndoChiudiAperto === 'function') _pianoUndoChiudiAperto();
  }
}
// SCRITTURE DEL PIANO FUORI DA UN OPERAZIONE DEL PIANO (Diario, congedi, generazione
// automatica): il passo di Annulla rimasto aperto si chiude prima, se nessuna
// operazione del Piano e in corso (una malattia scritta dal Piano passa anche dal
// Diario: quelle scritture restano dell operazione)
function _pianoFuoriDalPasso() {
  if (!_pianoOperazioniInCorso && typeof _pianoUndoChiudiAperto === 'function') _pianoUndoChiudiAperto();
}
async function _pianoAttendiScritture(massimoMs) {
  const fine = Date.now() + (massimoMs || 10 * 60 * 1000);
  while (_pianoScrittureInCorso > 0 && Date.now() < fine) await new Promise((x) => setTimeout(x, 300));
  return _pianoScrittureInCorso === 0;
}

// Carica le righe di un mese per un settore, in modo che SCALI con molti
// settori. Una query filtrata per il settore corrente, piu' le righe dei
// collaboratori di ALTRI settori che coprono qui (reparti_extra): di ognuno si
// caricano TUTTE le righe del mese, in qualunque settore lavori, cosi' si vede
// quando e' gia' occupato altrove e non lo si assegna due volte. Le query dei
// coprenti girano in parallelo a gruppi: il tempo dipende dai coprenti del
// settore aperto, non dal numero totale di settori, e non c'e' troncamento.
async function _pianoCaricaMeseSettore(da, a, rep) {
  // Tutte le letture partono INSIEME (prima una dopo l altra: in produzione ogni
  // lettura aspettava il giro su internet della precedente). Il risultato e lo stesso.
  // Giorni delle settimane a cavallo del mese (lunedi-domenica, una settimana in
  // piu: riposi a cavallo): servono per le ore lavorate nella settimana.
  const l = new Date(da + 'T12:00:00');
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7) - 7);
  const dm = new Date(a + 'T12:00:00');
  dm.setDate(dm.getDate() + ((7 - dm.getDay()) % 7) + 7);
  const dalB = dataLocaleISO(l) < da ? dataLocaleISO(l) : da;
  const alB = dataLocaleISO(dm) > a ? dataLocaleISO(dm) : a;
  // CELLE DEGLI ALTRI SETTORI di chi lavora anche altrove: sia chi viene a coprire
  // da un altro settore, sia chi e di questo settore ma ne ha altri (es. Balliu,
  // Slots con anche Valet). Prima il secondo caso non si leggeva: nel settore di
  // casa i giorni passati al Valet sembravano vuoti, la bozza ci metteva turni
  // (che il database poi scartava in silenzio) e riposi e ore della settimana
  // non li contavano. Si leggono anche i giorni del bordo (riposi a cavallo).
  // tutti i collaboratori del settore, anche chi e solo di questo settore: puo avere
  // celle scritte nel piano di un altro (Tonati con R23 nel foglio Valet)
  const altrove = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c, rep))
    .map((c) => c.nome);
  // sigle che esistono SOLO in questo settore: una cella con quella sigla nel piano
  // di un altro settore copre un posto qui (Papa del Valet su R22 della Reception)
  const soloQui = (pianoTurniCache || [])
    .filter((t) => t.attivo !== false && _repartoDi(t) === rep)
    .map((t) => t.codice)
    .filter(
      (cod) => !(pianoTurniCache || []).some((t) => t.attivo !== false && t.codice === cod && _repartoDi(t) !== rep),
    );
  const periodo = '&reparto_dip=neq.' + rep + '&data=gte.' + dalB + '&data=lte.' + alB;
  const bordoNulla = (pr) => pr.catch(() => []);
  const [righeLette, , prima, dopo, loro, conSigleQui] = await Promise.all([
    secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + rep + ''),
    // malattie dell anno: servono per le ore di malattia (giorno 1-14 o dal 15.)
    _pianoCaricaMalattieAnno(parseInt(String(da).substring(0, 4)), rep),
    dalB < da
      ? bordoNulla(secGet('piano?data=gte.' + dalB + '&data=lt.' + da + '&reparto_dip=eq.' + rep + '&limit=2000'))
      : [],
    alB > a
      ? bordoNulla(secGet('piano?data=gt.' + a + '&data=lte.' + alB + '&reparto_dip=eq.' + rep + '&limit=2000'))
      : [],
    altrove.length
      ? secGet('piano?collaboratore=in.(' + altrove.map((n) => encodeURIComponent(n)).join(',') + ')' + periodo)
      : [],
    soloQui.length
      ? secGet('piano?codice=in.(' + soloQui.map((c) => encodeURIComponent(c)).join(',') + ')' + periodo)
      : [],
  ]);
  const righe = righeLette || [];
  // serve a sapere in quali giorni e previsto il turno che fa prolungare un altro
  // (es. Z12 per Z0)
  _pianoRegistraGiorniTurno(righe);
  window._pianoRigheBordo = (prima || []).concat(dopo || []);
  const visti = new Set(righe.map((r) => r.id).concat(window._pianoRigheBordo.map((r) => r.id)));
  (loro || []).concat(conSigleQui || []).forEach((r) => {
    if (visti.has(r.id)) return;
    visti.add(r.id);
    const d = String(r.data).substring(0, 10);
    if (d >= da && d <= a) righe.push(r);
    else window._pianoRigheBordo.push(r);
  });
  return righe;
}
// RIDISEGNI IN FILA: se ne arriva uno mentre un altro e in corso, si accoda e
// alla fine se ne fa UNO solo con lo stato piu recente. Prima due ridisegni
// sovrapposti potevano finire nell ordine sbagliato: il piu vecchio riscriveva
// lo schermo (e i dati in memoria) del mese o della scheda precedente.
let _pianoRenderInCorso = null;
let _pianoRenderCoda = null;
function renderPiano() {
  // generazione automatica in corso su questo PC (js/piano-auto.js): il mese e il
  // settore in memoria sono i suoi, la pagina mostra l avviso finche finisce
  if (window._pianoAutoInCorso) {
    if (typeof _pianoAutoBanner === 'function') _pianoAutoBanner();
    return Promise.resolve();
  }
  if (_pianoRenderInCorso) {
    if (!_pianoRenderCoda)
      _pianoRenderCoda = _pianoRenderInCorso.then(
        () => {
          _pianoRenderCoda = null;
          return renderPiano();
        },
        () => {
          _pianoRenderCoda = null;
          return renderPiano();
        },
      );
    return _pianoRenderCoda;
  }
  if (typeof _ricordaSettore === 'function') _ricordaSettore(); // settore e mese restano dopo un aggiornamento
  _pianoRenderInCorso = _renderPianoCore().finally(() => {
    _pianoRenderInCorso = null;
    // moduli di non disponibilita: si creano o aggiornano se gli ND del mese cambiano
    if (typeof ndProgramma === 'function') ndProgramma();
    // confine fra due mesi: regole rotte nei primi giorni del mese dopo gia pianificato
    if (typeof _pianoConfineMostra === 'function' && _pianoTab === 'calendario') _pianoConfineMostra();
    // un altro PC sta generando questo mese: avviso, senza bloccare
    if (typeof pianoAutoAvvisoMese === 'function' && _pianoTab === 'calendario') pianoAutoAvvisoMese();
  });
  return _pianoRenderInCorso;
}
async function _renderPianoCore() {
  const el = document.getElementById('piano-content');
  if (!el) return;
  // dati non ancora arrivati (login appena fatto): mostra l'attesa e riprova
  // da solo · a caricamento finito loadAll richiama comunque renderPiano
  if (!window._loadAllDone && (!collaboratoriCache || !collaboratoriCache.length)) {
    el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento dati&hellip;</p>';
    clearTimeout(window._pianoAttesaTimer);
    window._pianoAttesaTimer = setTimeout(() => renderPiano(), 800);
    return;
  }
  // niente "Caricamento" che accorcia la pagina (faceva saltare lo scroll
  // in cima a ogni cambio giorno/mese): il contenuto vecchio resta visibile
  // sbiadito finché il nuovo non è pronto, poi lo scroll viene ripristinato
  const scrollPrec = window.scrollY;
  if (!el.firstChild) el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento piano...</p>';
  else el.style.opacity = '0.55';
  try {
    await _pianoCaricaCfg();
    // la scheda ricordata potrebbe essere stata nascosta a questo operatore
    if (!pianoTabVisibile(_pianoTab)) {
      const prima = _PIANO_TABS.map((x) => x[0]).find((k) => pianoTabVisibile(k));
      _pianoTab = prima || 'calendario';
    }
    // freccia Indietro: pagina e scheda del Piano nella cronologia (navigazione.js)
    if (typeof navRegistra === 'function') navRegistra();
    const ym = _pianoMeseSel;
    // FESTIVITA' PRIMA DI TUTTO: da queste dipende quali giorni chiudono tardi,
    // e quindi la durata dei turni che si prolungano. Se il dato non c'e', le
    // ore risulterebbero corte senza che nessuno se ne accorga: va caricato per
    // OGNI scheda, non solo per il calendario.
    await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
    const nGiorni = _pianoUltimoGiorno(ym);
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    // ora del database per le finestre di Annulla (una volta per sessione, in parallelo)
    if (typeof _pianoCalibraOra === 'function') _pianoCalibraOra();
    _pianoRighe = await _pianoCaricaMeseSettore(da, a, _pianoReparto());
    // domeniche libere dei mesi prima (conto annuale per Valida, bozza e Migliora)
    if (typeof _pianoCaricaDomAnno === 'function') await _pianoCaricaDomAnno(ym, _pianoReparto()).catch(() => {});
    const mappa = {}; // 'nome|data' -> riga
    _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + r.data] = r));
    const malattie = _pianoMalattieMese(ym);
    const ndMap = _pianoNdMese(ym);
    const festiviSet = {};
    pianoFestiviCache.forEach((f) => (festiviSet[f.data] = f.descrizione));

    // righe: collaboratori attivi del settore + eventuali nomi presenti solo nel piano (in
    // fondo). Ordine unico del programma (ordineCollabPiano): il RESP in cima, poi l ordine
    // trascinato a mano, poi SUP, BO, gli altri, jolly in fondo.
    const collabs = collaboratoriCache
      .filter(
        (c) =>
          c.attivo !== false &&
          _pianoAppartieneAlReparto(c) &&
          (_pianoOperativoNelMese(c, ym) || _pianoRighe.some((r) => r.collaboratore === c.nome)),
      )
      .map((c) => c.nome);
    const extra = [...new Set(_pianoRighe.map((r) => r.collaboratore))].filter((n) => !collabs.includes(n));
    const nomi = ordineCollabPiano(collabs, _pianoReparto()).concat(ordineCollabPiano(extra, _pianoReparto()));
    // coordinatori del mese (regola di gruppo "coordinatori"): il rosso si calcola qui
    window._pianoCoordMappa = _pianoCoordinatoriDa(
      _pianoRighe.filter((r) => String(r.data).startsWith(ym) && _pianoCopreQui(r)),
      _pianoReparto(),
    ).mappa;
    const puoMod = puoGestirePiano();
    const GG = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
    const GG3 = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']; // come Turnivo (GIORNI_SETT)
    const MESI_L = MESI_FULL || [];
    const label = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];

    let h = _pianoTabBar() + _pianoModificheHtml();
    if (_pianoTab === 'calendario') {
      h += '<div class="main-card"><div class="card-header pbar"><div class="pbar-riga">';
      h +=
        '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><span style="min-width:150px;text-align:center;font-weight:700">' +
        escP(label) +
        '</span><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>';
      // SETTORE: uno solo per tutto il programma. La tendina (se si vedono piu settori)
      // cambia anche quello della barra in alto (pianoCambiaReparto -> setReparto)
      const ammessiRep = _pianoRepartiAmmessi();
      const repVisibili = getReparti().filter((rp) => ammessiRep.includes(rp.key));
      if (repVisibili.length > 1) {
        h +=
          '<label class="pbar-settore pbar-settore-scelta" title="Settore del piano: è lo stesso della barra in alto, cambiarlo qui lo cambia anche lì"><span class="pbar-settore-lbl">Settore</span><select onchange="pianoCambiaReparto(this.value)">';
        repVisibili.forEach((rp) => {
          h +=
            '<option value="' +
            rp.key +
            '"' +
            (rp.key === _pianoReparto() ? ' selected' : '') +
            '>' +
            escP(rp.label) +
            '</option>';
        });
        h += '</select></label>';
      } else
        h +=
          '<span class="pbar-settore"><span class="pbar-settore-lbl">Settore</span> ' +
          escP(repartoLabel(_pianoReparto())) +
          '</span>';
      if (puoMod) {
        // Annulla / Ripristina: quelli generici in basso (Ctrl+Z / Ctrl+Y), per tutto il programma
        h +=
          '<span id="piano-autosave" title="Ogni modifica al piano si salva da sola nel database, subito. Per tornare indietro o avanti: Annulla e Ripristina in basso (Ctrl+Z, Ctrl+Y).">Salvataggio automatico</span>' +
          '<input type="text" id="piano-cerca" class="campo-cerca" placeholder="Cerca nome o sigla..." value="' +
          escP(window._pianoCercaTesto || '') +
          '" oninput="pianoCercaFiltra(this.value)" title="Mostra solo i collaboratori il cui nome contiene il testo, oppure chi ha quella sigla nel mese (es. C8). Vuoto = tutti">';
      }
      h += '</div>'; // fine riga navigazione
      // BARRA COMANDI (ondata 3): un azione principale (Prepara il mese), poi i menu
      // Controlla · Sistema · Strumenti · Esporta con nome semplice e una riga di
      // spiegazione per ogni voce; le azioni che cancellano stanno a parte, in rosso.
      // Le funzioni chiamate e i permessi sono gli stessi di prima.
      const voce = (nome, onclick, spiega) =>
        '<button type="button" class="pmenu-voce" onclick="pianoMenuChiudi();' +
        onclick +
        '"><span class="pmenu-nome">' +
        nome +
        '</span><span class="pmenu-spiega">' +
        spiega +
        '</span></button>';
      const menu = (id, nome, icona, voci) =>
        voci
          ? '<details class="pmenu" data-pmenu="' +
            id +
            '"><summary class="btn-export pbar-btn pmenu-apri">' +
            (icona ? '<i class="icx ' + icona + '"></i>' : '') +
            nome +
            '<i class="icx icx-giu pmenu-freccia"></i></summary><div class="pmenu-lista" role="menu">' +
            voci +
            '</div></details>'
          : '';
      h += '<div class="pbar-riga pbar-comandi">';
      // azioni automatiche (bozza, coperture, migliora ore, cancella, importa): solo
      // con il permesso apposito; senza, le voci non compaiono
      const puoAuto = puoMod && puoAzioniAutoPiano('genera');
      let pericolo = '';
      if (puoMod) {
        if (puoAuto)
          h +=
            '<button type="button" class="btn-export pbar-btn pbar-principale" onclick="pianoPreparaMese()" title="Il programma riempie i posti del mese con i collaboratori di questo settore, rispettando regole, vacanze e preferenze. Le celle già scritte non vengono toccate. Alla fine propone di migliorare la bozza.">' +
            '<i class="icx icx-calendario"></i>Prepara il mese</button>';
        // Controlla
        h += menu(
          'controlla',
          'Controlla',
          'icx-check',
          // Valida regole: con il permesso Genera (scelta del titolare, v357)
          (puoAuto
            ? voce(
                'Controlla le regole',
                'pianoAvvisiMeseApri(true);validaPiano()',
                'Cerca nel mese i turni che non rispettano riposi, ore e regole del settore e li colora in rosso',
              )
            : '') +
            voce(
              'Perché manca qualcuno',
              'pianoPercheScoperti()',
              "Per ogni posto rimasto vuoto: chi era libero e perché nessuno l'ha preso (personale, formazione, impostazioni, regole)",
            ),
        );
        // Sistema
        let sis = '';
        if (puoAuto && typeof pianoPreparaMesi === 'function')
          sis += voce(
            'Prepara più mesi',
            'pianoPreparaMesi()',
            'Prepara 3, 6 o fino a 12 mesi uno dopo l altro: copia il fabbisogno se manca, fa la bozza e la migliora, poi passa al mese dopo',
          );
        if (puoAuto)
          sis += voce(
            'Migliora la bozza',
            'pianoMigliora()',
            'Prova scambi e spostamenti fra i turni preparati dal programma e tiene solo quelli che rispettano meglio regole, posti e ore. Ti mostra prima e dopo',
          );
        if (puoAuto)
          sis += voce(
            'Sistema le ore',
            'miglioraOrePiano()',
            'Sposta turni preparati dal programma da chi lavora troppe ore a chi ne ha poche, nello stesso giorno e senza rompere regole',
          );
        if (
          puoAuto &&
          collaboratoriCache.some((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoCoperturaCfg(c))
        )
          sis += voce(
            'Copri i buchi con altri settori',
            'completaConCoperture()',
            'Riempie i posti rimasti vuoti con chi può coprire da altri settori. Da fare dopo aver preparato i piani dei loro settori',
          );
        if (puoAuto && window._pianoSolverUrl)
          sis += voce(
            'Prepara con il motore avanzato',
            'generaConSolver()',
            'Il server interno cerca il piano migliore del mese, con il lavoro diviso in modo equo. Stesse regole, non tocca le celle esistenti',
          );
        sis += voce(
          'Sostituisci chi è in malattia',
          'apriCoperturaMalattia()',
          'Trova chi può coprire i turni di un collaboratore in malattia',
        );
        h += menu('sistema', 'Sistema', 'icx-refresh', sis);
        // Strumenti
        h += menu(
          'strumenti',
          'Strumenti',
          'icx-settings',
          voce(
            "Rimetti l'ordine dei nomi",
            'ripristinaOrdinePiano()',
            "I nomi si riordinano trascinandoli; questa voce torna all'ordine predefinito (responsabili, vice, SUP, BO, poi gli altri, jolly in fondo)",
          ),
        );
        if (puoAuto || (puoMod && puoAzioniAutoPiano('cancella')))
          pericolo +=
            '<button type="button" class="btn-export pbar-btn pbar-pericolo" onclick="cancellaBozzaPiano()" title="Toglie i turni del mese di questo settore. Chiede prima conferma e si può annullare">' +
            '<i class="icx icx-cestino"></i>Svuota il mese</button>';
        const ssnap = (window._pianoSessSnap || {})[_pianoMeseSel + '|' + _pianoReparto()];
        if (ssnap)
          pericolo +=
            '<button type="button" class="btn-export pbar-btn pbar-pericolo" title="Riporta questo mese a com\'era quando hai iniziato a modificarlo in questa sessione (' +
            ssnap.n +
            ' operazioni tue)" onclick="annullaTuttoPiano()"><i class="icx icx-refresh"></i>Annulla tutto (' +
            ssnap.n +
            ')</button>';
      }
      let ge =
        voce('Stampa PDF', 'stampaPianoPDF()', 'Il piano del mese pronto da stampare o salvare in PDF') +
        voce('Copia per Excel', 'copiaPianoExcel()', 'Copia la griglia: in Excel basta incollare');
      if (puoMod && puoAzioniAutoPiano('import')) {
        ge += voce(
          'Importa da Excel',
          'pianoImportaConColonne(false)',
          'Legge un piano da un file Excel o CSV e lo controlla prima di scriverlo',
        );
        ge += voce(
          'Importa da Excel scegliendo le colonne',
          'pianoImportaConColonne(true)',
          'Per un file di un altro formato: scegli foglio, colonna dei nomi e colonne dei giorni, con anteprima',
        );
      }
      h += menu('esporta', 'Esporta', 'icx-download', ge);
      if (puoMod && puoAzioniAutoPiano('import'))
        h +=
          '<input type="file" id="piano-imp-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importaPianoExcel(this)">';
      // colori e formato delle celle: strumento di lavoro sulla selezione, resta a vista
      if (puoMod) h += '<span class="pbar-colori">' + _pianoColoriBarHtml() + '</span>';
      if (pericolo) h += '<span class="pbar-pericoli">' + pericolo + '</span>';
      h += '</div><div class="pbar-riga pbar-nota">';
      h +=
        '<span class="pbar-info">' +
        _pianoRighe.length +
        ' assegnazioni' +
        (puoMod
          ? '<span class="pbar-suggerimento"> · doppio clic su una cella per cambiarla · trascina o Shift+clic per selezionarne più di una</span>'
          : ' · sola lettura') +
        '</span></div></div>';
      // AVVISI DEL MESE IN UNA RIGA (revisione UX 11/10): compleanno, controllo delle regole,
      // confine con i mesi vicini, generazione in corso e non disponibilita stanno in una
      // sola riga richiudibile, cosi la griglia si vede subito. Aperta o chiusa resta
      // ricordato per la sessione (_pianoAvvisiMeseSommario scrive il riassunto).
      h += _pianoAvvisiMeseInizio();
      h += '<div id="piano-violazioni"></div><div id="piano-auto-avviso"></div><div id="piano-confine"></div>';

      // NON DISPONIBILITA' JOLLY: promemoria discreto (una riga, chiudibile),
      // scadenza dalla regola nd_jolly_giorno. Niente toni allarmistici.
      if (puoMod && localStorage.getItem('piano_nd_banner_off') !== ym) {
        const oggi = new Date();
        const gLim = _pianoGiornoNd();
        const prossimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 15);
        const ymNext = prossimo.getFullYear() + '-' + String(prossimo.getMonth() + 1).padStart(2, '0');
        const ndNext = _pianoNdMese(ymNext);
        const consegnato = new Set(Object.keys(ndNext).map((k) => k.split('|')[0].toLowerCase()));
        const jollyMancanti = collaboratoriCache
          .filter(
            (c) =>
              c.attivo !== false &&
              _repartoDi(c) === _pianoReparto() &&
              (c.impiego === 'jolly' || (!c.impiego && c.is_jolly)) &&
              !consegnato.has(c.nome.toLowerCase()),
          )
          .map((c) => c.nome.split(' ')[0]);
        if (jollyMancanti.length) {
          const lblNext = (MESI_FULL[prossimo.getMonth()] || '') + ' ' + prossimo.getFullYear();
          const inTempo = oggi.getDate() <= gLim;
          h +=
            '<div style="margin:6px 0;padding:4px 10px;font-size:var(--fs-sm,.8125rem);color:var(--muted);border-left:3px solid ' +
            (inTempo ? 'var(--c-oro)' : 'var(--c-rosso)') +
            '">Non disponibilità ' +
            escP(lblNext) +
            ' (termine: il ' +
            gLim +
            ' del mese)' +
            (inTempo ? '' : ' \u00b7 termine passato') +
            ' \u00b7 senza giorni registrati: ' +
            jollyMancanti.length +
            ' jolly <span title="' +
            escP(jollyMancanti.join(', ')) +
            '" style="cursor:help;text-decoration:underline dotted">(quali?)</span> \u00b7 si registrano dal Diario' +
            ' <a href="#" style="color:inherit;font-weight:700;margin-left:6px" onclick="localStorage.setItem(\'piano_nd_banner_off\',\'' +
            ym +
            '\');renderPiano();return false" title="Nascondi per questo mese">\u2715</a></div>';
        }
      }
      h += '</div></div>'; // fine riga degli avvisi del mese
      // GRIGLIA
      // le festivita' servono PRIMA di disegnare l'intestazione: e' li' che
      // compare il marcatore di chiusura (CH5/CH7) sopra il numero del giorno
      await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
      await _pianoCaricaRecupero(ym);
      let LC = _pianoCalcolaLarghezze(nomi);
      // TELEFONO: colonna del nome stretta e funzione nascosta (nome intero e funzione al
      // tocco, nella mini-scheda), cosi a schermo restano piu giorni. Le tabelle sotto
      // (fabbisogno, differenze) leggono la stessa larghezza e restano allineate.
      const telefono = !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
      if (telefono) LC = window._pianoLargCol = { nome: 104, fun: 0, tot: 104 };
      h +=
        '<div class="piano-wrap"><table data-seltab="piano" class="piano-table piano-fixed' +
        (telefono ? ' piano-tel' : '') +
        '" style="width:' +
        (LC.tot + 37 * nGiorni + 326) +
        'px"><colgroup><col style="width:' +
        LC.nome +
        'px"><col style="width:' +
        LC.fun +
        'px">' +
        _pianoColgroupGiorni(nGiorni) +
        '<col style="width:54px"><col style="width:30px"><col style="width:30px"><col style="width:54px"><col style="width:54px"><col style="width:50px"><col style="width:54px"></colgroup><thead><tr><th class="piano-nome">Collaboratore</th><th class="piano-fun">Fun</th>';
      for (let g = 1; g <= nGiorni; g++) {
        const dstr = ym + '-' + String(g).padStart(2, '0');
        const dow = new Date(dstr + 'T12:00:00').getDay();
        let cls = '';
        if (festiviSet[dstr]) cls = 'piano-festivo';
        else if (dow === 0) cls = 'piano-domenica';
        else if (_pianoGiorniWeekend().includes(dow)) cls = 'piano-weekend';
        if (g === 1) cls += ' piano-sep-left';
        if (dstr === oggiLocale()) cls += ' piano-oggi'; // colonna di oggi
        h +=
          '<th class="' +
          cls +
          '" data-g="' +
          g +
          '"' +
          (() => {
            // il suggerimento riunisce festivo cantonale e orario di chiusura
            const _ch = _pianoChiusuraGiorno(dstr);
            const _voci = [];
            if (festiviSet[dstr]) _voci.push(escP(festiviSet[dstr]));
            if (_ch.motivo) _voci.push(escP(_ch.motivo) + ': si chiude alle ' + _ch.ora + ':00');
            else if (_ch.ora !== _pianoChiusuraCfg().oraNormale) _voci.push('si chiude alle ' + _ch.ora + ':00');
            if (_pianoGiornoBloccato(dstr)) _voci.push('GIORNATA CHIUSA: si modifica solo con lo sblocco motivato');
            _voci.push('Doppio click: marcatore del giorno (CS, MN, LRD...)');
            return ' title="' + _voci.join(' \u00b7 ') + '"';
          })() +
          (puoMod ? ' ondblclick="pianoMarkerEdit(' + g + ')"' : '') +
          '>' +
          (_pianoMarkerGiorno(ym, g)
            ? '<div style="font-size:var(--fs-sm,.8125rem);background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
              escP(_pianoMarkerGiorno(ym, g)) +
              '</div>'
            : '') +
          // CHIUSURA PIU' TARDI: si segnala solo quando NON e' gia' scontato
          // (venerdi e sabato chiudono alle 5 per prassi, non serve dirlo)
          (_pianoChiusuraGiorno(dstr).marcatore
            ? '<div style="font-size:var(--fs-sm,.8125rem);background:#8b4a8b;color:#fff;font-weight:bold;line-height:1.1" title="' +
              escP(_pianoChiusuraGiorno(dstr).motivo || 'chiusura posticipata') +
              '">' +
              _pianoChiusuraGiorno(dstr).marcatore +
              '</div>'
            : '') +
          '<div>' +
          GG3[dow] +
          '</div><div>' +
          g +
          '</div>' +
          (_pianoGiornoBloccato(dstr)
            ? '<div style="font-size:var(--fs-xs,.75rem);line-height:1;opacity:.55" title="Giornata chiusa">&#128274;</div>'
            : '') +
          '</th>';
      }
      h +=
        '<th class="piano-tot piano-sep-left" title="Ore effettivamente lavorate: dall\'entrata all\'uscita, senza il supplemento del 10% e senza malattie, vacanze, CGF, permessi, maternita, matrimonio, militare, nascita, protezione civile, trasloco e assistenza familiare">OL</th>' +
        '<th class="piano-tot" title="Turni diurni">D</th><th class="piano-tot" title="Turni notturni">N</th>' +
        '<th class="piano-tot" title="Ore Dovute">OD</th><th class="piano-tot" title="Ore Pianificate">OP</th>' +
        '<th class="piano-tot" title="Saldo Mensile">SM</th><th class="piano-tot" title="Saldo Anno">YTD</th></tr></thead><tbody>';

      await _pianoAggiornaYtd(nomi);
      await _pianoCaricaOreMese(_pianoMeseSel);
      const _oggiCal = oggiLocale();
      nomi.forEach((nome) => {
        const ne = _jsArg(nome);
        const infoC0 = _pianoCollabInfo(nome);
        const perc0 = infoC0 ? parseFloat(infoC0.percentuale) || 1 : 1;
        let ore = 0; // solo turni (colonna Ore = ore_stimate Turnivo)
        // OL = ore EFFETTIVAMENTE lavorate: solo turni di lavoro, senza il
        // supplemento del 10% notturno e senza nessuna assenza retribuita
        // (malattia, vacanza, CGF, maternita', matrimonio, militare, nascita,
        // permesso, protezione civile, trasloco, assistenza familiare)
        let oreLav = 0;
        let oreSpec = 0; // codici speciali (scala_percentuale come Turnivo)
        let nD = 0;
        let nN = 0;
        let riga = '';
        for (let g = 1; g <= nGiorni; g++) {
          const dstr = ym + '-' + String(g).padStart(2, '0');
          const r = mappa[nome + '|' + dstr];
          const codice = r ? r.codice : '';
          let cella = '';
          let stile = '';
          let cls = 'piano-cella';
          if (g === 1) cls += ' piano-sep-left';
          if (dstr === _oggiCal) cls += ' piano-oggi';
          let titolo = '';
          if (r) {
            const t = _pianoTurnoInfoRiga(r);
            const cs = _pianoCodiceInfo(codice);
            cella = escP(codice);
            const _col = _pianoColore(codice);
            if (_col) stile = 'background:' + _col;
            if (t) {
              // orario del GIORNO: alcuni turni finiscono piu' tardi quando il
              // casino chiude alle 5 (o quando c'e' il turno che da' il cambio)
              const _eff = _pianoTurnoDelGiorno(t, dstr);
              ore += _eff ? _eff.durata : parseFloat(t.durata_ore) || 0;
              oreLav += _pianoOreEffettiveTurno(t, r);
              if (t.tipo === 'NOTTURNO') nN++;
              else nD++;
              titolo =
                codice +
                ' ' +
                (_eff.ora_inizio || '').substring(0, 5) +
                '-' +
                (_eff.ora_fine || '').substring(0, 5) +
                (_eff.prolungato ? ' (prolungato: chiusura tardi) ' + _eff.durata + 'h' : '');
            } else if (cs) {
              oreSpec += _pianoOreDiRiga(r, perc0);
              titolo = (cs.descrizione || codice) + (r.ora_inizio && r.ora_fine ? ' ' + _pianoFasceTesto(r) : '');
            }
            // DUE COSE DIVERSE: "bloccata con motivo" (lucchetto rosso, l'ha
            // chiesto un operatore: visita medica, corso...) e "protetta"
            // (consolidata dall'importazione o dalle vacanze: nessun segno,
            // solo la conferma quando la si sovrascrive)
            if (r.motivo_blocco) {
              cls += ' piano-bloccata';
              titolo += (titolo ? ' \u00b7 ' : '') + 'BLOCCATA: ' + r.motivo_blocco;
            } else if (r.protetto) {
              cls += ' piano-prot';
            }
            // CORSIVO = turno di un ALTRO settore (la persona e occupata, non copre qui),
            // in qualunque piano sia scritto: dipende dalla sigla, non da chi l ha scritta.
            // Congedi, vacanze e malattie valgono per la persona: sempre normali.
            if (_pianoTurnoInfo(codice) && !_pianoCopreQui(r)) {
              stile += (stile ? ';' : '') + 'opacity:.65;font-style:italic';
              titolo = '[' + repartoLabel(_pianoSettoreTurno(r)) + '] ' + titolo;
            } else if (_repartoDi(r) !== _pianoReparto()) {
              titolo =
                (_pianoTurnoInfo(codice) ? 'Turno ' + repartoLabel(_pianoReparto()) + ' ' : '') +
                '(scritto nel piano ' +
                repartoLabel(r.reparto_dip) +
                ') ' +
                titolo;
            }
            if (r.commento) {
              cls += ' piano-comm';
              titolo += (titolo ? ' · ' : '') + r.commento;
            }
            // ASSENZA NON GIUSTIFICATA (Certificato non ricevuto, assenze.js): ASS a 0 ore, segnata
            if (typeof _assNgCella === 'function' && _assNgCella(r)) {
              cls += ' piano-ass-ng';
              titolo = 'Assenza NON giustificata (certificato non ricevuto) · ASS, 0 ore · ' + titolo;
            }
            // MALATTIA SU GIORNO DI CONGEDO: il giorno C dentro un periodo di
            // malattia si mostra come MC (0 ore, la C resta nei dati) così la
            // malattia si vede anche dove non c'era un turno da coprire
            if (codice === 'C' && malattie[nome + '|' + dstr]) {
              cella = 'MC';
              cls += ' piano-malattia-c';
              stile = '';
              titolo = 'Malattia su giorno di congedo (C) · 0 ore · dal Diario' + (titolo ? ' · ' + titolo : '');
            }
            // MALATTIA SU GIORNO DI CGF: il recupero non e' stato goduto, il
            // credito resta. Si mostra MCG e non conta come CGF preso
            if (codice === 'CGF' && malattie[nome + '|' + dstr]) {
              cella = 'MCG';
              cls += ' piano-malattia-c';
              stile = '';
              titolo =
                'Malattia nel giorno di recupero festivo (CGF): il recupero non è goduto e resta a credito' +
                (titolo ? ' · ' + titolo : '');
            }
          } else if (malattie[nome + '|' + dstr]) {
            cella = 'M';
            cls += ' piano-malattia-auto';
            titolo = 'Malattia registrata nel Diario (automatica, non salvata nel piano)';
          } else if (ndMap[nome + '|' + dstr]) {
            cella = 'ND';
            cls += ' piano-nd-auto';
            titolo = 'Non disponibilità registrata nel Diario (automatica): la bozza non assegna turni';
          }
          // DOMENICA LIBERA VALIDA (una delle 12): lettera rossa, calcolata dai dati
          // a ogni disegno, quindi segue qualsiasi cambio (piano, Rapporto, Diario).
          // Un sabato di malattia (anche solo nel Diario) non si lavora: conta.
          if (r && cella === escP(codice) && !_pianoTurnoInfo(codice) && new Date(dstr + 'T12:00:00').getDay() === 0) {
            const sab = _pianoGiornoPrima(dstr);
            const rs =
              g > 1
                ? mappa[nome + '|' + sab]
                : (window._pianoRigheBordo || []).find(
                    (x) => x.collaboratore === nome && String(x.data).substring(0, 10) === sab,
                  );
            if (_pianoDomenicaValida(codice, rs && rs.codice, sab, rs, !!malattie[nome + '|' + sab])) {
              cls += ' piano-dom-valida';
              titolo += (titolo ? ' · ' : '') + 'Domenica libera valida: conta per le 12 domeniche dell anno';
            }
          }
          // dopo la fine del rapporto: cella grigia con la spiegazione
          if (!_pianoOperativoIl(nome, dstr)) {
            cls += ' piano-fuori-rapporto';
            titolo += (titolo ? ' · ' : '') + 'Fuori contratto: ' + _pianoMotivoFuoriRapporto(nome, dstr);
          }
          const violMsg = _pianoViolCelle[nome + '|' + dstr];
          if (violMsg) {
            cls += ' piano-viol';
            titolo += (titolo ? ' · ' : '') + 'Attenzione: ' + violMsg.map(_pianoMsgSemplice).join(' | ');
          }
          // stile personalizzato della cella: colore (vince sul turno) + formato
          const colEff = _pianoColoreCella(r);
          if (r && colEff) {
            const stC = _stileCella(colEff);
            if (stC.c) stile += (stile ? ';' : '') + 'background:' + stC.c;
            if (stC.b) stile += ';font-weight:700';
            if (stC.i) stile += ';font-style:italic';
            if (stC.t) stile += ';color:' + stC.t;
          }
          riga +=
            '<td class="' +
            cls +
            '" data-g="' +
            g +
            '" style="' +
            stile +
            '"' +
            (titolo ? ' title="' + escP(titolo) + '"' : '') +
            (r && r.commento ? ' data-commento="' + escP(r.commento) + '"' : '') +
            // come Excel: clic = seleziona la cella, doppio clic (o scrivere) = modifica
            ' onclick="pianoCellaClick(\'' +
            ne +
            "','" +
            dstr +
            '\',this)"' +
            (puoMod ? ' ondblclick="pianoCellaInline(\'' + ne + "','" + dstr + '\',this)"' : '') +
            '>' +
            cella +
            '</td>';
        }
        const infoC = infoC0;
        const perc = perc0;
        // come Turnivo: OD=(giorni/7)*ore_sett*pct (jolly=0), OP=turni+speciali, SM=OP-OD, YTD=cumulato da gennaio
        // giorni dovuti: meno congedi non pagati e giorni dopo la fine del rapporto
        const dovute =
          infoC && infoC.is_jolly ? 0 : Math.round(((_pianoOreSett * perc * _pianoGgDovuti(nome, ym)) / 7) * 10) / 10;
        const _rett = _pianoRettificaMese(nome);
        // scostamenti giornaliati (scheda Recupero ore): sommati alle ore del
        // piano, cosi' il saldo e' aggiornato giorno per giorno
        const _rec = _pianoRecuperoTotale(nome, ym);
        const orePianificate = Math.round((ore + oreSpec + _rec) * 100) / 100;
        // dove c'e' una rettifica scritta a mano, vale quella: e' il totale
        // reale del mese, quello che finisce in busta paga
        const orePiano = _rett ? Math.round(parseFloat(_rett.ore_reali) * 100) / 100 : orePianificate;
        const saldo = Math.round((orePiano - dovute) * 10) / 10;
        const ytd = _pianoYtdConMese(nome, saldo, orePiano);
        const _clsRiga = _pianoRigaFunzioneAttr(infoC);
        h +=
          '<tr' +
          _clsRiga +
          ' data-nome="' +
          escP(nome) +
          '"><td class="piano-nome" title="' +
          escP(nome) +
          '"><i class="icx icx-stampa piano-pdf-ico" title="Stampa il piano di ' +
          escP(nome) +
          '" onclick="event.stopPropagation();stampaPianoCollaboratore(\'' +
          ne +
          '\')"></i>' +
          escP(nome) +
          (infoC && infoC.lingue
            ? ' <span style="font-size:var(--fs-sm,.8125rem);color:var(--muted);font-weight:700">' +
              escP(infoC.lingue) +
              '</span>'
            : '') +
          // TURNI SOLO A MANO (Preferenze collaboratori): fuori dalla bozza, segno accanto al nome
          (infoC && infoC.turni_solo_a_mano
            ? ' <i class="icx icx-penna" style="color:var(--muted);font-size:.85em" role="img" aria-label="Turni solo a mano" title="Turni solo a mano: Prepara il mese, Migliora la bozza e Copri i buchi non le scrivono celle e non la contano fra i disponibili; le celle scritte a mano restano, Controlla le regole la controlla come tutti. Si cambia in Piano › Impostazioni › Preferenze collaboratori"></i>'
            : '') +
          // il collaboratore non e' dell'anagrafica di QUESTO settore (o non
          // c'e' affatto): si segnala, cosi' l'anomalia non passa inosservata
          (!infoC
            ? (() => {
                const ina = _pianoInattivoInfo(nome);
                if (!ina)
                  return '<span class="piano-estraneo" title="Non presente in Gestione collaboratori: funzione, percentuale e ore dovute non vengono calcolate">fuori anagrafica</span>';
                const repIna = _repartoDi(ina);
                return (
                  '<span class="piano-estraneo" title="Disattivato in Gestione collaboratori ma presente nel piano' +
                  (repIna !== _pianoReparto() ? ' · settore ' + escP(repartoLabel(repIna)) : '') +
                  '">non attivo' +
                  (repIna !== _pianoReparto() ? ' · ' + escP(repartoLabel(repIna)) : '') +
                  '</span>'
                );
              })()
            : _repartoDi(infoC) !== _pianoReparto()
              ? _pianoAppartieneAlReparto(infoC)
                ? // copertura prevista in Gestione collaboratori: normale, non un errore
                  (() => {
                    const cop = _pianoCoperturaCfg(infoC) || {};
                    return (
                      '<span class="piano-copre" title="Collaboratore ' +
                      escP(repartoLabel(_repartoDi(infoC))) +
                      ' abilitato a coprire in questo settore' +
                      (cop.max_turni ? ' · max ' + cop.max_turni + ' turni al mese' : '') +
                      (cop.gruppi ? ' · solo ' + escP(String(cop.gruppi).toUpperCase()) : '') +
                      (cop.accompagnato ? ' · accompagnato' : '') +
                      '">copre &middot; ' +
                      escP(repartoLabel(_repartoDi(infoC))) +
                      '</span>'
                    );
                  })()
                : '<span class="piano-estraneo" title="Collaboratore del settore ' +
                  escP(repartoLabel(_repartoDi(infoC))) +
                  ': non è abilitato a coprire qui, il suo piano dovrebbe stare nel suo settore">' +
                  escP(repartoLabel(_repartoDi(infoC))) +
                  '</span>'
              : '') +
          '</td><td class="piano-fun"><strong>' +
          escP(infoC && infoC.is_jolly ? 'JOLLY' : (infoC && infoC.funzione) || '') +
          '</strong> <span style="font-size:var(--fs-sm,.8125rem)">' +
          Math.round(perc * 100) +
          '%</span></td>' +
          riga +
          '<td class="piano-tot piano-sep-left" data-tot="0" title="ore effettivamente lavorate">' +
          (oreLav ? oreLav.toFixed(1) : '') +
          '</td><td class="piano-tot" data-tot="1" title="Turni di giorno nel mese">' +
          (nD || '') +
          '</td><td class="piano-tot" data-tot="2" title="Turni di notte nel mese">' +
          (nN || '') +
          '</td><td class="piano-tot" data-tot="3" style="color:var(--muted)" title="' +
          escP(
            infoC && infoC.is_jolly
              ? 'Ausiliario: nessuna ora dovuta'
              : 'Ore dovute: ' +
                  _pianoGgDovuti(nome, ym) +
                  ' giorni' +
                  (_pianoGiorniCnp(nome, ym) ? ' (meno ' + _pianoGiorniCnp(nome, ym) + ' di congedo non pagato)' : '') +
                  (_pianoGiorniDopoFine(nome, ym)
                    ? ' (meno ' + _pianoGiorniDopoFine(nome, ym) + ' dopo la fine del contratto)'
                    : '') +
                  ' / 7 x ' +
                  _pianoOreSett +
                  ' ore x ' +
                  Math.round(perc * 100) +
                  '% = ' +
                  dovute.toFixed(1),
          ) +
          '">' +
          (dovute ? dovute.toFixed(1) : '') +
          '</td><td class="piano-tot piano-op" data-tot="4"' +
          (_rett
            ? ' title="Ore reali del mese scritte da ' +
              escP(_rett.operatore || '') +
              ' il ' +
              String(_rett.creato_il || '').substring(0, 10) +
              (_rett.nota ? ' · ' + escP(_rett.nota) : '') +
              ' · pianificate ' +
              orePianificate.toFixed(1) +
              'h · doppio clic per correggere"'
            : _rec
              ? ' title="Ore del piano ' +
                Math.round((orePianificate - _rec) * 100) / 100 +
                'h con ' +
                (_rec > 0 ? '+' : '') +
                _rec +
                'h dalla scheda Recupero ore. Doppio clic per scrivere le ore realmente fatte nel mese"'
              : ' title="Ore pianificate. Doppio clic per scrivere le ore realmente fatte nel mese"') +
          '>' +
          (orePiano ? orePiano.toFixed(1) : '') +
          (_rett ? '<span class="piano-rett" title="valore scritto a mano">*</span>' : '') +
          '</td><td class="piano-tot piano-sm" data-tot="5" title="' +
          escP(
            'Saldo del mese: ' +
              (_rett ? 'ore reali ' : 'ore pianificate ') +
              orePiano.toFixed(1) +
              ' - ore dovute ' +
              dovute.toFixed(1) +
              ' = ' +
              (saldo > 0 ? '+' : '') +
              saldo.toFixed(1) +
              '. Doppio clic per scrivere le ore realmente fatte',
          ) +
          '" style="color:' +
          (saldo > 0 ? 'var(--c-verde,#2c6e49)' : saldo < 0 ? 'var(--c-rosso,#c0392b)' : 'var(--muted)') +
          '">' +
          (orePiano || dovute ? (saldo > 0 ? '+' : '') + saldo.toFixed(1) : '') +
          '</td><td class="piano-tot" data-tot="6" title="' +
          escP(_pianoTestoYtd(nome, saldo, ytd, orePiano)) +
          '" style="font-weight:700;color:' +
          (ytd > 0 ? 'var(--c-verde,#2c6e49)' : ytd < 0 ? 'var(--c-rosso,#c0392b)' : 'var(--muted)') +
          '">' +
          (orePiano || _pianoYtdMap[nome] ? (ytd > 0 ? '+' : '') + ytd.toFixed(1) : '') +
          '</td></tr>';
      });
      h += '</tbody></table></div>';

      // legenda
      h +=
        '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;font-size:var(--fs-sm,.8125rem);color:var(--muted)">';

      h +=
        '<span><span class="piano-leg piano-comm" style="background:var(--paper2)"></span> triangolo = commento (passa il mouse)</span>';
      h += '<span><span class="piano-leg piano-malattia-c"></span> MC = malattia su giorno di congedo (0 ore)</span>';
      h +=
        '<span><span class="piano-leg" style="background:' +
        PIANO_COLORI_SPECIALI.ASS +
        ';color:#222">ASS</span> = assenza in attesa di certificato (0 ore, turno da coprire)</span>';
      h +=
        '<span><span class="piano-leg piano-dom-valida" style="background:var(--paper2)">C</span> rossa = domenica libera valida (conta per le 12)</span>';
      h +=
        '<span><span class="piano-leg piano-malattia-auto" style="background:var(--paper2)">M</span> = malattia dal Diario (automatica)</span>';
      h += '<span>icona rossa = stampa piano del collaboratore · tasto destro su una cella = menu opzioni</span>';
      h += '</div></div>';

      // FABBISOGNO vs ASSEGNATI (editabile: click sulla cella per impostare le persone necessarie)
      const fabb =
        (await secGet(
          'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
        )) || [];
      _pianoFabbCache = fabb;
      const turniRep = _pianoTurniReparto();
      if (turniRep.length) {
        const fabbMap = {}; // codice -> {giorno: quantita}
        fabb.forEach((f) => {
          const g = parseInt(f.data.split('-')[2]);
          (fabbMap[f.turno_codice] = fabbMap[f.turno_codice] || {})[g] = f.quantita;
        });
        const assMap = {}; // codice -> {giorno: n}
        _pianoRighe.forEach((r) => {
          if (!_pianoCopreQui(r)) return; // turno di un altro settore: non copre questo fabbisogno
          const g = parseInt(r.data.split('-')[2]);
          (assMap[r.codice] = assMap[r.codice] || {})[g] =
            (assMap[r.codice] && assMap[r.codice][g] ? assMap[r.codice][g] : 0) + 1;
        });
        let hFabb = '';
        hFabb +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Pianificazione (fabbisogno) vs assegnati · ' +
          escP(label);
        // il fabbisogno lo vedono tutti; lo modifica (a mano, copia, incolla, import,
        // svuota) solo chi ha il permesso Modificare il fabbisogno
        const puoFabb = puoMod && puoAzioniAutoPiano('fabbisogno');
        if (puoFabb)
          hFabb +=
            '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="copiaFabbisognoMese()">Copia dal mese precedente</button>' +
            (puoAzioniAutoPiano('import')
              ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="document.getElementById(\'fabb-file\').click()">Importa da Excel</button>' +
                '<input type="file" id="fabb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaFabbisognoExcel(this)">'
              : '') +
            (puoAzioniAutoPiano('cancella')
              ? '<button class="btn-export btn-pericolo" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="eliminaFabbisognoMese()">Svuota mese</button>'
              : '') +
            '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted);font-weight:400">clicca una cella per impostare le persone necessarie</span>';
        hFabb += '</div>';
        // testata giorni con sigla settimana (D/L/M...), festivi e weekend:
        // usata da fabbisogno, differenze ed effettivi
        const testataGiorni = (conTot) => {
          let t = '<thead><tr><th class="piano-nome">Turno</th>';
          for (let g = 1; g <= nGiorni; g++) {
            const dstr = ym + '-' + String(g).padStart(2, '0');
            const dow = new Date(dstr + 'T12:00:00').getDay();
            let cls = '';
            if (festiviSet[dstr]) cls = 'piano-festivo';
            else if (dow === 0) cls = 'piano-domenica';
            else if (_pianoGiorniWeekend().includes(dow)) cls = 'piano-weekend';
            if (g === 1) cls += ' piano-sep-left';
            if (dstr === oggiLocale()) cls += ' piano-oggi'; // la colonna di oggi scende fino in fondo
            t +=
              '<th class="' +
              cls +
              '" data-g="' +
              g +
              '"' +
              (festiviSet[dstr] ? ' title="' + escP(festiviSet[dstr]) + '"' : '') +
              '>' +
              (_pianoMarkerGiorno(ym, g)
                ? '<div style="font-size:var(--fs-sm,.8125rem);background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
                  escP(_pianoMarkerGiorno(ym, g)) +
                  '</div>'
                : '') +
              '<div>' +
              GG3[dow] +
              '</div><div>' +
              g +
              '</div></th>';
          }
          if (conTot) t += '<th>Tot</th>';
          return t + '</tr></thead>';
        };
        hFabb +=
          '<div class="piano-wrap"><table data-seltab="fabb" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '</colgroup>' +
          testataGiorni(false) +
          '<tbody>';
        // ordine delle righe: quello del file Excel del fabbisogno (colonna ordine dei turni,
        // salvata all import); i turni senza ordine dopo, raggruppati per gruppo
        const gruppoOrd = {};
        turniRep.forEach((t, i) => (gruppoOrd[t.codice] = (t.gruppo || '') + '|' + String(i).padStart(3, '0')));
        const ordFile = (t) => (parseInt(t.ordine) > 0 && parseInt(t.ordine) < 999 ? parseInt(t.ordine) : 1e6);
        turniRep
          .slice()
          .sort(
            (x, y) => ordFile(x) - ordFile(y) || (gruppoOrd[x.codice] || '').localeCompare(gruppoOrd[y.codice] || ''),
          )
          .forEach((t) => {
            const cod = t.codice;
            hFabb +=
              '<tr data-cod="' +
              escP(cod) +
              '"><td class="piano-nome" title="' +
              escP(
                (t.gruppo || '') +
                  ' ' +
                  (t.ora_inizio || '').substring(0, 5) +
                  '-' +
                  (t.ora_fine || '').substring(0, 5),
              ) +
              '">' +
              escP(cod) +
              '</td>';
            for (let g = 1; g <= nGiorni; g++) {
              const req = (fabbMap[cod] || {})[g] || 0;
              const ass = (assMap[cod] || {})[g] || 0;
              const dstr = ym + '-' + String(g).padStart(2, '0');
              const cls = (g === 1 ? 'piano-sep-left' : '') + (dstr === oggiLocale() ? ' piano-oggi' : '');
              // colori della PIANIFICAZIONE Excel: celle gialle, weekend verdi;
              // la carenza resta segnalata dal numero rosso
              const dow = new Date(dstr + 'T12:00:00').getDay();
              let stile = '';
              if (req) {
                const bg = dow === 0 || _pianoGiorniWeekend().includes(dow) ? '#92D050' : '#FFFF00';
                stile =
                  'background:' + bg + ' !important;font-weight:bold;color:' + (ass >= req ? '#000' : '#a01f12') + ';';
              }
              hFabb +=
                '<td class="' +
                cls +
                '" data-g="' +
                g +
                '"' +
                ' style="' +
                stile +
                (puoFabb ? 'cursor:pointer' : '') +
                '"' +
                ' onclick="fabbCellaClick(\'' +
                escP(cod) +
                "','" +
                dstr +
                '\',this)"' +
                (puoFabb ? ' ondblclick="fabbisognoInline(\'' + escP(cod) + "','" + dstr + '\',this)"' : '') +
                ' oncontextmenu="fabbCtxMenu(event,\'' +
                escP(cod) +
                "','" +
                dstr +
                '\')"' +
                '>' +
                (req ? ass + '/' + req : '') +
                '</td>';
            }
            hFabb += '</tr>';
          });
        hFabb += '</tbody></table></div>';
        hFabb +=
          '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);padding:8px 14px">assegnati/richiesti · celle gialle (weekend verdi) come la PIANIFICAZIONE dell&#39;Excel; numero <span style="color:var(--c-rosso,#c0392b);font-weight:700">rosso</span> = carenza. Il fabbisogno guida "Prepara il mese".</p></div>';

        // DIFFERENZE + EFFETTIVI · schema IDENTICO a Turnivo (calendario.html):
        // differenze = effettivi - pianificazione (verde >0, rosso <0, vuoto 0),
        // effettivi = conteggio persone per turno/giorno con colonna Tot
        const turniOrdinati = turniRep
          .slice()
          .sort((x, y) => (gruppoOrd[x.codice] || '').localeCompare(gruppoOrd[y.codice] || ''));
        const clsCella = (g) => {
          const dstr = ym + '-' + String(g).padStart(2, '0');
          const dow = new Date(dstr + 'T12:00:00').getDay();
          const sep = (g === 1 ? ' piano-sep-left' : '') + (dstr === oggiLocale() ? ' piano-oggi' : '');
          if (dow === 0) return 'piano-cel-dom' + sep;
          if (_pianoGiorniWeekend().includes(dow)) return 'piano-cel-we' + sep;
          return sep.trim();
        };
        const cellaTurno = (t) =>
          '<td class="piano-nome" title="' +
          escP(
            (t.gruppo || '') + ' ' + (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
          ) +
          '">' +
          escP(t.codice) +
          '</td>';

        h +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Differenze · ' +
          escP(label) +
          ' <span style="font-size:var(--fs-sm,.8125rem);color:var(--muted);font-weight:400">(effettivi − pianificazione)</span></div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="diff" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '</colgroup>' +
          testataGiorni(false) +
          '<tbody>';
        turniOrdinati.forEach((t) => {
          h += '<tr>' + cellaTurno(t);
          for (let g = 1; g <= nGiorni; g++) {
            const diff = ((assMap[t.codice] || {})[g] || 0) - ((fabbMap[t.codice] || {})[g] || 0);
            // colori identici all'Excel: negativo bordeaux/bianco, positivo grigio/blu
            const col =
              diff < 0
                ? 'background:#993366 !important;color:#fff'
                : diff > 0
                  ? 'background:#C0C0C0 !important;color:#333399'
                  : '';
            h +=
              '<td class="' +
              clsCella(g) +
              '" data-g="' +
              g +
              '" onclick="if(window.event&&window.event.shiftKey)pianoBloccoClick(\'diff\',this)" style="font-weight:bold;' +
              col +
              '">' +
              (diff !== 0 ? diff : '') +
              '</td>';
          }
          h += '</tr>';
        });
        h += '</tbody></table></div></div>';

        h +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Effettivi · ' +
          escP(label) +
          '</div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="eff" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni + 44) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '<col style="width:44px"></colgroup>' +
          testataGiorni(true) +
          '<tbody>';
        turniOrdinati.forEach((t) => {
          h += '<tr>' + cellaTurno(t);
          let tot = 0;
          for (let g = 1; g <= nGiorni; g++) {
            const q = (assMap[t.codice] || {})[g] || 0;
            tot += q;
            h +=
              '<td class="' +
              clsCella(g) +
              '" data-g="' +
              g +
              '" onclick="if(window.event&&window.event.shiftKey)pianoBloccoClick(\'eff\',this)"' +
              (q > 0 ? ' style="font-weight:bold;background:#335593 !important;color:#fff"' : '') +
              '>' +
              (q > 0 ? q : '') +
              '</td>';
          }
          h += '<td><strong>' + tot + '</strong></td></tr>';
        });
        h += '</tbody></table></div></div>';
        // ordine come nell'Excel: DIFFERENZE, EFFETTIVI, poi PIANIFICAZIONE
        h += hFabb;
      }
    } else if (_pianoTab === 'briefing') {
      h += await _renderPianoBriefingTab();
    } else if (_pianoTab === 'avvisi') {
      h += await _renderPianoAvvisiTab();
    } else if (_pianoTab === 'congedi') {
      // congedi non pagati: chi, quando, quanti giorni, effetti (scheda propria)
      h += _renderPianoCongediNpCard();
    } else if (_pianoTab === 'crediti') {
      h += await _renderPianoCreditiTab();
    } else if (_pianoTab === 'vacanze') {
      h += await _renderPianoVacanzeTab();
    } else if (_pianoTab === 'turni') {
      h +=
        '<div id="piano-config">' +
        _renderPianoTurniCard() +
        _renderPianoCodiciCard() +
        _renderPianoCorsiCard() +
        '</div>';
    } else if (_pianoTab === 'regole') {
      h +=
        '<div id="piano-config">' +
        (typeof _pianoChiFaCosaSegnaposto === 'function' ? _pianoChiFaCosaSegnaposto() : '') +
        _renderPianoRegoleCard() +
        _renderPianoRegoleGruppoCard() +
        '</div>';
    } else if (_pianoTab === 'festivi') {
      await _generaFestiviSeMancanti();
      await _pianoCaricaFestivita(window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]));
      h += '<div id="piano-config">' + _renderPianoFestiviCard() + _renderPianoFestivitaCard() + '</div>';
    } else if (_pianoTab === 'timbrature') {
      h += '<div id="piano-config">' + _renderPianoTimbratureCard() + '</div>';
    } else if (_pianoTab === 'benessere') {
      h += '<div id="piano-config">' + _renderPianoBenessereCard() + _renderPianoDomenicheCard() + '</div>';
    } else if (_pianoTab === 'statistiche') {
      h += '<div id="piano-config">' + _renderPianoStatCard() + '</div>';
    } else if (_pianoTab === 'organico') {
      h += await _renderPianoOrganicoTab();
    } else if (_pianoTab === 'formazioni') {
      h += await _renderPianoFormazioniTab();
    } else if (_pianoTab === 'saldo') {
      h += await _renderPianoSaldoTab();
    } else if (_pianoTab === 'recupero') {
      h += await _renderPianoRecuperoTab();
    } else if (_pianoTab === 'storico') {
      h += await _renderPianoStoricoTab();
    } else if (_pianoTab === 'cambi') {
      h += _renderPianoCambiTab();
    } else if (_pianoTab === 'formulari') {
      h += await _renderPianoFormulariTab();
    } else if (_pianoTab === 'guida') {
      h += _renderPianoGuidaTab();
    } else if (_pianoTab === 'impostazioni') {
      h +=
        '<div id="piano-config">' +
        _renderPianoImportExportCard() +
        (typeof _renderPianoFunzioniCard === 'function' ? _renderPianoFunzioniCard() : '') +
        _renderPianoMappatureCard() +
        _renderPianoPreferenzeCard() +
        _renderPianoImpostazioniCard() +
        (typeof _renderOrganicoInterruttoreCard === 'function' ? _renderOrganicoInterruttoreCard() : '') +
        '</div>';
    }
    // chi naviga con la tastiera resta sulla scheda appena aperta
    const ae = document.activeElement;
    const fuocoSuScheda = !!(ae && ae.classList && ae.classList.contains('piano-tab') && el.contains(ae));
    el.innerHTML = h;
    el.style.opacity = '';
    _pianoTabBarDopo(fuocoSuScheda);
    _pianoSettoreDoppio();
    _pianoAvvisiMeseAvvia();
    if (scrollPrec) requestAnimationFrame(() => window.scrollTo(0, scrollPrec));
    // numero degli avvisi sulla scheda Avvisi e sulla voce Piano del menu
    if (_pianoTab !== 'avvisi' && typeof _pianoAvvisiAggiornaBadge === 'function')
      setTimeout(_pianoAvvisiAggiornaBadge, 0);
    if (typeof initCardRichiudibili === 'function' && document.getElementById('piano-config'))
      initCardRichiudibili('piano-config', []);
    if (_pianoTab === 'calendario') {
      _pianoCaricaInattivi().then(() => {
        if (!window._collabInattiviReso && (window._collabInattivi || []).length) {
          window._collabInattiviReso = true;
          renderPiano();
        }
      });
      _pianoInitSelezione();
      _pianoInitSticky();
      _pianoRenderViolazioni();
      _pianoDragBind();
      _pianoTipBind();
      _pianoApplicaNascosti();
      // la cella attiva resta selezionata anche dopo il ridisegno (salvataggio)
      if (typeof _pianoRipristinaCellaAttiva === 'function') _pianoRipristinaCellaAttiva();
      if (typeof _fabbRipristinaCellaAttiva === 'function') _fabbRipristinaCellaAttiva();
      if (typeof _pianoApplicaEvidenzia === 'function') _pianoApplicaEvidenzia();
    }
    if (_pianoTab === 'recupero' && typeof _pianoRecuperoTotaliGenerali === 'function') {
      _pianoRecuperoTotaliGenerali();
      _recApplicaColoriDom();
      _recDragBind();
    }
    if (_pianoTab === 'saldo') _pianoSaldoBind();
    if (_pianoTab === 'briefing') {
      _briefSelezioneBind();
      if (typeof _briefGrigliaCollega === 'function') _briefGrigliaCollega();
    }
    if (_pianoTab === 'benessere' && typeof caricaBenesserePiano === 'function')
      setTimeout(() => caricaBenesserePiano(), 60);
    if (_pianoTab === 'benessere' && typeof pianoCaricaDomenicheAnno === 'function')
      setTimeout(() => pianoCaricaDomenicheAnno(), 90);
    if (_pianoTab === 'statistiche' && typeof caricaStatisticheAnnoPiano === 'function')
      setTimeout(() => caricaStatisticheAnnoPiano(true), 50);
    if (_pianoTab === 'statistiche' && typeof caricaConfrontoAnniPiano === 'function')
      setTimeout(() => caricaConfrontoAnniPiano(), 80);
    if (_pianoTab === 'timbrature' && typeof caricaConfrontoTimbrature === 'function')
      setTimeout(() => caricaConfrontoTimbrature(), 50);
  } catch (e) {
    console.error('Errore piano:', e);
    el.style.opacity = '';
    el.innerHTML = '<p style="color:var(--accent);padding:20px">Errore caricamento piano</p>';
  }
}

// Torna al mese in corso da qualunque scheda (frecce del Recupero ore)
function pianoVaiMeseCorrente() {
  _pianoMeseSel = _pianoYmOggi();
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}
function pianoCambiaMese(delta) {
  const p = _pianoMeseSel.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + delta, 15);
  _pianoMeseSel = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// (la vecchia finestra di modifica cella è stata sostituita dalla
// scrittura diretta nella cella · pianoCellaInline / pianoSalvaCella)
// un operazione del Piano: alla fine il suo passo di Annulla si chiude
function rimuoviPianoCella(giaChiuso) {
  return _pianoOperazione(() => _rimuoviPianoCellaEsegui(giaChiuso));
}
async function _rimuoviPianoCellaEsegui(giaChiuso) {
  const avvisoRete = !!window._sessioneScadutaAvvisata;
  const sel = _pianoCellaSel;
  if (!sel) return;
  // GIORNO CHIUSO: la cancellazione e' una modifica come le altre e passa dallo
  // stesso controllo della scrittura (prima sfuggiva, si poteva cancellare una
  // cella di un mese passato senza sblocco motivato)
  if (!(await _pianoConsentiScrittura(sel.data))) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  // CELLA PROTETTA: non si cancella per sbaglio. Si puo' fare, ma con una
  // conferma esplicita che dice cosa si sta togliendo.
  if (
    r.protetto &&
    !(await chiediConferma(
      'CELLA PROTETTA\n\n' +
        sel.nome +
        ' · ' +
        String(sel.data).split('-').reverse().join('.') +
        ' · ' +
        r.codice +
        (r.motivo_blocco
          ? '\n\nE BLOCCATA per: ' + r.motivo_blocco
          : '\n\nE una cella protetta (piano consolidato, vacanza o assenza confermata).') +
        '\nCancellarla comunque?',
    ))
  )
    return;
  // MALATTIA CHE UN COLLEGA COPRIVA: «Rimetto il turno a X e tolgo la copertura a Y?»
  // (stessa domanda della cella scritta a mano: Sì = tutto come prima della malattia)
  const opR = { collaboratore: sel.nome, data: sel.data, atteso: _pianoAttesoDi(r), dati: null };
  const opsCop = [];
  if (_pianoCodiceAssenteTurno(r.codice) && typeof _pianoOpsTogliCopertura === 'function') {
    const cop = await _pianoOpsTogliCopertura(sel.nome, [sel.data]).catch(() => ({ ops: [] }));
    const sotto = _pianoSiglaSottoMalattia(r);
    if (
      cop.ops.length &&
      (await chiediConferma(
        _pianoTestoTogliCopertura(sel.nome, sotto ? [{ data: sel.data, codice: sotto }] : [], cop),
        { titolo: 'Malattia tolta: copertura', ok: 'Sì, rimetti com era', annulla: 'No, resta la copertura' },
      ))
    ) {
      if (sotto)
        opR.dati = Object.assign(_pianoRitornoDaMalattia(r, sotto), {
          operatore: getOperatore(),
          updated_at: new Date().toISOString(),
        });
      cop.ops.forEach((o) => opsCop.push(o));
    }
  }
  const passo = _pianoUndoSnap('rimozione cella');
  if (!giaChiuso) document.getElementById('pwd-modal').classList.add('hidden');
  // solo se la cella e ancora quella mostrata (un collega puo averla cambiata)
  let es;
  try {
    es = await _pianoScriviCelle([opR].concat(opsCop));
  } catch (e) {
    _pianoUndoScarta(passo);
    _pianoErroreScrittura('Cella NON rimossa: ', e, avvisoRete);
    return;
  }
  if (!es.ok) {
    _pianoUndoScarta(passo);
    await _pianoAvvisaConflitti(es.conflitti);
    return;
  }
  try {
    _pianoMemoriaDopo(es.ops, es.righe);
    logAzione('Piano: cella rimossa', sel.nome + ' ' + sel.data + ' (era ' + r.codice + ')');
    toast('Cella rimossa');
    if (r.codice === 'M' || r.codice === 'M1') await _pianoMalattiaViaDiario(sel.nome, [sel.data]);
    else if (r.codice === 'ASS') await _pianoMalattiaViaDiario(sel.nome, [sel.data], { codice: 'ASS' });
    await _pianoFestiviPersiDopo(sel.nome, [{ data: sel.data, codice: r.codice }]);
    renderPiano();
  } catch (e) {
    toastErrore('Cella rimossa, ma il seguito non e riuscito: ' + ((e && e.message) || e));
  }
}

// ================================================================
// BARRA COMANDI DEL CALENDARIO (ondata 3): menu a tendina e azione principale
// ================================================================
// chiude i menu aperti della barra (dopo una scelta, un clic fuori o Esc)
function pianoMenuChiudi(tranne) {
  document.querySelectorAll('details.pmenu[open]').forEach((d) => {
    if (d !== tranne) d.removeAttribute('open');
  });
}
document.addEventListener('click', (e) => {
  const aperto = e.target && e.target.closest ? e.target.closest('details.pmenu') : null;
  pianoMenuChiudi(aperto);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pianoMenuChiudi();
});
// PREPARA IL MESE: la bozza (generaBozzaPiano, invariata) e poi, se e stata scritta,
// la proposta del passo dopo: Migliora la bozza. I posti scoperti si spiegano con
// "Perché manca qualcuno" (menu Controlla), proposto se non si migliora.
async function pianoPreparaMese() {
  window._pianoUltimaBozza = null;
  window._pianoPreparaInCorso = true;
  try {
    await generaBozzaPiano();
  } finally {
    window._pianoPreparaInCorso = false;
  }
  const b = window._pianoUltimaBozza;
  if (!b) return; // annullata, niente da fare o errore (i messaggi li ha gia dati la bozza)
  const mese = (MESI_FULL[parseInt(b.ym.split('-')[1]) - 1] || b.ym) + ' ' + b.ym.split('-')[0];
  const scop = b.scoperti
    ? b.scoperti + (b.scoperti === 1 ? ' posto è rimasto scoperto.' : ' posti sono rimasti scoperti.')
    : 'tutti i posti sono coperti.';
  const migliora = await chiediConferma(
    'La bozza di ' +
      mese +
      ' è pronta: ' +
      scop +
      '\n\nPasso consigliato: Migliora la bozza. Il programma prova scambi e spostamenti fra i turni appena preparati e tiene solo quelli che rispettano meglio le regole, coprono più posti o equilibrano le ore. Prima di cambiare qualcosa ti mostra il prima e il dopo.',
    { titolo: 'Prepara il mese', ok: 'Migliora la bozza', annulla: 'Non ora' },
  );
  if (migliora) {
    await pianoMigliora();
    return;
  }
  if (b.scoperti && typeof pianoPercheScoperti === 'function')
    if (
      await chiediConferma(
        'Vuoi vedere perché ' +
          (b.scoperti === 1 ? 'un posto è rimasto scoperto' : b.scoperti + ' posti sono rimasti scoperti') +
          ' e cosa manca (personale, formazione, impostazioni)? Lo trovi anche nel menu Controlla, alla voce Perché manca qualcuno.',
        { titolo: 'Posti scoperti', ok: 'Vedi perché', annulla: 'Dopo' },
      )
    )
      await pianoPercheScoperti();
}
