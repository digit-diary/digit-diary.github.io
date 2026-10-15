/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-scelte.js
 * PIANO · SCELTE DELLA PERSONA NEL TEMPO (v457, richiesta del titolare 15/10/2026)
 * Le scelte sul piano (solo notti, solo diurni, giorni di lavoro, giorni a settimana, turni
 * solo a mano) sono spunte che si mettono per qualche mese e poi si tolgono. Il programma
 * ricorda DA SOLO quando sono state messe o tolte: il database registra ogni cambio di quelle
 * colonne (trigger su collaboratori, migrazione 20260923, tabella collab_scelte_storico), da
 * qualsiasi strada: Preferenze, Annulla e Ripristina, import, script. Nessuna data da scrivere.
 * Qui la lettura: sceltaValidaIl(persona, campo, data) = la scelta valida quel giorno.
 *  - Benessere e Controlla le regole sui mesi passati giudicano ogni giorno con la scelta di
 *    quel giorno (es. le notti di agosto non sono un anomalia se "solo diurni" e di novembre).
 *  - Dal giorno dell ultimo cambio in poi vale SEMPRE la colonna di oggi: la bozza, che lavora
 *    sul mese da generare, e i controlli del mese corrente usano le scelte attuali.
 *  - Senza righe nello storico la scelta di oggi vale da sempre (persone mai cambiate, o
 *    database senza la migrazione: tutto come prima).
 * Parte pura (PianoScelte) provata in test/piano-scelte.test.js.
 */
(function (root) {
  'use strict';
  const CAMPI = ['solo_notti', 'solo_diurni', 'giorni_lavoro', 'giorni_settimana', 'turni_solo_a_mano'];
  const BOOL = { solo_notti: 1, solo_diurni: 1, turni_solo_a_mano: 1 };
  const NOMI = {
    solo_notti: 'solo notturni',
    solo_diurni: 'solo diurni',
    giorni_lavoro: 'giorni di lavoro',
    giorni_settimana: 'giorni a settimana',
    turni_solo_a_mano: 'turni solo a mano',
  };

  // valore registrato (testo) -> valore della colonna
  function daTesto(campo, v) {
    const s = v == null ? '' : String(v).trim();
    if (BOOL[campo]) return s === 'true';
    if (campo === 'giorni_settimana') return parseInt(s) > 0 ? parseInt(s) : null;
    return s || null;
  }
  // valore della colonna -> testo confrontabile (come lo scrive il trigger)
  function inTesto(campo, v) {
    if (BOOL[campo]) return v ? 'true' : 'false';
    if (campo === 'giorni_settimana') return parseInt(v) > 0 ? String(parseInt(v)) : '';
    return String(v == null ? '' : v).replace(/\s+/g, '');
  }
  const attiva = (campo, v) => (BOOL[campo] ? !!v : inTesto(campo, v) !== '');

  // indice dello storico: { 'id|campo': [righe ordinate per giorno e id] }. Accetta l elenco
  // grezzo (righe di leggi_scelte_storico) o un indice gia pronto.
  function indice(storico) {
    if (storico && storico._indice) return storico;
    const idx = { _indice: true, perId: {} };
    (storico || []).forEach((r) => {
      if (!r || CAMPI.indexOf(r.campo) < 0) return;
      const k = String(r.collaboratore_id) + '|' + r.campo;
      (idx[k] = idx[k] || []).push(r);
      idx.perId[String(r.collaboratore_id)] = true;
    });
    Object.keys(idx).forEach((k) => {
      if (Array.isArray(idx[k]))
        idx[k].sort((a, b) =>
          String(a.valido_dal) < String(b.valido_dal)
            ? -1
            : String(a.valido_dal) > String(b.valido_dal)
              ? 1
              : (a.id || 0) - (b.id || 0),
        );
    });
    return idx;
  }
  const righeDi = (idx, persona, campo) => (persona && idx[String(persona.id) + '|' + campo]) || [];
  const giorno = (d) => String(d || '').substring(0, 10);

  // LA SCELTA VALIDA IL GIORNO data. persona = riga del collaboratore (serve id e la colonna di
  // oggi). Dall ultimo cambio in poi vale la colonna di oggi; prima, il valore del cambio
  // precedente; prima del primo cambio, il valore che c era prima di lui.
  function sceltaValidaIl(persona, campo, data, storico) {
    if (!persona) return daTesto(campo, '');
    const oggi = persona[campo];
    const righe = righeDi(indice(storico), persona, campo);
    const d = giorno(data);
    if (!righe.length || !d) return oggi;
    const ultima = righe[righe.length - 1];
    if (d >= giorno(ultima.valido_dal)) return oggi;
    let v = null;
    for (let i = 0; i < righe.length; i++) {
      if (giorno(righe[i].valido_dal) <= d) v = righe[i].valore;
      else break;
    }
    return daTesto(campo, v == null ? righe[0].valore_prima : v);
  }

  // la riga della persona con le scelte valide quel giorno (le altre colonne restano quelle di
  // oggi). Senza storico per la persona: la riga stessa, nessuna copia.
  function infoIl(persona, data, storico) {
    const idx = indice(storico);
    if (!persona || !idx.perId[String(persona.id)]) return persona;
    const out = Object.assign({}, persona);
    CAMPI.forEach((c) => (out[c] = sceltaValidaIl(persona, c, data, idx)));
    return out;
  }

  const piu1 = (iso, n) => {
    const x = new Date(iso + 'T12:00:00');
    x.setDate(x.getDate() + n);
    return (
      x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
    );
  };
  const firma = (info) => CAMPI.map((c) => inTesto(c, info && info[c])).join('|');

  // TRATTI DEL PERIODO con le stesse scelte: [{ da, a, info }] (almeno uno). Un tratto nuovo
  // comincia il giorno di un cambio; tratti vicini con le stesse scelte si uniscono.
  function segmenti(persona, da, a, storico) {
    const idx = indice(storico);
    const d0 = giorno(da);
    const d1 = giorno(a);
    if (!persona || !idx.perId[String(persona.id)]) return [{ da: d0, a: d1, info: persona }];
    const tagli = {};
    CAMPI.forEach((c) =>
      righeDi(idx, persona, c).forEach((r) => {
        const g = giorno(r.valido_dal);
        if (g > d0 && g <= d1) tagli[g] = true;
      }),
    );
    const inizi = [d0].concat(Object.keys(tagli).sort());
    const out = [];
    inizi.forEach((ini, i) => {
      const fine = i + 1 < inizi.length ? piu1(inizi[i + 1], -1) : d1;
      const info = infoIl(persona, ini, idx);
      const prec = out[out.length - 1];
      if (prec && firma(prec.info) === firma(info)) prec.a = fine;
      else out.push({ da: ini, a: fine, info: info });
    });
    return out;
  }

  // da quando vale la scelta di oggi: { dal: 'AAAA-MM-GG' | null, attiva: bool }. dal = ultimo
  // giorno in cui la scelta e davvero cambiata (messa e tolta lo stesso giorno non conta);
  // null = nessun cambio registrato (vale da sempre).
  function validaDal(persona, campo, storico) {
    const righe = righeDi(indice(storico), persona, campo);
    const on = attiva(campo, persona && persona[campo]);
    let prima = righe.length ? inTesto(campo, daTesto(campo, righe[0].valore_prima)) : null;
    let dal = null;
    for (let i = 0; i < righe.length; i++) {
      const g = giorno(righe[i].valido_dal);
      if (i + 1 < righe.length && giorno(righe[i + 1].valido_dal) === g) continue; // conta la fine del giorno
      const dopo = inTesto(campo, daTesto(campo, righe[i].valore));
      if (dopo !== prima) dal = g;
      prima = dopo;
    }
    return { dal: dal, attiva: on };
  }

  const API = { CAMPI, NOMI, daTesto, inTesto, indice, sceltaValidaIl, infoIl, segmenti, validaDal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.PianoScelte = API;
})(typeof window !== 'undefined' ? window : globalThis);

// ================================================================
// PARTE DEL BROWSER: lettura dello storico e nota "attiva dal" nelle Preferenze
// ================================================================
let _pianoScelteIdx = null; // indice dello storico (null = non ancora letto)
let _pianoScelteLettura = null;
let _pianoScelteAssente = false;
// legge lo storico (una lettura per tutto il settore). Senza la migrazione o senza rete:
// storico vuoto, le scelte di oggi valgono da sempre (come prima).
function pianoScelteCarica(forza) {
  if (_pianoScelteIdx && !forza) return Promise.resolve(_pianoScelteIdx);
  if (_pianoScelteLettura) return _pianoScelteLettura;
  const tk = typeof getOpToken === 'function' ? getOpToken() : '';
  // senza sessione o database senza la migrazione 20260923 (funzione assente: si chiede una volta)
  if (!tk || _pianoScelteAssente) return Promise.resolve((_pianoScelteIdx = _pianoScelteIdx || PianoScelte.indice([])));
  _pianoScelteLettura = _conSessione((t) => _rpcSicura('leggi_scelte_storico', { p_token: t }), tk)
    .then((r) => (_pianoScelteIdx = PianoScelte.indice(Array.isArray(r) ? r : [])))
    .catch((e) => {
      if (e && e.status === 404) _pianoScelteAssente = true;
      console.warn('[piano-scelte] storico non letto', e && e.message);
      return (_pianoScelteIdx = _pianoScelteIdx || PianoScelte.indice([]));
    })
    .finally(() => (_pianoScelteLettura = null));
  return _pianoScelteLettura;
}
// dopo un salvataggio che cambia una scelta (secPatch su collaboratori): si rilegge e si
// aggiornano le note delle Preferenze aperte
function pianoScelteCambiate() {
  pianoScelteCarica(true).then(() => pianoScelteNoteAggiorna());
}
function _pianoScelteRiga(persona) {
  if (persona && typeof persona === 'object') return persona;
  if (typeof _pianoCollabInfo === 'function') return _pianoCollabInfo(persona);
  return (collaboratoriCache || []).find((c) => c.nome === persona) || null;
}
// LA FUNZIONE UNICA: scelta valida il giorno data (persona = riga o nome)
function sceltaValidaIl(persona, campo, data) {
  return PianoScelte.sceltaValidaIl(_pianoScelteRiga(persona), campo, data, _pianoScelteIdx || []);
}
// riga della persona con tutte le scelte valide quel giorno
function pianoInfoIl(persona, data) {
  return PianoScelte.infoIl(_pianoScelteRiga(persona), data, _pianoScelteIdx || []);
}
function pianoScelteSegmenti(persona, da, a) {
  return PianoScelte.segmenti(_pianoScelteRiga(persona), da, a, _pianoScelteIdx || []);
}

// NOTA accanto alla spunta (Piano › Impostazioni › Preferenze): "dal 07.10.26", al passaggio
// del mouse "attiva dal 07.10.2026". Si riempie quando lo storico e letto.
function _pianoSceltaNotaTesto(c, campo) {
  if (!c || !_pianoScelteIdx) return { testo: '', titolo: '' };
  const v = PianoScelte.validaDal(c, campo, _pianoScelteIdx);
  const lungo = (d) => d.split('-').reverse().join('.');
  const corto = (d) => d.substring(8, 10) + '.' + d.substring(5, 7) + '.' + d.substring(2, 4);
  // nella cella dei giorni ci sono due scelte: si dice quale
  const chi = campo === 'giorni_lavoro' ? 'giorni ' : campo === 'giorni_settimana' ? 'a settimana ' : '';
  const nome = PianoScelte.NOMI[campo] + ': ';
  if (v.attiva && v.dal)
    return {
      testo: chi + 'dal ' + corto(v.dal),
      titolo: nome + 'attiva dal ' + lungo(v.dal) + ' (i giorni prima si giudicano con la scelta di allora)',
    };
  if (v.attiva)
    return {
      testo: chi + 'da sempre',
      titolo: nome + 'attiva da prima che il programma registrasse i cambi: vale anche per i mesi passati',
    };
  if (v.dal)
    return {
      testo: chi + 'tolta il ' + corto(v.dal),
      titolo: nome + 'tolta il ' + lungo(v.dal) + ' (i giorni prima si giudicano con la scelta di allora)',
    };
  return { testo: '', titolo: '' };
}
function pianoSceltaNota(c, campo) {
  if (!c) return '';
  if (!_pianoScelteIdx) pianoScelteCarica().then(() => pianoScelteNoteAggiorna());
  const n = _pianoSceltaNotaTesto(c, campo);
  return (
    '<span class="scelta-dal" data-scelta-id="' +
    c.id +
    '" data-scelta-campo="' +
    campo +
    '" title="' +
    n.titolo +
    '" style="display:block;font-size:var(--fs-xs,.75rem);color:var(--muted);line-height:1.1;white-space:nowrap">' +
    n.testo +
    '</span>'
  );
}
function pianoScelteNoteAggiorna() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('span.scelta-dal[data-scelta-id]').forEach((el) => {
    const id = parseInt(el.dataset.sceltaId);
    const c = (collaboratoriCache || []).find((x) => x.id === id);
    const n = _pianoSceltaNotaTesto(c, el.dataset.sceltaCampo);
    el.textContent = n.testo;
    el.title = n.titolo;
  });
}
