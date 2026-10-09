/**
 * GENERAZIONE AUTOMATICA DEL PIANO (v364)
 *
 * L amministratore sceglie in Piano > Impostazioni, per ogni settore, un giorno
 * del mese (1-28 o l ultimo). Da quel giorno in poi il primo PC con il programma
 * aperto genera la bozza del mese dopo:
 *   1. chiede al database di PRENOTARE settore e mese (piano_auto_prenota):
 *      il database controlla il giorno, che non sia gia fatta, che nessun altro
 *      PC la stia facendo e che le vacanze dell anno siano importate
 *      (se mancano: aspetta, avvisa una volta e riprova a ogni controllo);
 *   2. genera la bozza come "Genera bozza" (vacanze, C e WD attorno, CGF,
 *      compleanni, turni sul fabbisogno), senza domande;
 *   3. la migliora come "Migliora la bozza" per i minuti scelti, e applica solo
 *      se nessuna regola peggiora e i posti scoperti non aumentano;
 *   4. chiude la prenotazione (piano_auto_chiudi): il database salva il
 *      resoconto e lo manda come nota a chi ha il permesso "Genera bozza".
 * Controllo all avvio del programma e poi ogni 30 minuti: se il PC si accende
 * dopo il giorno scelto la generazione parte lo stesso.
 *
 * PERMESSI: non servono all operatore che ha il programma aperto. Il database,
 * solo mentre la sua sessione tiene la prenotazione, gli concede un lasciapassare
 * limitato al mese e al settore prenotati e alle sole celle scritte dal programma.
 * MAI TOCCATO: inserimenti a mano, vacanze protette, malattie, celle bloccate,
 * altri mesi. Se il mese ha gia una bozza (fatta a mano) la generazione si salta.
 * Mentre lavora, la pagina Piano di quel PC mostra un avviso; il resto del
 * programma si usa normalmente.
 */
const PIANO_AUTO_OGNI_MS = 30 * 60 * 1000;
let _pianoAutoTimer = null;
let _pianoAutoControllo = null;

// dopo il caricamento dei dati (loadAll): primo controllo fra 20 secondi, poi ogni mezz ora
function pianoAutoAvvia() {
  if (typeof getOpToken !== 'function' || !getOpToken()) return;
  clearInterval(_pianoAutoTimer);
  _pianoAutoTimer = setInterval(() => pianoAutoControlla(), PIANO_AUTO_OGNI_MS);
  clearTimeout(window._pianoAutoPrimo);
  window._pianoAutoPrimo = setTimeout(() => pianoAutoControlla(), 20000);
}

function _pianoAutoCfgDa(testo) {
  try {
    const v = JSON.parse(testo || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

async function pianoAutoControlla() {
  if (_pianoAutoControllo || window._pianoAutoInCorso) return _pianoAutoControllo;
  if (!getOpToken()) return null;
  _pianoAutoControllo = (async () => {
    let cfg;
    try {
      cfg = _pianoAutoCfgDa(await getImp('piano_auto_generazione'));
    } catch (e) {
      return;
    }
    const settori = (typeof getReparti === 'function' ? getReparti() : []).map((r) => r.key);
    for (const rep of Object.keys(cfg)) {
      if (!cfg[rep] || !cfg[rep].attivo || !settori.includes(rep)) continue;
      let r;
      try {
        r = await _rpcSicura('piano_auto_prenota', { p_token: getOpToken(), p_reparto: rep });
      } catch (e) {
        // database senza la migrazione 20260894 o rete assente: si riprova al prossimo giro
        console.warn('[piano-auto] prenotazione non riuscita', rep, e && e.message);
        continue;
      }
      if (r && r.esito === 'prenotata') await _pianoAutoEsegui(rep, r.mese, parseInt(r.minuti));
    }
  })().finally(() => {
    _pianoAutoControllo = null;
  });
  return _pianoAutoControllo;
}

function _pianoAutoMeseLabel(ym) {
  const p = String(ym).split('-');
  return ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(p[1]) - 1]) || ym) + ' ' + p[0];
}

// avviso al posto della griglia mentre la generazione lavora su questo PC
function _pianoAutoBanner() {
  const el = document.getElementById('piano-content');
  const a = window._pianoAutoInCorso;
  if (!el || !a) return;
  el.style.opacity = '';
  el.innerHTML =
    '<div class="main-card" style="margin-top:12px"><div class="card-header">Generazione automatica del piano in corso</div>' +
    '<div style="padding:14px;line-height:1.6">Su questo PC il programma sta generando il piano di <b>' +
    escP(_pianoAutoMeseLabel(a.ym)) +
    '</b> (' +
    escP(typeof repartoLabel === 'function' ? repartoLabel(a.rep) : a.rep) +
    '), come impostato in Piano &gt; Impostazioni.<br>' +
    'Ci vogliono pochi minuti. Il resto del programma si usa normalmente; il Piano torna appena finito.' +
    '<div id="pa-avanz" style="margin-top:8px;color:var(--muted)">' +
    escP(a.fase || 'Preparo i dati...') +
    '</div></div></div>';
}
function _pianoAutoFase(testo) {
  const a = window._pianoAutoInCorso;
  if (!a) return;
  a.fase = testo;
  const el = document.getElementById('pa-avanz');
  if (el) el.textContent = testo;
}

async function _pianoAutoEsegui(rep, ym, minuti) {
  // un ridisegno del piano gia partito finisce prima
  if (typeof _pianoRenderInCorso !== 'undefined' && _pianoRenderInCorso) {
    try {
      await _pianoRenderInCorso;
    } catch (e) {}
  }
  const prima = {
    mese: _pianoMeseSel,
    rep: _pianoRepartoSel,
    undo: (window._pianoUndo || []).length,
  };
  const auto = { rep: rep, ym: ym, inizio: Date.now(), fase: '' };
  window._pianoAutoInCorso = auto;
  _pianoAutoBanner();
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  const meseL = _pianoAutoMeseLabel(ym);
  const repL = typeof repartoLabel === 'function' ? repartoLabel(rep) : rep;
  const righe = [];
  let stato = 'fatta';
  const esito = { mese: ym, reparto: rep, operatore: getOperatore() };
  try {
    _pianoMeseSel = ym;
    _pianoRepartoSel = rep;
    _pianoViolCelle = {};
    _pianoViolLista = null;
    _pianoAutoFase('Preparo i dati del mese...');
    await _pianoCaricaCfg();
    await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
    _pianoRighe = await _pianoCaricaMeseSettore(da, a, rep);
    const delSettore = _pianoRighe.filter((r) => (r.reparto_dip || 'slots') === rep && _pianoIsLavoro(r.codice));
    const generate = delSettore.filter((r) => r.generato);
    const aMano = delSettore.filter((r) => !r.generato);
    esito.aMano = aMano.length;
    // UNA BOZZA C E GIA (piu di un turno generato al giorno in media): qualcuno
    // l ha fatta e magari gia corretta. Non si rifa: si avvisa e basta.
    if (generate.length > nGiorni) {
      stato = 'saltata';
      esito.motivo = 'bozza già presente';
      righe.push(
        'Il piano di ' +
          meseL +
          ' (' +
          repL +
          ') ha già una bozza (' +
          generate.length +
          ' turni generati): la generazione automatica non l ha toccata.',
      );
    } else {
      _pianoAutoFase('Genero la bozza: vacanze, congedi, CGF e turni sul fabbisogno...');
      await generaBozzaPiano(false);
      const b = auto.bozza || {};
      esito.bozza = b;
      if (b.saltata) {
        stato = 'saltata';
        esito.motivo = b.saltata;
        righe.push('Piano di ' + meseL + ' (' + repL + ') non generato: ' + b.saltata + ' (Piano > Fabbisogno).');
      } else {
        righe.push('Piano di ' + meseL + ' (' + repL + ') generato in automatico.');
        righe.push('• ' + (b.celle || 0) + ' celle scritte' + (b.cgf ? ', di cui ' + b.cgf + ' CGF' : ''));
        if (aMano.length) righe.push('• ' + aMano.length + ' turni già scritti a mano: lasciati come erano');
        // vacanze del file che cadono su una cella scritta a mano: non si tocca, si segnala
        const conflitti = auto.aManoNonToccate || [];
        if (conflitti.length) {
          esito.aManoNonToccate = conflitti.slice(0, 50);
          righe.push(
            '• Da controllare, celle scritte a mano lasciate come erano dove le vacanze vorrebbero altro: ' +
              conflitti
                .slice(0, 12)
                .map(
                  (x) =>
                    x.nome +
                    ' ' +
                    x.data.substring(8, 10) +
                    '.' +
                    x.data.substring(5, 7) +
                    ' (' +
                    x.attuale +
                    ', vacanze: ' +
                    x.voluto +
                    ')',
                )
                .join('; ') +
              (conflitti.length > 12 ? ' e altre ' + (conflitti.length - 12) : ''),
          );
        }
        // C prima delle vacanze che cadono nel mese prima, ancora vuoto: si mettono a mano
        if (auto.cMesePrima && auto.cMesePrima.length)
          righe.push(
            '• C prima delle vacanze da mettere nel mese precedente (la generazione automatica non lo tocca): ' +
              auto.cMesePrima
                .map((x) => x.nome + ' ' + x.data.substring(8, 10) + '.' + x.data.substring(5, 7))
                .join(', '),
          );
        // V scritte a mano o importate senza vacanza nel file: mai cancellate, da controllare
        if (auto.vSenzaFile && auto.vSenzaFile.length) {
          esito.vSenzaFile = auto.vSenzaFile.slice(0, 100);
          righe.push(
            '• Da controllare, V nel piano senza vacanza nel file (lasciate come sono):\n' +
              _vacElencoGiorni(auto.vSenzaFile),
          );
        }
        if (b.volute > b.celle)
          righe.push('• ' + (b.volute - b.celle) + ' celle non scritte perché in quei giorni c era già una cella');
        // MIGLIORA LA BOZZA per i minuti scelti
        if (minuti > 0 && (b.celle || 0) > 0) {
          const secondi = Math.min(10, minuti) * 60;
          const t0 = Date.now();
          const res = await pianoRicercaCalcola(secondi, (x) =>
            _pianoAutoFase(
              'Miglioro la bozza: ' +
                Math.round((Date.now() - t0) / 1000) +
                ' di ' +
                secondi +
                ' secondi · posti scoperti ora: ' +
                x.scoperti,
            ),
          );
          const P = res.prima;
          const D = res.dopo;
          const numeri = (x) => ({ legge: x.legge, regole: x.regole, scoperti: x.scoperti, oreSotto: x.oreSotto });
          esito.ricerca = { prima: numeri(P), dopo: numeri(D), cambi: res.cambi.length, applicata: false };
          if (res.migliore && res.cambi.length) {
            _pianoAutoFase('Scrivo i miglioramenti...');
            await _ricercaScrivi(res);
            esito.ricerca.applicata = true;
            // celle modificate a mano mentre il programma lavorava: rispettate
            if (res.saltate && res.saltate.length) {
              esito.ricerca.saltate = res.saltate.length;
              righe.push(
                '• ' +
                  res.saltate.length +
                  ' celle modificate a mano durante la generazione: lasciate come le ha scritte il collega (' +
                  res.saltate
                    .slice(0, 6)
                    .map((x) => x.nome + ' ' + String(x.data).substring(8, 10) + '.' + String(x.data).substring(5, 7))
                    .join(', ') +
                  (res.saltate.length > 6 ? '...' : '') +
                  ')',
              );
            }
            righe.push(
              '• Migliorata (' +
                Math.round(secondi / 60) +
                ' min, ' +
                res.cambi.length +
                ' celle): regole di legge ' +
                P.legge +
                ' → ' +
                D.legge +
                ', altre regole ' +
                (P.regole - P.legge) +
                ' → ' +
                (D.regole - D.legge) +
                ', posti scoperti ' +
                P.scoperti +
                ' → ' +
                D.scoperti,
            );
          } else
            righe.push(
              '• Nessun miglioramento sicuro trovato. Regole di legge violate: ' +
                P.legge +
                ', altre regole: ' +
                (P.regole - P.legge) +
                ', posti scoperti: ' +
                P.scoperti,
            );
          const fin = esito.ricerca.applicata ? D : P;
          if (fin.legge || fin.scoperti)
            righe.push('Da controllare in Piano > Calendario con "Valida regole" prima di usarlo.');
        } else if (b.scoperti) righe.push('• ' + b.scoperti + ' posti senza candidato idoneo');
        // COPERTURE DA ALTRI SETTORI e MIGLIORA ORE (richiesta del titolare 08/10/2026: la
        // generazione automatica fa la stessa sequenza che si fa a mano). Le coperture
        // solo quando il piano del settore di provenienza di chi copre c e gia (cosi non
        // si toglie nessuno al suo settore); generando quel settore si rifanno anche qui.
        await _pianoAutoCoperture(rep, ym, righe);
        for (const altro of _pianoAutoSettoriCheCopronoDa(rep))
          if (altro !== rep) await _pianoAutoCoperture(altro, ym, righe);
        _pianoMeseSel = ym;
        _pianoRepartoSel = rep;
        _pianoAutoFase('Bilancio le ore (Migliora ore)...');
        auto.miglioraOre = null;
        await miglioraOrePiano();
        const mo = auto.miglioraOre;
        if (mo && mo.scambi)
          righe.push(
            '• Migliora ore: ' +
              mo.scambi +
              ' turni spostati da chi e sopra a chi e sotto le ore (scarto medio ' +
              mo.prima +
              ' → ' +
              mo.dopo +
              ' ore)',
          );
        if (b.riposiDaSistemare && b.riposiDaSistemare.length)
          righe.push('• Riposo attorno alla domenica da sistemare a mano: ' + b.riposiDaSistemare.join(', '));
        righe.push('Si cancella con "Cancella piano" (solo le celle generate) se non va.');
      }
    }
  } catch (e) {
    console.error('[piano-auto]', e);
    stato = 'errore';
    esito.errore = String((e && e.message) || e);
    righe.push(
      'Generazione automatica del piano di ' +
        meseL +
        ' (' +
        repL +
        ') interrotta: ' +
        esito.errore +
        '. Si riprova da sola fra due ore (al massimo 5 volte); oppure "Riprova" in Piano > Impostazioni.',
    );
  } finally {
    // la fotografia per Annulla resta solo a chi la fa a mano
    if (window._pianoUndo && window._pianoUndo.length > prima.undo) window._pianoUndo.length = prima.undo;
    _pianoMeseSel = prima.mese;
    _pianoRepartoSel = prima.rep;
    _pianoViolCelle = {};
    _pianoViolLista = null;
    window._pianoAutoInCorso = null;
  }
  esito.messaggio = righe.join('\n');
  esito.secondi = Math.round((Date.now() - auto.inizio) / 1000);
  try {
    await _rpcSicura('piano_auto_chiudi', {
      p_token: getOpToken(),
      p_reparto: rep,
      p_mese: ym,
      p_stato: stato,
      p_esito: esito,
    });
  } catch (e) {
    // la prenotazione scade da sola dopo 30 minuti
    console.warn('[piano-auto] chiusura non riuscita', e && e.message);
  }
  logAzione('Piano: generazione automatica', ym + ' ' + rep + ' · ' + stato + ' · ' + esito.secondi + 's');
  try {
    if ((localStorage.getItem('pagina_corrente') || '') === 'piano') renderPiano();
  } catch (e) {}
  return { stato: stato, esito: esito };
}

// settori che possono prendere persone da rep (chi ha rep come settore e l altro fra i
// settori in cui copre)
function _pianoAutoSettoriCheCopronoDa(rep) {
  const out = new Set();
  collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === rep)
    .forEach((c) =>
      String(c.reparti_extra || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x && x !== rep)
        .forEach((x) => out.add(x)),
    );
  return [...out];
}
// COMPLETA CON COPERTURE nella generazione automatica, per il settore repT
async function _pianoAutoCoperture(repT, ym, righe) {
  const auto = window._pianoAutoInCorso;
  const nG = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nG).padStart(2, '0');
  const repL = typeof repartoLabel === 'function' ? repartoLabel(repT) : repT;
  const chi = collaboratoriCache.filter(
    (c) => c.attivo !== false && _pianoAppartieneAlReparto(c, repT) && _pianoCoperturaCfg(c, repT),
  );
  if (!chi.length) return;
  const haPiano = async (r) =>
    ((await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + r + '&limit=400')) || []).some(
      (x) => _pianoTurnoInfo(x.codice) || x.generato,
    );
  // il piano del settore da coprire c e? (per gli altri settori: solo se gia generato)
  if (!(await haPiano(repT))) return;
  const mancano = [];
  for (const casa of [...new Set(chi.map((c) => c.reparto_dip || 'slots'))])
    if (!(await haPiano(casa))) mancano.push(typeof repartoLabel === 'function' ? repartoLabel(casa) : casa);
  const nomi = chi.map((c) => c.nome).join(', ');
  if (mancano.length) {
    righe.push(
      '• Coperture ' +
        repL +
        ' (' +
        nomi +
        '): rimandate, il piano di ' +
        mancano.join(', ') +
        ' non c e ancora. Si fanno quando viene generato (anche a mano: "Completa con coperture").',
    );
    return;
  }
  _pianoAutoFase('Coperture da altri settori (' + repL + ')...');
  _pianoMeseSel = ym;
  _pianoRepartoSel = repT;
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, repT);
  if (auto) auto.bozza = null;
  await generaBozzaPiano(true);
  const bc = (auto && auto.bozza) || {};
  righe.push(
    '• Coperture ' +
      repL +
      ' (' +
      nomi +
      '): ' +
      (bc.celle || 0) +
      ' celle scritte (turni e congedi)' +
      (bc.scoperti != null ? ', posti ancora scoperti ' + bc.scoperti : ''),
  );
}

// ============================================================ IMPOSTAZIONI
// scheda in Piano > Impostazioni (solo amministratore): per settore attivo,
// giorno del mese e minuti di miglioramento; sotto, le ultime esecuzioni
function _pianoAutoCardSegnaposto() {
  if (!isAdmin()) return '';
  setTimeout(() => pianoAutoRenderCard(), 0);
  return '<div id="pa-card"></div>';
}

async function pianoAutoRenderCard() {
  const el = document.getElementById('pa-card');
  if (!el || !isAdmin()) return;
  let st = null;
  try {
    st = await _rpcSicura('piano_auto_stato', { p_token: getOpToken() });
  } catch (e) {
    el.innerHTML =
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Generazione automatica del piano</div>' +
      '<div style="padding:10px 14px;color:var(--muted)">Non disponibile: manca l aggiornamento del database 20260894 (vedi cartella IT).</div></div>';
    return;
  }
  const cfg = (st && st.config) || {};
  const es = (st && st.esecuzioni) || [];
  const mese = st && st.mese_prossimo;
  const sel = 'padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Generazione automatica del piano</div><div style="padding:10px 14px">' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px;line-height:1.5">Dal giorno scelto in poi il primo PC con il programma aperto genera il piano del mese dopo (vacanze, congedi, CGF, turni) e lo migliora per i minuti indicati. Se il PC si accende più tardi, la fa appena acceso. Una sola volta per mese e settore, anche con più PC accesi. Serve che le vacanze dell anno siano importate: se mancano aspetta e avvisa. Non tocca mai gli inserimenti a mano; se il mese ha già una bozza non la rifa. Alla fine avvisa con una nota chi ha il permesso "Genera bozza". Prossimo mese da generare: <b>' +
    escP(_pianoAutoMeseLabel(mese || '')) +
    '</b>.</p>' +
    '<div style="overflow-x:auto"><table class="tbl-semplice" style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem)"><thead><tr>' +
    '<th style="text-align:left;padding:4px 8px">Settore</th><th style="padding:4px 8px">Attiva</th><th style="padding:4px 8px">Dal giorno</th><th style="padding:4px 8px">Migliora per</th><th style="text-align:left;padding:4px 8px">Questo mese</th></tr></thead><tbody>';
  getReparti().forEach((rp) => {
    const c = cfg[rp.key] || {};
    const g = c.giorno == null ? 5 : parseInt(c.giorno);
    const m = c.minuti == null ? 3 : parseInt(c.minuti);
    const e = es.find((x) => x.reparto_dip === rp.key && x.mese === mese);
    h +=
      '<tr><td style="padding:4px 8px">' +
      escP(rp.label || rp.key) +
      '</td><td style="text-align:center;padding:4px 8px"><input type="checkbox"' +
      (c.attivo ? ' checked' : '') +
      ' onchange="pianoAutoSalva(\'' +
      escP(rp.key) +
      "','attivo',this.checked)\"></td>" +
      '<td style="padding:4px 8px"><select style="' +
      sel +
      '" onchange="pianoAutoSalva(\'' +
      escP(rp.key) +
      "','giorno',this.value)\">";
    for (let d = 1; d <= 28; d++)
      h += '<option value="' + d + '"' + (g === d ? ' selected' : '') + '>' + d + '</option>';
    h += '<option value="0"' + (g === 0 ? ' selected' : '') + '>ultimo del mese</option></select></td>';
    h +=
      '<td style="padding:4px 8px"><select style="' +
      sel +
      '" onchange="pianoAutoSalva(\'' +
      escP(rp.key) +
      "','minuti',this.value)\">" +
      [
        [0, 'non migliorare'],
        [1, '1 minuto'],
        [3, '3 minuti'],
        [5, '5 minuti'],
        [10, '10 minuti'],
      ]
        .map((o) => '<option value="' + o[0] + '"' + (m === o[0] ? ' selected' : '') + '>' + o[1] + '</option>')
        .join('') +
      '</select></td><td style="padding:4px 8px">' +
      _pianoAutoStatoHtml(e, c) +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  if (es.length) {
    h +=
      '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin:14px 0 4px">Ultime esecuzioni</p><div style="display:flex;flex-direction:column;gap:6px">';
    es.forEach((x) => {
      const msg = (x.esito && x.esito.messaggio) || '';
      h +=
        '<div style="font-size:var(--fs-sm,.8125rem);border-left:3px solid ' +
        (x.stato === 'fatta'
          ? 'var(--c-verde,#2e7d32)'
          : x.stato === 'errore'
            ? 'var(--c-rosso,#c62828)'
            : 'var(--c-oro,#b8860b)') +
        ';padding:2px 8px"><b>' +
        escP(_pianoAutoMeseLabel(x.mese)) +
        ' · ' +
        escP(typeof repartoLabel === 'function' ? repartoLabel(x.reparto_dip) : x.reparto_dip) +
        '</b> · ' +
        escP(_PIANO_AUTO_STATI[x.attiva ? 'in_corso' : x.stato] || x.stato) +
        (x.avviata_da ? ' · PC di ' + escP(x.avviata_da) : '') +
        (x.finita ? ' · ' + escP(new Date(x.finita).toLocaleString('it-CH')) : '') +
        (msg ? '<div style="white-space:pre-line;color:var(--muted);margin-top:2px">' + escP(msg) + '</div>' : '') +
        '</div>';
    });
    h += '</div>';
  }
  h += '</div></div>';
  el.innerHTML = h;
}

const _PIANO_AUTO_STATI = {
  in_corso: 'in corso adesso',
  fatta: 'fatta',
  saltata: 'saltata',
  attesa_vacanze: 'in attesa delle vacanze',
  errore: 'interrotta da un errore',
};

function _pianoAutoStatoHtml(e, c) {
  if (!c.attivo && !e) return '<span style="color:var(--muted)">spenta</span>';
  if (!e) return '<span style="color:var(--muted)">da fare</span>';
  const testo = _PIANO_AUTO_STATI[e.attiva ? 'in_corso' : e.stato] || e.stato;
  const riprova =
    !e.attiva && e.stato !== 'attesa_vacanze'
      ? ' <button class="btn-act" style="margin-left:6px" onclick="pianoAutoRiprova(\'' +
        escP(e.reparto_dip) +
        "','" +
        escP(e.mese) +
        '\')" title="Rimette da fare la generazione di questo mese: parte al prossimo controllo (subito su questo PC)">Riprova</button>'
      : '';
  return escP(testo) + riprova;
}

async function pianoAutoSalva(rep, campo, valore) {
  if (!isAdmin()) return;
  let cfg;
  try {
    cfg = _pianoAutoCfgDa(await getImp('piano_auto_generazione'));
  } catch (e) {
    toastErrore('Impostazione non letta: ' + (e.message || e));
    return;
  }
  const c = Object.assign({ attivo: false, giorno: 5, minuti: 3 }, cfg[rep] || {});
  const prima = c[campo];
  if (campo === 'attivo') c.attivo = !!valore;
  else if (campo === 'giorno') {
    const g = parseInt(valore);
    if (isNaN(g) || g < 0 || g > 28) return;
    c.giorno = g;
  } else if (campo === 'minuti') {
    const m = parseInt(valore);
    if (isNaN(m) || m < 0 || m > 10) return;
    c.minuti = m;
  } else return;
  cfg[rep] = c;
  if (!(await salvaImp('piano_auto_generazione', JSON.stringify(cfg)))) return;
  const etich = { attivo: 'attiva', giorno: 'dal giorno', minuti: 'minuti di miglioramento' }[campo];
  const fmt = (v) => (campo === 'giorno' && parseInt(v) === 0 ? 'ultimo' : v);
  logAzione('Piano: generazione automatica impostata', rep + ' · ' + etich + ' ' + fmt(prima) + ' → ' + fmt(c[campo]));
  _pianoRegistraModifica('Impostazioni', 'Generazione automatica ' + rep, etich, fmt(prima), fmt(c[campo]));
  toast(
    c.attivo
      ? 'Generazione automatica ' +
          rep +
          ': dal ' +
          (c.giorno ? 'giorno ' + c.giorno : 'ultimo giorno') +
          ' del mese, migliora ' +
          (c.minuti ? c.minuti + ' min' : 'no')
      : 'Generazione automatica ' + rep + ' spenta',
  );
  pianoAutoRenderCard();
  if (c.attivo) pianoAutoControlla();
}

async function pianoAutoRiprova(rep, mese) {
  if (
    !(await chiediConferma(
      'Rimettere da fare la generazione automatica di ' +
        _pianoAutoMeseLabel(mese) +
        ' (' +
        rep +
        ')?\n\nParte subito su questo PC se il giorno e arrivato. Se il mese ha già una bozza non la rifa: per rigenerarlo prima "Cancella piano".',
    ))
  )
    return;
  try {
    await _rpcSicura('piano_auto_riprova', { p_token: getOpToken(), p_reparto: rep, p_mese: mese });
  } catch (e) {
    toastErrore('Non riuscito: ' + (e.message || e));
    return;
  }
  logAzione('Piano: generazione automatica rimessa da fare', mese + ' ' + rep);
  await pianoAutoRenderCard();
  await pianoAutoControlla();
  pianoAutoRenderCard();
}

// ============================================================ AVVISO SUGLI ALTRI PC
// Chi apre nel calendario il mese che un altro PC sta generando vede un avviso; nulla
// e bloccato: le modifiche a mano vengono rispettate (la scrittura dei miglioramenti
// salta le celle cambiate nel frattempo, _ricercaScrivi). Stato letto al massimo una
// volta al minuto.
let _pianoAutoStatoCache = { t: 0, dati: null };
async function pianoAutoAvvisoMese() {
  const el = document.getElementById('piano-auto-avviso');
  if (!el || window._pianoAutoInCorso || typeof getOpToken !== 'function' || !getOpToken()) return;
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  try {
    if (Date.now() - _pianoAutoStatoCache.t > 60000) {
      _pianoAutoStatoCache = { t: Date.now(), dati: await _rpcSicura('piano_auto_stato', { p_token: getOpToken() }) };
    }
  } catch (e) {
    return; // database senza la migrazione o rete assente: nessun avviso
  }
  const es = ((_pianoAutoStatoCache.dati || {}).esecuzioni || []).find(
    (x) => x.attiva && x.reparto_dip === rep && x.mese === ym,
  );
  const el2 = document.getElementById('piano-auto-avviso');
  if (!el2 || ym !== _pianoMeseSel || rep !== _pianoReparto()) return;
  el2.innerHTML = es
    ? '<div style="border-left:3px solid var(--accent2,#1a4a7a);background:var(--paper2);padding:8px 12px;margin:6px 0;font-size:var(--fs-sm,.8125rem)"><b>Generazione automatica in corso</b> su un altro PC' +
      (es.avviata_da ? ' (' + escP(es.avviata_da) + ')' : '') +
      ': fra pochi minuti il mese si completa da solo. Puoi lavorare normalmente: le modifiche a mano vengono rispettate.</div>'
    : '';
}
