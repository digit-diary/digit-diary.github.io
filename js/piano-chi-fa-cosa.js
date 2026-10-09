/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-chi-fa-cosa.js
 * Piano > Regole: "Chi puo fare cosa" (sola lettura, controllo del 09/10/2026). Per un
 * collaboratore, ogni turno del settore raggruppato per area con l esito (si / ammesso /
 * no) e il MOTIVO in parole; oppure, per un turno, chi puo farlo, perche gli altri no e
 * tutto quello che decide quel turno (area, competenze, regole, turni per funzione,
 * persone con il turno bloccato). La spiegazione segue passo per passo il controllo della
 * bozza (_pianoIdoneoStatico) e verifica di arrivare allo stesso esito; accanto c e cosa
 * succede scrivendo la cella a mano (avviso o no).
 * "Vai a" porta al posto dove si cambia, apre la card, evidenzia la riga giusta e mostra
 * una barra per tornare qui (navigazione.js; anche la freccia Indietro torna).
 */

const _PCFC_GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
let _pcfcStato = { vista: 'persona', nome: '', turno: '', dow: undefined, filtro: 'tutti' };
let _pcfcGen = 0; // contatore: un disegno vecchio (attesa della storia) non scrive sopra il nuovo
let _pcfcRighe = []; // righe della tabella mostrata, per i pulsanti "vai a"

function _pcfcLista(v) {
  return String(v || '')
    .toUpperCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
function _pcfcPlur(n, uno, molti) {
  return n + ' ' + (n === 1 ? uno : molti);
}
function _pcfcEtichettaCompetenza(k) {
  const tutte = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {};
  for (const rep of Object.keys(tutte)) {
    const c = (tutte[rep] || []).find((x) => x.key === k);
    if (c) return c.label;
  }
  return k;
}
// competenze di Formazione collegate a un area di lavoro (gruppo)
function _pcfcCompetenzeDelGruppo(gruppo) {
  const m = typeof _pianoCompetenzeGruppi === 'function' ? _pianoCompetenzeGruppi() : {};
  const g = String(gruppo || '').toUpperCase();
  return Object.keys(m)
    .filter((k) => String(m[k] || '').toUpperCase() === g)
    .map((k) => ({ key: k, label: _pcfcEtichettaCompetenza(k) }));
}
// sigla di un turno dentro un modello di regola (Z* = i turni che iniziano con Z)
function _pcfcCombacia(modello, cod) {
  const m = String(modello || '')
    .trim()
    .toUpperCase();
  if (!m) return false;
  return m.endsWith('*') ? cod.startsWith(m.slice(0, -1)) : cod === m;
}
// le sigle citate da una regola, secondo il suo tipo (non i numeri di giorni o livelli)
function _pcfcSigleDellaRegola(r) {
  const tipo = String(r.tipo_regola || '').toLowerCase();
  const v = String(r.valore || '');
  const csv = (x) =>
    String(x || '')
      .split(',')
      .map((y) => y.trim())
      .filter(Boolean);
  if (tipo === 'turni_solo_funzioni' || tipo === 'livello_turni' || tipo === 'turni_solo_collaboratori')
    return csv(v.split(':')[0]);
  if (tipo === 'funzione_turni_giorni') return csv(v.split(':')[1]);
  if (tipo === 'coordinatori') return csv(v.split('|')[0]).concat(csv(v.split('|')[1]));
  return [];
}
function _pcfcRegoleCheCitano(cod, rep) {
  const c = String(cod).toUpperCase();
  return pianoRegoleGruppoCache.filter(
    (r) =>
      r.attivo !== false &&
      (r.reparto_dip || 'slots') === (rep || _pianoReparto()) &&
      _pcfcSigleDellaRegola(r).some((m) => _pcfcCombacia(m, c)),
  );
}
// gruppi di turni fatti nel settore aperto fino alla fine del mese scelto (come la bozza)
function _pcfcStoria(nome, rep) {
  const c = typeof _pianoStoriaGruppiCache !== 'undefined' ? _pianoStoriaGruppiCache[rep] : null;
  if (!c) return null;
  const ym = String(_pianoMeseSel || '').substring(0, 7);
  const fine = ym ? ym + '-31' : '9999-12-31';
  const per = c.primo[nome] || {};
  return new Set(Object.keys(per).filter((g) => per[g] <= fine));
}

// PERCHE: il risultato del motore unico (PianoRegole.idoneita, lo stesso della bozza)
// tradotto in parole, con il posto dove si cambia. Esito: si | serve (ammesso: la bozza
// preferisce i principali) | no. dove = posto dove si cambia; rif = id delle regole di
// gruppo coinvolte; comps = competenze da evidenziare; campo = preferenza da cambiare.
function _pcfcSpiega(nome, t, dowG, idoneita) {
  const info = _pianoCollabInfo(nome) || {};
  const r = PianoRegole.idoneita(
    info,
    t,
    _pianoCtxIdoneita({
      dow: dowG,
      storiaDi: () => (idoneita ? idoneita[nome] || new Set() : null),
      storiaSconosciutaPassa: false,
    }),
  );
  const cod = String(t.codice).toUpperCase();
  const gruppoT = String(t.gruppo || '').toUpperCase();
  const fz = String(info.funzione || '').toUpperCase();
  const regola = (id) => pianoRegoleGruppoCache.find((x) => x.id === id);
  const frase = (id) => {
    const rg = regola(id);
    return rg ? (typeof _rgFrase === 'function' ? _rgFrase(rg) : String(rg.valore).toLowerCase()) : '';
  };
  const no = (motivo, dove, extra) => Object.assign({ esito: 'no', motivo: motivo, dove: dove }, extra || {});
  const coda =
    (r.preferito ? ' · turno preferito della funzione ' + fz : '') +
    (r.affiancato ? ' · affiancato: mai da solo in ' + gruppoT : '');
  const compsGr = _pcfcCompetenzeDelGruppo(gruppoT);
  switch (r.passo) {
    case 'solo_a_mano':
      return no('"Turni solo a mano": fuori rotazione, la bozza non gli assegna turni', 'pref', {
        campo: 'Turni solo a mano',
      });
    case 'solo_diurni':
      return no('fa solo turni diurni', 'pref', { campo: 'Solo diurni' });
    case 'solo_notti':
      return no('fa solo turni notturni', 'pref', { campo: 'Solo notturni' });
    case 'giorno':
      return no('non lavora di ' + _PCFC_GIORNI[dowG], 'pref', { campo: 'Giorni di lavoro' });
    case 'bloccato':
      return no('turno bloccato nelle sue preferenze', 'pref', { campo: 'Turni bloccati' });
    case 'scelto':
      return {
        esito: 'si',
        motivo: 'scelto per nome (Turni riservati a collaboratori scelti)',
        dove: 'regole',
        rif: _pcfcRegoleCheCitano(cod)
          .filter((x) => String(x.tipo_regola).toLowerCase() === 'turni_solo_collaboratori')
          .map((x) => x.id),
      };
    case 'funzione_turno':
      return no(String(r.motivo).replace(/ \(Regole di gruppo\)$/, ''), 'regole', { rif: r.regole || [] });
    case 'area_funzioni':
      return no(
        'l area ' + gruppoT + ' e aperta alle funzioni ' + r.ammesse.join(', ') + ' e lui non vi e abilitato',
        'regole',
        { rif: [r.regola] },
      );
    case 'tipo_vietato':
      return no('turni ' + String(t.tipo).toLowerCase() + ' vietati nell area ' + gruppoT, 'regole', {
        rif: [r.regola],
      });
    case 'campo':
      return no('requisito sulla scheda non soddisfatto: ' + frase(r.regola), 'regole', { rif: [r.regola] });
    case 'mapp_fuori':
      return no('la funzione ' + fz + ' fa solo ' + r.voci.join(', ') + ' (Turni per funzione)', 'mapp');
    case 'mapp_ammesso':
      return {
        esito: 'serve',
        motivo: 'turno ammesso per la funzione ' + fz + ': la bozza lo da solo se serve e se e sotto le sue ore' + coda,
        dove: 'mapp',
      };
    case 'mapp_principale':
      return { esito: 'si', motivo: 'turno principale della funzione ' + fz + coda, dove: 'mapp' };
    case 'area':
      if (r.conSettori && compsGr.length)
        return no(
          'area ' +
            gruppoT +
            ' non abilitata: competenza ' +
            compsGr.map((c) => c.label).join(' o ') +
            ' non certificata in Formazione',
          'formazione',
          { comps: compsGr.map((c) => c.key) },
        );
      if (r.conSettori)
        return no(
          'area ' + gruppoT + ' non abilitata: nessuna competenza di Formazione collegata a quest area',
          'impo',
        );
      return no(
        'nessuna abilitazione all area ' + gruppoT + ' (nessuna competenza certificata) e non ci ha mai lavorato',
        compsGr.length ? 'formazione' : 'impo',
        { comps: compsGr.map((c) => c.key) },
      );
    case 'area_funzione':
      return {
        esito: 'si',
        motivo: 'la funzione ' + fz + ' entra nell area ' + gruppoT + ' senza abilitazione' + coda,
        dove: 'regole',
        rif: [r.lasciapassare.regola],
      };
    case 'area_campo':
      return {
        esito: 'si',
        motivo: 'requisito sulla scheda soddisfatto: ' + frase(r.lasciapassare.regola) + coda,
        dove: 'regole',
        rif: [r.lasciapassare.regola],
      };
    case 'area_affiancamento':
      return {
        esito: 'si',
        motivo:
          'affiancato in ' +
          gruppoT +
          ': fa questi turni ma mai da solo' +
          (r.preferito ? ' · turno preferito della funzione ' + fz : ''),
        dove: 'pref',
        campo: 'Affiancato in',
      };
    case 'area_settori': {
      const certif = compsGr.filter((c) => (info.competenze || {})[c.key] === true);
      return {
        esito: 'si',
        motivo:
          (certif.length
            ? 'competenza ' + certif.map((c) => c.label).join(', ') + ' certificata in Formazione'
            : 'area ' + gruppoT + ' fra le sue aree abilitate') + coda,
        dove: 'formazione',
        comps: certif.map((c) => c.key),
      };
    }
    default:
      return {
        esito: 'si',
        motivo: 'ha già lavorato nell area ' + gruppoT + ' (storia dei turni)' + coda,
        dove: 'formazione',
      };
  }
}

// COPERTURA da un altro settore (scheda del collaboratore): la bozza la usa solo nel
// passaggio "Completa con coperture" e solo nell area ammessa
function _pcfcCopertura(nome, t, sp) {
  if (sp.esito === 'no') return sp;
  const cop = _pianoCoperturaCfg(_pianoCollabInfo(nome) || {});
  if (!cop) return sp;
  const gruppoT = String(t.gruppo || '').toUpperCase();
  if (cop.gruppi && String(cop.gruppi).toUpperCase() !== gruppoT)
    return {
      esito: 'no',
      motivo: 'viene da un altro settore e qui copre solo l area ' + String(cop.gruppi).toUpperCase(),
      dove: 'scheda',
    };
  return {
    esito: 'serve',
    motivo:
      'viene da un altro settore: la bozza lo usa solo con Completa con coperture' +
      (cop.max_turni ? ', al massimo ' + cop.max_turni + ' turni nel mese' : '') +
      ' · ' +
      sp.motivo,
    dove: 'scheda',
  };
}

// scritto a mano: la cella si scrive sempre; il controllo da un avviso o no
function _pcfcAManoOk(nome, t, dowG) {
  return _pianoIdoneoAMano(nome, t) && !_pianoViolazioneFunzioneTurno(nome, t, dowG, false);
}
function _pcfcPercheAMano(nome, t, dowG, bozzaOk, manoOk) {
  if (bozzaOk === manoOk) return '';
  const info = _pianoCollabInfo(nome) || {};
  const fz = String(info.funzione || '').toUpperCase();
  if (!manoOk) return 'scritto a mano da un avviso: a mano le regole sono diverse da quelle della bozza';
  if (fz && _pianoFunzioniFannoTutto().has(fz))
    return 'a mano ' + fz + ' può fare ogni turno (regola Funzioni che fanno tutto)';
  if (info.turni_solo_a_mano) return 'fuori rotazione: i suoi turni si scrivono a mano';
  if (_pcfcLista(info.turni_bloccati).includes(String(t.codice).toUpperCase()))
    return 'a mano il turno bloccato non da avviso';
  if (dowG != null && !PianoRegole.lavoraNelGiorno(info, dowG)) return 'a mano i giorni di lavoro non danno avviso';
  if (_pianoCoperturaCfg(info)) return 'a mano le coperture da un altro settore non danno avviso';
  return 'a mano il controllo e più largo di quello della bozza';
}

function _pcfcChip(esito) {
  const m = { si: ['pcfc-si', 'Si'], serve: ['pcfc-serve', 'Ammesso'], no: ['pcfc-no', 'No'] }[esito];
  return '<span class="pcfc-chip ' + m[0] + '">' + m[1] + '</span>';
}
const _PCFC_DOVE = {
  pref: 'Preferenze',
  regole: 'Regole di gruppo',
  mapp: 'Turni per funzione',
  formazione: 'Formazione',
  scheda: 'Scheda',
  impo: 'Competenze e aree',
};
// il pulsante c e solo se chi guarda puo aprire il posto di arrivo
function _pcfcDoveVisibile(dove) {
  if (dove === 'mapp' || dove === 'impo') return isAdmin();
  if (dove === 'pref') return typeof puoVedereStoricoHr === 'function' ? puoVedereStoricoHr() : isAdmin();
  if (dove === 'formazione') return typeof isVis === 'function' ? isVis('formazione') : true;
  return true;
}

// ---- VAI A: posto di arrivo aperto, riga evidenziata, barra per tornare ----
function pcfcVai(i) {
  const x = _pcfcRighe[i];
  if (!x) return;
  const sp = x.sp;
  const nome = x.nome;
  const t = x.t;
  const cod = String(t.codice);
  const gr = String(t.gruppo || '').toUpperCase();
  const fz = String((_pianoCollabInfo(nome) || {}).funzione || '').toUpperCase();
  if (sp.dove === 'scheda') {
    if (typeof apriSchedaCollaboratore === 'function') apriSchedaCollaboratore(nome);
    return;
  }
  const origine = typeof _navStatoCorrente === 'function' ? _navStatoCorrente() : null;
  const chiave = x.chiave;
  const rep = _pianoReparto();
  const cosa = String(chiave).startsWith('area:') ? 'turni dell area ' + gr : cod;
  const titolo = '<b>' + escP(nome) + ' · ' + escP(cosa) + '</b>: ' + escP(sp.motivo) + '.';
  let consiglio = '';
  let trova = null;
  if (sp.dove === 'formazione') {
    switchPage('formazione');
    const comps = sp.comps && sp.comps.length ? sp.comps : _pcfcCompetenzeDelGruppo(gr).map((c) => c.key);
    const nomiC = comps.map(_pcfcEtichettaCompetenza).join(' o ');
    consiglio =
      typeof currentReparto !== 'undefined' && currentReparto !== rep
        ? ' Formazione mostra il settore ' +
          escP(repartoLabel(currentReparto)) +
          ': passa al settore ' +
          escP(repartoLabel(rep)) +
          ' per trovarlo.'
        : sp.esito === 'no'
          ? ' Per abilitarlo spunta ' + escP(nomiC || 'la competenza dell area') + ' nella riga evidenziata.'
          : ' Riga e competenza evidenziate.';
    trova = () => {
      const cerca = document.getElementById('form-matr-cerca');
      if (cerca && cerca.value) {
        cerca.value = '';
        if (typeof _filtraMatrice === 'function') _filtraMatrice();
      }
      const tr = document.querySelector(
        '#matrice-competenze tr[data-matr-nome="' + CSS.escape(nome.toLowerCase()) + '"]',
      );
      if (!tr) return null;
      const celle = comps.map((k) => tr.querySelector('td[data-comp="' + CSS.escape(k) + '"]')).filter(Boolean);
      return [tr].concat(celle);
    };
  } else if (sp.dove === 'pref') {
    _pcfcApriScheda('impostazioni');
    consiglio = ' Nella riga evidenziata cambia ' + escP(sp.campo || 'la preferenza') + '.';
    trova = () => {
      const cerca = document.getElementById('pref-collab-cerca');
      if (cerca && cerca.value) {
        cerca.value = '';
        if (typeof _filtraPrefCollab === 'function') _filtraPrefCollab('');
      }
      return document.querySelector('#pref-collab-table tr[data-pref-nome="' + CSS.escape(nome.toLowerCase()) + '"]');
    };
  } else if (sp.dove === 'mapp') {
    _pcfcApriScheda('impostazioni');
    consiglio =
      sp.esito === 'no'
        ? ' Funzione ' +
          escP(fz) +
          ' evidenziata. Per dargli ' +
          escP(cod) +
          ' aggiungilo qui sotto (già compilato) come AMMESSO o PRINCIPALE.'
        : ' Funzione ' + escP(fz) + ' evidenziata.';
    trova = () => {
      const els = document.querySelectorAll('[data-mapp-fz="' + CSS.escape(fz) + '"]');
      if (!els.length) return null;
      const sf = document.getElementById('mp-funzione');
      const stu = document.getElementById('mp-turno');
      if (sp.esito === 'no' && sf && stu) {
        sf.value = fz;
        stu.value = cod;
      }
      return els;
    };
  } else if (sp.dove === 'impo') {
    _pcfcApriScheda('impostazioni');
    consiglio = ' Collega una competenza di Formazione all area ' + escP(gr) + ' (riquadro evidenziato).';
    trova = () => document.querySelector('[data-pcfc-comp-gruppi]');
  } else {
    _pcfcApriScheda('regole');
    const ids = sp.rif && sp.rif.length ? sp.rif : null;
    consiglio = ids
      ? ids.length === 1
        ? ' Regola evidenziata: Modifica per cambiarla.'
        : ' Regole evidenziate.'
      : ' Regole dell area ' + escP(gr) + ' evidenziate.';
    trova = () => {
      const tutte = Array.from(document.querySelectorAll('tr[data-rg-id]'));
      const sel = ids
        ? tutte.filter((tr) => ids.includes(parseInt(tr.dataset.rgId)))
        : tutte.filter((tr) => tr.dataset.rgGruppo === gr);
      return sel.length ? sel : null;
    };
  }
  if (typeof navMostraBarra === 'function')
    navMostraBarra({
      html: titolo + consiglio,
      etichetta: 'Torna a Chi può fare cosa',
      origine: origine,
      alRitorno: () => _pcfcTornaQui(chiave),
    });
  if (trova && typeof navEvidenzia === 'function') navEvidenzia(trova);
}
// cambia scheda solo se serve (stessa scheda: niente ridisegno che cancella l evidenza)
function _pcfcApriScheda(tab) {
  if (typeof _pianoTab === 'undefined' || _pianoTab !== tab) pianoCambiaTab(tab);
}
function _pcfcTornaQui(chiave) {
  if (typeof _pianoTab !== 'undefined' && _pianoTab !== 'regole') pianoCambiaTab('regole');
  navEvidenzia(() => {
    const card = document.getElementById('pcfc-card');
    if (!card || !card.querySelector('table')) return null;
    return card.querySelector('tr[data-pcfc-chiave="' + CSS.escape(String(chiave)) + '"]') || card;
  });
  const gen = _navEvidGen;
  setTimeout(() => {
    if (gen === _navEvidGen) navTogliEvidenza();
  }, 3500);
}

// ---- RIEPILOGO PER TURNO: tutto quello che decide chi fa questo turno ----
function _pcfcCosaDecide(t) {
  const rep = _pianoReparto();
  const cod = String(t.codice).toUpperCase();
  const gr = String(t.gruppo || '').toUpperCase();
  const voci = [];
  const comps = _pcfcCompetenzeDelGruppo(gr);
  voci.push(
    'Area <b>' +
      escP(gr || '-') +
      '</b>' +
      (comps.length
        ? ': la apre la competenza ' + escP(comps.map((c) => c.label).join(' o ')) + ' di Formazione'
        : ': nessuna competenza collegata, vale la storia dei turni') +
      (t.tipo === 'NOTTURNO' ? ' · turno notturno' : ''),
  );
  const regArea = _pianoRegoleGruppoDi(gr);
  const regCod = _pcfcRegoleCheCitano(cod, rep).filter((r) => !regArea.includes(r));
  regArea
    .concat(regCod)
    .forEach((r) =>
      voci.push(
        'Regola di gruppo, ' +
          escP(
            String(
              (typeof _REGOLE_GRUPPO_ETICHETTE !== 'undefined' && _REGOLE_GRUPPO_ETICHETTE[r.tipo_regola]) ||
                r.tipo_regola,
            ),
          ) +
          ': ' +
          escP(typeof _rgFrase === 'function' ? _rgFrase(r) : r.valore),
      ),
    );
  const mapp = (typeof pianoMappatureCache !== 'undefined' ? pianoMappatureCache : []).filter(
    (m) => (m.reparto_dip || 'slots') === rep && String(m.turno_codice).toUpperCase() === cod,
  );
  if (mapp.length)
    voci.push(
      'Turni per funzione: ' +
        mapp.map((m) => escP(m.funzione) + ' ' + String(m.tipo).toLowerCase()).join(', ') +
        ' (una funzione con turni principali o ammessi fa solo quelli)',
    );
  const blocc = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pcfcLista(c.turni_bloccati).includes(cod))
    .map((c) => c.nome);
  if (blocc.length) voci.push('Turno bloccato nelle preferenze di ' + escP(blocc.join(', ')));
  return (
    '<div class="pcfc-decide"><div class="pcfc-decide-tit">Cosa decide chi fa ' +
    escP(cod) +
    '</div><ul>' +
    voci.map((v) => '<li>' + v + '</li>').join('') +
    '</ul>' +
    (voci.length > 3
      ? '<p class="pcfc-nota">Più voci decidono lo stesso turno: per ogni persona esclusa, il motivo nella tabella dice quale.</p>'
      : '') +
    '</div>'
  );
}

function _pianoChiFaCosaSegnaposto() {
  setTimeout(() => _pcfcRender(), 0);
  return '<div id="pcfc-card"></div>';
}
function pcfcImposta(campo, valore) {
  _pcfcStato[campo] = valore;
  if (campo !== 'filtro') _pcfcStato.filtro = 'tutti';
  _pcfcRender();
}
async function _pcfcRender() {
  const box = document.getElementById('pcfc-card');
  if (!box) return;
  const gen = ++_pcfcGen;
  const rep = _pianoReparto();
  try {
    await _pianoCaricaStoriaGruppi(rep);
  } catch (e) {}
  if (gen !== _pcfcGen || rep !== _pianoReparto() || !document.getElementById('pcfc-card')) return;
  const box2 = document.getElementById('pcfc-card');
  const persone = ordineCollabPiano(
    collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome),
    rep,
  );
  const turni = _pianoTurniReparto()
    .filter((t) => t.attivo !== false)
    .sort(
      (a, b) =>
        String(a.gruppo || '').localeCompare(String(b.gruppo || '')) ||
        String(a.codice).localeCompare(String(b.codice)),
    );
  const st = _pcfcStato;
  const oggi = new Date().getDay();
  if (st.dow === undefined) st.dow = oggi;
  if (!persone.includes(st.nome)) st.nome = persone[0] || '';
  if (!turni.some((t) => t.codice === st.turno)) st.turno = (turni[0] || {}).codice || '';
  const idoneita = {};
  persone.forEach((n) => {
    const s = _pcfcStoria(n, rep);
    if (s) idoneita[n] = s;
  });
  _pcfcRighe = [];
  const calcola = (nome, t) => {
    const sp = _pcfcCopertura(nome, t, _pcfcSpiega(nome, t, st.dow, idoneita));
    // controllo di coerenza con il motore della bozza (piu i limiti delle coperture)
    let bozza = _pianoIdoneoStatico(nome, t, st.dow, idoneita);
    const cop = _pianoCoperturaCfg(_pianoCollabInfo(nome) || {});
    if (bozza && cop && cop.gruppi && String(cop.gruppi).toUpperCase() !== String(t.gruppo || '').toUpperCase())
      bozza = false;
    const mano = _pcfcAManoOk(nome, t, st.dow);
    return {
      nome: nome,
      t: t,
      sp: sp,
      bozza: bozza,
      mano: mano,
      diverso: bozza !== (sp.esito !== 'no'),
      percheMano: _pcfcPercheAMano(nome, t, st.dow, bozza, mano),
    };
  };
  const sel = 'padding:6px 8px;max-width:100%;box-sizing:border-box';
  const opz = (v, testo, attivo) =>
    '<option value="' + escP(v) + '"' + (attivo ? ' selected' : '') + '>' + escP(testo) + '</option>';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Chi può fare cosa · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:10px 14px">' +
    '<p class="pcfc-intro">Sola lettura. Dice chi e <b>abilitato</b> a ogni turno e perché, con il pulsante che porta dove si cambia. Fra gli abilitati la bozza sceglie poi tenendo conto di riposi, ore, vacanze, fabbisogno e regole del giorno.</p>' +
    '<div class="add-tipo-row" style="margin-bottom:8px">' +
    '<div class="field"><label for="pcfc-vista">Vista</label><select id="pcfc-vista" style="' +
    sel +
    '" onchange="pcfcImposta(\'vista\',this.value)">' +
    opz('persona', 'Per collaboratore', st.vista === 'persona') +
    opz('turno', 'Per turno', st.vista === 'turno') +
    '</select></div>' +
    (st.vista === 'persona'
      ? '<div class="field"><label for="pcfc-nome">Collaboratore</label><select id="pcfc-nome" style="' +
        sel +
        '" onchange="pcfcImposta(\'nome\',this.value)">' +
        persone.map((n) => opz(n, n, n === st.nome)).join('') +
        '</select></div>'
      : '<div class="field"><label for="pcfc-turno">Turno</label><select id="pcfc-turno" style="' +
        sel +
        '" onchange="pcfcImposta(\'turno\',this.value)">' +
        turni.map((t) => opz(t.codice, t.codice + ' · ' + (t.gruppo || '-'), t.codice === st.turno)).join('') +
        '</select></div>') +
    '<div class="field"><label for="pcfc-dow">Giorno</label><select id="pcfc-dow" style="' +
    sel +
    "\" onchange=\"pcfcImposta('dow',this.value===''?null:parseInt(this.value))\">" +
    opz('', 'Qualsiasi giorno', st.dow == null) +
    [1, 2, 3, 4, 5, 6, 0]
      .map((d) => opz(String(d), _PCFC_GIORNI[d] + (d === oggi ? ' (oggi)' : ''), d === st.dow))
      .join('') +
    '</select></div></div>' +
    '<p class="pcfc-legenda">' +
    _pcfcChip('si') +
    ' la bozza può darglielo &nbsp; ' +
    _pcfcChip('serve') +
    ' solo se serve: dopo tutti gli altri e se e sotto le sue ore &nbsp; ' +
    _pcfcChip('no') +
    ' la bozza non glielo da mai. <b>A mano</b>: la cella si scrive sempre, la colonna dice se compare un avviso.</p>';

  if (!persone.length || !turni.length) {
    h +=
      '<p class="pcfc-vuoto">' +
      (!persone.length ? 'Nessun collaboratore attivo nel settore.' : 'Nessun turno attivo nel settore.') +
      '</p></div></div>';
    box2.innerHTML = h;
    return;
  }

  let righe = [];
  if (st.vista === 'persona') righe = turni.map((t) => calcola(st.nome, t));
  else {
    const t = turni.find((x) => x.codice === st.turno);
    const ord = { si: 0, serve: 1, no: 2 };
    righe = persone
      .map((n) => calcola(n, t))
      .sort((a, b) => ord[a.sp.esito] - ord[b.sp.esito] || a.nome.localeCompare(b.nome));
  }
  const conteggi = { tutti: righe.length, si: 0, serve: 0, no: 0, mano: 0 };
  righe.forEach((r) => {
    conteggi[r.sp.esito]++;
    if (r.percheMano) conteggi.mano++;
  });
  const passa = (r) => st.filtro === 'tutti' || (st.filtro === 'mano' ? !!r.percheMano : r.sp.esito === st.filtro);
  const filtri = [
    ['tutti', 'Tutti'],
    ['si', 'Si'],
    ['serve', 'Ammesso'],
    ['no', 'No'],
    ['mano', 'Diversi a mano'],
  ]
    .filter(([k]) => k === 'tutti' || conteggi[k])
    .map(
      ([k, testo]) =>
        '<button type="button" class="pcfc-filtro' +
        (st.filtro === k ? ' attivo' : '') +
        '" aria-pressed="' +
        (st.filtro === k) +
        "\" onclick=\"pcfcImposta('filtro','" +
        k +
        '\')">' +
        testo +
        ' <b>' +
        conteggi[k] +
        '</b></button>',
    )
    .join('');

  if (st.vista === 'persona') {
    const info = _pianoCollabInfo(st.nome) || {};
    const lv = typeof _pianoLivelloNelSettore === 'function' ? _pianoLivelloNelSettore(info) : null;
    const sett = _pianoSettoriEffettivi(info);
    h +=
      '<p class="pcfc-chi"><b>' +
      escP(st.nome) +
      '</b> · funzione ' +
      escP(info.funzione || '-') +
      (lv ? ' · livello ' + lv : '') +
      ' · aree abilitate: ' +
      escP(sett ? sett.join(', ') || 'nessuna' : 'dalla storia dei turni') +
      '</p>';
  } else {
    const t = turni.find((x) => x.codice === st.turno);
    h +=
      _pcfcCosaDecide(t) +
      '<p class="pcfc-chi">' +
      _pcfcPlur(conteggi.si + conteggi.serve, 'persona può fare ', 'persone possono fare ') +
      escP(t.codice) +
      (st.dow == null ? '' : ' di ' + _PCFC_GIORNI[st.dow]) +
      ', su ' +
      persone.length +
      '</p>';
  }
  h += '<div class="pcfc-filtri" role="group" aria-label="Filtra le righe">' + filtri + '</div>';

  const bottone = (r) => {
    if (!r.sp.dove || !_pcfcDoveVisibile(r.sp.dove)) return '';
    const i = _pcfcRighe.push(r) - 1;
    return (
      '<button class="btn-act pcfc-vai" type="button" onclick="pcfcVai(' +
      i +
      ')">' +
      _PCFC_DOVE[r.sp.dove] +
      '</button>'
    );
  };
  const riga = (titolo, chiave, r) => {
    r.chiave = chiave;
    const chip = r.diverso ? _pcfcChip(r.bozza ? 'si' : 'no') : _pcfcChip(r.sp.esito);
    return (
      '<tr data-pcfc-chiave="' +
      escP(chiave) +
      '"><td class="pcfc-c-tit">' +
      titolo +
      '</td><td class="pcfc-c-esito">' +
      chip +
      '</td><td class="pcfc-c-perché">' +
      escP(r.sp.motivo) +
      (r.diverso ? ' <span class="pcfc-allarme">(da verificare: la bozza decide diversamente)</span>' : '') +
      '</td><td class="pcfc-c-mano">' +
      (r.percheMano
        ? '<span class="pcfc-chip ' +
          (r.mano ? 'pcfc-si' : 'pcfc-no') +
          '">' +
          (r.mano ? 'Nessun avviso' : 'Avviso') +
          '</span> <span class="pcfc-mano-perché">' +
          escP(r.percheMano) +
          '</span>'
        : '<span class="pcfc-uguale">come la bozza</span>') +
      '</td><td class="pcfc-c-vai">' +
      bottone(r) +
      '</td></tr>'
    );
  };
  const testa = (primaCol) =>
    '<div class="pcfc-scroll"><table class="pcfc-tab"><thead><tr><th>' +
    primaCol +
    '</th><th>Bozza</th><th>Perché</th><th>A mano</th><th>Dove si cambia</th></tr></thead><tbody>';
  let corpo = '';
  if (st.vista === 'persona') {
    // per area: titolo con il conteggio; un area tutta esclusa per lo stesso motivo = una riga
    const perArea = {};
    righe.forEach((r) => {
      const g = String(r.t.gruppo || '-').toUpperCase();
      (perArea[g] = perArea[g] || []).push(r);
    });
    Object.keys(perArea).forEach((g) => {
      const tutte = perArea[g];
      const vis = tutte.filter(passa);
      if (!vis.length) return;
      const possibili = tutte.filter((r) => r.sp.esito !== 'no').length;
      corpo +=
        '<tr class="pcfc-area"><td colspan="5">' +
        escP(g) +
        ' <span>· ' +
        possibili +
        ' su ' +
        _pcfcPlur(tutte.length, 'turno', 'turni') +
        '</span></td></tr>';
      const stessoNo =
        vis.length > 2 &&
        vis.every((r) => r.sp.esito === 'no' && !r.diverso && !r.percheMano && r.sp.motivo === vis[0].sp.motivo);
      if (stessoNo)
        corpo += riga(
          'tutti i ' +
            vis.length +
            ' turni <span class="pcfc-sigle">' +
            escP(vis.map((r) => r.t.codice).join(', ')) +
            '</span>',
          'area:' + g,
          vis[0],
        );
      else vis.forEach((r) => (corpo += riga('<b>' + escP(r.t.codice) + '</b>', r.t.codice, r)));
    });
    h += testa('Turno') + corpo;
  } else {
    righe.filter(passa).forEach((r) => (corpo += riga('<b>' + escP(r.nome) + '</b>', r.nome, r)));
    h += testa('Collaboratore') + corpo;
  }
  if (!corpo) h += '<tr><td colspan="5" class="pcfc-vuoto">Nessuna riga con questo filtro.</td></tr>';
  h += '</tbody></table></div></div></div>';
  box2.innerHTML = h;
}
