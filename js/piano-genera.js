/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-genera.js
 * PIANO · validatore regole e generatore della bozza (prenotazioni, passata di riparazione)
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// FASE 2 · VALIDATORE REGOLE (dai manuali Turnivo/Casino Lugano)
// ================================================================
let _pianoViolCelle = {}; // 'nome|data' -> [messaggi]
let _pianoViolLista = null; // ultima validazione (null = mai eseguita)

function _pianoOra(hhmm) {
  if (!hhmm) return null;
  const p = String(hhmm).split(':');
  return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
}
// Giorno del mese entro cui i Jolly consegnano le non disponibilita':
// regola 'nd_jolly_giorno' modificabile dall'admin (direttiva 16-007)
function _pianoGiornoNd() {
  const v = parseInt(_pianoRegolaVal('nd_jolly_giorno'));
  return v > 0 && v <= 28 ? v : 3;
}
// Valore di una regola PER IL SETTORE CORRENTE. Se esiste una regola scritta
// apposta per questo settore vince lei; altrimenti vale quella generale (campo
// settori vuoto). Una regola spenta non si applica.
function _pianoRegolaSettori(r) {
  return String((r && r.settori) || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
function _pianoRegolaVal(nome, rep) {
  const settore = (rep || (typeof _pianoReparto === 'function' ? _pianoReparto() : 'slots') || '').toLowerCase();
  const candidate = pianoRegoleCache.filter((x) => x.nome === nome);
  // 1) regola specifica del settore (ha la precedenza)
  const spec = candidate.find((x) => _pianoRegolaSettori(x).includes(settore));
  if (spec) return spec.attivo === false ? null : spec.valore;
  // 2) regola generale (nessun settore indicato)
  const gen = candidate.find((x) => !_pianoRegolaSettori(x).length);
  if (!gen || gen.attivo === false) return null;
  return gen.valore;
}
// Limiti ORE MENSILI personalizzabili (pannello Regole):
// - fissi e jolly CON percentuale: obiettivo = giorni/7 × ore sett × %;
//   max = obiettivo + tolleranza_ore_sopra, min = obiettivo − tolleranza_ore_sotto
//   (se sopra/sotto sono spente vale la tolleranza_ore simmetrica ±);
// - jolly SENZA percentuale: range assoluto jolly_ore_min / jolly_ore_max.
// min/max null = nessun limite su quel lato (regole spente).
function _pianoLimitiOre(nome, nGiorni) {
  const info = _pianoCollabInfo(nome) || {};
  // jolly con percentuale PIENA (o vuota) = jolly puro → range assoluto;
  // jolly con percentuale ridotta (es. 80%) = obiettivo % come i fissi
  const pctJ = parseFloat(info.percentuale);
  let jollySenzaPct = info.is_jolly && !(pctJ > 0 && pctJ < 1);
  // AUSILIARI: nella generazione del piano si punta a una percentuale, perche'
  // di norma un jolly fa circa l'80% di un tempo pieno. Vale SOLO qui, per
  // decidere quanti turni proporgli: le loro ore dovute restano zero e le
  // assenze continuano a contare per intero. La percentuale si cambia dalla
  // scheda Regole; lasciandola vuota si torna al vecchio range assoluto
  // jolly_ore_min / jolly_ore_max.
  const pctJollyPiano = parseFloat(_pianoRegolaVal('jolly_percentuale_piano'));
  if (jollySenzaPct && pctJollyPiano > 0 && pctJollyPiano <= 1) jollySenzaPct = false;
  if (jollySenzaPct) {
    const jMin = parseFloat(_pianoRegolaVal('jolly_ore_min'));
    const jMax = parseFloat(_pianoRegolaVal('jolly_ore_max'));
    return { obiettivo: null, min: isNaN(jMin) ? null : jMin, max: isNaN(jMax) ? null : jMax };
  }
  const pct = info.is_jolly && !(pctJ > 0 && pctJ < 1) ? pctJollyPiano : parseFloat(info.percentuale) || 1;
  const obiettivo = (_pianoGgDovuti(nome, _pianoMeseSel) / 7) * _pianoOreSett * pct;
  const sim = parseFloat(_pianoRegolaVal('tolleranza_ore'));
  const sopra = parseFloat(_pianoRegolaVal('tolleranza_ore_sopra'));
  const sotto = parseFloat(_pianoRegolaVal('tolleranza_ore_sotto'));
  const su = !isNaN(sopra) ? sopra : !isNaN(sim) ? sim : NaN;
  const giu = !isNaN(sotto) ? sotto : !isNaN(sim) ? sim : NaN;
  return {
    obiettivo: obiettivo,
    min: isNaN(giu) ? null : obiettivo - giu,
    max: isNaN(su) ? null : obiettivo + su,
  };
}
function _pianoIsLavoro(codice) {
  return !!_pianoTurnoInfo(codice);
}

// Calcola le violazioni del mese corrente. Ritorna la lista e riempie _pianoViolCelle.
// Il sabato "chiude entro le 23"? Se il turno finisce oltre (o dopo la
// mezzanotte), la domenica seguente NON conta tra le 12 libere (LL art. 18)
function _pianoSabatoEntro23(codice) {
  if (!codice) return true;
  const t = _pianoTurnoInfo(codice);
  if (!t) return true; // codici speciali: niente lavoro
  if (t.oltre23) return false;
  const fi = _pianoOra(String(t.ora_fine || '').substring(0, 5));
  const ii = _pianoOra(String(t.ora_inizio || '').substring(0, 5));
  if (fi == null) return true;
  if (ii != null && fi < ii) return false; // finisce dopo mezzanotte
  return fi <= 23; // _pianoOra e' in ore decimali
}
function _pianoCalcolaViolazioni() {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
  const no4w1c1w = _pianoRegolaVal('no_4w1c1w') === 'TRUE';
  const diurnoPreV = _pianoRegolaVal('diurno_prima_vacanza') === 'TRUE';
  const celle = {};
  const lista = [];
  const aggiungi = (nome, giorno, msg) => {
    const dstr = ym + '-' + String(giorno).padStart(2, '0');
    (celle[nome + '|' + dstr] = celle[nome + '|' + dstr] || []).push(msg);
    lista.push({ nome: nome, giorno: giorno, msg: msg });
  };
  const perNome = {};
  _pianoRighe.forEach((r) => {
    const g = parseInt(r.data.split('-')[2]);
    (perNome[r.collaboratore] = perNome[r.collaboratore] || {})[g] = r.codice;
  });
  Object.keys(perNome).forEach((nome) => {
    const giorni = perNome[nome];
    let consec = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = giorni[g] || '';
      const lavoro = _pianoIsLavoro(cod);
      // 1) massimo giorni lavorativi consecutivi
      if (lavoro) {
        consec++;
        if (maxCons && consec === maxCons + 1)
          aggiungi(nome, g, consec - 1 + '+ giorni lavorativi consecutivi (max ' + maxCons + ')');
      } else {
        consec = 0;
      }
      // 2) riposo minimo tra due turni consecutivi
      if (minRiposo && lavoro && giorni[g + 1] && _pianoIsLavoro(giorni[g + 1])) {
        const t1 = _pianoTurnoInfo(cod);
        const t2 = _pianoTurnoInfo(giorni[g + 1]);
        const fine1 = _pianoOra(t1.ora_fine);
        const inizio2 = _pianoOra(t2.ora_inizio);
        if (fine1 != null && inizio2 != null) {
          // fine oltre mezzanotte = fine prima dell'inizio. Il flag "oltre le 23"
          // vale anche per un turno che chiude alle 23:30 e NON sposta il giorno
          const fineAbs = fine1 <= _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
          const riposo = 24 + inizio2 - fineAbs;
          if (riposo < minRiposo)
            aggiungi(
              nome,
              g + 1,
              'solo ' + riposo.toFixed(1) + 'h di riposo dopo ' + cod + ' (min ' + minRiposo + 'h)',
            );
        }
      }
      // 3) vietato 4 lavoro + 1 riposo + 1 lavoro
      if (no4w1c1w && !lavoro && cod && g >= 5) {
        let prima = 0;
        for (let k = g - 1; k >= 1 && _pianoIsLavoro(giorni[k]); k--) prima++;
        if (prima >= 4 && _pianoIsLavoro(giorni[g + 1] || ''))
          aggiungi(nome, g, 'riposo singolo dopo ' + prima + ' giorni di lavoro (vietato 4+1+1)');
      }
      // 4) turno diurno il giorno prima delle vacanze
      if (diurnoPreV && (cod === 'V' || cod === 'V1') && (giorni[g - 1] || '') && _pianoIsLavoro(giorni[g - 1])) {
        const tp = _pianoTurnoInfo(giorni[g - 1]);
        if (tp && tp.tipo === 'NOTTURNO')
          aggiungi(nome, g - 1, 'turno notturno il giorno prima delle vacanze (deve essere diurno)');
      }
      // 5) regole "chi fa cosa" del settore (regole di gruppo turni_solo_funzioni
      //    e funzione_turni_giorni: create e modificate dalla scheda Regole di gruppo)
      if (lavoro) {
        const t = _pianoTurnoInfo(cod);
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        const vfz = t ? _pianoViolazioneFunzioneTurno(nome, t, dow, false) : null;
        if (vfz) aggiungi(nome, g, vfz);
      }
    }
  });

  // ===== TOLLERANZA ORE (regole personalizzabili: tolleranza_ore ±,
  // tolleranza_ore_sopra/sotto per fissi e jolly con %, jolly_ore_min/max) =====
  {
    const orePerNome = {};
    _pianoRighe.forEach((r) => {
      const info = _pianoCollabInfo(r.collaboratore) || {};
      const pct = parseFloat(info.percentuale) || 1;
      const o = _pianoOreDiRiga(r, pct);
      if (o) orePerNome[r.collaboratore] = (orePerNome[r.collaboratore] || 0) + o;
    });
    Object.keys(orePerNome).forEach((nome) => {
      const lim = _pianoLimitiOre(nome, nGiorni);
      if (lim.min == null && lim.max == null) return; // regole spente per questo profilo
      const oreT = Math.round(orePerNome[nome] * 10) / 10;
      const arr = (x) => Math.round(x * 10) / 10;
      if (lim.max != null && oreT > lim.max)
        lista.push({
          nome: nome,
          giorno: 0,
          msg:
            'ore mese ' +
            oreT +
            'h SOPRA il massimo ' +
            arr(lim.max) +
            'h (regole tolleranza' +
            (lim.obiettivo == null ? ' jolly' : '') +
            ')',
        });
      else if (lim.min != null && oreT < lim.min)
        lista.push({
          nome: nome,
          giorno: 0,
          msg:
            'ore mese ' +
            oreT +
            'h SOTTO il minimo ' +
            arr(lim.min) +
            'h (regole tolleranza' +
            (lim.obiettivo == null ? ' jolly' : '') +
            ')',
        });
    });
  }
  // ===== REGOLE DI GRUPPO (come il solver Turnivo) =====
  if (pianoRegoleGruppoCache.length) {
    const perGruppoGiornoFz = {}; // GRUPPO|FZ|g -> [nomi]
    const perGruppoMeseFz = {}; // GRUPPO|FZ -> Set(nomi)
    const perGruppoGiornoTot = {}; // GRUPPO|g -> n
    _pianoRighe.forEach((r) => {
      const t = _pianoTurnoInfo(r.codice);
      if (!t) return;
      const gr = (t.gruppo || '').toUpperCase();
      const g = parseInt(r.data.split('-')[2]);
      const fz = (((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase();
      (perGruppoGiornoFz[gr + '|' + fz + '|' + g] = perGruppoGiornoFz[gr + '|' + fz + '|' + g] || []).push(
        r.collaboratore,
      );
      (perGruppoMeseFz[gr + '|' + fz] = perGruppoMeseFz[gr + '|' + fz] || new Set()).add(r.collaboratore);
      perGruppoGiornoTot[gr + '|' + g] = (perGruppoGiornoTot[gr + '|' + g] || 0) + 1;
      // blocca_tipo_turno + richiede_campo + accompagnamento: controlli per cella
      for (const rg of _pianoRegoleGruppoDi(gr)) {
        const tipoR = (rg.tipo_regola || '').toLowerCase();
        if (tipoR === 'blocca_tipo_turno') {
          const tipi = rg.valore.split(',').map((x) => x.trim().toUpperCase());
          if (tipi.includes((t.tipo || '').toUpperCase()))
            aggiungi(r.collaboratore, g, 'turno ' + r.codice + ' di tipo ' + t.tipo + ' vietato nel gruppo ' + gr);
        } else if (tipoR === 'richiede_campo') {
          if (!_pianoCampoOk(_pianoCollabInfo(r.collaboratore), rg.valore))
            aggiungi(r.collaboratore, g, 'gruppo ' + gr + ' richiede ' + rg.valore);
        }
      }
      const infoAcc = _pianoCollabInfo(r.collaboratore);
      if (infoAcc && infoAcc.accompagnamento_settori) {
        const grAcc = _pianoAccompagnamentoDi(infoAcc);
        if (grAcc.includes(gr)) r._accGruppo = gr;
      }
      // chi copre da un altro settore ed e' segnato "accompagnato" non deve
      // restare da solo nel gruppo, esattamente come sopra
      const copAcc = _pianoCoperturaCfg(infoAcc);
      if (copAcc && copAcc.accompagnato) r._accGruppo = gr;
    });
    // accompagnamento: da solo nel gruppo quel giorno
    _pianoRighe.forEach((r) => {
      if (!r._accGruppo) return;
      const g = parseInt(r.data.split('-')[2]);
      if ((perGruppoGiornoTot[r._accGruppo + '|' + g] || 0) <= 1)
        aggiungi(r.collaboratore, g, 'richiede accompagnamento nel gruppo ' + r._accGruppo + ' ma è da solo');
      delete r._accGruppo;
    });
    // limiti e minimi per gruppo
    const gruppi = [...new Set(pianoRegoleGruppoCache.map((r) => (r.gruppo || '').toUpperCase()))];
    for (const gr of gruppi) {
      for (const rg of _pianoRegoleGruppoDi(gr)) {
        const tipoR = (rg.tipo_regola || '').toLowerCase();
        const parti = rg.valore.split(':');
        const fu = (parti[0] || '').toUpperCase();
        const nVal = parseInt(parti[1]) || 1;
        if (tipoR === 'limite_funzione_giorno') {
          for (let g = 1; g <= nGiorni; g++) {
            const lista2 = perGruppoGiornoFz[gr + '|' + fu + '|' + g] || [];
            if (lista2.length > nVal)
              lista2.forEach((nome) =>
                aggiungi(nome, g, 'più di ' + nVal + ' ' + fu + ' nel gruppo ' + gr + ' lo stesso giorno'),
              );
          }
        } else if (tipoR === 'limite_funzione_mese') {
          const set = perGruppoMeseFz[gr + '|' + fu];
          if (set && set.size > nVal)
            lista.push({
              nome: '(' + gr + ')',
              giorno: 0,
              msg:
                set.size +
                ' ' +
                fu +
                ' diversi nel gruppo ' +
                gr +
                ' nel mese (max ' +
                nVal +
                '): ' +
                [...set].join(', '),
            });
        } else if (tipoR === 'minimo_funzione_mese') {
          const set = perGruppoMeseFz[gr + '|' + fu];
          if (!set || set.size < nVal)
            lista.push({
              nome: '(' + gr + ')',
              giorno: 0,
              msg:
                'nel gruppo ' +
                gr +
                ' servono almeno ' +
                nVal +
                ' ' +
                fu +
                ' nel mese (trovati ' +
                (set ? set.size : 0) +
                ')',
            });
        } else if (tipoR === 'minimo_funzione_giorno') {
          const tipoF = (parti[2] || '').toUpperCase();
          const dows = parti[3] ? parti[3].split(',').map((x) => parseInt(x)) : null;
          for (let g = 1; g <= nGiorni; g++) {
            const dstr = ym + '-' + String(g).padStart(2, '0');
            const dowPy = (new Date(dstr + 'T12:00:00').getDay() + 6) % 7;
            if (dows && !dows.includes(dowPy)) continue;
            // conta la funzione richiesta su turni del tipo filtrato nel gruppo
            let conta = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              const t = _pianoTurnoInfo(r.codice);
              if (!t || (t.gruppo || '').toUpperCase() !== gr) return;
              if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) return;
              if ((((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase() === fu) conta++;
            });
            // segnala solo se quel giorno il gruppo ha turni del tipo richiesto
            let turniQuelGiorno = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              const t = _pianoTurnoInfo(r.codice);
              if (t && (t.gruppo || '').toUpperCase() === gr && (!tipoF || (t.tipo || '').toUpperCase() === tipoF))
                turniQuelGiorno++;
            });
            if (turniQuelGiorno && conta < nVal)
              lista.push({
                nome: '(' + gr + ')',
                giorno: g,
                msg:
                  'giorno ' +
                  g +
                  ': nel gruppo ' +
                  gr +
                  ' servono ' +
                  nVal +
                  ' ' +
                  fu +
                  (tipoF ? ' sui turni ' + tipoF : '') +
                  ' (trovati ' +
                  conta +
                  ')',
              });
          }
        }
      }
    }
  }
  // NON DISPONIBILITA': un turno assegnato in un giorno dichiarato ND
  const ndV = _pianoNdMese(ym);
  _pianoRighe.forEach((r) => {
    if (!_pianoTurnoInfo(r.codice)) return;
    if (ndV[r.collaboratore + '|' + r.data])
      aggiungi(
        r.collaboratore,
        parseInt(r.data.split('-')[2]),
        "turno su un giorno di NON disponibilita' (dal Diario)",
      );
  });
  // DOMENICHE LIBERE (OLL2 art. 24: minimo 12 all'anno · regola aziendale:
  // la domenica conta solo se il sabato si finisce entro le 23)
  if (_pianoRegolaVal('domeniche_libere_anno') != null) {
    const chkSab = _pianoRegolaVal('turno_prima_domenica_libera') === 'TRUE';
    Object.keys(perNome).forEach((nome) => {
      const info = _pianoCollabInfo(nome);
      if (!info || info.funzione === 'RESP') return;
      let libere = 0;
      let ultimaDom = 0;
      for (let g = 1; g <= nGiorni; g++) {
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        if (dow !== 0) continue;
        ultimaDom = g;
        const cod = perNome[nome][g];
        const lavora = cod && _pianoTurnoInfo(cod);
        if (lavora) continue;
        if (_pianoDomenicaEsclusa(cod)) continue; // vacanza o malattia: non conta tra le 12
        const codSab = g > 1 ? perNome[nome][g - 1] : null;
        if (chkSab && !_pianoSabatoEntro23(codSab)) {
          aggiungi(nome, g, 'domenica non conteggiabile come libera: il sabato finisce oltre le 23');
          continue;
        }
        libere++;
      }
      if (ultimaDom && libere === 0)
        aggiungi(nome, ultimaDom, "nessuna domenica libera valida nel mese (minimo 12 all'anno)");
    });
  }

  return { celle: celle, lista: lista };
}

function validaPiano() {
  setTimeout(() => controllaFormazioniCompletate(true), 800);
  const r = _pianoCalcolaViolazioni();
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  logAzione('Piano validato', _pianoMeseSel + ' · ' + r.lista.length + ' violazioni');
  renderPiano();
}

function _pianoRenderViolazioni() {
  const el = document.getElementById('piano-violazioni');
  if (!el || _pianoViolLista === null) return;
  if (!_pianoViolLista.length) {
    el.innerHTML =
      '<p style="padding:8px 14px;font-size:.82rem;color:#2c6e49;font-weight:600">✓ Nessuna violazione delle regole attive nel mese.</p>';
    return;
  }
  let h =
    '<div style="padding:8px 14px"><p style="font-size:.82rem;font-weight:700;color:var(--accent);margin-bottom:6px">' +
    _pianoViolLista.length +
    ' violazioni (celle evidenziate in rosso):</p><div style="max-height:180px;overflow-y:auto;font-size:.85rem;line-height:1.7">';
  _pianoViolLista.forEach((v) => {
    h += '<div>• <strong>' + escP(v.nome) + '</strong> · giorno ' + v.giorno + ': ' + escP(v.msg) + '</div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
}

// ================================================================
// FASE 2 · GENERA BOZZA (euristica istantanea, non il solver)
// Riempie i fabbisogni del mese rispettando: riposo 11h, max
// consecutivi, idoneità storica (gruppi già fatti), equità ore.
// Le celle esistenti (V, protette, malattie Diario) non si toccano.
// ================================================================
async function completaConCoperture() {
  if (!puoGestirePiano()) return;
  const chi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoCoperturaCfg(c))
    .map((c) => c.nome + ' (' + repartoLabel(c.reparto_dip || 'slots') + ')');
  if (!chi.length) {
    toast('Nessun collaboratore abilitato a coprire in questo settore');
    return;
  }
  if (
    !confirm(
      'Tappo i buchi rimasti di ' +
        _pianoMeseSel +
        ' usando chi copre da altri settori:\n\n' +
        chi.map((x) => '\u2022 ' + x).join('\n') +
        "\n\nI turni gia' inseriti non vengono toccati. Fallo DOPO aver generato i piani dei loro reparti, cosi' si vede chi e' davvero libero.",
    )
  )
    return;
  await generaBozzaPiano(true);
}
// usaCoperture = false (predefinito): riempie SOLO con i collaboratori del
// reparto, cosi' l'ordine con cui generi i piani non toglie nessuno al suo
// settore d'origine. Con true (bottone "Completa con coperture") si tappano i
// buchi rimasti usando chi e' abilitato a coprire da altri settori.
async function generaBozzaPiano(usaCoperture) {
  _pianoUndoSnap((usaCoperture ? 'coperture ' : 'genera bozza ') + _pianoMeseSel);
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  const fabb =
    (await secGet(
      'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!fabb.length) {
    toast('Nessun fabbisogno configurato per questo mese: la bozza non sa cosa riempire');
    return;
  }
  // GIORNI CHIUSI (gia' passati): la bozza non li tocca, ne' cancellando ne'
  // assegnando. Prima cancellava e riempiva anche il passato senza motivo.
  const giorniChiusi = new Set();
  for (let g = 1; g <= nGiorni; g++) {
    const dstrG = ym + '-' + String(g).padStart(2, '0');
    if (_pianoGiornoBloccato(dstrG) && !_pianoGiornoSbloccato(dstrG)) giorniChiusi.add(g);
  }
  if (giorniChiusi.size === nGiorni) {
    toastErrore('Tutti i giorni di ' + ym + ' sono chiusi: niente da generare');
    return;
  }
  let primoApertoG = 1;
  while (giorniChiusi.has(primoApertoG)) primoApertoG++;
  const primoAperto = ym + '-' + String(primoApertoG).padStart(2, '0');
  // le C di RIEMPIMENTO generate da una bozza precedente si tolgono e si
  // rimettono alla fine: così rigenerare non trova i giorni "occupati"
  await secDel(
    'piano',
    'data=gte.' +
      primoAperto +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&codice=eq.C&generato=eq.true&protetto=eq.false',
  );
  // Step 0 come Turnivo: prima le vacanze (V protette + C + WD)
  await _applicaVacanzeMese(false);
  // ricarico includendo le celle degli ALTRI reparti dei multi-reparto
  // (stessa funzione scalabile di renderPiano)
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, _pianoReparto());
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  // storia per idoneità (chi ha già fatto quel gruppo) e familiarità:
  // tutte le assegnazioni passate del settore (le più recenti prima)
  const storia =
    (await secGet('piano?data=lt.' + da + '&reparto_dip=eq.' + _pianoReparto() + '&order=data.desc&limit=20000')) || [];
  const idoneita = {}; // nome -> Set(gruppi)
  const familiarita = {}; // nome|codice -> n
  storia.concat(_pianoRighe).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t) return;
    (idoneita[r.collaboratore] = idoneita[r.collaboratore] || new Set()).add(t.gruppo);
    familiarita[r.collaboratore + '|' + r.codice] = (familiarita[r.collaboratore + '|' + r.codice] || 0) + 1;
  });
  const malattie = Object.assign(_pianoMalattieMese(ym), _pianoCnpMese(ym)); // malattie e congedi non pagati: giorni non assegnabili
  const ndDiario = _pianoNdMese(ym);
  // stato griglia: esistenti + assegnazioni della bozza
  const cella = {}; // 'nome|g' -> codice
  const rigaDi = {}; // 'nome|g' -> riga (per sostituire i segnaposto WD)
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  const oreMese = {}; // equità: ore gia' nel mese, turni E codici speciali (V, M, CGF...)
  Object.keys(cella).forEach((k) => {
    const nomeK = k.substring(0, k.lastIndexOf('|'));
    const t = _pianoTurnoInfo(cella[k]);
    if (t) oreMese[nomeK] = (oreMese[nomeK] || 0) + (parseFloat(t.durata_ore) || 0);
    else {
      // vacanze, malattie, CGF valgono ore: chi ha 10 giorni di V non deve
      // ricevere turni fino all'obiettivo pieno (validatore e calendario li contano)
      const cs = _pianoCodiceInfo(cella[k]);
      if (cs)
        oreMese[nomeK] = (oreMese[nomeK] || 0) + _pianoOreCodiceSpeciale(cs, _pianoCollabInfo(nomeK) || {}, cella[k]);
    }
  });
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  // OBIETTIVO ORE mensile (come la tolleranza ore del solver Turnivo):
  // giorni/7 × ore settimanali × percentuale, corretto col saldo cumulato
  // dei mesi precedenti. La bozza dà i turni a chi è più LONTANO dal
  // proprio obiettivo: prima i fissi al 100%, i jolly coprono il resto.
  await _pianoAggiornaYtd(nomi);
  await _pianoCaricaOreMese(_pianoMeseSel);
  const obiettivo = {};
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    const pct = parseFloat(info.percentuale) || 1;
    obiettivo[n] = (_pianoGgDovuti(n, ym) / 7) * _pianoOreSett * pct - (_pianoYtdMap[n] || 0);
  });
  const gapOre = (n) => (obiettivo[n] || 0) - (oreMese[n] || 0);
  const consecPrima = (nome, g) => {
    let n = 0;
    for (let k = g - 1; k >= 1 && _pianoIsLavoro(cella[nome + '|' + k] || ''); k--) n++;
    return n;
  };
  const riposoOk = (nome, g, t) => {
    // verso il giorno prima
    const prev = _pianoTurnoInfo(cella[nome + '|' + (g - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = finePrev <= _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    // verso il giorno dopo (se già assegnato, es. cella protetta)
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = fine <= _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  // fabbisogno per giorno
  const fabbG = {}; // g -> [{codice, quantita}]
  fabb.forEach((f) => {
    const g = parseInt(f.data.split('-')[2]);
    (fabbG[g] = fabbG[g] || []).push(f);
  });
  const nuove = [];
  const sostituzioniWd = [];
  const scoperti = [];
  const scopertiObj = []; // posti scoperti da provare a riparare spostando un turno
  const assegnatiRun = new Set(); // 'nome|g' assegnati da QUESTA bozza (spostabili)
  // regole di preferenza lette UNA volta (Si/No) e contatori sul mese
  const regSi = (nome) => {
    const v = _pianoRegolaVal(nome);
    return v == null ? false : String(v).toUpperCase() === 'TRUE';
  };
  const patternLavoro = parseInt(_pianoRegolaVal('pattern_lavoro')) || 99;
  const contaTipo = (n, tipo) => {
    let k = 0;
    for (let d = 1; d <= nGiorni; d++) {
      const tt = _pianoTurnoInfo(cella[n + '|' + d] || '');
      if (tt && tt.tipo === tipo) k++;
    }
    return k;
  };
  const contaDomeniche = (n) => {
    let k = 0;
    for (let d = 1; d <= nGiorni; d++) {
      if (new Date(ym + '-' + String(d).padStart(2, '0') + 'T12:00:00').getDay() !== 0) continue;
      if (_pianoTurnoInfo(cella[n + '|' + d] || '')) k++;
    }
    return k;
  };
  // contatori per le regole di gruppo (limite/minimo funzione per giorno/mese)
  const contaGiornoFz = {}; // gruppo|FZ|g -> n assegnati
  const contaGiornoTot = {}; // gruppo|g -> n assegnati (per accompagnamento)
  const collabMeseFz = {}; // gruppo|FZ -> Set(nomi)
  const registraAssegnazione = (nomeC, codiceT, giorno) => {
    const tt = _pianoTurnoInfo(codiceT);
    if (!tt) return;
    const gr = (tt.gruppo || '').toUpperCase();
    const fzC = (((_pianoCollabInfo(nomeC) || {}).funzione || '') + '').toUpperCase();
    contaGiornoFz[gr + '|' + fzC + '|' + giorno] = (contaGiornoFz[gr + '|' + fzC + '|' + giorno] || 0) + 1;
    contaGiornoTot[gr + '|' + giorno] = (contaGiornoTot[gr + '|' + giorno] || 0) + 1;
    (collabMeseFz[gr + '|' + fzC] = collabMeseFz[gr + '|' + fzC] || new Set()).add(nomeC);
  };
  Object.keys(cella).forEach((k) => {
    const [nomeK, gK] = [k.substring(0, k.lastIndexOf('|')), parseInt(k.substring(k.lastIndexOf('|') + 1))];
    registraAssegnazione(nomeK, cella[k], gK);
  });
  // ===== PRENOTAZIONI PRIMA DEI TURNI =====
  // Come le vacanze: i giorni che spettano si fissano PRIMA di distribuire i
  // turni, altrimenti la bozza li occupa e il diritto salta.
  // 1) COMPLEANNO: congedo C con la nota, per tutti (anche chi lavora in due
  //    settori: la cella e' una sola e si vede in entrambi i piani)
  const compleanni = {}; // nome|g -> true
  const annoBozza = ym.split('-')[0];
  const fabbTot = {}; // g -> posti richiesti (per scegliere i giorni di recupero)
  Object.keys(fabbG).forEach((g) => (fabbTot[g] = fabbG[g].reduce((a, f) => a + (parseInt(f.quantita) || 0), 0)));
  nomi.forEach((n) => {
    const infoN = _pianoCollabInfo(n) || {};
    const md = infoN.data_nascita ? String(infoN.data_nascita).substring(5, 10) : '';
    if (!md || md.substring(0, 2) !== ym.substring(5, 7)) return;
    const g = parseInt(md.substring(3, 5));
    if (!g || g > nGiorni) return;
    compleanni[n + '|' + g] = true;
    const dstrG = ym + '-' + String(g).padStart(2, '0');
    if (giorniChiusi.has(g) || cella[n + '|' + g] || malattie[n + '|' + dstrG]) return;
    cella[n + '|' + g] = 'C';
    nuove.push({
      collaboratore: n,
      data: dstrG,
      codice: 'C',
      protetto: false,
      generato: true,
      commento: 'Compleanno',
      reparto_dip: _pianoReparto(),
    });
  });
  // 2) CGF ARRETRATI: recuperi maturati nei mesi (e nell'anno) precedenti e
  //    non ancora goduti, con la contabilita' unica e le regole cgf_*
  await _pianoCaricaCgfRiporto(annoBozza);
  // solo i mesi PRIMA di questo: il mese si legge dalla griglia, il futuro mai
  const righeCgf = (await _pianoCaricaRigheCgf(annoBozza, da)).filter((r) => !String(r.data).startsWith(ym));
  const nomiCgf = nomi.filter((n) => _pianoMaturaCgf(_pianoCollabInfo(n)));
  const contoCgf = _pianoContabilitaCgf(righeCgf, nomiCgf, annoBozza, da);
  const daCancellareCgf = []; // CGF generati che non spettano piu' (festivo saltato per malattia)
  const festiviCgf = _pianoFestiviCgfSet();
  let nCgfAuto = 0;
  const ctxCgf = {
    ym: ym,
    nGiorni: nGiorni,
    cella: cella,
    malattie: malattie,
    compleanni: compleanni,
    fabbTot: fabbTot,
    chiusi: giorniChiusi,
  };
  const scriviCgf = (n, giorni) => {
    giorni.forEach((g) => {
      nuove.push({
        collaboratore: n,
        data: ym + '-' + String(g).padStart(2, '0'),
        codice: 'CGF',
        protetto: false,
        generato: true,
        reparto_dip: _pianoReparto(),
      });
      nCgfAuto++;
    });
  };
  nomiCgf.forEach((n) => {
    // credito arretrato = resta dei mesi precedenti + festivi gia' nel mese
    // (celle esistenti, non in malattia) - CGF gia' presenti nel mese
    let credito = contoCgf[n].resta;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = cella[n + '|' + g];
      if (!cod) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (festiviCgf.has(dstrG) && _pianoTurnoInfo(cod) && !malattie[n + '|' + dstrG]) credito++;
      if (cod === 'CGF') credito--;
    }
    if (credito > 0) scriviCgf(n, _pianoPiazzaCgf(n, credito, ctxCgf));
    // credito negativo: recuperi automatici dati per un festivo poi saltato
    // (malattia). Si tolgono i CGF generati e non protetti, dall'ultimo
    if (credito < 0) {
      for (let g = nGiorni; g >= 1 && credito < 0; g--) {
        const rg = rigaDi[n + '|' + g];
        if (rg && rg.codice === 'CGF' && rg.generato && !rg.protetto && !giorniChiusi.has(g)) {
          daCancellareCgf.push(rg.id);
          delete cella[n + '|' + g];
          delete rigaDi[n + '|' + g];
          credito++;
        }
      }
    }
  });
  // IDONEITA' DI UN CANDIDATO per il turno f (oggetto con turno_codice) nel
  // giorno g. E' l'unico posto in cui la bozza decide chi puo' fare cosa:
  // lo usano il giro principale e la passata di riparazione (che chiede
  // ignoraOccupato = true per chi ha gia' un turno da spostare, con oreDelta
  // = ore del turno che lascia, negative).
  const candidatoOk = (n, f, t, g, dstr, dowG, ignoraOccupato, oreDelta) => {
    const esistente = cella[n + '|' + g];
    if (malattie[n + '|' + dstr]) return false;
    if (ndDiario[n + '|' + dstr]) return false; // non disponibile (dal Diario)
    if (!ignoraOccupato && esistente && esistente !== 'WD') return false;
    if (esistente === 'WD' && t.tipo === 'NOTTURNO') return false; // WD = diurno forzato
    const infoC = _pianoCollabInfo(n);
    // preferenze collaboratore
    if (infoC && infoC.solo_diurni && t.tipo === 'NOTTURNO') return false;
    if (
      infoC &&
      infoC.turni_bloccati &&
      infoC.turni_bloccati
        .split(',')
        .map((x) => x.trim())
        .includes(f.turno_codice)
    )
      return false;
    // COPERTURA da un altro settore: rispetta i gruppi ammessi e il
    // tetto mensile di turni impostati nella scheda del collaboratore
    const cop = _pianoCoperturaCfg(infoC);
    if (cop && !usaCoperture) return false; // prima il reparto, le coperture in un secondo passaggio
    if (cop) {
      if (cop.gruppi && String(cop.gruppi).toUpperCase() !== (t.gruppo || '').toUpperCase()) return false;
      if (cop.max_turni) {
        let fatti = 0;
        for (let k = 1; k <= nGiorni; k++) {
          const cod = cella[n + '|' + k];
          const tk = cod && _pianoTurniReparto().find((x) => x.codice === cod);
          if (tk) fatti++;
        }
        if (fatti >= cop.max_turni) return false;
      }
    }
    // mappature per funzione (SUP/BO limitati ai loro turni; regole settimana SUP)
    const fz = infoC && infoC.funzione;
    // regole "chi fa cosa" del settore (turni riservati, funzione-turni-giorni)
    if (_pianoViolazioneFunzioneTurno(n, t, dowG, true)) return false;
    // regola HARD no_4w1c1w: niente rientro dopo UN solo giorno di riposo
    // se prima c'erano 4+ giorni di lavoro consecutivi
    if (String(_pianoRegolaVal('no_4w1c1w')).toUpperCase() === 'TRUE') {
      const cp0 = consecPrima(n, g);
      if (cp0 === 0 && !_pianoIsLavoro(cella[n + '|' + (g - 1)] || '')) {
        let streakPrec = 0;
        for (let k = g - 2; k >= 1 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) streakPrec++;
        if (streakPrec >= 4) return false;
      }
    }
    // REGOLE DI GRUPPO (port di eligibility.py Turnivo): i settori
    // assegnati al collaboratore (settori_piano, M2M di Turnivo) sono la
    // fonte di verità; la storia vale solo se i settori non sono configurati
    const gruppoT = (t.gruppo || '').toUpperCase();
    const fzU = (fz || '').toUpperCase();
    const settoriC = _pianoSettoriEffettivi(infoC);
    const haStoria = settoriC ? settoriC.includes(gruppoT) : !!(idoneita[n] && idoneita[n].has(t.gruppo));
    let campoGrant = false;
    for (const rg of _pianoRegoleGruppoDi(gruppoT)) {
      const tipoR = (rg.tipo_regola || '').toLowerCase();
      if (tipoR === 'richiede_funzione') {
        // come in PianoRegole: la funzione ammessa e' un lasciapassare
        const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
        if (ammesse.includes(fzU)) campoGrant = true;
        else if (!haStoria) return false;
      } else if (tipoR === 'blocca_tipo_turno') {
        const tipi = rg.valore.split(',').map((x) => x.trim().toUpperCase());
        if (tipi.includes((t.tipo || '').toUpperCase())) return false;
      } else if (tipoR === 'richiede_campo') {
        if (!_pianoCampoOk(infoC, rg.valore)) return false;
        campoGrant = true;
      } else if (tipoR === 'limite_funzione_giorno') {
        const [fu, nMax] = rg.valore.split(':');
        if (
          fzU === (fu || '').toUpperCase() &&
          (contaGiornoFz[gruppoT + '|' + fzU + '|' + g] || 0) >= (parseInt(nMax) || 99)
        )
          return false;
      } else if (tipoR === 'limite_funzione_mese') {
        const [fu, nMax] = rg.valore.split(':');
        if (fzU === (fu || '').toUpperCase()) {
          const set = collabMeseFz[gruppoT + '|' + fzU];
          if (set && set.size >= (parseInt(nMax) || 99) && !set.has(n)) return false;
        }
      }
    }
    // limiti ore (regole tolleranza_ore/_sopra, jolly_ore_max):
    // nessuno supera il PROPRIO massimo mensile; i jolly senza
    // regola restano liberi di coprire il fabbisogno (come Turnivo)
    {
      const limN = _pianoLimitiOre(n, nGiorni);
      if (limN.max != null) {
        // per chi ha obiettivo il max segue anche il saldo cumulato (YTD)
        const maxEff = limN.obiettivo != null ? limN.max - (_pianoYtdMap[n] || 0) : limN.max;
        if ((oreMese[n] || 0) + (oreDelta || 0) + (parseFloat(t.durata_ore) || 0) > maxEff) return false;
      }
    }
    // accompagnamento: nei gruppi indicati non puo essere il primo/solo
    if (infoC && infoC.accompagnamento_settori) {
      const grAcc = _pianoAccompagnamentoDi(infoC);
      if (grAcc.includes(gruppoT) && !(contaGiornoTot[gruppoT + '|' + g] || 0)) return false;
    }
    // accompagnato SOLO dove copre (spunta nella scheda): stessa regola
    if (cop && cop.accompagnato && !(contaGiornoTot[gruppoT + '|' + g] || 0)) return false;
    const mapp = _pianoMappFunzione(fz);
    if (mapp) {
      const voci = mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO').map((m) => m.turno_codice);
      if (voci.length && !voci.includes(f.turno_codice)) return false;
    } else if (!haStoria && !campoGrant) return false;
    return consecPrima(n, g) < maxCons && riposoOk(n, g, t);
  };
  for (let g = 1; g <= nGiorni; g++) {
    if (giorniChiusi.has(g)) continue; // giorno chiuso: resta com'e'
    (fabbG[g] || []).forEach((f) => {
      const t = _pianoTurnoInfo(f.turno_codice);
      if (!t) return;
      const dstr = ym + '-' + String(g).padStart(2, '0');
      let have = nomi.filter((n) => cella[n + '|' + g] === f.turno_codice).length;
      while (have < f.quantita) {
        const dowG = new Date(dstr + 'T12:00:00').getDay();
        const candidati = nomi
          .filter((n) => candidatoOk(n, f, t, g, dstr, dowG, false, 0))
          .sort((x, y) => {
            const mx = _pianoMappFunzione((_pianoCollabInfo(x) || {}).funzione);
            const my = _pianoMappFunzione((_pianoCollabInfo(y) || {}).funzione);
            const bonus = (m) =>
              m
                ? m.some(
                    (v) => v.turno_codice === f.turno_codice && (v.tipo === 'PRINCIPALE' || v.tipo === 'PREFERITO'),
                  )
                  ? -1
                  : 0
                : 0;
            // Pattern a BLOCCHI (anti-scacchiera): chi ha lavorato ieri continua
            // il blocco (fino a max consecutivi); chi ha riposato UN solo giorno
            // non viene richiamato subito (i riposi vanno a coppie, stile 4L+2R)
            const pattern = (n) => {
              if (cella[n + '|' + g] === 'WD') return -5; // WD = qui DEVE lavorare diurno: priorità massima
              let p = 0;
              const infoP = _pianoCollabInfo(n) || {};
              // REGOLE DI PREFERENZA (scheda Regole): prima erano scritte ma
              // il generatore non le leggeva. Ognuna sposta il punteggio.
              // equilibrio notti / diurni-notturni: chi ne ha fatte meno viene prima
              if (t.tipo === 'NOTTURNO' && regSi('equilibrio_notti')) p += contaTipo(n, 'NOTTURNO') * 0.5;
              if (regSi('equilibrio_diurni_notturni'))
                p += (contaTipo(n, t.tipo) - contaTipo(n, t.tipo === 'NOTTURNO' ? 'DIURNO' : 'NOTTURNO')) * 0.25;
              // notte, un riposo, poi un turno che inizia presto: da evitare
              if (regSi('no_notte_riposo_presto') && _pianoOra(t.ora_inizio) < 10) {
                const t2 = _pianoTurnoInfo(cella[n + '|' + (g - 2)] || '');
                if (t2 && t2.tipo === 'NOTTURNO' && !_pianoIsLavoro(cella[n + '|' + (g - 1)] || '')) p += 4;
              }
              // domeniche: chi ne ha gia' lavorate di piu' nel mese viene dopo
              if (dowG === 0 && _pianoRegolaVal('domeniche_libere_anno') != null) p += contaDomeniche(n) * 1.5;
              // preferisce L1 (2 collaboratrici in produzione Turnivo)
              if (f.turno_codice === 'L1' && infoP.prefers_l1) p -= 1;
              // minimo_funzione_giorno non ancora soddisfatto: privilegia la funzione richiesta
              const grT = (t.gruppo || '').toUpperCase();
              for (const rg of _pianoRegoleGruppoDi(grT)) {
                if ((rg.tipo_regola || '').toLowerCase() !== 'minimo_funzione_giorno') continue;
                const parti = rg.valore.split(':');
                const fu = (parti[0] || '').toUpperCase();
                const nMin = parseInt(parti[1]) || 1;
                const tipoF = (parti[2] || '').toUpperCase();
                const dows = parti[3] ? parti[3].split(',').map((x) => parseInt(x)) : null;
                const dowPy = (dowG + 6) % 7; // JS dom=0 -> Python lun=0
                if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) continue;
                if (dows && !dows.includes(dowPy)) continue;
                if (
                  ((infoP.funzione || '') + '').toUpperCase() === fu &&
                  (contaGiornoFz[grT + '|' + fu + '|' + g] || 0) < nMin
                )
                  p -= 2;
              }
              const cp = consecPrima(n, g);
              // blocchi compatti: chi ha lavorato ieri continua il blocco fino
              // alla lunghezza ideale (pattern_lavoro), poi non oltre
              if (regSi('blocchi_compatti') && cp > 0 && cp < Math.min(maxCons, patternLavoro)) return p - 3;
              // riposo isolato: chi ha riposato UN solo giorno non viene richiamato subito
              if (regSi('penalita_riposo_isolato') && cp === 0 && _pianoIsLavoro(cella[n + '|' + (g - 2)] || ''))
                return p + 2;
              return p;
            };
            const jx = (_pianoCollabInfo(x) || {}).is_jolly ? 1 : 0;
            const jy = (_pianoCollabInfo(y) || {}).is_jolly ? 1 : 0;
            // chi COPRE da un altro settore va usato solo se il settore non ha
            // nessun altro disponibile: cosi' l'ordine di generazione dei piani
            // non toglie una persona al suo reparto d'origine
            const cx = _pianoCoperturaCfg(_pianoCollabInfo(x)) ? 1 : 0;
            const cy = _pianoCoperturaCfg(_pianoCollabInfo(y)) ? 1 : 0;
            return (
              cx - cy ||
              pattern(x) - pattern(y) ||
              bonus(mx) - bonus(my) ||
              gapOre(y) - gapOre(x) || // chi è più lontano dal proprio obiettivo ore viene prima
              jx - jy || // a parità di gap, i fissi prima dei jolly
              (familiarita[y + '|' + f.turno_codice] || 0) - (familiarita[x + '|' + f.turno_codice] || 0)
            );
          });
        if (!candidati.length) {
          scoperti.push(f.turno_codice + ' giorno ' + g);
          scopertiObj.push({ codice: f.turno_codice, t: t, g: g, dstr: dstr, dowG: dowG });
          break;
        }
        const scelto = candidati[0];
        const eraWd = cella[scelto + '|' + g] === 'WD';
        cella[scelto + '|' + g] = f.turno_codice;
        assegnatiRun.add(scelto + '|' + g);
        registraAssegnazione(scelto, f.turno_codice, g);
        oreMese[scelto] = (oreMese[scelto] || 0) + (parseFloat(t.durata_ore) || 0);
        if (eraWd && rigaDi[scelto + '|' + g]) {
          sostituzioniWd.push({ id: rigaDi[scelto + '|' + g].id, codice: f.turno_codice });
        } else {
          nuove.push({
            collaboratore: scelto,
            data: dstr,
            codice: f.turno_codice,
            protetto: false,
            generato: true,
            reparto_dip: _pianoReparto(),
          });
        }
        have++;
      }
    });
  }
  // ===== PASSATA DI RIPARAZIONE =====
  // Il giro principale decide un giorno alla volta e non torna indietro: un
  // posto resta scoperto anche quando basterebbe spostare un turno. Qui, per
  // ogni scoperto, si cerca A (assegnato da questa bozza nello stesso giorno,
  // idoneo al turno scoperto) e B (libero quel giorno, idoneo al turno di A):
  // A passa al turno scoperto, B prende il turno di A. Tutte le regole
  // valgono per entrambi. Niente catene piu' lunghe: restano scoperti.
  let riparati = 0;
  const scopertiRestanti = [];
  scopertiObj.forEach((sc) => {
    let fatto = false;
    for (const a of nomi) {
      if (fatto) break;
      const kA = a + '|' + sc.g;
      if (!assegnatiRun.has(kA)) continue;
      const codA = cella[kA];
      const tA = _pianoTurnoInfo(codA);
      if (!tA || codA === sc.codice) continue;
      const durA = parseFloat(tA.durata_ore) || 0;
      if (!candidatoOk(a, { turno_codice: sc.codice }, sc.t, sc.g, sc.dstr, sc.dowG, true, -durA)) continue;
      for (const b of nomi) {
        if (b === a || cella[b + '|' + sc.g]) continue;
        if (!candidatoOk(b, { turno_codice: codA }, tA, sc.g, sc.dstr, sc.dowG, false, 0)) continue;
        // A: dal turno codA al turno scoperto
        cella[kA] = sc.codice;
        const nA = nuove.find((x) => x.collaboratore === a && x.data === sc.dstr);
        if (nA) nA.codice = sc.codice;
        else {
          const sw = rigaDi[kA] && sostituzioniWd.find((x) => x.id === rigaDi[kA].id);
          if (sw) sw.codice = sc.codice;
        }
        const grA = (tA.gruppo || '').toUpperCase();
        const fzA = (((_pianoCollabInfo(a) || {}).funzione || '') + '').toUpperCase();
        contaGiornoFz[grA + '|' + fzA + '|' + sc.g] = Math.max(
          0,
          (contaGiornoFz[grA + '|' + fzA + '|' + sc.g] || 0) - 1,
        );
        contaGiornoTot[grA + '|' + sc.g] = Math.max(0, (contaGiornoTot[grA + '|' + sc.g] || 0) - 1);
        registraAssegnazione(a, sc.codice, sc.g);
        oreMese[a] = (oreMese[a] || 0) - durA + (parseFloat(sc.t.durata_ore) || 0);
        // B: prende il turno lasciato da A
        cella[b + '|' + sc.g] = codA;
        assegnatiRun.add(b + '|' + sc.g);
        registraAssegnazione(b, codA, sc.g);
        oreMese[b] = (oreMese[b] || 0) + durA;
        nuove.push({
          collaboratore: b,
          data: sc.dstr,
          codice: codA,
          protetto: false,
          generato: true,
          reparto_dip: _pianoReparto(),
        });
        riparati++;
        fatto = true;
        break;
      }
    }
    if (!fatto) scopertiRestanti.push(sc.codice + ' giorno ' + sc.g);
  });
  scoperti.length = 0;
  scopertiRestanti.forEach((x) => scoperti.push(x));
  // ===== CGF DEI FESTIVI LAVORATI IN QUESTO MESE =====
  // Chi ha appena ricevuto un turno in un festivo con diritto matura un
  // recupero: si mette nei giorni DOPO il festivo, con le stesse regole.
  nomiCgf.forEach((n) => {
    const festiviLav = [];
    let cgfMese = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = cella[n + '|' + g];
      if (!cod) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (festiviCgf.has(dstrG) && _pianoTurnoInfo(cod) && !malattie[n + '|' + dstrG]) festiviLav.push(g);
      if (cod === 'CGF') cgfMese++;
    }
    // quanti restano da dare per il mese: festivi del mese + resta precedente - CGF gia' nel mese
    const dovuti = contoCgf[n].resta + festiviLav.length - cgfMese;
    if (dovuti <= 0) return;
    const preferiti = [];
    festiviLav.forEach((g) => {
      for (let k = g + 1; k <= Math.min(nGiorni, g + 10); k++) preferiti.push(k);
    });
    scriviCgf(n, _pianoPiazzaCgf(n, dovuti, Object.assign({}, ctxCgf, { preferiti: preferiti })));
  });

  // RIEMPIMENTO C: come nei piani fatti a mano, nessuna cella resta vuota ·
  // ogni giorno senza turno/assenza riceve C (congedo, 0 ore, rigenerabile)
  let nCongedi = 0;
  nomi.forEach((n) => {
    const infoN = _pianoCollabInfo(n) || {};
    if (String(infoN.reparti_extra || '').trim()) return; // multi-reparto: niente C automatiche
    for (let g = 1; g <= nGiorni; g++) {
      if (giorniChiusi.has(g)) continue;
      if (cella[n + '|' + g]) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (malattie[n + '|' + dstrG]) continue;
      cella[n + '|' + g] = 'C';
      // COMPLEANNO: il congedo di quel giorno porta la nota, cosi' si vede
      // subito nel piano e nel briefing (la data di nascita e' in scheda)
      const _dnMD = infoN.data_nascita ? String(infoN.data_nascita).substring(5, 10) : '';
      nuove.push({
        collaboratore: n,
        data: dstrG,
        codice: 'C',
        protetto: false,
        generato: true,
        commento: _dnMD && _dnMD === dstrG.substring(5, 10) ? 'Compleanno' : null,
        reparto_dip: _pianoReparto(),
      });
      nCongedi++;
    }
  });
  if (!nuove.length && !sostituzioniWd.length) {
    toast(
      'Niente da generare: fabbisogni già coperti' +
        (scoperti.length ? ' (' + scoperti.length + ' scoperti senza candidati)' : ''),
    );
    renderPiano();
    return;
  }
  if (
    !confirm(
      'Genera bozza per ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        '):\n\n• ' +
        (nuove.length + sostituzioniWd.length - nCgfAuto - nCongedi) +
        ' turni da assegnare' +
        (nCgfAuto ? '\n• ' + nCgfAuto + ' CGF automatici (compensazione festivi lavorati)' : '') +
        (daCancellareCgf.length
          ? '\n• ' + daCancellareCgf.length + ' CGF automatici tolti (festivo non lavorato)'
          : '') +
        (nCongedi ? '\n• ' + nCongedi + ' congedi C di riempimento (giorni senza turno)' : '') +
        '\n• ' +
        scoperti.length +
        ' posti senza candidato idoneo' +
        (riparati ? ' (altri ' + riparati + ' risolti spostando un turno)' : '') +
        '\n\nLe celle esistenti (vacanze, protette, malattie) NON vengono toccate.\nLa bozza si può eliminare con "Cancella piano". Procedere?',
    )
  ) {
    // Le C di riempimento e le vacanze sono gia' state riscritte per poter
    // calcolare la bozza: chi rinuncia deve ritrovare il mese com'era.
    await _pianoRipristinaUltimoSnapshot("Bozza annullata: il mese e' tornato com'era");
    return;
  }
  try {
    for (const idC of daCancellareCgf) await secDel('piano', 'id=eq.' + idC);
    let inseriteTot = 0;
    for (let i = 0; i < nuove.length; i += 2500) {
      const r2 = await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove.slice(i, i + 2500) });
      inseriteTot += (r2 && r2.inserite) || 0;
    }
    const r = { inserite: inseriteTot };
    if (nuove.length && !inseriteTot) throw new Error('nessuna cella scritta dal database');
    for (const sw of sostituzioniWd) {
      await secPatch('piano', 'id=eq.' + sw.id, {
        codice: sw.codice,
        protetto: false,
        generato: true,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    }
    logAzione('Piano: bozza generata', ym + ' · ' + nuove.length + ' turni, ' + scoperti.length + ' scoperti');
    toast(
      'Bozza generata: ' +
        r.inserite +
        ' celle scritte' +
        (r.inserite < nuove.length ? ' su ' + nuove.length + " (le altre esistevano gia')" : '') +
        (scoperti.length ? ' · ' + scoperti.length + ' scoperti' : ''),
    );
    _pianoViolLista = null;
    _pianoViolCelle = {};
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore generazione bozza');
  }
}

async function cancellaBozzaPiano() {
  // IDENTICO a Turnivo (cancella_piano): elimina le celle NON protette del mese;
  // opzione "cancella tutto" per includere anche le protette.
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const nonProtette = _pianoRighe.filter((r) => !r.protetto).length;
  const protette = _pianoRighe.length - nonProtette;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cancella piano · ' +
    ym +
    '</h3><p style="margin-bottom:14px;font-size:.88rem">' +
    nonProtette +
    ' celle generate/non protette, ' +
    protette +
    ' protette (manuali/vacanze).</p>' +
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" onclick="eseguiCancellaPiano(false)">Solo non protette (' +
    nonProtette +
    ')</button>' +
    (isAdmin()
      ? '<button class="btn-modal-ok" style="background:var(--accent)" onclick="eseguiCancellaPiano(true)">TUTTE (' +
        _pianoRighe.length +
        ')</button>'
      : '') +
    '</div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCancellaPiano(tutto) {
  // cancellare ANCHE le celle protette (piano reale) e' riservato all'admin
  if (tutto && !isAdmin()) return;
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const mie = _pianoRighe.filter((r) => (r.reparto_dip || 'slots') === _pianoReparto()); // non le celle degli altri settori
  const n = tutto ? mie.length : mie.filter((r) => !r.protetto).length;
  if (!n) {
    toast('Niente da cancellare');
    return;
  }
  if (
    tutto &&
    !confirm('ATTENZIONE: verranno eliminate ANCHE le celle protette (vacanze, inserimenti manuali). Confermi?')
  )
    return;
  _pianoUndoSnap('cancella piano ' + _pianoMeseSel + (tutto ? ' (tutto)' : ''));
  try {
    await secDel(
      'piano',
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + (tutto ? '' : '&protetto=eq.false'),
    );
    logAzione('Piano: cancellato', ym + ' · ' + n + ' celle (tutto=' + tutto + ')');
    toast('Piano cancellato: ' + n + ' celle rimosse');
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}
