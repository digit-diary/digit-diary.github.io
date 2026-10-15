/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: assenze.js
 *
 * ASS = ASSENZA IN ATTESA DI CERTIFICATO (decisione del titolare 15/10/2026).
 * Chi chiama per malattia e registrato come «Assenza» (Diario, Rapporto): nel Piano ASS solo
 * nei giorni con un turno, 0 ore, il turno resta da coprire (sincronizzaMalattiaPiano con
 * codice ASS, in piano-core.js). Qui:
 *  - CERTIFICATO RICEVUTO (solo Storico HR · modificare o amministratore, come nel database,
 *    migrazione 20260921): con le date del certificato la malattia si applica come oggi a
 *    tutto il periodo (ASS e turni -> M, giorni liberi -> M sopra la C, 0 ore, i CGF e i
 *    festivi come sempre) in UNA scrittura del Piano; le registrazioni Assenza del periodo
 *    diventano Malattia «con certificato» (anche nel Rapporto), le parti fuori dal periodo
 *    restano Assenza; voce nello Storico HR e nel registro. Annulla (generale) rimette
 *    registrazioni, Rapporto e Storico HR, e il Piano si riallinea da solo (M -> ASS).
 *  - ASS DA REGOLARIZZARE: le ASS del mese piu vecchie di X giorni (regola
 *    ass_giorni_regolarizzare, predefinita 3) negli Avvisi, per chi ha il permesso HR.
 */

function puoRegistrareCertificato() {
  return typeof puoModificareStoricoHr === 'function' && puoModificareStoricoHr();
}
function _assGg(d) {
  return String(d).substring(8, 10) + '.' + String(d).substring(5, 7);
}
function _assDataIt(d) {
  return String(d).split('-').reverse().join('/');
}
function _assGiorni(dal, al) {
  const out = [];
  const d = new Date(dal + 'T12:00:00');
  for (let n = 0; n < 400 && dataLocaleISO(d) <= al; n++, d.setDate(d.getDate() + 1)) out.push(dataLocaleISO(d));
  return out;
}
function _assSposta(d, n) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return dataLocaleISO(x);
}
// giorni di fila: [[dal, al], ...]
function _assSegmenti(giorni) {
  const gg = [...new Set(giorni)].sort();
  const out = [];
  gg.forEach((d) => {
    const ult = out[out.length - 1];
    if (ult && _assSposta(ult[1], 1) === d) ult[1] = d;
    else out.push([d, d]);
  });
  return out;
}
// regola degli avvisi: dopo quanti giorni un ASS e da regolarizzare
function _assGiorniRegolarizzare() {
  const v = typeof _pianoRegolaVal === 'function' ? _pianoRegolaVal('ass_giorni_regolarizzare') : null;
  const n = parseInt(v);
  return isNaN(n) || n < 0 ? 3 : n;
}
// registrazioni «Assenza» di una persona (non nel cestino)
function _assRegistrazioniDi(nome) {
  const tipo = _pianoTipoAssenza();
  return (typeof datiCache !== 'undefined' ? datiCache : []).filter(
    (e) => !e.eliminato && e.tipo === tipo && String(e.nome || '').toLowerCase() === String(nome).toLowerCase(),
  );
}
// le celle ASS di una persona (dal piano, tutti i settori), facoltativo fra due date
async function _assCelleDi(nome, da, a) {
  return (
    (await secGet(
      'piano?collaboratore=eq.' +
        encodeURIComponent(nome) +
        '&codice=eq.ASS' +
        (da ? '&data=gte.' + da : '') +
        (a ? '&data=lte.' + a : '') +
        '&order=data.asc&limit=400',
    )) || []
  );
}
// una registrazione Diario «un giorno per riga» (periodo come etichetta finale "(dal .. al ..)")
function _assRigaPerGiorno(e) {
  return /\(dal \d{1,2}[./]\d{1,2}[./]\d{4} al \d{1,2}[./]\d{1,2}[./]\d{4}\)\s*$/.test(String(e.testo || ''));
}
// i giorni che la registrazione «possiede»: il suo giorno (riga per giorno) o il periodo
function _assGiorniPropri(e) {
  const tutti = _pianoDateMalattia(e.testo || '', e.data);
  if (_assRigaPerGiorno(e)) {
    const g = typeof giornoDi === 'function' ? giornoDi(e.data) : String(e.data).substring(0, 10);
    return tutti.includes(g) ? [g] : [g];
  }
  return tutti;
}
// testo della registrazione senza il periodo e senza "(N giorni ...)"
function _assTestoBase(t) {
  return _assNgTogli(t)
    .replace(/\s*\(?dal\s+\d{1,2}[./]\d{1,2}[./]\d{4}\s+al\s+\d{1,2}[./]\d{1,2}[./]\d{4}\)?/gi, '')
    .replace(/\s*\(\d+\s*giorn[oi][^)]*\)/gi, '')
    .replace(/\s*·\s*certificato medico.*$/i, '')
    .trim();
}
function _assPeriodoTesto(a, b) {
  const n = _assGiorni(a, b).length;
  return n > 1
    ? 'dal ' + _assDataIt(a) + ' al ' + _assDataIt(b) + ' (' + n + ' giorni)'
    : 'il ' + _assDataIt(a) + ' (1 giorno)';
}

// ================= ASSENZA NON GIUSTIFICATA (Certificato non ricevuto) =================
// Il collaboratore non porta il certificato: l ASS resta ASS a 0 ore, senza conteggi, ma e
// NON GIUSTIFICATA. Dove si vede:
//  - registrazione Assenza: il testo comincia con «Assenza non giustificata (certificato non
//    ricevuto) · »; se solo alcuni giorni della registrazione lo sono, sono scritti
//    «(certificato non ricevuto: 06.01, 07.01)». Tipo e date non cambiano (Piano, Rapporto,
//    Annulla e cestino continuano a leggerla come un Assenza);
//  - cella ASS del piano: la nota finisce con « · non giustificata»;
//  - Rapporto: «Rossi assente non giustificato dal ...».
// La registrazione e la parte che conta: le note delle celle si riallineano a lei
// (_assAllineaNote), anche dopo Annulla e Ripristina.
const _ASS_NG_NOTA = ' · non giustificata';
const _ASS_NG_RE = /^Assenza non giustificata \(certificato non ricevuto(?::\s*([0-9.,\s]+))?\)\s*·\s*/;
function _assNgNota(c) {
  return /·\s*non giustificata\s*$/i.test(String(c || ''));
}
// cella ASS con la nota «non giustificata»
function _assNgCella(r) {
  return !!r && r.codice === 'ASS' && _assNgNota(r.commento);
}
// nota della cella con (si) o senza la parte «non giustificata»
function _assNgCommento(c, si) {
  const base = String(c || '')
    .replace(/\s*·\s*non giustificata\s*$/i, '')
    .trim();
  if (!si) return base || null;
  return (base ? base.substring(0, 370) : 'Assenza') + _ASS_NG_NOTA;
}
// testo della registrazione senza il contrassegno
function _assNgTogli(t) {
  return String(t || '').replace(_ASS_NG_RE, '');
}
// i giorni non giustificati di una registrazione Assenza
function _assNgGiorniReg(e) {
  if (!e || e.eliminato || e.tipo !== _pianoTipoAssenza()) return [];
  const m = _ASS_NG_RE.exec(String(e.testo || ''));
  if (!m) return [];
  const propri = _assGiorniPropri(e);
  if (!m[1]) return propri;
  const gg = m[1].split(/[,\s]+/).filter(Boolean);
  return propri.filter((d) => gg.includes(_assGg(d)));
}
// testo con il contrassegno dei giorni marcati (nessuno: senza contrassegno)
function _assNgTestoReg(testo, marcati, propri) {
  const base = _assNgTogli(testo);
  const mm = propri.filter((d) => marcati.includes(d));
  if (!mm.length) return base;
  return (
    'Assenza non giustificata (certificato non ricevuto' +
    (mm.length === propri.length ? '' : ': ' + mm.map(_assGg).join(', ')) +
    ') · ' +
    base
  );
}
// giorni non giustificati di una lista di registrazioni (scheda, statistiche)
function assNonGiustificateGiorni(entries) {
  const set = new Set();
  (entries || []).forEach((e) => _assNgGiorniReg(e).forEach((d) => set.add((e.nome || '') + '|' + d)));
  return set.size;
}
// LE NOTE DELLE CELLE ALLINEATE ALLE REGISTRAZIONI: nei giorni dati, una cella ASS di un
// giorno non giustificato ha la nota « · non giustificata», tutte le altre no (anche la M
// del certificato arrivato dopo). forzaSi: giorni non giustificati senza registrazione (ASS
// scritte solo nel piano). Una scrittura sola, condizionata (cella ancora come letta).
async function _assAllineaNote(nome, giorni, forzaSi) {
  const gg = [...new Set(giorni || [])].sort();
  if (!gg.length) return { cambiate: 0 };
  const celle =
    (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=in.(' + gg.join(',') + ')')) || [];
  const marcati = new Set(forzaSi || []);
  _assRegistrazioniDi(nome).forEach((e) => _assNgGiorniReg(e).forEach((d) => marcati.add(d)));
  const op = getOperatore();
  const ora = new Date().toISOString();
  const ops = [];
  celle.forEach((r) => {
    const d = String(r.data).substring(0, 10);
    const vuole = r.codice === 'ASS' && marcati.has(d);
    if (vuole === _assNgNota(r.commento)) return;
    ops.push({
      collaboratore: r.collaboratore,
      data: d,
      atteso: _pianoAttesoDi(r),
      dati: { commento: _assNgCommento(r.commento, vuole), operatore: op, updated_at: ora },
    });
  });
  if (!ops.length) return { cambiate: 0 };
  if (typeof _pianoFuoriDalPasso === 'function') _pianoFuoriDalPasso();
  const es = await _pianoScriviCelle(ops);
  if (!es.ok) throw _pianoErroreConflitto(es.conflitti);
  if (typeof _pianoRighe !== 'undefined') _pianoMemoriaDopo(es.ops, es.righe);
  return { cambiate: ops.length };
}

// finestra: periodo proposto = le ASS di fila attorno al giorno indicato, ancora da regolarizzare
async function apriCertificatoNonRicevuto(nome, dataVicina) {
  if (!puoRegistrareCertificato()) {
    await mostraAvviso(
      'L assenza non giustificata la registra chi ha il permesso Storico HR · modificare (o l amministratore).',
      { titolo: 'Certificato non ricevuto' },
    );
    return;
  }
  let celle = [];
  try {
    celle = await _assCelleDi(nome);
  } catch (e) {
    toastErrore('Piano non letto: ' + ((e && e.message) || e));
    return;
  }
  const giorniAss = celle.map((r) => String(r.data).substring(0, 10));
  _assRegistrazioniDi(nome).forEach((e) => _assGiorniPropri(e).forEach((d) => giorniAss.push(d)));
  const seg = _assSegmenti(giorniAss);
  let prop = seg.find((s) => dataVicina && s[0] <= dataVicina && dataVicina <= s[1]) || seg[seg.length - 1] || null;
  if (!prop) prop = [dataVicina || oggiLocale(), dataVicina || oggiLocale()];
  const elenco = celle.length
    ? celle
        .map(
          (r) =>
            _assGg(r.data) +
            ' (' +
            escP(_pianoSiglaSottoMalattia(r) || 'ASS') +
            (_assNgCella(r) ? ', già non giustificata' : '') +
            ')',
        )
        .join(', ')
    : 'nessuna nel piano';
  window._certNoCtx = { nome: nome };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Certificato non ricevuto · ' +
    escP(nome) +
    '</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px;text-align:left">Assenze in attesa di certificato (ASS): ' +
    elenco +
    '.<br>Nei giorni scelti l assenza diventa <b>non giustificata</b>: la sigla resta <b>ASS</b> a 0 ore, senza conteggi; Diario e Rapporto lo scrivono, la cella lo mostra e i giorni escono dagli avvisi «ASS da regolarizzare». Se il certificato arriva dopo, «Certificato ricevuto» li trasforma in malattia. Nessun provvedimento automatico. Annulla rimette tutto.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><div class="field" style="text-align:left"><label>Non giustificata dal</label><input type="date" id="certno-dal" value="' +
    prop[0] +
    '" style="padding:8px"></div><div class="field" style="text-align:left"><label>al</label><input type="date" id="certno-al" value="' +
    prop[1] +
    '" style="padding:8px"></div></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Nota (facoltativa)</label><input type="text" id="certno-nota" maxlength="200" placeholder="es. sollecitato il 20.01, nessuna risposta" style="width:100%;padding:8px"></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" onclick="confermaCertificatoNonRicevuto()">Registra: non giustificata</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
function confermaCertificatoNonRicevuto() {
  const c = window._certNoCtx || {};
  const dal = ((document.getElementById('certno-dal') || {}).value || '').trim();
  const al = ((document.getElementById('certno-al') || {}).value || '').trim();
  const nota = ((document.getElementById('certno-nota') || {}).value || '').trim();
  if (!c.nome || !/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || dal > al) {
    toastErrore('Date non valide (dal ≤ al)');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  return unaVoltaSola('certificato-no|' + c.nome, () => registraCertificatoNonRicevuto(c.nome, dal, al, nota));
}
// CERTIFICATO NON RICEVUTO: registrazioni (Diario), Rapporto, note delle celle, Storico HR e
// registro come UN passo dell Annulla generale (le note delle celle seguono le registrazioni)
async function registraCertificatoNonRicevuto(nome, dal, al, nota) {
  if (!puoRegistrareCertificato()) {
    toastErrore('Permesso mancante: Storico HR · modificare');
    return null;
  }
  const P = _assGiorni(dal, al);
  if (!P.length || P.length > 366) {
    toastErrore('Periodo non valido');
    return null;
  }
  const Pset = new Set(P);
  let celle = [];
  try {
    celle = await _assCelleDi(nome, dal, al);
  } catch (e) {
    toastErrore('NON registrato: piano non letto (' + ((e && e.message) || e) + ')', 9000);
    return null;
  }
  const giorniCelle = celle.map((r) => String(r.data).substring(0, 10));
  const regs = _assRegistrazioniDi(nome).map((e) => ({ e: e, propri: _assGiorniPropri(e) }));
  // i giorni: quelli dell assenza (registrazioni Assenza o celle ASS) dentro il periodo
  const giorni = [...new Set(giorniCelle.concat(...regs.map((x) => x.propri.filter((d) => Pset.has(d)))))].sort();
  if (!giorni.length) {
    await mostraAvviso(
      nome +
        ': nel periodo ' +
        _assPeriodoTesto(dal, al) +
        ' non ci sono assenze in attesa di certificato (ASS). Niente è stato registrato.',
      { titolo: 'Certificato non ricevuto' },
    );
    return null;
  }
  const op = getOperatore();
  const oggiIt = new Date().toLocaleDateString('it-IT');
  const errori = [];
  // 1) DIARIO: il contrassegno sulle registrazioni dei giorni scelti (tipo e date restano)
  const toccate = [];
  for (const x of regs) {
    const giaNg = _assNgGiorniReg(x.e);
    const marcati = [...new Set(giaNg.concat(x.propri.filter((d) => Pset.has(d))))];
    const testo = _assNgTestoReg(x.e.testo, marcati, x.propri).substring(0, 2000);
    if (testo === x.e.testo) continue;
    const dati = { testo: testo, modificato_da: op + ' il ' + oggiIt + ' (certificato non ricevuto)' };
    try {
      await secPatch('registrazioni', 'id=eq.' + x.e.id, dati);
      Object.assign(x.e, dati);
      toccate.push(x.e);
    } catch (e) {
      errori.push(_assGg(String(x.e.data).substring(0, 10)) + ': ' + ((e && e.message) || e));
    }
  }
  // 2) RAPPORTO: «Rossi assente non giustificato dal ...»
  const rapporti = [];
  for (const e of toccate) {
    if (typeof _rapportoOrigineDi !== 'function' || !_rapportoOrigineDi(e)) continue;
    try {
      const o = await _rapportoCorreggiRegistrazione(e, e.nome, { senzaRegistro: true });
      if (o) rapporti.push(o.turno + ' del ' + o.ds.split('-').reverse().join('.'));
    } catch (er) {
      errori.push('Rapporto: ' + ((er && er.message) || er));
    }
  }
  // 3) PIANO: la nota delle celle ASS (anche quelle senza registrazione nel Diario)
  const senzaReg = giorniCelle.filter((d) => !regs.some((x) => x.propri.includes(d)));
  try {
    await _assAllineaNote(nome, giorni, senzaReg);
  } catch (e) {
    errori.push('piano: ' + ((e && e.message) || e));
  }
  // 4) STORICO HR e registro (chiude il passo dell Annulla)
  const desc =
    'Certificato non ricevuto ' +
    _assPeriodoTesto(dal, al) +
    ', registrato il ' +
    oggiIt +
    ': assenza non giustificata ' +
    giorni.map(_assGg).join(', ') +
    ' (ASS, 0 ore)' +
    (nota ? ' · ' + nota : '');
  if (typeof _insertHrEvento === 'function') {
    const hrIns = () => _insertHrEvento(nome, 'assenza_ng', desc, oggiLocale());
    await (window.Annulla ? window.Annulla.senzaTraccia(hrIns) : hrIns());
  }
  logAzione('Certificato non ricevuto', nome + ' · ' + desc);
  if (typeof render === 'function') render();
  if (typeof updateStats === 'function') updateStats();
  if (errori.length)
    toastErrore('Registrato, ma non tutto: ' + errori.join('; ') + '. Controlla Diario, Rapporto e piano.', 12000);
  else
    toast(
      nome +
        ': assenza non giustificata ' +
        giorni.map(_assGg).join(', ') +
        (rapporti.length ? ' · Rapporto ' + [...new Set(rapporti)].join(', ') : ''),
      7000,
    );
  if (
    typeof _pianoRighe !== 'undefined' &&
    typeof renderPiano === 'function' &&
    localStorage.getItem('pagina_corrente') === 'piano'
  )
    renderPiano();
  return { giorni: giorni, registrazioni: toccate.length, errori: errori };
}

// ================= CERTIFICATO RICEVUTO =================
// finestra: date del certificato (proposte: le ASS di fila attorno al giorno indicato)
async function apriCertificatoRicevuto(nome, dataVicina) {
  if (!puoRegistrareCertificato()) {
    await mostraAvviso('Il certificato lo registra chi ha il permesso Storico HR · modificare (o l amministratore).', {
      titolo: 'Certificato ricevuto',
    });
    return;
  }
  let celle = [];
  try {
    celle = await _assCelleDi(nome);
  } catch (e) {
    toastErrore('Piano non letto: ' + ((e && e.message) || e));
    return;
  }
  const giorniAss = celle.map((r) => String(r.data).substring(0, 10));
  _assRegistrazioniDi(nome).forEach((e) => _pianoDateMalattia(e.testo || '', e.data).forEach((d) => giorniAss.push(d)));
  const seg = _assSegmenti(giorniAss);
  let prop = seg.find((s) => dataVicina && s[0] <= dataVicina && dataVicina <= s[1]) || seg[seg.length - 1] || null;
  if (!prop) prop = [dataVicina || oggiLocale(), dataVicina || oggiLocale()];
  const elenco = celle.length
    ? celle.map((r) => _assGg(r.data) + ' (' + escP(_pianoSiglaSottoMalattia(r) || 'ASS') + ')').join(', ')
    : 'nessuna nel piano';
  window._certCtx = { nome: nome };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Certificato ricevuto · ' +
    escP(nome) +
    '</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px;text-align:left">Assenze in attesa di certificato (ASS): ' +
    elenco +
    '.<br>Con le date del certificato la malattia vale per tutto il periodo, come una malattia registrata oggi: le ASS e i turni diventano <b>M</b>, i giorni liberi <b>M sopra la C</b> (0 ore). Le ASS fuori dal periodo restano ASS e vengono segnalate. Annulla rimette tutto.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><div class="field" style="text-align:left"><label>Certificato dal</label><input type="date" id="cert-dal" value="' +
    prop[0] +
    '" style="padding:8px"></div><div class="field" style="text-align:left"><label>al</label><input type="date" id="cert-al" value="' +
    prop[1] +
    '" style="padding:8px"></div></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Nota (facoltativa)</label><input type="text" id="cert-nota" maxlength="200" placeholder="es. certificato del dott. ..." style="width:100%;padding:8px"></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" onclick="confermaCertificatoRicevuto()">Registra il certificato</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
function confermaCertificatoRicevuto() {
  const c = window._certCtx || {};
  const dal = ((document.getElementById('cert-dal') || {}).value || '').trim();
  const al = ((document.getElementById('cert-al') || {}).value || '').trim();
  const nota = ((document.getElementById('cert-nota') || {}).value || '').trim();
  if (!c.nome || !/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || dal > al) {
    toastErrore('Date del certificato non valide (dal ≤ al)');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  return unaVoltaSola('certificato|' + c.nome, () => registraCertificatoRicevuto(c.nome, dal, al, nota));
}
// IL CERTIFICATO: Piano (una scrittura), poi Diario, Rapporto, Storico HR e registro come
// UN passo dell Annulla generale (le scritture del Piano seguono le registrazioni)
async function registraCertificatoRicevuto(nome, dal, al, nota) {
  if (!puoRegistrareCertificato()) {
    toastErrore('Permesso mancante: Storico HR · modificare');
    return null;
  }
  const C = _assGiorni(dal, al);
  if (!C.length || C.length > 366) {
    toastErrore('Periodo del certificato non valido');
    return null;
  }
  const Cset = new Set(C);
  const tipoMal = nomeCorrente('Malattia');
  const tipoAss = _pianoTipoAssenza();
  const op = getOperatore();
  const oggiIt = new Date().toLocaleDateString('it-IT');
  // giorni NON GIUSTIFICATI prima del certificato (arrivato dopo «Certificato non ricevuto»):
  // diventano malattia come gli altri, lo Storico HR lo dice; fuori dal periodo restano tali
  const ngPrima = new Set();
  _assRegistrazioniDi(nome).forEach((e) => _assNgGiorniReg(e).forEach((d) => ngPrima.add(d)));
  try {
    (await _assCelleDi(nome, dal, al)).filter(_assNgCella).forEach((r) => ngPrima.add(String(r.data).substring(0, 10)));
  } catch (e) {
    /* lettura non riuscita: valgono le registrazioni */
  }
  const ngNelCert = [...ngPrima].filter((d) => Cset.has(d)).sort();
  // 1) PIANO: la malattia di tutto il periodo, come oggi (ASS -> M con il turno sotto,
  //    turni -> M, C -> M "Ex C" a 0 ore, CGF e festivi come sempre), in una scrittura
  let sync = null;
  try {
    sync = await sincronizzaMalattiaPiano(
      nome,
      '',
      dal + 'T08:00:00.000Z',
      'dal ' + _assDataIt(dal) + ' al ' + _assDataIt(al),
    );
  } catch (e) {
    toastErrore('Certificato NON registrato: il piano non si è aggiornato (' + ((e && e.message) || e) + ')', 10000);
    return null;
  }
  // 2) DIARIO: le registrazioni Assenza del periodo diventano Malattia «con certificato»
  //    (ogni giorno del certificato in una sola registrazione); le parti fuori restano Assenza
  const regs = _assRegistrazioniDi(nome).map((e) => ({ e: e, tutti: _pianoDateMalattia(e.testo || '', e.data) }));
  regs.forEach((x) => (x.propri = _assGiorniPropri(x.e)));
  const conv = regs
    .filter((x) => x.propri.some((d) => Cset.has(d)))
    .map((x) => Object.assign(x, { primo: x.propri.filter((d) => Cset.has(d)).sort()[0] }))
    .sort((a, b) => (a.primo < b.primo ? -1 : a.primo > b.primo ? 1 : String(a.e.id).localeCompare(String(b.e.id))));
  // giorni del certificato divisi fra le registrazioni: la prima dal primo giorno, ogni altra
  // dal suo primo giorno fino al giorno prima della successiva (nessun giorno contato due volte)
  conv.forEach((x, i) => {
    const da = i === 0 ? dal : x.primo;
    const prossimo = conv.slice(i + 1).find((y) => y.primo > da);
    const a = prossimo ? _assSposta(prossimo.primo, -1) : al;
    x.parte = i > 0 && x.primo === conv[i - 1].primo ? null : [da, a];
  });
  const fuori = []; // giorni di assenza fuori dal certificato: restano Assenza
  const patch = []; // { e, dati }
  const nuove = []; // registrazioni Assenza nuove per le parti fuori
  const tienePropri = new Set();
  regs.forEach((x) => {
    if (conv.includes(x)) return;
    // riga per giorno fuori dal certificato: resta Assenza, il periodo si accorcia alla sua parte
    if (_assRigaPerGiorno(x.e) && x.tutti.some((d) => Cset.has(d))) {
      const g = x.propri[0];
      const resto = _assSegmenti(x.tutti.filter((d) => !Cset.has(d))).find((s) => s[0] <= g && g <= s[1]) || [g, g];
      const t = String(x.e.testo || '').replace(
        /\(dal \d{1,2}[./]\d{1,2}[./]\d{4} al \d{1,2}[./]\d{1,2}[./]\d{4}\)\s*$/,
        '(dal ' + _assDataIt(resto[0]) + ' al ' + _assDataIt(resto[1]) + ')',
      );
      if (t !== x.e.testo) patch.push({ e: x.e, dati: { testo: t } });
    }
    x.propri.forEach((d) => tienePropri.add(d));
  });
  conv.forEach((x) => {
    x.propri.filter((d) => !Cset.has(d)).forEach((d) => fuori.push(d));
    const rap = typeof _rapportoOrigineDi === 'function' ? _rapportoOrigineDi(x.e) : null;
    let testo;
    if (!x.parte) {
      // stessa data di un altra registrazione (doppione): resta per la storia, 0 giorni
      testo =
        _assTestoBase(x.e.testo) +
        ' · certificato medico il ' +
        _assDataIt(x.primo) +
        ' (0 giorni: già nella registrazione del certificato)';
    } else if (rap) {
      // nata dal Rapporto: lo stesso testo che il Rapporto scrive per «malato con certificato»
      const lab = (String(x.e.testo || '').match(/da rapporto (?:PRESTO|NOTTE) del \d{1,2}\/\d{1,2}\/\d{4}/) || [
        '',
      ])[0];
      const n = _assGiorni(x.parte[0], x.parte[1]).length;
      const dsIt = _assDataIt(rap.ds);
      testo =
        'Assente per malattia con certificato' +
        (n > 1
          ? ' dal ' + _assDataIt(x.parte[0]) + ' al ' + _assDataIt(x.parte[1]) + ' (' + n + ' giorni, ' + lab + ')'
          : (_assDataIt(x.parte[0]) !== dsIt ? ' dal ' + _assDataIt(x.parte[0]) : '') + ' (' + lab + ')');
    } else {
      testo =
        (_assTestoBase(x.e.testo) || 'Assenza') + ' · certificato medico ' + _assPeriodoTesto(x.parte[0], x.parte[1]);
    }
    patch.push({
      e: x.e,
      dati: {
        tipo: tipoMal,
        testo: testo.substring(0, 2000),
        modificato_da: op + ' il ' + oggiIt + ' (certificato ricevuto)',
      },
      rap: !!rap && !!x.parte,
    });
  });
  // parti fuori dal certificato che nessuna registrazione tiene piu: Assenza nuova
  // (i giorni gia non giustificati lo restano)
  _assSegmenti(fuori.filter((d) => !tienePropri.has(d) && !Cset.has(d))).forEach((s) =>
    nuove.push({
      id: Date.now() + nuove.length,
      nome: nome,
      tipo: tipoAss,
      testo: _assNgTestoReg(
        'Assente (attesa certificato) dal ' +
          _assDataIt(s[0]) +
          ' al ' +
          _assDataIt(s[1]) +
          ' (fuori dal certificato del ' +
          _assGg(dal) +
          '-' +
          _assGg(al) +
          ')',
        _assGiorni(s[0], s[1]).filter((d) => ngPrima.has(d)),
        _assGiorni(s[0], s[1]),
      ),
      data: s[0] + 'T08:00:00.000Z',
      operatore: op,
      reparto_dip: (_pianoCollabInfo(nome) || {}).reparto_dip || currentReparto,
    }),
  );
  // senza nessuna registrazione nel periodo (ASS scritte nel piano senza Diario): la
  // malattia si registra ora, una riga per il certificato
  if (!conv.some((x) => x.parte))
    nuove.push({
      id: Date.now() + 500,
      nome: nome,
      tipo: tipoMal,
      testo: 'Certificato medico ' + _assPeriodoTesto(dal, al) + (nota ? ' · ' + nota : ''),
      data: dal + 'T08:00:00.000Z',
      operatore: op,
      reparto_dip: (_pianoCollabInfo(nome) || {}).reparto_dip || currentReparto,
    });
  const errori = [];
  for (const x of patch) {
    try {
      await secPatch('registrazioni', 'id=eq.' + x.e.id, x.dati);
      Object.assign(x.e, x.dati);
    } catch (e) {
      errori.push(_assGg(String(x.e.data).substring(0, 10)) + ': ' + ((e && e.message) || e));
    }
  }
  for (const rec of nuove) {
    try {
      const r = await secPost('registrazioni', rec);
      datiCache.unshift((r && r[0]) || rec);
    } catch (e) {
      errori.push('nuova registrazione: ' + ((e && e.message) || e));
    }
  }
  // 3) RAPPORTO: la voce diventa «malato con certificato dal ... al ...»
  const rapporti = [];
  for (const x of patch.filter((p) => p.rap)) {
    try {
      const o = await _rapportoCorreggiRegistrazione(x.e, x.e.nome, { senzaRegistro: true });
      if (o) rapporti.push(o.turno + ' del ' + o.ds.split('-').reverse().join('.'));
    } catch (e) {
      errori.push('Rapporto: ' + ((e && e.message) || e));
    }
  }
  // 3b) NOTE DELLE CELLE: la M del certificato non porta piu «non giustificata»; le ASS
  //     non giustificate fuori dal periodo la tengono
  try {
    await _assAllineaNote(nome, C.concat(fuori));
  } catch (e) {
    errori.push('note del piano: ' + ((e && e.message) || e));
  }
  // 4) ASS fuori dal periodo (restano da regolarizzare): nello Storico HR e in un avviso
  let resto = [];
  try {
    resto = (await _assCelleDi(nome, _assSposta(dal, -62), _assSposta(al, 62)))
      .map((r) => String(r.data).substring(0, 10))
      .filter((d) => !Cset.has(d));
  } catch (e) {
    /* lettura non riuscita: la segnalazione resta negli Avvisi */
  }
  // 5) STORICO HR e registro (chiude il passo dell Annulla)
  const nConv = conv.filter((x) => x.parte).length;
  const desc =
    'Certificato medico ' +
    _assPeriodoTesto(dal, al) +
    ' ricevuto il ' +
    oggiIt +
    ': ' +
    ((sync && sync.messe) || 0) +
    ' giorni del piano in malattia (M)' +
    (ngNelCert.length
      ? '; erano assenze non giustificate (certificato arrivato dopo): ' + ngNelCert.map(_assGg).join(', ')
      : '') +
    (resto.length ? '; fuori dal certificato restano ASS: ' + resto.map(_assGg).join(', ') : '') +
    (nota ? ' · ' + nota : '');
  // lo Storico HR e un registro (le righe le cancella solo l amministratore): la riga resta
  // fuori dall Annulla, che ne aggiunge una «Annullato» (annulla.js, _annullaRicarica)
  if (typeof _insertHrEvento === 'function') {
    const hrIns = () => _insertHrEvento(nome, 'certificato', desc, oggiLocale());
    await (window.Annulla ? window.Annulla.senzaTraccia(hrIns) : hrIns());
  }
  logAzione('Certificato ricevuto', nome + ' · ' + desc);
  if (typeof render === 'function') render();
  if (typeof updateStats === 'function') updateStats();
  if (errori.length)
    toastErrore('Certificato registrato, ma non tutto: ' + errori.join('; ') + '. Controlla Diario e Rapporto.', 12000);
  else
    toast(
      nome +
        ': certificato ' +
        _assGg(dal) +
        '-' +
        _assGg(al) +
        ' registrato · ' +
        nConv +
        (nConv === 1 ? ' registrazione' : ' registrazioni') +
        ' ora Malattia' +
        (rapporti.length ? ' · Rapporto ' + [...new Set(rapporti)].join(', ') : ''),
      7000,
    );
  if (resto.length)
    await mostraAvviso(
      nome +
        ': restano assenze in attesa di certificato (ASS) fuori dal periodo del certificato: ' +
        resto.map(_assGg).join(', ') +
        '.\n\nRestano ASS (0 ore) finché arriva il loro certificato.',
      { titolo: 'ASS fuori dal certificato' },
    );
  if (
    typeof _pianoRighe !== 'undefined' &&
    typeof renderPiano === 'function' &&
    localStorage.getItem('pagina_corrente') === 'piano'
  )
    renderPiano();
  return { sync: sync, convertite: nConv, nuove: nuove.length, fuori: resto, errori: errori };
}

// ================= ASS DA REGOLARIZZARE (Avvisi del mese) =================
// le ASS del mese aperto piu vecchie di X giorni (oggi compreso), per persona
// DA QUANDO: regola ass_regolarizzare_dal, scritta dalla migrazione 20260921 con il giorno in
// cui e applicata (il rilascio). Le ASS dei giorni prima (Excel, «Assenza generica») restano
// a 0 ore ma non sono da regolarizzare. Senza la regola (database senza la migrazione): niente.
function _assRegolarizzareDal() {
  const v = typeof _pianoRegolaVal === 'function' ? _pianoRegolaVal('ass_regolarizzare_dal') : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null;
}
function _pianoAssDaRegolarizzare() {
  if (!puoRegistrareCertificato()) return [];
  const dal = _assRegolarizzareDal();
  if (!dal) return [];
  const righe = typeof _pianoRighe !== 'undefined' ? _pianoRighe : [];
  const limite = _assSposta(oggiLocale(), -_assGiorniRegolarizzare());
  const per = {};
  righe
    .filter(
      (r) =>
        r.codice === 'ASS' &&
        !_assNgCella(r) && // non giustificata: regolarizzata (Certificato non ricevuto)
        String(r.data).substring(0, 10) <= limite &&
        String(r.data).substring(0, 10) >= dal,
    )
    .forEach((r) => (per[r.collaboratore] = per[r.collaboratore] || []).push(String(r.data).substring(0, 10)));
  return Object.keys(per)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => {
      const gg = per[n].sort();
      return {
        nome: n,
        giorni: gg,
        dal: gg[0],
        trascorsi: Math.round((new Date(oggiLocale() + 'T12:00:00') - new Date(gg[0] + 'T12:00:00')) / 86400000),
      };
    });
}
function _pianoAssDaRegolarizzareN(lista) {
  return (lista || []).reduce((s, x) => s + x.giorni.length, 0);
}
