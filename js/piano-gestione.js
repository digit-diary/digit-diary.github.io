/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-gestione.js
 * PIANO · benessere e domeniche, settore, festivi automatici, recupero ore, festivita e chiusure, CGF (RAP 4.3), congedi non pagati
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// DOMENICHE LIBERE DELL'ANNO · come il foglio DOMENICHE del piano Excel
//
// Ogni collaboratore ha diritto a 12 domeniche libere all'anno (OLL2 art. 24,
// regola domeniche_libere_anno). Qui si conta, mese per mese, quante ne ha
// GIA' avute e quante ne restano da dare: quando per mancanza di personale si
// mette al lavoro qualcuno in una domenica, il conto scende e si vede subito
// a chi bisogna restituirla nei mesi che rimangono.
//
// Una domenica conta come libera se non c'e' un turno; la vacanza (V) NON
// conta tra le 12, e se la regola del sabato e' accesa non conta nemmeno la
// domenica il cui sabato finisce oltre le 23 (LL art. 18). Sono gli stessi
// criteri del validatore del mese: un conto solo, in tutto il programma.
// ================================================================
async function pianoCaricaDomenicheAnno() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const el = document.getElementById('piano-domeniche-body');
  if (el) el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Conto le domeniche dell anno...</p>';
  const rep = _pianoReparto();
  const righe =
    (await secGet(
      'piano?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&reparto_dip=eq.' + rep + '&limit=40000',
    )) || [];
  const perGiorno = {}; // 'nome|data' -> codice
  const mesiConPiano = {};
  const mesiPersona = {}; // 'nome|MM' -> true: la persona ha celle in quel mese
  righe.forEach((r) => {
    perGiorno[r.collaboratore + '|' + r.data] = r.codice;
    mesiConPiano[String(r.data).substring(5, 7)] = true;
    mesiPersona[r.collaboratore + '|' + String(r.data).substring(5, 7)] = true;
  });
  window._pianoDomenicheDati = {
    anno: anno,
    perGiorno: perGiorno,
    mesiConPiano: mesiConPiano,
    mesiPersona: mesiPersona,
  };
  _renderPianoDomenicheBody();
}
function _renderPianoDomenicheBody() {
  const el = document.getElementById('piano-domeniche-body');
  const dati = window._pianoDomenicheDati;
  if (!el || !dati) return;
  const anno = dati.anno;
  const diritto = parseInt(_pianoRegolaVal('domeniche_libere_anno')) || 12;
  const chkSab = _pianoRegolaVal('turno_prima_domenica_libera') === 'TRUE';
  const oggiStr = _pianoOggiStr();
  // tutte le domeniche dell'anno, divise per mese
  const domMese = {}; // 'MM' -> [dstr...]
  const d = new Date(anno, 0, 1, 12);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === anno) {
    const dstr = anno + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const mm = dstr.substring(5, 7);
    (domMese[mm] = domMese[mm] || []).push(dstr);
    d.setDate(d.getDate() + 7);
  }
  const ordSalv = (window._pianoOrdineCollab || {})[_pianoReparto()] || [];
  const pos = {};
  ordSalv.forEach((n, i) => (pos[n] = i));
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome)
    .sort((x, y) => (pos[x] != null ? pos[x] : 9999) - (pos[y] != null ? pos[y] : 9999) || x.localeCompare(y));
  // domeniche future ancora disponibili (nei mesi con o senza piano): serve a
  // capire se le restanti si POSSONO ancora dare
  let domFuture = 0;
  Object.keys(domMese).forEach((mm) => domMese[mm].forEach((dstr) => dstr > oggiStr && domFuture++));
  let h =
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Diritto: ' +
    diritto +
    ' domeniche libere all anno (regola "domeniche_libere_anno"). Vacanza e malattia non contano ne\' tra le libere ne\' tra le lavorate (stesso criterio del validatore e di Benessere)' +
    (chkSab ? '; il sabato deve finire entro le 23, come nel validatore' : '') +
    '. Nei mesi senza piano non si conta nulla. Rosso = le domeniche rimaste nell anno non bastano piu per arrivare al diritto: da li in poi vanno restituite per prime.</p>';
  h +=
    '<div style="overflow:auto;max-height:66vh"><table id="piano-domeniche-table" class="piano-table piano-fisse3" style="min-width:1050px;font-size:.8rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Fun</th><th>%</th>';
  for (let m = 1; m <= 12; m++) h += '<th title="Domeniche libere nel mese">' + (MESI[m - 1] || m) + '</th>';
  h +=
    '<th title="Domeniche libere gia avute nei mesi pianificati">Libere</th><th title="Domeniche con un turno">Lavorate</th><th>Diritto</th><th title="Quante ne mancano al diritto">Restano</th></tr></thead><tbody>';
  let scritte = 0;
  nomi.forEach((nome) => {
    const info = _pianoCollabInfo(nome) || {};
    let libere = 0;
    let lavorate = 0;
    let visto = false;
    let cols = '';
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      // un assunto a giugno non ha domeniche "libere" da gennaio a maggio:
      // il mese conta solo se questa persona ha un piano in quel mese
      if (!dati.mesiConPiano[mm] || !(dati.mesiPersona || {})[nome + '|' + mm]) {
        cols += '<td style="color:var(--line)"></td>';
        continue;
      }
      let lib = 0;
      let lav = 0;
      (domMese[mm] || []).forEach((dstr) => {
        const cod = perG(nome, dstr);
        if (cod && _pianoTurnoInfo(cod)) {
          lav++;
          return;
        }
        if (_pianoDomenicaEsclusa(cod)) return; // vacanza o malattia: non conta tra le 12
        if (chkSab) {
          const prima = new Date(dstr + 'T12:00:00');
          prima.setDate(prima.getDate() - 1);
          const sab =
            prima.getFullYear() +
            '-' +
            String(prima.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(prima.getDate()).padStart(2, '0');
          if (!_pianoSabatoEntro23(perG(nome, sab))) return;
        }
        lib++;
      });
      libere += lib;
      lavorate += lav;
      visto = true;
      cols +=
        '<td style="color:' +
        (lib ? '#2c6e49' : lav ? '#c0392b' : 'var(--muted)') +
        (lav && !lib ? ';font-weight:700' : '') +
        '" title="' +
        lib +
        ' libere' +
        (lav ? ', ' + lav + ' lavorate' : '') +
        '">' +
        (lib || (lav ? '0' : '')) +
        '</td>';
    }
    function perG(n, dstr) {
      return dati.perGiorno[n + '|' + dstr] || null;
    }
    if (!visto) return;
    scritte++;
    const restano = Math.max(0, diritto - libere);
    // le restanti si possono ancora dare? confronto con le domeniche future
    const critico = restano > domFuture;
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(nome) +
      '</td><td>' +
      escP(info.is_jolly ? 'JOLLY' : info.funzione || '') +
      '</td><td>' +
      (info.is_jolly ? '-' : Math.round((parseFloat(info.percentuale) || 1) * 100) + '%') +
      '</td>' +
      cols +
      '<td style="font-weight:700;color:' +
      (libere >= diritto ? '#2c6e49' : '#8b6914') +
      '">' +
      libere +
      '</td><td style="color:' +
      (lavorate ? '#c0392b' : 'var(--muted)') +
      '">' +
      (lavorate || '') +
      '</td><td>' +
      diritto +
      '</td><td style="font-weight:700;color:' +
      (restano === 0 ? '#2c6e49' : critico ? '#c0392b' : '#8b6914') +
      '"' +
      (critico
        ? ' title="Restano ' + restano + ' da dare ma nell anno ci sono solo ' + domFuture + ' domeniche future"'
        : '') +
      '>' +
      restano +
      (critico ? ' !' : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  if (!scritte) h = '<p style="color:var(--muted);font-size:.85rem">Nessun mese pianificato per il ' + anno + '.</p>';
  el.innerHTML = h;
}
function _renderPianoDomenicheCard() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Domeniche libere ' +
    anno +
    ' · ' +
    escP(repartoLabel(_pianoReparto())) +
    '<input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-domeniche-table\')">' +
    '<button class="btn-export" style="font-size:.8rem;padding:4px 12px" onclick="pianoCaricaDomenicheAnno()">Ricalcola</button>' +
    '</div><div style="padding:10px 14px" id="piano-domeniche-body"><p style="color:var(--muted);font-size:.85rem">Caricamento...</p></div></div>'
  );
}
function _renderPianoBenessereCard() {
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px">Benessere · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' ' +
    escP(_pianoMeseSel.split('-')[0]) +
    '<button class="btn-act pin" onclick="pianoBenessereAnno(-1)">&larr;</button><button class="btn-act pin" onclick="pianoBenessereAnno(1)">&rarr;</button>' +
    '<input type="text" id="benessere-cerca" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoBenessereFiltra(this.value)">' +
    '</div><div style="padding:10px 14px" id="piano-benessere-body"><p style="color:var(--muted);font-size:.85rem">Caricamento...</p></div></div>'
  );
}
function pianoBenessereAnno(d) {
  window._pianoBenessereAnno = (window._pianoBenessereAnno || parseInt(_pianoMeseSel.split('-')[0])) + d;
  caricaBenesserePiano();
}
async function caricaBenesserePiano() {
  const el = document.getElementById('piano-benessere-body');
  if (!el) return;
  const anno = window._pianoBenessereAnno || parseInt(_pianoMeseSel.split('-')[0]);
  el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Calcolo del ' + anno + ' in corso...</p>';
  try {
    const righe =
      (await secGet(
        'piano?data=gte.' +
          anno +
          '-01-01&data=lte.' +
          anno +
          '-12-31&reparto_dip=eq.' +
          _pianoReparto() +
          '&limit=40000',
      )) || [];
    const nomi = collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && c.funzione !== 'RESP')
      .map((c) => c.nome);
    // dati per persona
    const per = {};
    nomi.forEach((n) => (per[n] = { giorni: {}, lav: 0, notti: 0, we: 0, vac: 0, mal: 0, domLib: 0, oreLav: 0 }));
    righe.forEach((r) => {
      const p = per[r.collaboratore];
      if (!p) return;
      p.giorni[r.data] = r.codice;
    });
    const domeniche = {};
    for (let m = 0; m < 12; m++) {
      const ultimo = new Date(anno, m + 1, 0).getDate();
      for (let g = 1; g <= ultimo; g++) {
        const d = new Date(anno, m, g);
        if (d.getDay() === 0)
          domeniche[
            d.getFullYear() +
              '-' +
              String(d.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(d.getDate()).padStart(2, '0')
          ] = true;
      }
    }
    // PERIODO CONSIDERATO: solo i MESI CON PIANO COMPLETO (tutti i giorni del
    // mese hanno una cella), anche se sono nel futuro. Un mese a meta' o non
    // ancora pianificato falserebbe medie e conteggi, quindi resta fuori.
    const giorniDelMese = {};
    for (let m = 1; m <= 12; m++) {
      const ym = anno + '-' + String(m).padStart(2, '0');
      giorniDelMese[ym] = new Date(anno, m, 0).getDate();
    }
    nomi.forEach((n) => {
      const p = per[n];
      const date = Object.keys(p.giorni).sort();
      // mesi completi di questa persona
      const perMese = {};
      date.forEach((d) => {
        const ym = d.substring(0, 7);
        perMese[ym] = (perMese[ym] || 0) + 1;
      });
      const mesiOk = new Set(Object.keys(perMese).filter((ym) => perMese[ym] >= giorniDelMese[ym]));
      p.mesiPiano = mesiOk.size;
      p.mesiElenco = [...mesiOk].sort();
      let serie = 0;
      p.serieMax = 0;
      p.riposiIsolati = 0;
      date.forEach((d, i) => {
        if (!mesiOk.has(d.substring(0, 7))) return; // mese non completo: fuori
        const cod = p.giorni[d];
        const t = _pianoTurnoInfo(cod);
        if (t) {
          p.lav++;
          p.oreLav += _pianoOreEffettiveTurno(t, { codice: cod, data: d });
          if (t.tipo === 'NOTTURNO') p.notti++;
          const dow = new Date(d + 'T12:00:00').getDay();
          if (dow === 0 || dow === 6) p.we++;
          if (dow === 0) p.domLav = (p.domLav || 0) + 1;
          serie++;
          if (serie > p.serieMax) p.serieMax = serie;
        } else {
          serie = 0;
          if (cod === 'V') p.vac++;
          if (cod === 'M' || cod === 'M1') p.mal++;
          const prima = _pianoTurnoInfo(p.giorni[date[i - 1]]);
          const dopo = _pianoTurnoInfo(p.giorni[date[i + 1]]);
          const cs = _pianoCodiceInfo(cod);
          if (cs && cs.is_riposo && prima && dopo) p.riposiIsolati++;
        }
      });
      // DOMENICHE LIBERE nei soli mesi completi. Vale la regola LL art. 18: la
      // domenica libera conta solo se il sabato prima si finisce entro le 23.
      p.domTot = 0;
      p.domTardi = 0;
      Object.keys(domeniche).forEach((d) => {
        if (!mesiOk.has(d.substring(0, 7))) return;
        const cod = p.giorni[d];
        // Una domenica passata in VACANZA (o in malattia) non e' un riposo
        // settimanale: non conta ne' come libera ne' nel totale.
        if (_pianoDomenicaEsclusa(cod)) {
          p.domAssenza = (p.domAssenza || 0) + 1;
          return;
        }
        p.domTot++;
        if (_pianoTurnoInfo(cod)) return; // domenica lavorata
        const sab = new Date(d + 'T12:00:00');
        sab.setDate(sab.getDate() - 1);
        const isoSab =
          sab.getFullYear() +
          '-' +
          String(sab.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(sab.getDate()).padStart(2, '0');
        if (!_pianoSabatoEntro23(p.giorni[isoSab])) {
          p.domTardi++;
          return;
        }
        p.domLib++;
      });
    });
    const conPiano = nomi.filter((n) => per[n].lav > 0);
    const mediaWe = conPiano.length ? conPiano.reduce((s, n) => s + per[n].we, 0) / conPiano.length : 0;
    const soglie = {
      domenicheAnno: parseInt(_pianoRegolaVal('domeniche_libere_anno')) || 12,
      maxConsecutivi: parseInt(_pianoRegolaVal('max_consecutivi')) || 5,
      vacanzeAnno: parseInt(_pianoRegolaVal('vacanze_giorni_anno')) || 20,
    };
    const calcolati = conPiano
      .map((n) => {
        const p = per[n];
        const info = _pianoCollabInfo(n) || {};
        const res = PianoRegole.indiceBenessere(
          {
            domenicheLibere: p.domLib,
            weekendLavorati: p.we,
            weekendMediaSettore: mediaWe,
            notti: p.notti,
            giorniLavorati: p.lav,
            riposiIsolati: p.riposiIsolati,
            serieMax: p.serieMax,
            vacanzeGiorni: p.vac,
          },
          soglie,
        );
        return { nome: n, jolly: !!(info.is_jolly || info.impiego === 'jolly'), p: p, res: res };
      })
      .sort((a, b) => {
        const so = window._benessereSort;
        if (!so) return a.res.punteggio - b.res.punteggio; // default: prima i piu critici
        const val = (x) =>
          so.campo === 'nome' ? x.nome : so.campo === 'indice' ? x.res.punteggio : x.p[so.campo] || 0;
        const va = val(a);
        const vb = val(b);
        if (typeof va === 'string') return so.dir * va.localeCompare(vb);
        return so.dir * (va - vb);
      });
    if (!calcolati.length) {
      el.innerHTML = '<p style="font-size:.85rem">Nessun piano nel ' + anno + ' per questo settore.</p>';
      return;
    }
    const colore = (v) => (v >= 75 ? '#2c6e49' : v >= 55 ? '#b8860b' : '#c0392b');
    const etichetta = (v) => (v >= 75 ? 'buono' : v >= 55 ? "da tenere d'occhio" : 'critico');
    const tabella = (lista, titolo) => {
      if (!lista.length) return '';
      const media = Math.round(lista.reduce((s, x) => s + x.res.punteggio, 0) / lista.length);
      let t =
        '<p style="font-size:.85rem;font-weight:700;margin:14px 0 6px">' +
        titolo +
        ' <span style="font-weight:400;color:var(--muted)">· ' +
        lista.length +
        ' persone, media ' +
        '<b style="color:' +
        colore(media) +
        '">' +
        media +
        '/100</b></span></p>';
      const thOrd = (campo, testo, tip) =>
        '<th style="cursor:pointer" title="' +
        (tip || '') +
        ' · clicca per ordinare" onclick="pianoBenessereOrdina(\'' +
        campo +
        '\')">' +
        testo +
        (window._benessereSort && window._benessereSort.campo === campo
          ? window._benessereSort.dir > 0
            ? ' &#9650;'
            : ' &#9660;'
          : '') +
        '</th>';
      t +=
        '<div style="overflow-x:auto"><table class="piano-table benessere-tab" style="min-width:860px;font-size:.95rem"><thead><tr>' +
        '<th style="text-align:left;cursor:pointer" onclick="pianoBenessereOrdina(\'nome\')">Collaboratore' +
        (window._benessereSort && window._benessereSort.campo === 'nome'
          ? window._benessereSort.dir > 0
            ? ' &#9650;'
            : ' &#9660;'
          : '') +
        '</th>' +
        thOrd('indice', 'Indice', 'Punteggio complessivo, 100 = carico ben distribuito') +
        thOrd('domLib', 'Dom. libere', 'Domeniche libere gia trascorse quest anno') +
        thOrd('domLav', 'Dom. lavorate', 'Domeniche in cui ha lavorato') +
        thOrd('we', 'Weekend', 'Sabati e domeniche lavorati (giornate, non fine settimana interi)') +
        thOrd('notti', 'Notti', 'Turni notturni') +
        thOrd('riposiIsolati', 'Riposi isolati', 'Riposi di un solo giorno tra due periodi di lavoro') +
        thOrd('serieMax', 'Serie max', 'Serie piu lunga di giorni consecutivi') +
        thOrd('vac', 'Vacanze', 'Giorni di vacanza goduti') +
        thOrd('mal', 'Malattie', 'Giorni di malattia: segnale da leggere, non tolgono punti') +
        thOrd('oreLav', 'Ore lavorate', 'Ore effettivamente lavorate nell anno') +
        '</tr></thead><tbody>';
      lista.forEach((x) => {
        t +=
          '<tr title="' +
          escP(x.res.voci.map((v) => v.nome + ': ' + v.punti + '/' + v.max + ' (' + v.valore + ')').join(' · ')) +
          '" data-nome="' +
          escP(x.nome) +
          '"><td style="text-align:left;font-weight:600">' +
          escP(x.nome) +
          '</td><td style="min-width:120px"><div style="display:flex;align-items:center;gap:6px">' +
          '<div style="flex:1;height:7px;background:var(--line);border-radius:4px;overflow:hidden"><div style="width:' +
          x.res.punteggio +
          '%;height:100%;background:' +
          colore(x.res.punteggio) +
          '"></div></div><b style="color:' +
          colore(x.res.punteggio) +
          '">' +
          x.res.punteggio +
          '</b></div><div style="font-size:.8rem;color:var(--muted);text-align:center">' +
          etichetta(x.res.punteggio) +
          '</div></td><td title="' +
          x.p.domLib +
          ' libere su ' +
          (x.p.domTot || 0) +
          ' domeniche nei mesi con piano completo (' +
          (x.p.mesiPiano || 0) +
          ' mesi)' +
          (x.p.domTardi ? ' · ' + x.p.domTardi + ' non valide: il sabato si finisce dopo le 23' : '') +
          (x.p.domAssenza ? ' · ' + x.p.domAssenza + ' escluse perche in vacanza o malattia' : '') +
          '">' +
          x.p.domLib +
          '<span style="font-weight:400;color:var(--muted);font-size:.85rem">/' +
          (x.p.domTot || 0) +
          '</span></td><td>' +
          (x.p.domLav || 0) +
          '</td><td>' +
          x.p.we +
          '</td><td>' +
          x.p.notti +
          '</td><td' +
          (x.p.riposiIsolati > 2 ? ' style="color:#c0392b;font-weight:700"' : '') +
          '>' +
          x.p.riposiIsolati +
          '</td><td' +
          (x.p.serieMax > soglie.maxConsecutivi ? ' style="color:#c0392b;font-weight:700"' : '') +
          '>' +
          x.p.serieMax +
          '</td><td>' +
          x.p.vac +
          '</td><td' +
          (x.p.mal > 20 ? ' style="color:#b8860b;font-weight:700"' : '') +
          '>' +
          x.p.mal +
          '</td><td>' +
          Math.round(x.p.oreLav) +
          'h</td></tr>';
      });
      t += '</tbody></table></div>';
      return t;
    };
    let h =
      '<p style="font-size:.88rem;color:var(--muted);margin-bottom:6px">' +
      _benesserePeriodoLbl(calcolati, anno) +
      ' ' +
      ', su dati del piano. L indice va da 0 a 100 e pesa: domeniche libere (25), equita nei weekend (20), carico notturno (15), qualita del riposo (15), giorni consecutivi (15), vacanze godute (10). ' +
      'Le <b>malattie non tolgono punti</b>: sono un segnale da leggere insieme al resto, non una colpa. Passa il mouse su una riga per il dettaglio dei punti.</p>';
    h += '<div style="margin:8px 0 10px;max-width:720px"><canvas id="benessere-chart" height="150"></canvas></div>';
    h += tabella(
      calcolati.filter((x) => !x.jolly),
      'Personale fisso',
    );
    h += tabella(
      calcolati.filter((x) => x.jolly),
      'Personale ausiliario (jolly)',
    );
    const critici = calcolati.filter((x) => x.res.punteggio < 55);
    if (critici.length)
      h +=
        '<p style="font-size:.85rem;margin-top:12px;padding:8px 10px;background:#fdecea;border-left:3px solid #c0392b;border-radius:2px"><b>Da guardare per primi:</b> ' +
        escP(critici.map((x) => x.nome.split(' ')[0] + ' (' + x.res.punteggio + ')').join(', ')) +
        '</p>';
    el.innerHTML = h;
    if (typeof Chart !== 'undefined' && document.getElementById('benessere-chart')) {
      // Grafico compatto: la MEDIA di ogni indicatore, in percentuale del suo
      // massimo, confrontando personale fisso e ausiliari. Dice a colpo d'occhio
      // dove il settore e' solido e dove no, senza una barra per ogni persona.
      const medieDi = (lista) => {
        if (!lista.length) return null;
        const n = lista[0].res.voci.length;
        const out = [];
        for (let k = 0; k < n; k++) {
          const somma = lista.reduce((sm, x) => sm + x.res.voci[k].punti, 0);
          out.push(Math.round((somma / lista.length / lista[0].res.voci[k].max) * 100));
        }
        return out;
      };
      const fissi = calcolati.filter((x) => !x.jolly);
      const jolly = calcolati.filter((x) => x.jolly);
      const etichette = calcolati[0].res.voci.map((v) => v.nome);
      const dataset = [];
      const mf = medieDi(fissi);
      const mj = medieDi(jolly);
      if (mf)
        dataset.push({ label: 'Fissi (' + fissi.length + ')', data: mf, backgroundColor: '#1a4a7a', borderRadius: 3 });
      if (mj)
        dataset.push({
          label: 'Ausiliari (' + jolly.length + ')',
          data: mj,
          backgroundColor: '#b8860b',
          borderRadius: 3,
        });
      renderChart(
        'benessere-chart',
        'bar',
        { labels: etichette, datasets: dataset },
        {
          plugins: {
            legend: { position: 'top', labels: { font: { size: 12 }, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + c.parsed.y + '% del massimo' } },
          },
          scales: {
            y: { min: 0, max: 100, ticks: { stepSize: 25, font: { size: 11 }, callback: (v) => v + '%' } },
            x: { ticks: { font: { size: 11 } } },
          },
        },
      );
    }
  } catch (e) {
    console.error(e);
    el.innerHTML =
      '<p style="color:var(--accent);font-size:.85rem">Errore nel calcolo: ' + escP(e.message || '') + '</p>';
  }
}
// Etichetta del periodo davvero considerato: solo i mesi con piano completo
function _benesserePeriodoLbl(calcolati, anno) {
  const MESI_N = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre',
  ];
  const tutti = new Set();
  calcolati.forEach((x) => (x.p.mesiElenco || []).forEach((m) => tutti.add(m)));
  const lista = [...tutti].sort();
  if (!lista.length) return '<b>Nessun mese con piano completo nel ' + anno + '.</b>';
  const nome = (ym) => MESI_N[parseInt(ym.split('-')[1]) - 1];
  const periodo = lista.length === 1 ? nome(lista[0]) : 'da ' + nome(lista[0]) + ' a ' + nome(lista[lista.length - 1]);
  return (
    '<b>Periodo considerato: ' +
    periodo +
    ' ' +
    anno +
    '</b> (' +
    lista.length +
    (lista.length === 1 ? ' mese con piano completo' : ' mesi con piano completo') +
    '). I mesi incompleti o non ancora pianificati restano fuori dal conteggio, cosi i confronti sono corretti.'
  );
}
// Ordina le tabelle del benessere SENZA ricaricare i dati: si riordinano le
// righe gia' presenti, cosi' la pagina non sfarfalla.
function pianoBenessereOrdina(campo) {
  const so = window._benessereSort;
  const dir = so && so.campo === campo ? -so.dir : campo === 'nome' ? 1 : -1;
  window._benessereSort = { campo: campo, dir: dir };
  // indice di colonna corrispondente al campo
  const col = {
    nome: 0,
    indice: 1,
    domLib: 2,
    domLav: 3,
    we: 4,
    notti: 5,
    riposiIsolati: 6,
    serieMax: 7,
    vac: 8,
    mal: 9,
    oreLav: 10,
  }[campo];
  if (col == null) return;
  document.querySelectorAll('#piano-benessere-body table').forEach((tab) => {
    const tbody = tab.querySelector('tbody');
    if (!tbody) return;
    const righe = [...tbody.querySelectorAll('tr[data-nome]')];
    const val = (tr) => {
      const testo = (tr.cells[col] || {}).textContent || '';
      if (campo === 'nome') return tr.dataset.nome.toLowerCase();
      const n = parseFloat(
        String(testo)
          .replace(',', '.')
          .replace(/[^0-9.\-]/g, ''),
      );
      return isNaN(n) ? 0 : n;
    };
    righe
      .sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        return typeof va === 'string' ? dir * va.localeCompare(vb) : dir * (va - vb);
      })
      .forEach((tr) => tbody.appendChild(tr));
    // freccia sull'intestazione ordinata
    [...tab.querySelectorAll('thead th')].forEach((th, i) => {
      th.innerHTML = th.innerHTML.replace(/\s*[▲▼]\s*$/, '');
      if (i === col) th.innerHTML += dir > 0 ? ' ▲' : ' ▼';
    });
  });
}
function pianoBenessereFiltra(q) {
  const testo = (q || '').trim().toLowerCase();
  document.querySelectorAll('#piano-benessere-body table tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = !testo || tr.dataset.nome.toLowerCase().includes(testo) ? '' : 'none';
  });
}
function _renderPianoTurniCard() {
  if (!isAdmin()) {
    // operatori: vedono i turni del PROPRIO settore in sola lettura
    const turniRO = _pianoTurniReparto()
      .slice()
      .sort((x, y) => (x.gruppo || '').localeCompare(y.gruppo || '') || x.codice.localeCompare(y.codice));
    let hRO =
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni · ' +
      escP(repartoLabel(_pianoReparto())) +
      '</div><div style="padding:10px 14px"><div style="overflow-x:auto"><table class="piano-table" style="min-width:520px;font-size:.85rem"><thead><tr><th>Codice</th><th>Gruppo</th><th>Inizio</th><th>Fine</th><th title="Durata in ore decimali e, accanto, in ore e minuti: 8.33 = 8h20, perche 20 minuti sono un terzo di ora">Ore</th><th>Tipo</th></tr></thead><tbody>';
    turniRO.forEach((t) => {
      hRO +=
        '<tr><td style="font-weight:700;background:' +
        (t.colore || 'transparent') +
        ';color:#000">' +
        escP(t.codice) +
        '</td><td>' +
        escP(t.gruppo || '') +
        '</td><td>' +
        (t.ora_inizio || '-').substring(0, 5) +
        '</td><td>' +
        (t.ora_fine || '-').substring(0, 5) +
        '</td><td>' +
        (t.durata_ore || 0) +
        ' <span style="font-size:.82rem;color:var(--muted)">= ' +
        _pianoOreHm(t.durata_ore) +
        '</span></td><td>' +
        escP(t.tipo || '') +
        '</td></tr>';
    });
    hRO +=
      '</tbody></table></div><p style="font-size:.82rem;color:var(--muted);margin-top:6px">Sola lettura: i turni si modificano solo da admin o da chi ha il permesso.</p></div></div>';
    return hRO;
  }
  const turni = _pianoTurniReparto();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (admin)</div><div style="padding:10px 14px">';
  // Il supplemento del 10% sul lavoro notturno (23:00-06:00) e' incluso nella
  // DURATA del turno: questo controllo verifica che tutte le durate lo
  // rispettino e propone la correzione dove manca.
  h +=
    '<div style="background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:10px 12px;margin-bottom:12px">' +
    '<b style="font-size:.9rem">Supplemento notturno del 10%</b>' +
    '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 8px">Chi lavora nella fascia notturna (23:00-06:00) matura il 10% di quelle ore in piu\', e questo supplemento deve essere gia\' compreso nella durata del turno. Il controllo confronta ogni turno con la durata attesa.</p>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoVerificaDurateNotte()">Controlla le durate dei turni</button>' +
    '</div>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:720px;font-size:.85rem"><thead><tr><th>Codice</th><th>Gruppo</th><th>Inizio</th><th>Fine</th><th title="Ora di fine nei giorni in cui il casino chiude alle 5: venerdi, sabato, vigilie di festivita, 31 dicembre. Vuoto = il turno finisce sempre alla stessa ora">Fine (chiusura 5)</th><th title="Durata in ore decimali e, accanto, in ore e minuti: 8.33 = 8h20, perche 20 minuti sono un terzo di ora">Ore</th><th>Tipo</th><th>Colore</th><th>Oltre 23</th><th>Attivo</th><th></th></tr></thead><tbody>';
  turni
    .slice()
    .sort((x, y) => (x.gruppo || '').localeCompare(y.gruppo || '') || x.codice.localeCompare(y.codice))
    .forEach((t) => {
      const _mod = (window._pianoModifiche || []).filter((m) => m.scheda === 'Turni' && m.codice === t.codice);
      h +=
        '<tr id="pt-riga-' +
        t.id +
        '"' +
        (_mod.length ? ' style="background:#fff8e1"' : '') +
        '><td style="font-weight:700;background:' +
        (t.colore || '#fff') +
        '">' +
        escP(t.codice) +
        (_mod.length
          ? ' <span title="Modificato adesso: ' +
            escP(_mod.map((m) => m.campo + ' ' + m.prima + ' \u2192 ' + m.dopo).join(' \u00b7 ')) +
            '" style="color:#b8860b">\u25cf</span>'
          : '') +
        '</td><td><input type="text" value="' +
        escP(t.gruppo || '') +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'gruppo\',this.value.toUpperCase())" style="width:86px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_inizio || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_inizio\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_fine || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_fine\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_fine_tardi || '').substring(0, 5)) +
        '" title="Ora di fine nei giorni in cui si chiude alle 5 (venerdi, sabato, vigilie di festivita, 31 dicembre). Vuoto = finisce sempre alla stessa ora" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_fine_tardi\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></td><td><input type="number" step="0.25" value="' +
        (t.durata_ore || 0) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'durata_ore\',this.value)" oninput="_pianoTurnoHmVivo(' +
        t.id +
        ',this.value)" style="width:58px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"> <span id="pt-hm-' +
        t.id +
        '" style="font-size:.82rem;color:var(--muted);white-space:nowrap" title="Stessa durata scritta in ore e minuti: 8.33 in decimali = 8h20 (20 minuti sono un terzo di ora)">= ' +
        _pianoOreHm(t.durata_ore) +
        '</span></td><td><select onchange="salvaPianoTurno(' +
        t.id +
        ',\'tipo\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option' +
        (t.tipo === 'DIURNO' ? ' selected' : '') +
        '>DIURNO</option><option' +
        (t.tipo === 'NOTTURNO' ? ' selected' : '') +
        '>NOTTURNO</option></select></td><td><input type="color" value="' +
        (t.colore && /^#[0-9a-fA-F]{6}$/.test(t.colore) ? t.colore : '#ffffff') +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'colore\',this.value)" title="Colore di sfondo della sigla nel piano" style="width:38px;height:26px;padding:0;border:1px solid var(--line);cursor:pointer"></td><td><input type="checkbox"' +
        (t.oltre23 ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'oltre23\',this.checked)"></td><td><input type="checkbox"' +
        (t.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaPianoTurno(' +
        t.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Codice</label><input type="text" id="pt-nuovo-codice" placeholder="S9" style="width:80px"></div>' +
    '<div class="field"><label>Gruppo</label><input type="text" id="pt-nuovo-gruppo" placeholder="SALA" style="width:110px"></div>' +
    '<div class="field"><label>Inizio</label><input type="time" id="pt-nuovo-inizio"></div>' +
    '<div class="field"><label>Fine</label><input type="time" id="pt-nuovo-fine"></div>' +
    '<div class="field"><label>Ore</label><input type="number" step="0.25" id="pt-nuovo-ore" value="8.25" style="width:70px"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoTurno()">+ Aggiungi turno</button></div>';
  h += '</div></div>';
  return h;
}
// Ore e minuti aggiornati MENTRE si scrive la durata: prima il "= 8h20" a
// fianco restava fermo al valore vecchio finche' non si ricaricava la scheda,
// e chi scriveva in centesimi non vedeva subito che cosa stava facendo.
function _pianoTurnoHmVivo(id, valore) {
  const el = document.getElementById('pt-hm-' + id);
  if (!el) return;
  const v = parseFloat(String(valore).replace(',', '.'));
  el.textContent = '= ' + (isNaN(v) ? '-' : _pianoOreHm(v));
}
// MEMORIA DI QUELLO CHE SI E' CAMBIATO ADESSO.
// Turni, regole e impostazioni del piano si salvano da soli appena si tocca un
// campo: e' comodo, ma la scritta che passa in basso non basta e dopo cinque
// modifiche non ci si ricorda piu' che cosa si e' toccato. Qui resta l'elenco,
// visibile in cima alla scheda finche' non lo si chiude. Tutto finisce anche
// nel Registro attivita', con nome e ora.
function _pianoRegistraModifica(scheda, oggetto, campo, prima, dopo) {
  window._pianoModifiche = window._pianoModifiche || [];
  window._pianoModifiche.push({
    scheda: scheda,
    codice: oggetto,
    campo: campo,
    prima: prima,
    dopo: dopo,
    ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
  });
}
function _pianoModificheHtml() {
  const lista = window._pianoModifiche || [];
  if (!lista.length) return '';
  return (
    '<div style="background:#fff8e1;border-left:4px solid #b8860b;border-radius:3px;padding:10px 12px;margin:0 0 12px">' +
    '<b style="font-size:.9rem">Modifiche fatte adesso (' +
    lista.length +
    ')</b>' +
    '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 6px">Sono gia salvate: il programma registra ogni campo appena lo cambi. Questo elenco serve solo a ricordare che cosa hai toccato in questa sessione. Resta anche nel Registro attivita, con nome e ora.</p>' +
    '<ul style="margin:0 0 8px 18px;font-size:.86rem">' +
    lista
      .map(
        (m) =>
          '<li><span style="color:var(--muted)">' +
          escP(m.scheda) +
          '</span> \u00b7 <b>' +
          escP(m.codice) +
          '</b> \u00b7 ' +
          escP(m.campo) +
          ': ' +
          escP(String(m.prima)) +
          ' \u2192 <b>' +
          escP(String(m.dopo)) +
          '</b> <span style="color:var(--muted)">(' +
          escP(m.ora) +
          ')</span></li>',
      )
      .join('') +
    '</ul>' +
    '<button class="btn-export" style="font-size:.8rem;padding:4px 10px" onclick="window._pianoModifiche=[];renderPiano()">Ho visto, chiudi l elenco</button>' +
    '</div>'
  );
}
const _PT_ETICHETTE = {
  gruppo: 'gruppo',
  ora_inizio: 'ora di inizio',
  ora_fine: 'ora di fine',
  ora_fine_tardi: 'ora di fine con chiusura alle 5',
  durata_ore: 'durata',
  tipo: 'tipo',
  colore: 'colore',
  oltre23: 'oltre le 23',
  attivo: 'attivo',
};
// CONTROLLI SUI TURNI: sigla, orari e durata devono avere senso PRIMA di
// finire nel piano (una sigla vuota o un orario "25:00" rompono i conteggi).
function _pianoValidaTurno(campo, valore, t) {
  const v = String(valore == null ? '' : valore).trim();
  if (campo === 'codice') {
    if (!/^[A-Z0-9]{1,6}$/i.test(v))
      return 'La sigla deve avere da 1 a 6 lettere o cifre, senza spazi (es. C0, Z8, L1)';
    if (pianoCodiciCache.some((c) => String(c.codice).toUpperCase() === v.toUpperCase()))
      return 'La sigla ' + v.toUpperCase() + ' e gia un codice speciale (V, M, C, CGF...): scegline un altra';
    if (
      pianoTurniCache.some(
        (x) =>
          x !== t &&
          String(x.codice).toUpperCase() === v.toUpperCase() &&
          (x.reparto_dip || 'slots') === _pianoReparto(),
      )
    )
      return 'La sigla ' + v.toUpperCase() + ' esiste gia in questo settore';
  }
  if (campo === 'gruppo' && !/^[A-Z0-9_ ]{1,20}$/i.test(v))
    return 'Il gruppo deve essere una parola (es. SALA, CASSA, BO)';
  if (campo === 'ora_inizio' || campo === 'ora_fine') {
    if (!/^([01]?\d|2[0-3])[:.][0-5]\d$/.test(v)) return 'Orario non valido: usa hh:mm, per esempio 19:45';
  }
  if (campo === 'durata_ore') {
    const n = parseFloat(v.replace(',', '.'));
    if (isNaN(n) || n < 0.5 || n > 14) return 'La durata deve essere fra 0.5 e 14 ore (hai scritto ' + v + ')';
  }
  return null;
}
async function salvaPianoTurno(id, campo, valore) {
  if (!isAdmin()) return;
  const tV = pianoTurniCache.find((x) => x.id === id);
  const erroreT = _pianoValidaTurno(campo, valore, tV);
  if (erroreT) {
    toastErrore(erroreT + '. Il valore precedente resta.', 8000);
    renderPiano();
    return;
  }
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'oltre23') patch[campo] = !!valore;
    else if (campo === 'durata_ore') patch[campo] = parseFloat(String(valore).replace(',', '.')) || 0;
    else patch[campo] = String(valore).trim();
    const t = pianoTurniCache.find((x) => x.id === id);
    const prima = t ? t[campo] : '';
    await secPatch('piano_turni', 'id=eq.' + id, patch);
    if (t) t[campo] = patch[campo];
    const et = _PT_ETICHETTE[campo] || campo;
    const daA = (v) =>
      campo === 'durata_ore'
        ? v + ' (' + _pianoOreHm(v) + ')'
        : campo === 'attivo' || campo === 'oltre23'
          ? v
            ? 'si'
            : 'no'
          : String(v == null || v === '' ? 'vuoto' : v).substring(0, 20);
    logAzione(
      'Piano: turno modificato',
      (t ? t.codice : id) + ' \u00b7 ' + et + ': ' + daA(prima) + ' \u2192 ' + daA(patch[campo]),
    );
    _pianoRegistraModifica('Turni', t ? t.codice : String(id), et, daA(prima), daA(patch[campo]));
    toast('Salvato \u00b7 ' + (t ? t.codice : id) + ': ' + et + ' ' + daA(prima) + ' \u2192 ' + daA(patch[campo]));
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio turno');
  }
}
async function aggiungiPianoTurno() {
  if (!isAdmin()) return;
  const codice = ((document.getElementById('pt-nuovo-codice') || {}).value || '').trim().toUpperCase();
  const gruppo = ((document.getElementById('pt-nuovo-gruppo') || {}).value || '').trim().toUpperCase();
  const inizio = (document.getElementById('pt-nuovo-inizio') || {}).value || '';
  const fine = (document.getElementById('pt-nuovo-fine') || {}).value || '';
  const oreV = parseFloat((document.getElementById('pt-nuovo-ore') || {}).value) || 8.25;
  if (!codice || !gruppo || !inizio || !fine) {
    toastErrore('Compila sigla, gruppo, ora di inizio e ora di fine');
    return;
  }
  const oreTxt = (document.getElementById('pt-nuovo-ore') || {}).value;
  for (const [campo, val] of [
    ['codice', codice],
    ['gruppo', gruppo],
    ['ora_inizio', inizio],
    ['ora_fine', fine],
    ['durata_ore', oreTxt === '' || oreTxt == null ? String(oreV) : oreTxt],
  ]) {
    const errore = _pianoValidaTurno(campo, val, null);
    if (errore) {
      toastErrore(errore, 8000);
      return;
    }
  }
  const oltre23 = _pianoOra(fine) < _pianoOra(inizio) || _pianoOra(fine) > 23;
  try {
    const r = await secPost('piano_turni', {
      codice: codice,
      gruppo: gruppo,
      ora_inizio: inizio,
      ora_fine: fine,
      durata_ore: oreV,
      tipo: _pianoOra(inizio) >= 15 || oltre23 ? 'NOTTURNO' : 'DIURNO',
      oltre23: oltre23,
      colore: PIANO_COLORI_GRUPPO[gruppo] || '#EEEEEE',
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoTurniCache.push(r[0]);
    logAzione('Piano: turno aggiunto', codice + ' (' + gruppo + ')');
    toast('Turno ' + codice + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta turno');
  }
}
const PIANO_COLORI_GRUPPO = {
  SALA: '#F2DBDB',
  REC: '#FF99CC',
  CASSA: '#FBD4B4',
  SUP: '#B8CCE4',
  ACCOGLIENZA: '#C6EFCE',
  BO: '#CCC0D9',
  VALET: '#343a40',
};
async function eliminaPianoTurno(id) {
  if (!isAdmin()) return;
  const t = pianoTurniCache.find((x) => x.id === id);
  if (!t) return;
  const usato = (await secGet('piano?codice=eq.' + encodeURIComponent(t.codice) + '&limit=1')) || [];
  if (usato.length) {
    toast('Il turno ' + t.codice + ' è usato nel piano: disattivalo invece di eliminarlo');
    return;
  }
  if (!confirm('Eliminare il turno ' + t.codice + '? (mai usato nel piano)')) return;
  try {
    await secDel('piano_turni', 'id=eq.' + id);
    pianoTurniCache = pianoTurniCache.filter((x) => x.id !== id);
    logAzione('Piano: turno eliminato', t.codice);
    toast('Turno eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione turno');
  }
}

// ---- Card CODICI SPECIALI (admin) ----
function _renderPianoCodiciCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Codici speciali (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Assenze e situazioni non lavorative. "Riposo" = il codice conta come giorno di riposo per le regole. Le ore seguono le formule CCL originali.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:640px;font-size:.85rem"><thead><tr><th>Codice</th><th style="text-align:left">Descrizione</th><th title="Durata in ore decimali e, accanto, in ore e minuti: 8.33 = 8h20, perche 20 minuti sono un terzo di ora">Ore</th><th title="Le ore vengono scalate per la percentuale d\'impiego">Scala %</th><th title="Inserendolo nel piano chiede orario di inizio e fine (es. JG)">Chiede orario</th><th>Riposo</th><th>Attivo</th><th></th></tr></thead><tbody>';
  pianoCodiciCache
    .slice()
    .sort((x, y) => x.codice.localeCompare(y.codice))
    .forEach((c) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(c.codice) +
        '</td><td style="text-align:left"><input type="text" value="' +
        escP(c.descrizione || '') +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'descrizione\',this.value)" style="width:200px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="number" step="0.001" value="' +
        (c.ore || 0) +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'ore\',this.value)" style="width:70px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
        (c.scala_percentuale ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'scala_percentuale\',this.checked)"></td><td><input type="checkbox"' +
        (c.richiede_orario ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'richiede_orario\',this.checked)"></td><td><input type="checkbox"' +
        (c.is_riposo ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'is_riposo\',this.checked)"></td><td><input type="checkbox"' +
        (c.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaPianoCodice(' +
        c.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Codice</label><input type="text" id="pc-nuovo-codice" placeholder="XX" style="width:70px"></div>' +
    '<div class="field"><label>Descrizione</label><input type="text" id="pc-nuovo-desc" placeholder="Es: Permesso studio" style="width:200px"></div>' +
    '<div class="field"><label>Ore</label><input type="number" step="0.001" id="pc-nuovo-ore" value="0" style="width:80px"></div>' +
    '<label style="font-size:.85rem"><input type="checkbox" id="pc-nuovo-scala"> Scala %</label>' +
    '<label style="font-size:.85rem"><input type="checkbox" id="pc-nuovo-riposo"> Riposo</label>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoCodice()">+ Aggiungi codice</button></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoCodice() {
  if (!isAdmin()) return;
  const codice = ((document.getElementById('pc-nuovo-codice') || {}).value || '').trim().toUpperCase();
  const desc = ((document.getElementById('pc-nuovo-desc') || {}).value || '').trim();
  const oreV = parseFloat((document.getElementById('pc-nuovo-ore') || {}).value) || 0;
  const scala = (document.getElementById('pc-nuovo-scala') || {}).checked;
  const riposo = (document.getElementById('pc-nuovo-riposo') || {}).checked;
  if (!codice) {
    toastErrore('Inserisci il codice');
    return;
  }
  const erroreC = _pianoValidaCodice('codice', codice, null) || _pianoValidaCodice('ore', String(oreV), null);
  if (erroreC) {
    toastErrore(erroreC, 8000);
    return;
  }
  try {
    const r = await secPost('piano_codici', {
      codice: codice,
      descrizione: desc,
      ore: oreV,
      scala_percentuale: !!scala,
      is_riposo: !!riposo,
      attivo: true,
    });
    if (r && r[0]) pianoCodiciCache.push(r[0]);
    logAzione('Piano: codice aggiunto', codice);
    toast('Codice ' + codice + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta codice');
  }
}
async function eliminaPianoCodice(id) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.id === id);
  if (!c) return;
  const usato = (await secGet('piano?codice=eq.' + encodeURIComponent(c.codice) + '&limit=1')) || [];
  if (usato.length) {
    toast('Il codice ' + c.codice + ' è usato nel piano: disattivalo invece di eliminarlo');
    return;
  }
  if (!confirm('Eliminare il codice ' + c.codice + '?')) return;
  try {
    await secDel('piano_codici', 'id=eq.' + id);
    pianoCodiciCache = pianoCodiciCache.filter((x) => x.id !== id);
    logAzione('Piano: codice eliminato', c.codice);
    toast('Codice eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione codice');
  }
}
// CONTROLLI SUI CODICI SPECIALI: sigla unica (anche rispetto ai turni di
// ogni settore) e ore fra 0 e 24
function _pianoValidaCodice(campo, valore, c) {
  const v = String(valore == null ? '' : valore).trim();
  if (campo === 'codice') {
    if (!/^[A-Z0-9]{1,8}$/i.test(v)) return 'Il codice deve avere da 1 a 8 lettere o cifre, senza spazi';
    if (pianoCodiciCache.some((x) => x !== c && String(x.codice).toUpperCase() === v.toUpperCase()))
      return 'Il codice ' + v.toUpperCase() + ' esiste gia';
    const turnoUguale = pianoTurniCache.find((x) => String(x.codice).toUpperCase() === v.toUpperCase());
    if (turnoUguale)
      return 'La sigla ' + v.toUpperCase() + ' e gia un turno di ' + repartoLabel(turnoUguale.reparto_dip || 'slots');
  }
  if (campo === 'ore') {
    const n = parseFloat(v.replace(',', '.'));
    if (v !== '' && (isNaN(n) || n < 0 || n > 24)) return 'Le ore di un codice vanno da 0 a 24 (hai scritto ' + v + ')';
  }
  return null;
}
async function salvaPianoCodice(id, campo, valore) {
  if (!isAdmin()) return;
  const cV = pianoCodiciCache.find((x) => x.id === id);
  const erroreC = _pianoValidaCodice(campo, valore, cV);
  if (erroreC) {
    toastErrore(erroreC + '. Il valore precedente resta.', 8000);
    renderPiano();
    return;
  }
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'is_riposo' || campo === 'scala_percentuale' || campo === 'richiede_orario')
      patch[campo] = !!valore;
    else if (campo === 'ore') patch[campo] = parseFloat(valore) || 0;
    else patch[campo] = String(valore).trim();
    await secPatch('piano_codici', 'id=eq.' + id, patch);
    const c = pianoCodiciCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: codice modificato', (c ? c.codice : id) + ' ' + campo);
    toast('Codice aggiornato');
  } catch (e) {
    toast('Errore salvataggio codice');
  }
}

// ---- RIPORTO CGF: i recuperi con cui ogni fisso entra nell'anno (colonna
// "riporto" del foglio CGF). Elenco compatto, si salva tutto insieme.
async function pianoRiportoCgf() {
  if (!puoGestirePiano()) return;
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  await _pianoCaricaCgfRiporto(anno);
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c))
    .map((c) => c.nome)
    .sort();
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Riporto CGF ' +
    anno +
    ' · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Recuperi festivi maturati fino al 31.12.' +
    (anno - 1) +
    " e non ancora goduti (negativo = presi in anticipo). Con un riporto registrato il programma non conta piu' i festivi e i CGF dell'anno prima. Vuoto = nessun riporto.</p>" +
    '<div style="max-height:52vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.9rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Riporto</th></tr></thead><tbody>';
  nomi.forEach((n) => {
    const r = _pianoCgfRiporto[n + '|' + anno];
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(n) +
      '</td><td><input type="number" step="1" min="-30" max="30" data-cgf-rip="' +
      escP(n) +
      '" value="' +
      (r ? escP(String(r.riporto)) : '') +
      '" style="width:80px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"></td></tr>';
  });
  h +=
    '</tbody></table></div><div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button><button class="btn-modal-ok" onclick="salvaRiportoCgf()">Salva</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaRiportoCgf() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const campi = [...document.querySelectorAll('input[data-cgf-rip]')];
  let salvati = 0;
  const op = getOperatore();
  try {
    for (const inp of campi) {
      const nome = inp.dataset.cgfRip;
      const testo = inp.value.trim();
      const att = _pianoCgfRiporto[nome + '|' + anno];
      if (testo === '') {
        if (att) {
          await secDel('piano_cgf_riporto', 'id=eq.' + att.id);
          delete _pianoCgfRiporto[nome + '|' + anno];
          _pianoRegistraModifica('Festivi', nome, 'riporto CGF ' + anno, String(att.riporto), 'nessuno');
          salvati++;
        }
        continue;
      }
      const v = parseInt(testo);
      if (isNaN(v)) continue;
      if (att) {
        if (parseInt(att.riporto) === v) continue;
        await secPatch('piano_cgf_riporto', 'id=eq.' + att.id, {
          riporto: v,
          operatore: op,
          modificato_il: new Date().toISOString(),
        });
        _pianoRegistraModifica('Festivi', nome, 'riporto CGF ' + anno, String(att.riporto), String(v));
        att.riporto = v;
      } else {
        const nuovo = await secPost('piano_cgf_riporto', {
          collaboratore: nome,
          reparto_dip: _pianoReparto(),
          anno: anno,
          riporto: v,
          operatore: op,
        });
        _pianoCgfRiporto[nome + '|' + anno] = (nuovo && nuovo[0]) || { collaboratore: nome, anno: anno, riporto: v };
        _pianoRegistraModifica('Festivi', nome, 'riporto CGF ' + anno, 'nessuno', String(v));
      }
      salvati++;
    }
    logAzione('Piano: riporto CGF', anno + ' · ' + salvati + ' collaboratori');
    document.getElementById('pwd-modal').classList.add('hidden');
    toast(salvati ? salvati + ' riporti salvati' : 'Nessuna modifica');
  } catch (e) {
    toastErrore('Errore nel salvataggio del riporto: ' + (e.message || ''));
  }
}
// ---- Card FESTIVI (admin) ----
// ===== CGF PER IL PIANO FATTO A MANO =====
// Stessa contabilita' del generatore automatico, ma applicabile da sola: si
// contano i festivi lavorati e i CGF gia' goduti dall'inizio dell'anno (anche
// dei mesi precedenti e del dicembre passato), cosi' il saldo e' sempre giusto
// e non si assegnano recuperi doppi. Vale solo per il personale FISSO: gli
// ausiliari prendono il supplemento del 50% (RAP Allegato 1), non il recupero.
async function _pianoSaldoCgf(ym) {
  const annoCorr = ym.split('-')[0];
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c))
    .map((c) => c.nome);
  await _pianoCaricaCgfRiporto(annoCorr);
  const finoA = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const storia = await _pianoCaricaRigheCgf(annoCorr, finoA);
  const saldo = _pianoContabilitaCgf(storia, nomi, annoCorr, finoA);
  nomi.forEach((n) => (saldo[n].festiviMeseSel = saldo[n].festiviMese[ym] || []));
  return { saldo: saldo, storia: storia, nomi: nomi };
}
// Elenco informativo: chi ha diritto a un recupero e quanti
async function pianoElencoCgfDaDare() {
  if (!puoGestirePiano()) return;
  toast('Calcolo i recuperi...');
  const { saldo, nomi } = await _pianoSaldoCgf(_pianoMeseSel);
  const righe = nomi
    .map((n) => ({ nome: n, ...saldo[n] }))
    .filter((x) => x.maturati || x.goduti || x.riporto || x.persi)
    .sort((a, b) => b.resta - a.resta || a.nome.localeCompare(b.nome));
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Recuperi festivi (CGF) · ' +
    escP(_pianoMeseSel.split('-')[0]) +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Conteggio fino alla fine di ' +
    escP(_pianoMeseSel) +
    " (i mesi futuri non contano). Riporto dall'anno prima + festivi con diritto lavorati (non in malattia) - recuperi goduti. Senza riporto registrato si conta anche l'anno precedente. Un CGF caduto in malattia non e' goduto: resta a credito. Solo personale fisso" +
    (_pianoCgfSoloParificati() ? ', solo festivi parificati alla domenica (regola cgf_solo_parificati)' : '') +
    '.</p>';
  if (!righe.length) h += '<p style="font-size:.85rem">Nessun festivo lavorato quest\'anno.</p>';
  else {
    h +=
      '<div style="max-height:52vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th title="Recuperi con cui entra nell anno (scheda Festivi, Riporto CGF)">Riporto</th><th>Maturati</th><th>Goduti</th><th title="CGF caduti in malattia: non goduti, restano a credito">In malattia</th><th>Da dare</th></tr></thead><tbody>';
    righe.forEach((r) => {
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(r.nome) +
        '</td><td>' +
        (r.riporto || '') +
        '</td><td>' +
        r.maturati +
        '</td><td>' +
        r.goduti +
        '</td><td>' +
        (r.persi || '') +
        '</td><td style="font-weight:700;color:' +
        (r.resta > 0 ? '#c0392b' : r.resta < 0 ? '#8b6914' : '#2c6e49') +
        '">' +
        (r.resta > 0 ? r.resta : r.resta < 0 ? r.resta + " (in piu')" : '0') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h +=
    '<div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
// Assegna i CGF mancanti nei giorni liberi del mese aperto
async function pianoAssegnaCgfMese() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  toast('Calcolo i recuperi da assegnare...');
  const { saldo, nomi } = await _pianoSaldoCgf(ym);
  const nGiorni = _pianoUltimoGiorno(ym);
  const malattie = _pianoMalattieMese(ym);
  const occupato = {};
  _pianoRighe.forEach((r) => (occupato[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
  const daFare = [];
  const compleanni = {};
  collaboratoriCache.forEach((c) => {
    const md = c.data_nascita ? String(c.data_nascita).substring(5, 10) : '';
    if (md && md.substring(0, 2) === ym.substring(5, 7)) compleanni[c.nome + '|' + parseInt(md.substring(3, 5))] = true;
  });
  // stessa griglia di lavoro della bozza: nome|g -> codice
  const cella = {};
  Object.keys(occupato).forEach((k) => (cella[k] = occupato[k]));
  const ctx = { ym: ym, nGiorni: nGiorni, cella: cella, malattie: malattie, compleanni: compleanni };
  const daTogliere = []; // CGF generati in piu' (festivo saltato per malattia)
  nomi.forEach((n) => {
    const s = saldo[n];
    if (s.resta < 0) {
      let extra = -s.resta;
      _pianoRighe
        .filter((r) => r.collaboratore === n && r.codice === 'CGF' && r.generato && !r.protetto && !r.motivo_blocco)
        .sort((a, b) => String(b.data).localeCompare(String(a.data)))
        .forEach((r) => {
          if (extra > 0 && _pianoConsentiScrittura(r.data, true)) {
            daTogliere.push(r);
            extra--;
          }
        });
      return;
    }
    if (s.resta <= 0) return;
    // prima i giorni dopo i festivi lavorati questo mese, poi il resto
    const preferiti = [];
    (s.festiviMeseSel || []).forEach((g) => {
      for (let k = g + 1; k <= Math.min(nGiorni, g + 10); k++) preferiti.push(k);
    });
    _pianoPiazzaCgf(n, s.resta, Object.assign({}, ctx, { preferiti: preferiti })).forEach((g) =>
      daFare.push({ nome: n, giorno: g, data: ym + '-' + String(g).padStart(2, '0') }),
    );
  });
  if (daTogliere.length) {
    if (
      confirm(
        daTogliere.length +
          ' recuper' +
          (daTogliere.length === 1 ? 'o' : 'i') +
          ' automatic' +
          (daTogliere.length === 1 ? 'o' : 'i') +
          ' non spetta' +
          (daTogliere.length === 1 ? '' : 'no') +
          " piu' (festivo non lavorato, per esempio per malattia):\n\n" +
          daTogliere.map((r) => '• ' + r.collaboratore.split(' ')[0] + ' ' + r.data).join('\n') +
          '\n\nLi trasformo in congedo C?',
      )
    ) {
      _pianoUndoSnap('CGF in piu tolti ' + ym);
      for (const r of daTogliere) {
        await secPatch('piano', 'id=eq.' + r.id, {
          codice: 'C',
          commento: ('CGF tolto: festivo non lavorato - ' + getOperatore()).substring(0, 400),
          operatore: getOperatore(),
          updated_at: new Date().toISOString(),
        });
        r.codice = 'C';
      }
      logAzione('Piano: CGF in piu tolti', ym + ' · ' + daTogliere.length);
    }
  }
  if (!daFare.length) {
    if (daTogliere.length) {
      renderPiano();
      return;
    }
    alert(
      'Nessun recupero da assegnare in ' +
        ym +
        ".\n\nO i saldi sono gia' a posto, oppure non ci sono giorni liberi dove metterli (le celle gia' occupate non vengono toccate).",
    );
    return;
  }
  const elenco = daFare
    .slice(0, 25)
    .map((x) => '• ' + x.nome.split(' ')[0] + ' → giorno ' + x.giorno)
    .join('\n');
  if (
    !confirm(
      'Assegno ' +
        daFare.length +
        ' recuper' +
        (daFare.length === 1 ? 'o' : 'i') +
        ' (CGF) nei giorni liberi di ' +
        ym +
        ':\n\n' +
        elenco +
        (daFare.length > 25 ? '\n... e altri ' + (daFare.length - 25) : '') +
        "\n\nIl conteggio tiene conto del riporto e dei recuperi gia' dati nei mesi precedenti; valgono le regole cgf_max_mese, cgf_distanza_giorni e cgf_non_con_vacanze. Le celle occupate non vengono toccate.",
    )
  )
    return;
  _pianoUndoSnap('assegnazione CGF ' + ym);
  let fatti = 0;
  try {
    for (const x of daFare) {
      const nuovo = await _pianoInserisciCella({
        collaboratore: x.nome,
        data: x.data,
        codice: 'CGF',
        protetto: false,
        generato: true,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo) _pianoRighe.push(Array.isArray(nuovo) ? nuovo[0] : nuovo);
      fatti++;
    }
    logAzione('Piano: CGF assegnati a mano', ym + ' · ' + fatti + ' recuperi');
    toast(fatti + ' recuperi assegnati');
    renderPiano();
  } catch (e) {
    toast('Errore: assegnati ' + fatti + ' su ' + daFare.length);
  }
}
function _renderPianoFestiviCard() {
  if (!puoGestireFestivi()) return _pianoSchedaRiservata('Festivi e CGF', 'Festivi e CGF');
  // selettore anno: si vedono (e generano) anche i festivi degli anni futuri
  const anniPresenti = [...new Set(pianoFestiviCache.map((f) => parseInt(f.data.split('-')[0])))];
  const annoCorrente = parseInt(_pianoMeseSel.split('-')[0]);
  const anni = [...new Set(anniPresenti.concat([annoCorrente]))].sort();
  const annoSel =
    window._pianoFestiviAnnoSel && anni.concat([window._pianoFestiviAnnoSel])
      ? window._pianoFestiviAnnoSel
      : annoCorrente;
  window._pianoFestiviAnnoSel = annoSel;
  const visibili = pianoFestiviCache.filter((f) => parseInt(f.data.split('-')[0]) === annoSel);
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px">Festivi ' +
    annoSel +
    ' (' +
    visibili.length +
    ')';
  h +=
    '<select onchange="window._pianoFestiviAnnoSel=parseInt(this.value);renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
  for (let a = 2024; a <= 2032; a++)
    h +=
      '<option value="' +
      a +
      '"' +
      (a === annoSel ? ' selected' : '') +
      '>' +
      a +
      (anniPresenti.includes(a) ? '' : ' (vuoto)') +
      '</option>';
  h += '</select></div><div style="padding:10px 14px">';
  // Chi compila il piano A MANO non passa dalla generazione automatica: con
  // questi pulsanti assegna i CGF del mese senza rifare il piano.
  h +=
    '<div style="background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:10px 12px;margin-bottom:12px">' +
    '<b style="font-size:.9rem">Recuperi festivi (CGF) sul piano</b>' +
    '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 8px">Per chi compila il piano a mano: assegna i giorni di recupero ai <b>fissi</b> che hanno lavorato nei festivi, senza rigenerare nulla. Gli ausiliari non ricevono CGF: per loro vale il supplemento del 50% (RAP Allegato 1), che si legge nelle Statistiche.</p>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoAssegnaCgfMese()">Assegna i CGF del mese di ' +
    escP(_pianoMeseSel) +
    '</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoElencoCgfDaDare()">Chi ha diritto a un recupero</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoRiportoCgf()">Riporto CGF dall\'anno precedente</button>' +
    '</div>';
  if (!visibili.length)
    h +=
      '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Nessun festivo per il ' +
      annoSel +
      ': generali con il pulsante qui sotto.</p>';
  visibili
    .slice()
    .sort((x, y) => x.data.localeCompare(y.data))
    .forEach((f) => {
      h +=
        '<div class="tipo-item"><div class="tipo-item-name">' +
        new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') +
        ' · ' +
        escP(f.descrizione || '') +
        (_pianoFestivoDaCgf(f)
          ? ' <span class="tipo-item-default">(CGF)</span>'
          : f.cgf && _festivoCgfDefault(f.data)
            ? ' <span class="tipo-item-default" title="Flag CGF attivo ma festivo non parificato alla domenica: escluso dalla regola cgf_solo_parificati">(senza CGF: non parificato)</span>'
            : f.cgf
              ? ' <span class="tipo-item-default" title="Cade di domenica: nessun recupero">(domenica)</span>'
              : '') +
        '</div><button class="btn-del-tipo" onclick="eliminaPianoFestivo(' +
        f.id +
        ')">Rimuovi</button></div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Data</label><input type="date" id="pf-nuova-data"></div>' +
    '<div class="field"><label>Descrizione</label><input type="text" id="pf-nuova-desc" placeholder="Es: Natale"></div>' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="pf-nuovo-cgf" checked> CGF</label>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoFestivo()">+ Aggiungi</button></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:6px;border-top:1px solid var(--line);padding-top:8px"><div class="field"><label>Genera automaticamente i festivi di un anno</label><input type="number" id="pf-genera-anno" value="' +
    annoSel +
    '" min="2024" max="2050" style="width:90px"></div>' +
    '<button class="btn-add-tipo" onclick="generaPianoFestivi()">Genera festivi anno</button>' +
    '<span style="font-size:.8rem;color:var(--muted)">11 festivi italiani (Lunedì dell&#39;Angelo calcolato dalla Pasqua)</span></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoFestivo() {
  if (!isAdmin()) return;
  const data = (document.getElementById('pf-nuova-data') || {}).value || '';
  const desc = ((document.getElementById('pf-nuova-desc') || {}).value || '').trim();
  const cgf = !!(document.getElementById('pf-nuovo-cgf') || {}).checked;
  if (!data || !desc) {
    toastErrore('Compila data e descrizione');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(new Date(data + 'T12:00:00').getTime())) {
    toastErrore('Data non valida');
    return;
  }
  if (pianoFestiviCache.some((f) => String(f.data).substring(0, 10) === data)) {
    toastErrore('Il ' + data.split('-').reverse().join('.') + ' e gia in elenco');
    return;
  }
  try {
    const r = await secPost('piano_festivi', { data: data, descrizione: desc, cgf: cgf });
    if (r && r[0]) pianoFestiviCache.push(r[0]);
    logAzione('Piano: festivo aggiunto', data + ' ' + desc);
    toast('Festivo aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore (data già presente?)');
  }
}
async function eliminaPianoFestivo(id) {
  if (!isAdmin()) return;
  const f = pianoFestiviCache.find((x) => x.id === id);
  if (!f || !confirm('Rimuovere il festivo ' + f.data + ' (' + (f.descrizione || '') + ')?')) return;
  try {
    await secDel('piano_festivi', 'id=eq.' + id);
    pianoFestiviCache = pianoFestiviCache.filter((x) => x.id !== id);
    logAzione('Piano: festivo rimosso', f.data);
    toast('Festivo rimosso');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione festivo');
  }
}

// ================================================================
// SETTORE DEL PIANO · un operatore autorizzato può vedere/gestire
// il piano di un altro settore (es. supervisor Tavoli sul piano
// Slots) senza cambiare login: il selettore vale solo per il Piano.
// ================================================================
let _pianoRepartoSel = null; // null = segue il settore corrente dell'app
function _pianoReparto() {
  return _pianoRepartoSel || currentReparto;
}
// reparti che l'operatore può guardare nel piano: il suo + gli accessi extra
// (admin e operatori senza reparto assegnato: tutti)
function _pianoRepartiAmmessi() {
  const tutti = getReparti().map((r) => r.key);
  if (isAdmin()) return tutti;
  const op = getOperatore();
  const proprio = (typeof operatoriRepartoMap !== 'undefined' && operatoriRepartoMap[op]) || 'entrambi';
  if (proprio === 'entrambi') return tutti;
  const extra = typeof _accessiExtraDi === 'function' ? _accessiExtraDi(op) : null;
  return tutti.filter((k) => k === proprio || !!(extra && extra[k]));
}
function pianoCambiaReparto(rep) {
  if (!_pianoRepartiAmmessi().includes(rep)) return;
  _pianoRepartoSel = rep === currentReparto ? null : rep;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ================================================================
// FESTIVI AUTOMATICI · genera i festivi di un anno con un click.
// Lista = quella osservata dal casinò (da Turnivo 2026): 7 fissi +
// Lunedì di Pasqua e Ascensione calcolati dalla data di Pasqua.
// ================================================================
function _pianoPasqua(anno) {
  // algoritmo di Meeus (calendario gregoriano)
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mese = Math.floor((hh + l - 7 * m + 114) / 31);
  const giorno = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno, 12);
}
function _pianoFestiviAnno(anno) {
  const pasqua = _pianoPasqua(anno);
  const add = (base, giorni) => {
    const d = new Date(base);
    d.setDate(d.getDate() + giorni);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  };
  // FESTIVI DEL CANTON TICINO (richiesta utente 04/09/2026): la lista segue
  // il calendario cantonale ufficiale — le feste fisse sono di legge, quelle
  // mobili si calcolano da Pasqua, quindi risultano sempre esatte anno per anno
  return [
    { data: anno + '-01-01', descrizione: 'Capodanno' },
    { data: anno + '-01-06', descrizione: 'Epifania' },
    { data: anno + '-03-19', descrizione: 'San Giuseppe' },
    { data: add(pasqua, 1), descrizione: 'Lunedì di Pasqua' },
    { data: anno + '-05-01', descrizione: 'Festa del Lavoro' },
    { data: add(pasqua, 39), descrizione: 'Ascensione' },
    { data: add(pasqua, 50), descrizione: 'Lunedì di Pentecoste' },
    { data: add(pasqua, 60), descrizione: 'Corpus Domini' },
    { data: anno + '-06-29', descrizione: 'SS. Pietro e Paolo' },
    { data: anno + '-08-01', descrizione: 'Festa nazionale' },
    { data: anno + '-08-15', descrizione: 'Assunzione' },
    { data: anno + '-11-01', descrizione: 'Ognissanti' },
    { data: anno + '-12-08', descrizione: 'Immacolata Concezione' },
    { data: anno + '-12-25', descrizione: 'Natale' },
    { data: anno + '-12-26', descrizione: 'Santo Stefano' },
  ];
}
// ===========================================================================
// RECUPERO ORE (griglia giornaliera, come il foglio Excel di slots e tavoli)
// Ogni giorno si segna lo scostamento dal turno previsto: -1 se ha fatto un ora
// in meno, +3 se ne ha fatte tre in piu. Il totale del mese entra nel saldo.
// ===========================================================================
let _pianoRecupero = {}; // 'nome|YYYY-MM-DD' -> record
let _pianoRecuperoMese = null;
async function _pianoCaricaRecupero(ym) {
  if (_pianoRecuperoMese === ym) return;
  const da = ym + '-01';
  // ultimo giorno VERO del mese: scrivere sempre 31 fa rifiutare la richiesta
  // dal database nei mesi che non ce l'hanno (30 settembre, 28 febbraio...)
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const r =
    (await secGet(
      'piano_recupero_ore?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000',
    )) || [];
  _pianoRecupero = {};
  r.forEach((x) => (_pianoRecupero[x.collaboratore + '|' + String(x.data).substring(0, 10)] = x));
  _pianoRecuperoMese = ym;
}
// totale del mese per un collaboratore (0 se non ha scostamenti)
function _pianoRecuperoTotale(nome, ym) {
  let t = 0;
  Object.keys(_pianoRecupero).forEach((k) => {
    if (k.indexOf(nome + '|') !== 0) return;
    if (k.substring(nome.length + 1, nome.length + 8) !== (ym || _pianoMeseSel)) return;
    t += parseFloat(_pianoRecupero[k].ore) || 0;
  });
  return Math.round(t * 100) / 100;
}
// Converte quello che scrive l'operatore in ore decimali.
// '1:30' e '-1:30' -> 1.5 / -1.5 (sessantesimi) · '1,5' e '1.5' -> 1.5
// Ritorna stringa vuota quando il campo e' vuoto.
function _pianoOreDaTesto(valore) {
  let t = String(valore == null ? '' : valore).trim();
  if (t === '') return '';
  t = t.replace(',', '.');
  const m = t.match(/^([+-]?)(\d+):([0-5]?\d)$/);
  if (m) {
    const segno = m[1] === '-' ? -1 : 1;
    const ore = parseInt(m[2]) + parseInt(m[3]) / 60;
    return String(segno * (Math.round(ore * 100) / 100));
  }
  return t;
}
// Scrive/aggiorna/cancella uno scostamento del giorno
async function pianoRecuperoScrivi(nome, dstr, valore) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return false;
  }
  const _info = _pianoCollabInfo(nome) || {};
  if (_info.is_jolly || _info.impiego === 'jolly') {
    toast('Gli ausiliari non hanno ore dovute: nessun recupero da registrare');
    return false;
  }
  // il recupero entra nel saldo del mese: vale la stessa chiusura del saldo
  if (!_pianoConsentiSaldoMese(String(dstr).substring(0, 7))) return false;
  const chiave = nome + '|' + dstr;
  const att = _pianoRecupero[chiave];
  // si accetta sia il decimale (1.5) sia l'orologio (1:30): un'ora e mezza si
  // puo' scrivere in tutti e due i modi, cosi' nessuno sbaglia scrivendo 1.30
  const testo = _pianoOreDaTesto(valore);
  try {
    if (testo === '' || parseFloat(testo) === 0) {
      if (att) {
        await secDel('piano_recupero_ore', 'id=eq.' + att.id);
        delete _pianoRecupero[chiave];
        logAzione('Recupero ore tolto', nome + ' ' + dstr);
      }
      return true;
    }
    const ore = parseFloat(testo);
    if (isNaN(ore) || ore < -24 || ore > 24) {
      toast('Valore fuori scala (da -24 a +24)');
      return false;
    }
    if (att) {
      await secPatch('piano_recupero_ore', 'id=eq.' + att.id, {
        ore: ore,
        operatore: getOperatore(),
        modificato_il: new Date().toISOString(),
      });
      att.ore = ore;
    } else {
      const nuovo = await secPost('piano_recupero_ore', {
        collaboratore: nome,
        data: dstr,
        ore: ore,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      _pianoRecupero[chiave] = (nuovo && nuovo[0]) || { collaboratore: nome, data: dstr, ore: ore };
    }
    logAzione('Recupero ore', nome + ' ' + dstr + ': ' + (ore > 0 ? '+' : '') + ore + 'h');
    return true;
  } catch (e) {
    console.error('recupero ore', e);
    toast('Errore nel salvataggio');
    return false;
  }
}
// modifica dalla cella della griglia
async function pianoRecuperoCella(el, nome, dstr) {
  const ok = await pianoRecuperoScrivi(nome, dstr, el.value);
  if (!ok) {
    const att = _pianoRecupero[nome + '|' + dstr];
    el.value = att ? att.ore : '';
    return;
  }
  _pianoYtdKey = ''; // il saldo dei mesi seguenti cambia
  _pianoRecuperoAggiornaRiga(nome);
}
// aggiorna colori e totali della riga senza ridisegnare tutta la pagina
function _pianoRecuperoAggiornaRiga(nome) {
  const tr = document.querySelector('#piano-recupero-table tbody tr[data-nome="' + CSS.escape(nome) + '"]');
  if (!tr) return;
  tr.querySelectorAll('input[data-data]').forEach((inp) => {
    const v = parseFloat(inp.value);
    inp.className = 'rec-cella' + (v > 0 ? ' rec-piu' : v < 0 ? ' rec-meno' : '');
  });
  const tot = _pianoRecuperoTotale(nome, _pianoMeseSel);
  const cel = tr.querySelector('.rec-totale');
  if (cel) {
    cel.innerHTML = tot
      ? (tot > 0 ? '+' : '') +
        String(Math.round(tot * 100) / 100) +
        '<div style="font-size:.78em;font-weight:400;opacity:.8">' +
        (tot > 0 ? '+' : '-') +
        _pianoOreHm(Math.abs(tot)) +
        '</div>'
      : '';
    cel.className = 'rec-totale' + (tot > 0 ? ' rec-piu' : tot < 0 ? ' rec-meno' : '');
  }
  _pianoRecuperoTotaliGenerali();
}
function _pianoRecuperoTotaliGenerali() {
  const box = document.getElementById('piano-recupero-riepilogo');
  if (!box) return;
  let piu = 0;
  let meno = 0;
  Object.keys(_pianoRecupero).forEach((k) => {
    const v = parseFloat(_pianoRecupero[k].ore) || 0;
    if (v > 0) piu += v;
    else meno += v;
  });
  const netto = Math.round((piu + meno) * 100) / 100;
  box.innerHTML =
    '<span class="rec-piu">+' +
    _pianoOreHm(piu) +
    '</span> in piu &middot; <span class="rec-meno">-' +
    _pianoOreHm(Math.abs(meno)) +
    '</span> in meno &middot; saldo del settore <b>' +
    (netto > 0 ? '+' : netto < 0 ? '-' : '') +
    _pianoOreHm(Math.abs(netto)) +
    '</b>';
}
// SELEZIONE E COLORI del Recupero ore: STESSO sistema del calendario.
// Click sul nome = riga marcata, click sull'intestazione del giorno = colonna
// marcata, Ctrl+click su una casella = singola cella. Il bottone "Colora"
// applica l'ultimo colore usato (condiviso col piano), la freccia apre la
// stessa palette, con Grassetto, Corsivo e colore del testo.
// Unica differenza voluta rispetto al calendario: qui si colora anche il nome
// del collaboratore (col colore della riga).
let _recSel = { righe: {}, colonne: {}, celle: {} };
// valori nello stesso formato stile del piano: '#fondo|bi|#testo' (_stileCella)
let _recColori = { righe: {}, colonne: {}, celle: {} };
let _recColoriKey = null;
function _recImpKey(ym) {
  return 'recupero_colori_' + _pianoReparto() + '_' + ym;
}
async function _recCaricaColori(ym) {
  const k = _recImpKey(ym);
  if (_recColoriKey === k) return;
  _recColoriKey = k;
  _recColori = { righe: {}, colonne: {}, celle: {} };
  try {
    const v = await getImp(k);
    if (v) {
      const o = JSON.parse(v);
      _recColori = { righe: o.righe || {}, colonne: o.colonne || {}, celle: o.celle || {} };
    }
  } catch (e) {}
}
async function _recSalvaColori() {
  try {
    if (!(await salvaImp(_recImpKey(_pianoMeseSel), JSON.stringify(_recColori)))) return;
  } catch (e) {
    toast('Colori non salvati');
  }
}
// stile effettivo di una cella: cella > riga > colonna
function _recStileDi(nome, dstr) {
  const gg = dstr.substring(8);
  return _recColori.celle[nome + '|' + dstr] || _recColori.righe[nome] || _recColori.colonne[gg] || '';
}
function _recSelVuota() {
  return (
    !Object.keys(_recSel.righe).length && !Object.keys(_recSel.colonne).length && !Object.keys(_recSel.celle).length
  );
}
function _recSelAggiornaBarra() {
  const el = document.getElementById('rec-sel-info');
  if (!el) return;
  const r = Object.keys(_recSel.righe).length;
  const c = Object.keys(_recSel.colonne).length;
  const s2 = Object.keys(_recSel.celle).length;
  const parti = [];
  if (r) parti.push(r + (r === 1 ? ' riga' : ' righe'));
  if (c) parti.push(c + (c === 1 ? ' colonna' : ' colonne'));
  if (s2) parti.push(s2 + (s2 === 1 ? ' cella' : ' celle'));
  el.textContent = parti.length ? 'Selezione: ' + parti.join(' + ') : '';
}
// le marcature usano le STESSE classi del calendario (row-selected ecc.) e lo
// STESSO comportamento: il click semplice fa una selezione NUOVA (quella di
// prima sparisce), Ctrl/Cmd+click AGGIUNGE alla selezione esistente.
function pianoRecSelRiga(ev, nome, td) {
  const aggiunge = ev && (ev.ctrlKey || ev.metaKey);
  const eraSelezionata = !!_recSel.righe[nome];
  const eraLUnica =
    eraSelezionata &&
    Object.keys(_recSel.righe).length === 1 &&
    !Object.keys(_recSel.colonne).length &&
    !Object.keys(_recSel.celle).length;
  if (!aggiunge) {
    pianoRecSelPulisci();
    if (eraLUnica) return; // ri-click sull'unica riga selezionata: deseleziona
  } else if (eraSelezionata) {
    delete _recSel.righe[nome];
    const tr0 = td.closest('tr');
    if (tr0) tr0.classList.remove('row-selected');
    _recSelAggiornaBarra();
    return;
  }
  _recSel.righe[nome] = 1;
  const tr = td.closest('tr');
  if (tr) tr.classList.add('row-selected');
  _recSelAggiornaBarra();
}
function pianoRecSelColonna(ev, gg, th) {
  const aggiunge = ev && (ev.ctrlKey || ev.metaKey);
  const eraSelezionata = !!_recSel.colonne[gg];
  const eraLUnica =
    eraSelezionata &&
    Object.keys(_recSel.colonne).length === 1 &&
    !Object.keys(_recSel.righe).length &&
    !Object.keys(_recSel.celle).length;
  const segna = (on) => {
    th.classList.toggle('col-selected-header', on);
    document
      .querySelectorAll('#piano-recupero-table tbody td[data-gg="' + gg + '"]')
      .forEach((c) => c.classList.toggle('col-selected', on));
  };
  if (!aggiunge) {
    pianoRecSelPulisci();
    if (eraLUnica) return; // ri-click sull'unica colonna selezionata: deseleziona
  } else if (eraSelezionata) {
    delete _recSel.colonne[gg];
    segna(false);
    _recSelAggiornaBarra();
    return;
  }
  _recSel.colonne[gg] = 1;
  segna(true);
  _recSelAggiornaBarra();
}
function pianoRecSelCella(ev, inp) {
  if (!ev || (!ev.ctrlKey && !ev.metaKey)) {
    // click normale: si va a scrivere le ore, quindi la selezione in corso
    // si azzera (come nel calendario, dove il click su una cella ricomincia)
    if (!_recSelVuota()) pianoRecSelPulisci();
    return;
  }
  ev.preventDefault();
  inp.blur();
  const k = inp.dataset.nome + '|' + inp.dataset.data;
  if (_recSel.celle[k]) delete _recSel.celle[k];
  else _recSel.celle[k] = 1;
  inp.closest('td').classList.toggle('blocco-sel', !!_recSel.celle[k]);
  _recSelAggiornaBarra();
}
// TRASCINAMENTO anche qui, come nel calendario: si tiene premuto Ctrl (o Cmd)
// e si trascina da una casella all'altra. Senza Ctrl il trascinamento non parte,
// perche' il click normale serve a scrivere le ore.
function _recDragBind() {
  const tab = document.getElementById('piano-recupero-table');
  if (!tab || tab.dataset.dragBound) return;
  tab.dataset.dragBound = '1';
  let attivo = false;
  let partenza = null;
  const cellaDi = (ev) => {
    const td = ev.target.closest('td[data-gg]');
    return td && tab.contains(td) ? td : null;
  };
  const segna = (a, b2) => {
    const righe = [...tab.querySelectorAll('tbody tr[data-nome]')];
    const r1 = righe.indexOf(a.closest('tr'));
    const r2 = righe.indexOf(b2.closest('tr'));
    const g1 = a.dataset.gg;
    const g2 = b2.dataset.gg;
    const da = Math.min(r1, r2);
    const aR = Math.max(r1, r2);
    const dg = Math.min(parseInt(g1), parseInt(g2));
    const ag = Math.max(parseInt(g1), parseInt(g2));
    _recSel = { righe: {}, colonne: {}, celle: {} };
    tab
      .querySelectorAll('.row-selected, .col-selected, .col-selected-header, .blocco-sel')
      .forEach((x) => x.classList.remove('row-selected', 'col-selected', 'col-selected-header', 'blocco-sel'));
    for (let i2 = da; i2 <= aR; i2++) {
      const tr = righe[i2];
      if (!tr) continue;
      for (let g = dg; g <= ag; g++) {
        const td = tr.querySelector('td[data-gg="' + String(g).padStart(2, '0') + '"]');
        if (!td) continue;
        td.classList.add('blocco-sel');
        const inp = td.querySelector('input');
        if (inp) _recSel.celle[inp.dataset.nome + '|' + inp.dataset.data] = 1;
      }
    }
    _recSelAggiornaBarra();
  };
  tab.addEventListener('mousedown', (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    const td = cellaDi(ev);
    if (!td) return;
    ev.preventDefault();
    attivo = true;
    partenza = td;
    segna(td, td);
  });
  tab.addEventListener('mouseover', (ev) => {
    if (!attivo) return;
    const td = cellaDi(ev);
    if (td && partenza) segna(partenza, td);
  });
  document.addEventListener('mouseup', () => {
    attivo = false;
    partenza = null;
  });
}
function pianoRecSelPulisci() {
  _recSel = { righe: {}, colonne: {}, celle: {} };
  document
    .querySelectorAll(
      '#piano-recupero-table .row-selected, #piano-recupero-table .col-selected, #piano-recupero-table .col-selected-header, #piano-recupero-table .blocco-sel',
    )
    .forEach((x) => x.classList.remove('row-selected', 'col-selected', 'col-selected-header', 'blocco-sel'));
  _recSelAggiornaBarra();
}
function pianoRecColoriToggle() {
  const p2 = document.getElementById('rec-colori-pop');
  if (p2) p2.style.display = p2.style.display === 'none' ? 'block' : 'none';
}
// (mappa, chiave) di tutto cio' che e' selezionato
function _recSelVoci() {
  const out = [];
  Object.keys(_recSel.righe).forEach((n) => out.push([_recColori.righe, n]));
  Object.keys(_recSel.colonne).forEach((g) => out.push([_recColori.colonne, g]));
  Object.keys(_recSel.celle).forEach((k) => out.push([_recColori.celle, k]));
  return out;
}
// modifica lo stile di tutta la selezione, riapplica e salva (motore unico)
async function _recModificaStili(mod, msg) {
  const p2 = document.getElementById('rec-colori-pop');
  if (p2) p2.style.display = 'none';
  const voci = _recSelVoci();
  if (!voci.length) {
    toast('Prima seleziona: click sul nome (riga), sul giorno (colonna) o Ctrl+click su una casella');
    return;
  }
  voci.forEach(([mappa, chiave]) => {
    const st = _stileCella(mappa[chiave] || '');
    mod(st);
    const v = _stileStr(st);
    if (v) mappa[chiave] = v;
    else delete mappa[chiave];
  });
  _recApplicaColoriDom();
  await _recSalvaColori();
  if (msg) toast(msg);
}
async function pianoRecColora(colore) {
  if (colore) _colUltimoSet(colore);
  else if (colore === '') _colUltimoSet('');
  await _recModificaStili(
    (st) => {
      st.c = colore || '';
    },
    colore ? 'Colore applicato' : 'Colore tolto',
  );
}
async function pianoRecFormato(f) {
  const voci = _recSelVoci();
  const on = voci.length ? !voci.every(([m, k]) => _stileCella(m[k] || '')[f]) : true;
  await _recModificaStili(
    (st) => {
      st[f] = on;
    },
    f === 'b' ? (on ? 'Grassetto' : 'Grassetto tolto') : on ? 'Corsivo' : 'Corsivo tolto',
  );
}
async function pianoRecColoreTesto(colore) {
  await _recModificaStili(
    (st) => {
      st.t = colore || '';
    },
    colore ? 'Testo colorato' : 'Colore del testo tolto',
  );
}
// barretta identica a quella del calendario (stessa palette, stesso secchiello)
function _recColoriBarHtml() {
  return (
    '<span style="position:relative;display:inline-flex;align-items:center">' +
    '<button class="btn-export pbar-btn pbar-color" title="Applica alla selezione il colore mostrato nella barretta (per cambiarlo usa la freccia accanto)" onclick="event.stopPropagation();pianoRecColora(_colUltimo() || null)"><span style="display:flex;flex-direction:column;gap:3px;min-width:44px">Colora' +
    _colChipHtml() +
    '</span></button>' +
    '<button class="btn-export pbar-btn pbar-color" style="padding-left:6px;padding-right:6px" title="Scegli un altro colore o il formato (grassetto, corsivo)" onclick="event.stopPropagation();pianoRecColoriToggle()">&#9662;</button>' +
    '<div id="rec-colori-pop" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<span data-c="' +
        c +
        '" onclick="pianoRecColora(\'' +
        c +
        '\')" style="display:inline-block;width:22px;height:22px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="pianoRecColora(null)">Togli colore</button>' +
    '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
    '<button class="btn-export" style="font-size:.82rem;font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulla selezione" onclick="pianoRecFormato(\'b\')">G</button> ' +
    '<button class="btn-export" style="font-size:.82rem;font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulla selezione" onclick="pianoRecFormato(\'i\')">C</button>' +
    '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
    '<span style="font-size:.82rem;color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
    PIANO_COLORI_TESTO.map(
      (c) =>
        '<span onclick="pianoRecColoreTesto(\'' +
        c +
        '\')" style="display:inline-block;width:18px;height:18px;background:' +
        c +
        ';border:1px solid #999;border-radius:50%;margin:1px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="pianoRecColoreTesto(null)">&#10005;</button>' +
    '</div></div></span>'
  );
}
// applica sfondo, grassetto, corsivo e colore testo a un td e alla sua casella
function _recApplicaStileEl(td, inp, stile) {
  const st = _stileCella(stile || '');
  td.style.background = st.c || '';
  const bersaglio = inp || td;
  bersaglio.style.fontWeight = st.b ? '700' : '';
  bersaglio.style.fontStyle = st.i ? 'italic' : '';
  bersaglio.style.color = st.t || '';
}
// riapplica tutti gli stili alle celle visibili senza ridisegnare la scheda
function _recApplicaColoriDom() {
  const tab = document.getElementById('piano-recupero-table');
  if (!tab) return;
  tab.querySelectorAll('tbody tr[data-nome]').forEach((tr) => {
    const nome = tr.dataset.nome;
    const tdNome = tr.querySelector('.piano-nome');
    if (tdNome) _recApplicaStileEl(tdNome, null, _recColori.righe[nome] || '');
    tr.querySelectorAll('td[data-gg]').forEach((td) => {
      const dstr = _pianoMeseSel + '-' + td.dataset.gg;
      _recApplicaStileEl(td, td.querySelector('input'), _recStileDi(nome, dstr));
    });
  });
}
function pianoRecuperoOrdina(campo) {
  window._pianoRecuperoOrdine = campo;
  renderPiano();
}
async function _renderPianoRecuperoTab() {
  const ym = _pianoMeseSel;
  await _pianoCaricaRecupero(ym);
  await _recCaricaColori(ym);
  _recSel = { righe: {}, colonne: {}, celle: {} };
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const nGiorni = new Date(anno, mese, 0).getDate();
  const GG3 = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
  const MESI_L = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const puoMod = puoGestirePiano() || isAdmin();
  // SOLO PERSONALE FISSO: gli ausiliari non hanno ore dovute, quindi non esiste
  // uno scostamento dal turno da recuperare. Le loro ore si contano su quelle
  // effettivamente lavorate (RAP Allegato 1).
  let nomi = ordineCollabPiano(
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && !(c.is_jolly || c.impiego === 'jolly'))
      .map((c) => c.nome),
    _pianoReparto(),
  );
  // ordinamento scelto dall'operatore (resta finche' non lo cambia)
  const _ord = window._pianoRecuperoOrdine || 'nome';
  if (_ord === 'totale') {
    nomi = nomi.slice().sort((a5, b5) => _pianoRecuperoTotale(a5, ym) - _pianoRecuperoTotale(b5, ym));
  } else if (_ord === 'percentuale') {
    nomi = nomi
      .slice()
      .sort(
        (a5, b5) =>
          (parseFloat((_pianoCollabInfo(b5) || {}).percentuale) || 1) -
            (parseFloat((_pianoCollabInfo(a5) || {}).percentuale) || 1) || a5.localeCompare(b5),
      );
  }
  const _oggiYm = _pianoYmOggi();
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Recupero ore &middot; personale fisso' +
    // stesse frecce del calendario, per cambiare mese senza uscire dalla scheda
    '<span style="display:inline-flex;align-items:center;gap:6px">' +
    '<button class="btn-export" style="padding:2px 10px;font-size:.9rem" title="Mese precedente" onclick="pianoCambiaMese(-1)">&#8592;</button>' +
    '<b style="min-width:150px;text-align:center">' +
    (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) +
    ' ' +
    ym.split('-')[0] +
    '</b>' +
    '<button class="btn-export" style="padding:2px 10px;font-size:.9rem" title="Mese successivo" onclick="pianoCambiaMese(1)">&#8594;</button>' +
    (ym !== _oggiYm
      ? '<button class="btn-act" style="font-size:.82rem" title="Torna al mese corrente" onclick="pianoVaiMeseCorrente()">Mese corrente</button>'
      : '') +
    '</span>' +
    '<span id="piano-recupero-riepilogo" style="margin-left:auto;font-size:.85rem;font-weight:400"></span></div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Si aggiorna <b>ogni giorno</b>: nella casella del giorno si scrive quanto il collaboratore ha lavorato in piu o in meno rispetto al turno previsto. <b>-1</b> significa un ora in meno (rosso), <b>+3</b> tre ore in piu (verde). Casella vuota = ha fatto esattamente il suo turno. Il totale del mese entra nel <b>saldo ore</b>, quindi il conteggio resta aggiornato senza aspettare la fine del mese.</p>';
  if (!nomi.length) {
    h += '<p style="color:var(--muted);padding:10px 0">Nessun collaboratore in questo settore.</p></div></div>';
    return h;
  }
  h +=
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
    '<span style="font-size:.85rem;color:var(--muted)">Ordina per</span>' +
    '<select onchange="pianoRecuperoOrdina(this.value)" style="padding:5px 9px;font-size:.85rem;border:1px solid var(--line);border-radius:3px;background:var(--paper);color:var(--ink)">' +
    [
      ['nome', 'Nome'],
      ['totale', 'Totale del mese'],
      ['percentuale', 'Percentuale'],
    ]
      .map(
        (o) =>
          '<option value="' +
          o[0] +
          '"' +
          ((window._pianoRecuperoOrdine || 'nome') === o[0] ? ' selected' : '') +
          '>' +
          o[1] +
          '</option>',
      )
      .join('') +
    '</select>' +
    '<input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-recupero-table\')">' +
    '</div>';
  // barretta selezione e colori: la STESSA del calendario (secchiello con
  // l'ultimo colore condiviso, palette, grassetto, corsivo, colore del testo)
  h +=
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
    _recColoriBarHtml() +
    '<button class="btn-export" style="font-size:.82rem;padding:4px 12px" onclick="pianoRecSelPulisci()">Deseleziona</button>' +
    '<b id="rec-sel-info" style="font-size:.85rem;color:#b8860b"></b>' +
    '<span style="font-size:.82rem;color:var(--muted);margin-left:auto">Click sul nome = riga &middot; click sul giorno = colonna &middot; Ctrl+click aggiunge (anche singole caselle)</span>' +
    '</div>';
  h +=
    // scorrimento DENTRO il riquadro: cosi' la riga delle date resta fissa in
    // alto e la colonna dei collaboratori resta fissa a sinistra
    '<div style="overflow:auto;max-height:72vh"><table id="piano-recupero-table" class="piano-table" style="width:' +
    (270 + 46 * nGiorni + 90) +
    'px"><thead><tr><th class="piano-nome" style="width:210px">Collaboratore</th><th style="width:60px" title="Percentuale d impiego: le ore dovute si calcolano su questa">%</th>';
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = ym + '-' + String(g).padStart(2, '0');
    const dow = new Date(dstr + 'T12:00:00').getDay();
    const _gg = String(g).padStart(2, '0');
    h +=
      '<th data-gg="' +
      _gg +
      '" onclick="pianoRecSelColonna(event,\'' +
      _gg +
      '\',this)" title="Click: seleziona la colonna &middot; Ctrl+click: aggiunge alla selezione" style="width:46px;cursor:pointer' +
      (dow === 0 ? ';background:#7a2e2e;color:#fff' : dow === 6 ? ';background:#5a4a3a;color:#fff' : '') +
      '"><div>' +
      GG3[dow] +
      '</div><div>' +
      g +
      '</div></th>';
  }
  h += '<th style="width:90px" title="Somma degli scostamenti del mese">Totale</th></tr></thead><tbody>';
  nomi.forEach((nome) => {
    const _infoR = _pianoCollabInfo(nome) || {};
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td class="piano-nome" onclick="pianoRecSelRiga(event,\'' +
      escP(nome.replace(/'/g, "\\'")) +
      '\',this)" title="Click: seleziona la riga &middot; Ctrl+click: aggiunge &middot; ' +
      escP(nome) +
      '" style="text-align:left;cursor:pointer">' +
      escP(nome) +
      '</td><td style="color:var(--muted)">' +
      Math.round((parseFloat(_infoR.percentuale) || 1) * 100) +
      '%</td>';
    for (let g = 1; g <= nGiorni; g++) {
      const dstr = ym + '-' + String(g).padStart(2, '0');
      const r = _pianoRecupero[nome + '|' + dstr];
      const v = r ? parseFloat(r.ore) : '';
      h +=
        '<td data-gg="' +
        dstr.substring(8) +
        '" style="padding:1px"><input class="rec-cella' +
        (v > 0 ? ' rec-piu' : v < 0 ? ' rec-meno' : '') +
        '" data-nome="' +
        escP(nome).replace(/"/g, '&quot;') +
        '" data-data="' +
        dstr +
        '" onmousedown="pianoRecSelCella(event,this)" type="text" inputmode="decimal" value="' +
        (v === '' ? '' : v) +
        '"' +
        (puoMod
          ? ' onchange="pianoRecuperoCella(this,\'' + escP(nome.replace(/'/g, "\\'")) + "','" + dstr + '\')"'
          : ' readonly') +
        ' title="' +
        escP(nome) +
        ' &middot; ' +
        dstr.split('-').reverse().join('.') +
        (r && r.operatore ? ' &middot; ' + escP(r.operatore) : '') +
        '"></td>';
    }
    const tot = _pianoRecuperoTotale(nome, ym);
    h +=
      '<td class="rec-totale' +
      (tot > 0 ? ' rec-piu' : tot < 0 ? ' rec-meno' : '') +
      '">' +
      (tot
        ? (tot > 0 ? '+' : '') +
          String(tot).replace(/\.00$/, '') +
          '<div style="font-size:.78em;font-weight:400;opacity:.8">' +
          (tot > 0 ? '+' : '-') +
          _pianoOreHm(Math.abs(tot)) +
          '</div>'
        : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);margin-top:10px">Le stesse ore compaiono nella colonna <b>SM</b> del calendario e nella scheda <b>Saldo</b>, sommate alle ore del piano. Chi scrive e quando resta nel registro.</p>';
  h += '</div></div>';
  return h;
}
// ===========================================================================
// FESTIVITA' E ORARI DI CHIUSURA
// Giorni in cui si chiude alle 05:00 invece che alle 04:00 (o alle 07:00 il 31
// dicembre). Servono a sapere in anticipo quando mettere piu' personale.
// ===========================================================================
// Cache PER ANNO: il saldo annuale e le statistiche attraversano mesi diversi,
// e un solo anno in memoria faceva sparire le festivita' degli altri. Da questo
// dipende anche l'orario prolungato dei turni nei giorni di chiusura tardi,
// quindi un dato mancante diventerebbe un conteggio di ore sbagliato.
let _pianoFestivitaPerAnno = {};
let pianoFestivitaCache = [];
let _pianoFestivitaAnnoCaricato = null;
async function _pianoCaricaFestivita(anno) {
  anno = parseInt(anno);
  if (!_pianoFestivitaPerAnno[anno]) {
    _pianoFestivitaPerAnno[anno] =
      (await secGet('piano_festivita?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=500')) || [];
  }
  pianoFestivitaCache = _pianoFestivitaPerAnno[anno]; // l'anno mostrato nella scheda Festivi
  _pianoFestivitaAnnoCaricato = anno;
  return pianoFestivitaCache;
}
function _pianoFestivitaScarta(anno) {
  delete _pianoFestivitaPerAnno[parseInt(anno)];
  _pianoFestivitaAnnoCaricato = null;
}
// mappa { 'YYYY-MM-DD': nome } delle festivita' attive di TUTTI gli anni caricati
function _pianoFestivitaMappa() {
  const m = {};
  Object.keys(_pianoFestivitaPerAnno).forEach((a) => {
    (_pianoFestivitaPerAnno[a] || []).forEach((f) => {
      if (f.attivo !== false) m[String(f.data).substring(0, 10)] = f.nome;
    });
  });
  return m;
}
// configurazione degli orari, modificabile dalle regole
function _pianoChiusuraCfg() {
  const giorni = String(_pianoRegolaVal('chiusura_giorni_tardi') || '5,6')
    .split(',')
    .map((x) => parseInt(x.trim()))
    .filter((x) => !isNaN(x));
  // chiusura "facoltativa" scritta nella scheda della festivita': vale per la
  // notte che precede quel giorno (prima veniva salvata e mai letta)
  const orePerData = {};
  Object.keys(_pianoFestivitaPerAnno || {}).forEach((a) => {
    (_pianoFestivitaPerAnno[a] || []).forEach((f) => {
      if (f.attivo !== false && f.ora_chiusura != null && f.ora_chiusura !== '')
        orePerData[String(f.data).substring(0, 10)] = parseFloat(f.ora_chiusura);
    });
  });
  return {
    oraNormale: parseFloat(_pianoRegolaVal('chiusura_ora_normale')) || 4,
    oraTardi: parseFloat(_pianoRegolaVal('chiusura_ora_tardi')) || 5,
    oraFineAnno: parseFloat(_pianoRegolaVal('chiusura_ora_fine_anno')) || 7,
    giorniTardi: giorni.length ? giorni : [5, 6],
    orePerData: orePerData,
  };
}
function _pianoChiusuraGiorno(dstr) {
  return PianoRegole.chiusuraDelGiorno(dstr, _pianoFestivitaMappa(), _pianoChiusuraCfg());
}
// ELENCHI FORNITI DALLA DIREZIONE (2026 e 2027). Per gli altri anni il
// programma calcola le dodici festivita' italiane di legge (Pasqua compresa).
const PIANO_FESTIVITA_ELENCHI = {
  2026: [
    ['2026-01-01', 'Capodanno'],
    ['2026-01-06', 'Epifania del Signore'],
    ['2026-03-08', 'Festa internazionale della donna'],
    ['2026-04-05', 'Pasqua'],
    ['2026-04-06', "Lunedi dell'Angelo"],
    ['2026-04-25', 'Festa della Liberazione'],
    ['2026-05-01', 'Festa del Lavoro'],
    ['2026-06-02', 'Festa della Repubblica Italiana'],
    ['2026-08-15', 'Ferragosto'],
    ['2026-08-24', "Giorno dell'indipendenza dell'Ucraina"],
    ['2026-10-01', "Giornata dei difensori dell'Ucraina"],
    ['2026-10-04', "Festa nazionale San Francesco d'Assisi"],
    ['2026-11-01', 'Tutti i Santi'],
    ['2026-12-08', 'Immacolata Concezione'],
    ['2026-12-25', 'Natale'],
    ['2026-12-26', 'Santo Stefano'],
  ],
  2027: [
    ['2027-01-01', 'Capodanno'],
    ['2027-01-06', 'Epifania'],
    ['2027-03-28', 'Pasqua'],
    ['2027-03-29', "Lunedi dell'Angelo"],
    ['2027-04-25', 'Festa della Liberazione'],
    ['2027-05-01', 'Festa dei Lavoratori'],
    ['2027-06-02', 'Festa della Repubblica'],
    ['2027-08-15', 'Ferragosto'],
    ['2027-11-01', 'Tutti i Santi'],
    ['2027-12-08', 'Immacolata Concezione'],
    ['2027-12-25', 'Natale'],
    ['2027-12-26', 'Santo Stefano'],
  ],
};
function _pianoFestivitaProposte(anno) {
  const elenco = PIANO_FESTIVITA_ELENCHI[anno];
  if (elenco) return elenco.map((x) => ({ data: x[0], nome: x[1] }));
  return PianoRegole.festivitaItaliane(anno);
}
async function pianoImportaFestivita(anno) {
  if (!puoGestireFestivi()) {
    toast('Serve il permesso Festivi e CGF');
    return;
  }
  await _pianoCaricaFestivita(anno);
  const gia = new Set((pianoFestivitaCache || []).map((f) => String(f.data).substring(0, 10) + '|' + f.nome));
  const nuovi = _pianoFestivitaProposte(anno).filter((f) => !gia.has(f.data + '|' + f.nome));
  if (!nuovi.length) {
    toast('Le festivita del ' + anno + ' sono gia inserite');
    return;
  }
  if (
    !confirm(
      'Inserisco ' +
        nuovi.length +
        ' festivita per il ' +
        anno +
        ':\n\n' +
        nuovi.map((f) => '\u2022 ' + f.data.split('-').reverse().join('.') + '  ' + f.nome).join('\n') +
        '\n\nQuelle gia presenti non vengono toccate.',
    )
  )
    return;
  let n = 0;
  for (const f of nuovi) {
    try {
      await secPost('piano_festivita', {
        data: f.data,
        nome: f.nome,
        paese: 'IT',
        attivo: true,
        operatore: getOperatore(),
      });
      n++;
    } catch (e) {
      console.warn('festivita', f.data, e && e.message);
    }
  }
  _pianoFestivitaScarta(anno);
  await _pianoCaricaFestivita(anno);
  logAzione('Festivita importate', anno + ': ' + n + ' giorni');
  toast(n + ' festivita inserite per il ' + anno);
  renderPiano();
}
async function pianoFestivitaToggle(id) {
  if (!puoGestireFestivi()) return;
  const f = (pianoFestivitaCache || []).find((x) => x.id === id);
  if (!f) return;
  const nuovo = f.attivo === false;
  await secPatch('piano_festivita', 'id=eq.' + id, { attivo: nuovo });
  f.attivo = nuovo;
  logAzione('Festivita ' + (nuovo ? 'riattivata' : 'disattivata'), f.nome + ' ' + f.data);
  renderPiano();
}
async function pianoFestivitaElimina(id) {
  if (!puoGestireFestivi()) return;
  const f = (pianoFestivitaCache || []).find((x) => x.id === id);
  if (!f) return;
  if (!confirm('Elimino "' + f.nome + '" del ' + String(f.data).split('-').reverse().join('.') + '?')) return;
  await secDel('piano_festivita', 'id=eq.' + id);
  pianoFestivitaCache = pianoFestivitaCache.filter((x) => x.id !== id);
  logAzione('Festivita eliminata', f.nome + ' ' + f.data);
  renderPiano();
}
async function pianoFestivitaAggiungi() {
  if (!puoGestireFestivi()) return;
  const data = (document.getElementById('festivita-data') || {}).value;
  const nome = ((document.getElementById('festivita-nome') || {}).value || '').trim();
  const ora = (document.getElementById('festivita-ora') || {}).value;
  if (!data || !nome) {
    toastErrore('Servono data e nome');
    return;
  }
  if (ora !== '' && ora != null && (isNaN(parseFloat(ora)) || parseFloat(ora) < 0 || parseFloat(ora) > 12)) {
    toastErrore('L ora di chiusura va da 0 a 12 (es. 5 per le cinque del mattino)');
    return;
  }
  try {
    await secPost('piano_festivita', {
      data: data,
      nome: nome,
      paese: 'IT',
      ora_chiusura: ora ? parseFloat(ora) : null,
      attivo: true,
      operatore: getOperatore(),
    });
    _pianoFestivitaScarta(parseInt(data.split('-')[0]));
    await _pianoCaricaFestivita(parseInt(data.split('-')[0]));
    logAzione('Festivita aggiunta', nome + ' ' + data);
    toast('Aggiunta: ' + nome);
    renderPiano();
  } catch (e) {
    toast('Gia presente o errore');
  }
}
function _renderPianoFestivitaCard() {
  if (!puoGestireFestivi()) return '';
  const anno = window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]);
  const cfg = _pianoChiusuraCfg();
  const GG = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const righe = (pianoFestivitaCache || [])
    .filter((f) => parseInt(String(f.data).substring(0, 4)) === anno)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Festivita e orari di chiusura ' +
    anno +
    '</div><div style="padding:12px 16px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Si chiude alle <b>' +
    cfg.oraNormale +
    ':00</b> nei giorni feriali e alle <b>' +
    cfg.oraTardi +
    ':00</b> il ' +
    cfg.giorniTardi.map((g) => GG[g]).join(' e il ') +
    '. <b>La notte prima di un giorno di festa</b> si chiude alle <b>' +
    cfg.oraTardi +
    ':00</b> anche in mezzo alla settimana, perche e quella la sera in cui la gente esce; il <b>31 dicembre</b> si chiude alle <b>' +
    cfg.oraFineAnno +
    ':00</b>. Quei giorni compaiono nel calendario con il marcatore <b>CH' +
    cfg.oraTardi +
    '</b> in cima alla colonna, cosi si sa dove serve piu personale. Gli orari si cambiano nella scheda Regole.</p>';
  h +=
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' +
    '<button class="btn-export" onclick="pianoImportaFestivita(' +
    anno +
    ')">Inserisci le festivita del ' +
    anno +
    '</button>' +
    '<span style="font-size:.82rem;color:var(--muted)">' +
    (PIANO_FESTIVITA_ELENCHI[anno]
      ? 'elenco fornito dalla direzione'
      : 'calcolate: dodici festivita italiane di legge, Pasqua compresa') +
    '</span></div>';
  if (!righe.length) {
    h += '<p style="padding:8px 0;color:var(--muted)">Nessuna festivita registrata per il ' + anno + '.</p>';
  } else {
    h +=
      '<div style="overflow-x:auto"><table class="piano-table" style="min-width:560px"><thead><tr>' +
      '<th style="text-align:left">Data</th><th>Giorno</th><th style="text-align:left">Festivita</th><th title="Il giorno prima della festa: e quella la notte in cui si chiude piu tardi">Si chiude tardi il</th><th title="Cosa compare in cima alla colonna del calendario, quel giorno">Nel piano</th><th></th></tr></thead><tbody>';
    righe.forEach((f) => {
      const d = String(f.data).substring(0, 10);
      // il marcatore si mette la VIGILIA, cioe' il giorno prima della festa
      const vig = new Date(d + 'T12:00:00');
      vig.setDate(vig.getDate() - 1);
      const dVig =
        vig.getFullYear() +
        '-' +
        String(vig.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(vig.getDate()).padStart(2, '0');
      const ch = _pianoChiusuraGiorno(dVig);
      const spento = f.attivo === false;
      h +=
        '<tr style="' +
        (spento ? 'opacity:.45' : '') +
        '"><td style="text-align:left">' +
        d.split('-').reverse().join('.') +
        '</td><td>' +
        GG[new Date(d + 'T12:00:00').getDay()] +
        '</td><td style="text-align:left;font-weight:600">' +
        escP(f.nome) +
        '</td><td' +
        (spento
          ? ''
          : ' title="notte fra il ' +
            dVig.split('-').reverse().join('.') +
            ' e il ' +
            d.split('-').reverse().join('.') +
            '"') +
        '>' +
        (spento
          ? '-'
          : GG[new Date(dVig + 'T12:00:00').getDay()] +
            ' ' +
            dVig.split('-').reverse().join('.') +
            ' &middot; ' +
            ch.ora +
            ':00') +
        '</td><td>' +
        (spento
          ? '<span style="color:var(--muted)">spenta</span>'
          : ch.marcatore
            ? '<b style="background:#8b4a8b;color:#fff;padding:2px 8px;border-radius:2px">' + ch.marcatore + '</b>'
            : '<span style="color:var(--muted)" title="quella notte si chiude gia tardi per prassi: non serve segnalarlo">-</span>') +
        '</td><td style="white-space:nowrap"><button class="btn-act" style="font-size:.82rem" onclick="pianoFestivitaToggle(' +
        f.id +
        ')">' +
        (spento ? 'Riattiva' : 'Spegni') +
        '</button> <button class="btn-act del" style="font-size:.82rem" onclick="pianoFestivitaElimina(' +
        f.id +
        ')">Elimina</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h +=
    '<div class="add-tipo-row" style="margin-top:12px"><div class="field"><label>Data</label><input type="date" id="festivita-data"></div>' +
    '<div class="field"><label>Festivita</label><input type="text" id="festivita-nome" placeholder="Es. Santo patrono"></div>' +
    '<div class="field"><label>Chiusura (facoltativa)</label><input type="number" id="festivita-ora" step="0.5" min="0" max="12" placeholder="' +
    cfg.oraTardi +
    '"></div>' +
    '<button class="btn-add-tipo" onclick="pianoFestivitaAggiungi()">+ Aggiungi</button></div>';
  h += '</div></div>';
  return h;
}
// ===== CONGEDI NON PAGATI (RAP 5.14) =====
// Un congedo e' un periodo dal/al. Tre effetti, con soglie dalle Regole:
//  - i giorni del piano sono CNP (0 ore) e NON contano fra le ore dovute;
//  - oltre congedo_np_giorni_vacanze il diritto vacanze dell'anno cala in
//    proporzione ai giorni di congedo di quell'anno;
//  - oltre congedo_np_mesi_anzianita l'anzianita' si sposta in avanti di
//    tutta la durata (giubilei e scaglioni vacanze); sotto non si interrompe.
function _pianoCongediDi(nome) {
  const n = String(nome || '').toLowerCase();
  return _pianoCongediNp.filter((c) => String(c.collaboratore || '').toLowerCase() === n);
}
function _pianoGiorniCongedo(c) {
  const a = new Date(String(c.dal).substring(0, 10) + 'T12:00:00');
  const b = new Date(String(c.al).substring(0, 10) + 'T12:00:00');
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}
// giorni di congedo di 'nome' dentro il mese ym (per le ore dovute)
function _pianoGiorniCnp(nome, ym) {
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  let g = 0;
  _pianoCongediDi(nome).forEach((c) => {
    const da = String(c.dal).substring(0, 10) > inizio ? String(c.dal).substring(0, 10) : inizio;
    const a = String(c.al).substring(0, 10) < fine ? String(c.al).substring(0, 10) : fine;
    if (a < da) return;
    g += Math.round((new Date(a + 'T12:00:00') - new Date(da + 'T12:00:00')) / 86400000) + 1;
  });
  return g;
}
// giorni del mese che contano per le ore dovute: tutti meno quelli di congedo
function _pianoGgDovuti(nome, ym) {
  return Math.max(0, _pianoUltimoGiorno(ym) - _pianoGiorniCnp(nome, ym));
}
// mappa 'nome|YYYY-MM-DD' -> true dei giorni di congedo nel mese (per la bozza)
function _pianoCnpMese(ym) {
  const out = {};
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  _pianoCongediNp.forEach((c) => {
    const da = String(c.dal).substring(0, 10);
    const a = String(c.al).substring(0, 10);
    if (a < inizio || da > fine) return;
    const cur = new Date((da < inizio ? inizio : da) + 'T12:00:00');
    const stop = a > fine ? fine : a;
    while (cur.toISOString().substring(0, 10) <= stop) {
      out[c.collaboratore + '|' + cur.toISOString().substring(0, 10)] = true;
      cur.setDate(cur.getDate() + 1);
    }
  });
  return out;
}
// effetti per l'anno: { giorniVacanze, giorniAnzianita }
function _pianoCongedoNpEffetti(nome, anno) {
  const sogliaGg = parseInt(_pianoRegolaVal('congedo_np_giorni_vacanze'));
  const sogliaMesi = parseInt(_pianoRegolaVal('congedo_np_mesi_anzianita'));
  const sg = isNaN(sogliaGg) ? 10 : sogliaGg;
  const sm = isNaN(sogliaMesi) ? 6 : sogliaMesi;
  let giorniVacanze = 0;
  let giorniAnzianita = 0;
  _pianoCongediDi(nome).forEach((c) => {
    const tot = _pianoGiorniCongedo(c);
    if (tot > sg) {
      // solo la parte che cade nell'anno richiesto
      const inizio = anno + '-01-01';
      const fine = anno + '-12-31';
      const da = String(c.dal).substring(0, 10) > inizio ? String(c.dal).substring(0, 10) : inizio;
      const a = String(c.al).substring(0, 10) < fine ? String(c.al).substring(0, 10) : fine;
      if (a >= da) giorniVacanze += Math.round((new Date(a + 'T12:00:00') - new Date(da + 'T12:00:00')) / 86400000) + 1;
    }
    if (tot > sm * 30.44) giorniAnzianita += tot;
  });
  return { giorniVacanze: giorniVacanze, giorniAnzianita: giorniAnzianita };
}
// RICONCILIAZIONE: se per 'nome' nel mese ym i recuperi goduti superano
// quelli maturati (un festivo e' saltato per malattia dopo che la bozza aveva
// gia' messo il CGF), i CGF automatici in piu' del mese tornano congedo C.
async function _pianoRiconciliaCgf(nome, ym) {
  try {
    const info = _pianoCollabInfo(nome);
    if (!info || !_pianoMaturaCgf(info)) return 0;
    const anno = ym.substring(0, 4);
    const finoA = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
    await _pianoCaricaCgfRiporto(anno);
    const righe = await _pianoCaricaRigheCgf(anno, finoA);
    const conto = _pianoContabilitaCgf(righe, [nome], anno, finoA)[nome];
    if (!conto || conto.resta >= 0) return 0;
    let extra = -conto.resta;
    const candidati = righe
      .filter(
        (r) =>
          r.collaboratore === nome &&
          String(r.data).startsWith(ym) &&
          r.codice === 'CGF' &&
          r.generato &&
          !r.protetto &&
          !r.motivo_blocco,
      )
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    let fatte = 0;
    for (const r of candidati) {
      if (extra <= 0) break;
      if (_pianoGiornoBloccato(r.data) && !_pianoGiornoSbloccato(r.data)) continue;
      await secPatch('piano', 'id=eq.' + r.id, {
        codice: 'C',
        commento: 'CGF tolto: festivo non lavorato (malattia)',
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
      const inMem = _pianoRighe.find((x) => x.id === r.id);
      if (inMem) {
        inMem.codice = 'C';
        inMem.commento = 'CGF tolto: festivo non lavorato (malattia)';
      }
      extra--;
      fatte++;
    }
    if (fatte) {
      logAzione('Piano: CGF tolti (festivo in malattia)', nome + ' ' + ym + ' · ' + fatte);
      toast(
        fatte +
          ' recuper' +
          (fatte === 1 ? 'o' : 'i') +
          ' di ' +
          nome.split(' ')[0] +
          ' tolt' +
          (fatte === 1 ? 'o' : 'i') +
          ': festivo non lavorato',
      );
    }
    return fatte;
  } catch (e) {
    console.error('riconcilia CGF', e);
    return 0;
  }
}
// Le celle del piano seguono il congedo: CNP protetto sui giorni del periodo
// (rimuovi = true le toglie). Scrive anche nei giorni chiusi: registrare un
// congedo e' un atto amministrativo, non una modifica del turno.
async function _pianoSincronizzaCongedoNp(c, rimuovi) {
  const giorni = [];
  const cur = new Date(String(c.dal).substring(0, 10) + 'T12:00:00');
  const stop = String(c.al).substring(0, 10);
  let n = 0;
  while (cur.toISOString().substring(0, 10) <= stop && n < 400) {
    giorni.push(cur.toISOString().substring(0, 10));
    cur.setDate(cur.getDate() + 1);
    n++;
  }
  const op = getOperatore();
  let fatte = 0;
  for (const d of giorni) {
    const righe =
      (await secGet('piano?collaboratore=eq.' + encodeURIComponent(c.collaboratore) + '&data=eq.' + d + '&limit=2')) ||
      [];
    const r = righe[0];
    if (rimuovi) {
      if (r && r.codice === 'CNP') {
        await secDel('piano', 'id=eq.' + r.id);
        fatte++;
      }
      continue;
    }
    const body = {
      codice: 'CNP',
      protetto: true,
      generato: false,
      commento: ('Congedo non pagato' + (c.motivo ? ': ' + c.motivo : '')).substring(0, 400),
      operatore: op,
    };
    if (r) {
      if (r.codice === 'CNP') continue;
      body.updated_at = new Date().toISOString();
      await secPatch('piano', 'id=eq.' + r.id, body);
    } else {
      await secPost(
        'piano',
        Object.assign({ collaboratore: c.collaboratore, data: d, reparto_dip: c.reparto_dip || _pianoReparto() }, body),
      );
    }
    fatte++;
  }
  return fatte;
}
// DOMENICHE LIBERE: una domenica passata in vacanza o in malattia non e' un
// riposo settimanale concesso dal piano: non conta ne' come libera ne' come
// lavorata. UNICO criterio per validatore, tabella Domeniche e Benessere
// (prima ogni schermata escludeva codici diversi e i conteggi non tornavano).
function _pianoDomenicaEsclusa(cod) {
  return cod === 'V' || cod === 'V1' || cod === 'M' || cod === 'M1';
}
// REGOLA CGF: il festivo che cade di DOMENICA non matura compensazione
function _festivoCgfDefault(dstr) {
  return new Date(dstr + 'T12:00:00').getDay() !== 0;
}
// Regola cgf_solo_parificati (predefinita SI): il recupero matura solo sui
// nove festivi parificati alla domenica dell'Allegato 1 del RAP, come nel
// foglio Excel. Si spegne dalla scheda Regole se un giorno cambiasse.
function _pianoCgfSoloParificati() {
  const v = _pianoRegolaVal('cgf_solo_parificati');
  return v == null ? true : String(v).toUpperCase() === 'TRUE';
}
// UN SOLO criterio per "questo festivo da' diritto al CGF": flag attivo,
// non domenica e, con la regola, parificato. Lo usano bozza, assegnazione
// manuale, elenco "chi ha diritto", statistiche e la scheda Festivi.
function _pianoFestivoDaCgf(f) {
  if (!f || f.cgf === false) return false;
  if (!_festivoCgfDefault(f.data)) return false;
  if (_pianoCgfSoloParificati() && !_pianoFestivoParificato(f)) return false;
  return true;
}
function _pianoFestiviCgfSet() {
  return new Set(pianoFestiviCache.filter(_pianoFestivoDaCgf).map((f) => f.data));
}
// Riporto CGF dall'anno precedente (tabella piano_cgf_riporto), per settore
let _pianoCgfRiporto = {}; // 'nome|anno' -> record
async function _pianoCaricaCgfRiporto(anno) {
  const r =
    (await secGet('piano_cgf_riporto?anno=eq.' + anno + '&reparto_dip=eq.' + _pianoReparto() + '&limit=500')) || [];
  _pianoCgfRiporto = {};
  r.forEach((x) => (_pianoCgfRiporto[x.collaboratore + '|' + x.anno] = x));
}
// Righe del piano del settore su anno precedente + anno corrente: la base
// di ogni conteggio CGF (un festivo di fine dicembre si compensa a gennaio).
// finoA = ultimo giorno da considerare (di norma la fine del mese aperto):
// i CGF gia' messi nei mesi FUTURI non contano, ne' come goduti ne' come
// maturati. Il credito si legge solo dal passato e dal mese in corso.
async function _pianoCaricaRigheCgf(anno, finoA) {
  const annoPrec = String(Number(anno) - 1);
  const stop = finoA && finoA < anno + '-12-31' ? finoA : anno + '-12-31';
  return (
    (await secGet(
      'piano?data=gte.' + annoPrec + '-01-01&data=lte.' + stop + '&reparto_dip=eq.' + _pianoReparto() + '&limit=60000',
    )) || []
  );
}
// UNICA CONTABILITA' dei recuperi festivi. Per ogni fisso in 'nomi':
//   maturati = festivi con diritto lavorati; goduti = CGF presi; persi = CGF
//   caduti in malattia (il credito resta); riporto = dall'anno prima.
// Se esiste un riporto per l'anno, l'anno precedente non si conta (e' gia'
// dentro il riporto); altrimenti si contano anche i festivi e i CGF dell'anno
// prima. resta = riporto + maturati - goduti.
// finoA (facoltativo): le righe dopo quella data non contano (niente futuro).
// Un festivo conta come LAVORATO solo se c'e' il turno E la persona non e' in
// malattia quel giorno: chi manca al festivo non matura il recupero.
function _pianoContabilitaCgf(righe, nomi, anno, finoA) {
  const fest = _pianoFestiviCgfSet();
  const mal = {};
  if (finoA) righe = righe.filter((r) => String(r.data).substring(0, 10) <= finoA);
  new Set(righe.map((r) => String(r.data).substring(0, 7))).forEach((m) => Object.assign(mal, _pianoMalattieMese(m)));
  const s = {};
  nomi.forEach((n) => {
    const rip = _pianoCgfRiporto[n + '|' + anno];
    s[n] = {
      maturati: 0,
      goduti: 0,
      persi: 0,
      riporto: rip ? parseInt(rip.riporto) || 0 : 0,
      conRiporto: !!rip,
      festivi: [],
      festiviMese: {},
    };
  });
  righe.forEach((r) => {
    const o = s[r.collaboratore];
    if (!o) return;
    const a = String(r.data).substring(0, 4);
    if (o.conRiporto && a !== String(anno)) return;
    if (fest.has(r.data) && _pianoTurnoInfo(r.codice) && !mal[r.collaboratore + '|' + r.data]) {
      o.maturati++;
      o.festivi.push(r.data);
      const m = String(r.data).substring(0, 7);
      (o.festiviMese[m] = o.festiviMese[m] || []).push(parseInt(r.data.split('-')[2]));
    }
    if (r.codice === 'CGF') {
      if (mal[r.collaboratore + '|' + r.data]) o.persi++;
      else o.goduti++;
    }
  });
  nomi.forEach((n) => (s[n].resta = s[n].riporto + s[n].maturati - s[n].goduti));
  return s;
}
// PIAZZAMENTO di 'quanti' CGF per 'nome' nel mese, con le regole:
//   cgf_max_mese (max nel mese, contando quelli gia' presenti),
//   cgf_distanza_giorni (mai due CGF vicini), cgf_non_con_vacanze (mai
//   accanto a una V), mai su malattia, compleanno o cella occupata.
// ctx: { ym, nGiorni, cella (nome|g -> codice), malattie (nome|data), compleanni (nome|g),
//        preferiti [g...] (giorni da provare per primi), fabbTot (g -> fabbisogno) }
// Ritorna i giorni scelti; e' chi chiama a scrivere le celle.
function _pianoPiazzaCgf(nome, quanti, ctx) {
  const maxMese = parseInt(_pianoRegolaVal('cgf_max_mese'));
  const dist = parseInt(_pianoRegolaVal('cgf_distanza_giorni'));
  const noVac = String(_pianoRegolaVal('cgf_non_con_vacanze') || 'TRUE').toUpperCase() === 'TRUE';
  const isV = (c) => c === 'V' || c === 'V1';
  const cgfNelMese = () => {
    let n = 0;
    for (let g = 1; g <= ctx.nGiorni; g++) if (ctx.cella[nome + '|' + g] === 'CGF') n++;
    return n;
  };
  const ok = (g) => {
    if (g < 1 || g > ctx.nGiorni) return false;
    if (ctx.chiusi && ctx.chiusi.has(g)) return false;
    if (ctx.cella[nome + '|' + g]) return false;
    const dstr = ctx.ym + '-' + String(g).padStart(2, '0');
    if (ctx.malattie[nome + '|' + dstr]) return false;
    if (ctx.compleanni && ctx.compleanni[nome + '|' + g]) return false;
    if (noVac && (isV(ctx.cella[nome + '|' + (g - 1)]) || isV(ctx.cella[nome + '|' + (g + 1)]))) return false;
    if (!isNaN(dist) && dist > 0)
      for (let k = g - dist; k <= g + dist; k++) if (k !== g && ctx.cella[nome + '|' + k] === 'CGF') return false;
    return true;
  };
  const scelti = [];
  // ordine di prova: prima i giorni preferiti (dopo il festivo del mese),
  // poi i giorni con meno fabbisogno (piu' facili da lasciare liberi)
  const tutti = [];
  for (let g = 1; g <= ctx.nGiorni; g++) tutti.push(g);
  const pref = (ctx.preferiti || []).filter((g) => g >= 1 && g <= ctx.nGiorni);
  const resto = tutti
    .filter((g) => !pref.includes(g))
    .sort((a, b) => ((ctx.fabbTot || {})[a] || 0) - ((ctx.fabbTot || {})[b] || 0) || a - b);
  for (const g of pref.concat(resto)) {
    if (scelti.length >= quanti) break;
    if (!isNaN(maxMese) && maxMese > 0 && cgfNelMese() >= maxMese) break;
    if (!ok(g)) continue;
    ctx.cella[nome + '|' + g] = 'CGF';
    scelti.push(g);
  }
  return scelti;
}
// FESTIVI PARIFICATI ALLE DOMENICHE — RAP Allegato 1 (Personale ausiliario,
// versione 3.0 del 1° gennaio 2022). Sono i SOLI nove giorni per cui il
// personale ausiliario (jolly) che lavora ha diritto al supplemento del 50%
// sul salario orario lordo. Gli altri festivi cantonali (San Giuseppe, Festa
// del Lavoro, Pentecoste, Corpus Domini, SS. Pietro e Paolo, Immacolata) NON
// sono parificati e non danno il supplemento.
const PIANO_FESTIVI_PARIFICATI = [
  'capodanno',
  'epifania',
  'lunedì di pasqua',
  'lunedi di pasqua',
  'ascensione',
  'festa nazionale', // 1° agosto
  '1 agosto',
  'assunzione',
  'ognissanti',
  'natale',
  'santo stefano',
];
// ORE DI LAVORO NOTTURNO di un turno, cioe' quante ore cadono nella fascia
// notturna (per legge 23:00-06:00, modificabile dalle regole notte_inizio /
// notte_fine). Serve per il supplemento del 10% in tempo libero pagato dovuto
// al personale ausiliario (RAP Allegato 1).
// ORE EFFETTIVAMENTE LAVORATE di un turno: dalla timbratura di entrata a
// quella di uscita, SENZA il supplemento del 10% sul lavoro notturno (che e'
// compreso nella durata contrattuale del turno). Se la cella ha orari suoi
// (turno personalizzato, JG) valgono quelli.
function _pianoOreEffettiveTurno(t, riga) {
  // se il turno si prolunga nei giorni di chiusura tardi, valgono quegli orari
  const eff = t && riga && riga.data ? _pianoTurnoDelGiorno(t, String(riga.data).substring(0, 10)) : null;
  const oi = (riga && riga.ora_inizio) || (eff && eff.ora_inizio) || (t && t.ora_inizio);
  const of = (riga && riga.ora_fine) || (eff && eff.ora_fine) || (t && t.ora_fine);
  const i = _pianoOra(oi);
  let f = _pianoOra(of);
  if (i == null || f == null) return 0;
  if (f <= i) f += 24;
  return Math.round((f - i) * 100) / 100;
}
function _pianoOreNotturneTurno(t) {
  if (!t) return 0;
  const ni = parseFloat(_pianoRegolaVal('notte_inizio'));
  const nf = parseFloat(_pianoRegolaVal('notte_fine'));
  const inizioN = !isNaN(ni) ? ni : 23;
  const fineN = !isNaN(nf) ? nf : 6;
  const i = _pianoOra(t.ora_inizio);
  let f = _pianoOra(t.ora_fine);
  if (i == null || f == null) return 0;
  if (f <= i) f += 24; // turno che passa la mezzanotte
  // due finestre notturne: quella della notte in corso e quella del mattino
  const finestre = [
    [inizioN, fineN + 24],
    [inizioN - 24, fineN],
  ];
  let ore = 0;
  finestre.forEach((w) => {
    const a = Math.max(i, w[0]);
    const b = Math.min(f, w[1]);
    if (b > a) ore += b - a;
  });
  return Math.round(ore * 100) / 100;
}
// Tempo libero pagato maturato sulle ore notturne: 10% (RAP Allegato 1),
// percentuale modificabile dalle regole (notte_percentuale)
function _pianoNotteRecupero(oreNotturne) {
  const p = parseFloat(_pianoRegolaVal('notte_percentuale'));
  const perc = !isNaN(p) && p > 0 ? p : 10;
  return Math.round((((oreNotturne || 0) * perc) / 100) * 100) / 100;
}
// INDENNITA' DEGLI AUSILIARI (RAP Allegato 1): si calcolano in percentuale
// sulle ore effettivamente lavorate, perche' gli ausiliari non hanno una
// percentuale contrattuale. Percentuali modificabili dalle regole.
function _pianoIndennitaJolly(oreLavorate) {
  const v4 = parseFloat(_pianoRegolaVal('jolly_indennita_vacanze_4sett'));
  const v5 = parseFloat(_pianoRegolaVal('jolly_indennita_vacanze_5sett'));
  const t13 = parseFloat(_pianoRegolaVal('jolly_indennita_tredicesima'));
  const pV4 = !isNaN(v4) ? v4 : 8.33;
  const pV5 = !isNaN(v5) ? v5 : 10.65;
  const pT = !isNaN(t13) ? t13 : 8.33;
  const h = (p) => Math.round(((oreLavorate * p) / 100) * 100) / 100;
  return (
    Math.round(oreLavorate * 10) / 10 +
    'h lavorate · vacanze ' +
    pV4 +
    '% = ' +
    h(pV4) +
    'h (con 5 settimane ' +
    pV5 +
    '% = ' +
    h(pV5) +
    'h) · tredicesima ' +
    pT +
    '% = ' +
    h(pT) +
    'h'
  );
}
function _pianoFestivoParificato(fest) {
  if (!fest) return false;
  const d = String(fest.descrizione || '')
    .trim()
    .toLowerCase();
  if (PIANO_FESTIVI_PARIFICATI.includes(d)) return true;
  // riconoscimento anche dalla data, per festivi rinominati a mano
  const md = String(fest.data || '').substring(5);
  return ['01-01', '01-06', '08-01', '08-15', '11-01', '12-25', '12-26'].includes(md);
}
// Se l'anno selezionato non ha festivi li genera da solo (sono deterministici)
async function _generaFestiviSeMancanti() {
  if (!isAdmin()) return;
  const anno = window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]);
  if (pianoFestiviCache.some((f) => parseInt(f.data.split('-')[0]) === anno)) return;
  const esistenti = new Set(pianoFestiviCache.map((f) => f.data));
  const nuovi = _pianoFestiviAnno(anno).filter((f) => !esistenti.has(f.data));
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', {
        data: f.data,
        descrizione: f.descrizione,
        cgf: _festivoCgfDefault(f.data),
      });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    if (nuovi.length) {
      logAzione('Piano: festivi generati automaticamente', anno + ' · ' + nuovi.length);
      toast('Festivi ' + anno + ' generati automaticamente (' + nuovi.length + ')');
    }
  } catch (e) {}
}
async function generaPianoFestivi() {
  if (!isAdmin()) return;
  const anno = parseInt((document.getElementById('pf-genera-anno') || {}).value);
  if (!anno || anno < 2024 || anno > 2050) {
    toast('Inserisci un anno valido (2024-2050)');
    return;
  }
  const esistenti = new Set(pianoFestiviCache.map((f) => f.data));
  const nuovi = _pianoFestiviAnno(anno).filter((f) => !esistenti.has(f.data));
  if (!nuovi.length) {
    toast('Festivi ' + anno + ' già tutti presenti');
    return;
  }
  if (
    !confirm(
      'Generare ' +
        nuovi.length +
        ' festivi per il ' +
        anno +
        '?\n\n' +
        nuovi
          .map((f) => new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') + ' · ' + f.descrizione)
          .join('\n') +
        '\n\n(tutti con CGF attivo; quelli già presenti non vengono toccati)',
    )
  )
    return;
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', {
        data: f.data,
        descrizione: f.descrizione,
        cgf: _festivoCgfDefault(f.data),
      });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    logAzione('Piano: festivi generati', anno + ' (' + nuovi.length + ')');
    toast('Generati ' + nuovi.length + ' festivi per il ' + anno);
    renderPiano();
  } catch (e) {
    toast('Errore generazione festivi');
  }
}
