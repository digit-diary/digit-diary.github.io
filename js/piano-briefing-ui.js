/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-briefing-ui.js
 * PIANO · scheda Briefing (compilazione, numeri cassa, formato) e corsi
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ============================================================
// TAB BRIEFING · briefing giornaliero + pause (da Excel Musa)
// Una riga piano_briefing per (data, reparto, sezione): il
// contenuto è tutto editabile e si salva da solo; le colonne
// E/U scrivono anche le timbrature (regola entrata anticipata).
// ============================================================
let _briefData = null;
let _briefState = null;
let _briefSaveTimer = null;
let _briefSaving = false;

function _briefDomani() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _briefGiornoLbl(dstr) {
  const d = new Date(dstr + 'T12:00:00');
  return ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'][d.getDay()];
}
function _briefIsValet() {
  return _pianoReparto() === 'valet';
}
function _briefGruppo(cod) {
  if (!cod) return 9;
  const u = String(cod).toUpperCase();
  if (u === '9' || u === 'L1') return 3;
  if (u[0] === 'Z') return 4;
  if (u[0] === 'C') return 0;
  if (u[0] === 'S') return 1;
  if (u[0] === 'R') return 2;
  if (u[0] === 'X') return 1;
  return 5;
}
function _briefOrarioHM(s) {
  return s ? String(s).substring(0, 5) : '';
}
// EVIDENZIAZIONI DAL PIANO AL BRIEFING
// Regole per settore: una cella colorata nel piano puo' arrivare sul briefing
// con un ALTRO colore e un'etichetta (es. valet: coordinatore segnato in rosso
// nel piano, sul foglio del briefing si vede verde). Configurabili dalla tab
// Briefing. Impostazione 'brief_evidenziazioni':
//   { valet: [ { da:'#FF6B6B', a:'#95E06C', label:'Coordinatore' } ] }
function _briefEvidenziazioni(rep) {
  const cfg = window._briefEvidCfg || {};
  const lista = cfg[rep || _pianoReparto()];
  return Array.isArray(lista) ? lista : [];
}
function _briefColoreDaPiano(colorePiano) {
  if (!colorePiano) return '';
  const su = String(colorePiano).toUpperCase();
  const reg = _briefEvidenziazioni().find((x) => String(x.da || '').toUpperCase() === su);
  if (reg) return reg.a || colorePiano;
  // senza regole configurate il valet mantiene il comportamento di sempre
  // (il colore del piano arriva tale e quale); gli altri settori no
  return _pianoReparto() === 'valet' ? colorePiano : '';
}
function _briefEtichettaColore(coloreBriefing) {
  if (!coloreBriefing) return '';
  const su = String(coloreBriefing).toUpperCase();
  const reg = _briefEvidenziazioni().find((x) => String(x.a || '').toUpperCase() === su);
  return reg && reg.label ? reg.label : '';
}
function _briefComponi(pianoRighe) {
  const righe = [];
  (pianoRighe || []).forEach((r) => {
    // regola multi-reparto: si finisce nel briefing del REPARTO DEL TURNO,
    // non del reparto d'origine (Balliu con X1 valet → solo briefing valet,
    // mai in quello slots). Niente fallback sui turni degli altri reparti.
    const t = _pianoTurniReparto().find((x) => x.codice === r.codice);
    // stesso CODICE usato da due reparti (es. "9" esiste sia in slots sia in
    // tavoli): la riga resta al reparto suo, altrimenti i colleghi degli altri
    // settori finirebbero in questo briefing solo per omonimia di sigla
    const repRiga = r.reparto_dip || 'slots';
    if (t && repRiga !== _pianoReparto()) {
      const suoTurno = pianoTurniCache.some(
        (x) => x.codice === r.codice && (x.reparto_dip || 'slots') === repRiga && x.attivo !== false,
      );
      if (suoTurno) return;
    }
    // JG: sempre nel briefing quando è nel piano del reparto (con l'orario
    // della cella se c'è, altrimenti da scrivere a mano sul foglio)
    const isJg = String(r.codice).toUpperCase() === 'JG' && (r.reparto_dip || 'slots') === _pianoReparto();
    const custom = (!t && r.ora_inizio && r.ora_fine && (r.reparto_dip || 'slots') === _pianoReparto()) || (!t && isJg);
    if (!t && !custom) return;
    const info = _pianoCollabInfo(r.collaboratore);
    if (info && info.attivo === false) return;
    if (info && info.funzione === 'RESP') return;
    const parole = r.collaboratore.trim().split(/\s+/);
    const cognome = (parole.length > 1 ? parole.slice(0, -1).join(' ') : parole[0]).toUpperCase();
    righe.push({
      e: '',
      u: '',
      nome: cognome,
      nomeFull: r.collaboratore,
      turno: r.codice,
      oi: r.ora_inizio ? _briefOrarioHM(r.ora_inizio) : '',
      of: r.ora_fine ? _briefOrarioHM(r.ora_fine) : '',
      cd: '',
      uscita: '',
      firma: '',
      radio: '',
      badge: '',
      fm: /formazion|affianc/i.test(r.commento || '') || undefined,
      // Il colore dato alla cella del PIANO arriva sul briefing. Con le
      // "evidenziazioni" configurate (Briefing → Evidenziazioni dal piano) un
      // colore del piano puo' diventarne un altro sul briefing: es. valet,
      // coordinatore segnato in rosso nel piano che sul foglio si vede verde.
      col: (r.colore && _briefColoreDaPiano(_stileCella(r.colore).c)) || undefined,
    });
  });
  // cognomi uguali di persone diverse (es. BIANCHI Milena e BIANCHI Chiara):
  // aggiungi l'iniziale del nome; se coincide anche quella, il nome intero
  const perCognome = {};
  righe.forEach((r) => {
    (perCognome[r.nome] = perCognome[r.nome] || new Set()).add(r.nomeFull || r.nome);
  });
  righe.forEach((r) => {
    if (perCognome[r.nome] && perCognome[r.nome].size > 1 && r.nomeFull) {
      const parole = r.nomeFull.trim().split(/\s+/);
      const proprio = parole[parole.length - 1];
      const iniziali = [...perCognome[r.nome]].map((n) => {
        const p = n.trim().split(/\s+/);
        return p[p.length - 1].charAt(0).toUpperCase();
      });
      const doppiaIni = iniziali.filter((x) => x === proprio.charAt(0).toUpperCase()).length > 1;
      r.nome = r.nome + ' ' + (doppiaIni ? proprio.toUpperCase() : proprio.charAt(0).toUpperCase() + '.');
    }
  });
  _briefOrdina(righe);
  return righe;
}
// Ordine del foglio: gruppi, dentro il gruppo prima i presti poi le notti;
// aperture e chiusure seguono l'ordine delle coppie CD (C0,C23,C4 poi C5,C20,C15)
function _briefOrdina(righe) {
  const inizioDi = (r) => {
    const t = _pianoTurnoInfo(r.turno);
    const o = t ? t.ora_inizio : r.oi;
    const m = _pianoOra(o ? String(o).substring(0, 5) : '');
    return m == null ? 99 : m;
  };
  const cfgCd = window._pianoCdCfg && Array.isArray(window._pianoCdCfg.coppie) ? window._pianoCdCfg.coppie : [];
  const ordineCd = cfgCd
    .map((cp) => String(cp.apre || '').toUpperCase())
    .concat(cfgCd.map((cp) => String(cp.chiude || '').toUpperCase()))
    .filter(Boolean);
  const rangoCd = (t) => ordineCd.indexOf(String(t).toUpperCase());
  righe.sort((a, b) => {
    const g = _briefGruppo(a.turno) - _briefGruppo(b.turno);
    if (g) return g;
    const ra = rangoCd(a.turno);
    const rb = rangoCd(b.turno);
    if (ra >= 0 || rb >= 0) {
      if (ra >= 0 && rb >= 0 && ra !== rb) return ra - rb;
      if (ra >= 0 !== rb >= 0) return ra >= 0 ? -1 : 1;
    }
    const o = inizioDi(a) - inizioDi(b);
    if (o) return o;
    if (a.turno !== b.turno) return a.turno < b.turno ? -1 : 1;
    // chi è in formazione sta VICINO al collega dello stesso turno (in fondo al gruppo turno)
    if (!!a.fm !== !!b.fm) return a.fm ? 1 : -1;
    return a.nome < b.nome ? -1 : 1;
  });
  return righe;
}
// Posizioni del fabbisogno SCOPERTE (es. manca il C0 quel giorno): riga
// segnaposto 'XXX' così sul foglio il buco si vede. Le pause NON la considerano.
async function _briefAggiungiScoperti(righe, dstr) {
  try {
    const fabb = (await secGet('piano_fabbisogni?data=eq.' + dstr + '&reparto_dip=eq.' + _pianoReparto())) || [];
    let aggiunte = false;
    fabb.forEach((f) => {
      const cod = String(f.turno_codice || '').toUpperCase();
      if (!_pianoTurnoInfo(cod)) return;
      const have = righe.filter((r) => String(r.turno || '').toUpperCase() === cod).length;
      for (let k = have; k < (parseInt(f.quantita) || 0); k++) {
        righe.push({
          e: '',
          u: '',
          nome: 'XXX',
          nomeFull: null,
          turno: f.turno_codice,
          oi: '',
          of: '',
          cd: '',
          uscita: '',
          firma: '',
          radio: '',
          badge: '',
        });
        aggiunte = true;
      }
    });
    if (aggiunte) _briefOrdina(righe);
  } catch (e) {}
}
// NUMERI CASSA (CD) automatici: chi ha CHIUSO ieri RIAPRE oggi.
// Coppie configurabili (default 2/7 su C0-C5, 3/4 su C23-C20, 8/9 su C4-C15);
// i C8 di ven/sab prendono in ordine l'altra cassa di ogni coppia.
// Tutto resta editabile: domani si riparte dai valori salvati oggi.
async function _briefAssegnaCd(righe, dstr) {
  const cfg = window._pianoCdCfg;
  if (!cfg || !cfg.coppie || !cfg.coppie.length) return;
  // La rotazione NON dipende dall'aver salvato ieri: si ricostruisce la
  // catena "chi chiude riapre" all'indietro (max 14 giorni) dall'ultimo
  // briefing salvato; nei giorni senza salvataggio vale la regola pura e,
  // se nel piano c'erano C8, la cassa del presto resta anche il giorno dopo.
  const giorni = [];
  for (let gi = 14; gi >= 1; gi--) {
    const d0 = new Date(dstr + 'T12:00:00');
    d0.setDate(d0.getDate() - gi);
    giorni.push(
      d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0'),
    );
  }
  let salvatiRange = [];
  let pianoRange = [];
  try {
    [salvatiRange, pianoRange] = await Promise.all([
      secGet(
        'piano_briefing?data=gte.' +
          giorni[0] +
          '&data=lte.' +
          giorni[giorni.length - 1] +
          '&sezione=eq.briefing&reparto_dip=eq.' +
          _pianoReparto(),
      ),
      secGet(
        'piano?data=gte.' + giorni[0] + '&data=lte.' + giorni[giorni.length - 1] + '&reparto_dip=eq.' + _pianoReparto(),
      ),
    ]);
  } catch (e) {}
  const salvatoDi = {};
  (salvatiRange || []).forEach((s) => {
    if (s.contenuto && Array.isArray(s.contenuto.righe) && s.contenuto.righe.length)
      salvatoDi[String(s.data).substring(0, 10)] = s.contenuto.righe;
  });
  const c8Nei = new Set(
    (pianoRange || [])
      .filter((r) => String(r.codice || '').toUpperCase() === 'C8')
      .map((r) => String(r.data).substring(0, 10)),
  );
  const trovaOggi = (turno) => righe.find((x) => String(x.turno).toUpperCase() === turno);
  const apreCds = [];
  const coppieCalc = [];
  cfg.coppie.forEach((cp) => {
    const [a, b] = cp.cd.map(String);
    const altroCd = (n) => (n === a ? b : a);
    // REGOLA: la cassa che CHIUDE un giorno e' quella che APRE il giorno dopo.
    // Si leggono i numeri EFFETTIVI del briefing di ieri (anche se cambiati a
    // mano e diversi dalla coppia configurata): comanda quello che c'e' scritto,
    // non la configurazione. La coppia serve solo a sapere QUALI turni aprono e
    // chiudono, e come punto di partenza quando non esiste alcuno storico.
    const apreDomaniDa = (rr) => {
      const cdDi = (turno) => {
        const x = rr.find((y) => String(y.turno).toUpperCase() === turno && String(y.cd || '').trim());
        return x ? String(x.cd).trim() : '';
      };
      // il C8 chiude piu' tardi di tutti: se c'e' ed e' su una cassa di questa
      // postazione (quella che apriva o chiudeva ieri), riapre lui domani
      const cdApriva = cdDi(cp.apre.toUpperCase());
      const cdChiudeva = cdDi(cp.chiude.toUpperCase());
      const c8 = rr.filter((y) => String(y.turno).toUpperCase() === 'C8' && String(y.cd || '').trim());
      const c8Qui = c8.find((y) => [cdApriva, cdChiudeva].includes(String(y.cd).trim()));
      if (c8Qui)
        return { apre: String(c8Qui.cd).trim(), altra: cdApriva === String(c8Qui.cd).trim() ? cdChiudeva : cdApriva };
      if (cdChiudeva) return { apre: cdChiudeva, altra: cdApriva || altroCd(cdChiudeva) };
      if (cdApriva) return { apre: altroCd(cdApriva), altra: cdApriva };
      return null;
    };
    let apreCd = '';
    let altraCd = '';
    let anc = -1;
    for (let gi = giorni.length - 1; gi >= 0 && !apreCd; gi--) {
      if (salvatoDi[giorni[gi]]) {
        const res = apreDomaniDa(salvatoDi[giorni[gi]]);
        if (res && res.apre) {
          apreCd = res.apre;
          altraCd = res.altra || altroCd(res.apre);
          anc = gi;
        }
      }
    }
    if (!apreCd) {
      // nessun briefing salvato nel periodo: alternanza deterministica per data
      const ep = Math.floor(new Date(giorni[0] + 'T12:00:00').getTime() / 86400000);
      apreCd = ep % 2 === 0 ? a : b;
      altraCd = apreCd === a ? b : a;
      anc = -1;
    }
    // propaga la rotazione dai giorni SENZA briefing salvato fino a ieri: ogni
    // giorno senza C8 le due casse si scambiano, con C8 restano come sono
    const scambia = () => {
      const t = apreCd;
      apreCd = altraCd;
      altraCd = t;
    };
    for (let gi = anc + 1; gi < giorni.length; gi++) {
      if (!c8Nei.has(giorni[gi])) scambia();
    }
    const chiudeCd = altraCd || altroCd(apreCd);
    apreCds.push(apreCd);
    coppieCalc.push({ apreCd, chiudeCd });
    const rA = trovaOggi(cp.apre.toUpperCase());
    const rC = trovaOggi(cp.chiude.toUpperCase());
    if (rA && !String(rA.cd || '').trim()) rA.cd = apreCd;
    if (rC && !String(rC.cd || '').trim()) rC.cd = chiudeCd;
  });
  // C8 in ordine: riapre la cassa del presto di ogni coppia
  let k = 0;
  righe.forEach((r) => {
    if (String(r.turno).toUpperCase() === 'C8' && !String(r.cd || '').trim() && k < apreCds.length) {
      r.cd = apreCds[k];
      k++;
    }
  });
  // coppie in FORMAZIONE sullo stesso turno: lavorano sulla STESSA cassa
  righe.forEach((r) => {
    if (!r.fm || String(r.cd || '').trim()) return;
    const collega = righe.find(
      (x) => x !== r && String(x.turno).toUpperCase() === String(r.turno).toUpperCase() && String(x.cd || '').trim(),
    );
    if (collega) r.cd = String(collega.cd).trim();
  });
  // turni di chiusura doppi (es. due C5): il secondo prende una cassa LIBERA
  // delle altre coppie (prima quella che chiuderebbe oggi, es. la 3 o la 4)
  const usati = new Set(righe.map((r) => String(r.cd || '').trim()).filter(Boolean));
  cfg.coppie.forEach((cp, i) => {
    const doppi = righe.filter(
      (x) => String(x.turno).toUpperCase() === cp.chiude.toUpperCase() && !String(x.cd || '').trim(),
    );
    doppi.forEach((rx) => {
      for (let j = 1; j < cfg.coppie.length && !String(rx.cd || '').trim(); j++) {
        const cc = coppieCalc[(i + j) % cfg.coppie.length];
        for (const n of [cc.chiudeCd, cc.apreCd]) {
          if (n && !usati.has(n)) {
            rx.cd = n;
            usati.add(n);
            break;
          }
        }
      }
    });
  });
}
async function _renderPianoBriefingTab() {
  if (!_briefData) _briefData = _briefDomani();
  const dstr = _briefData;
  const rep = _pianoReparto();
  const [salvati, pianoRighe, pauseCfg] = await Promise.all([
    secGet('piano_briefing?data=eq.' + dstr + '&reparto_dip=eq.' + rep),
    // senza filtro reparto: i multi-reparto (es. Balliu) entrano nel briefing
    // del reparto del TURNO che fanno quel giorno; _briefComponi filtra per turno
    secGet('piano?data=eq.' + dstr),
    getImp('piano_pause_cfg'),
  ]);
  try {
    window._briefPauseCfgObj = pauseCfg ? JSON.parse(pauseCfg) : {};
  } catch (e) {
    window._briefPauseCfgObj = {};
  }
  const valetR = _briefIsValet();
  const rigaBrief = (salvati || []).find((x) => x.sezione === 'briefing');
  const rigaPause = (salvati || []).find((x) => x.sezione === 'pause');
  let righe, salvato;
  if (
    rigaBrief &&
    rigaBrief.contenuto &&
    Array.isArray(rigaBrief.contenuto.righe) &&
    rigaBrief.contenuto.righe.length
  ) {
    righe = rigaBrief.contenuto.righe;
    salvato = true;
  } else {
    righe = _briefComponi(pianoRighe);
    await _briefAggiungiScoperti(righe, dstr);
    if (!valetR && rep === 'slots') await _briefAssegnaCd(righe, dstr);
    salvato = false;
  }
  _briefState = {
    id: rigaBrief ? rigaBrief.id : null,
    righe: righe,
    pause: rigaPause || null,
    pianoRighe: pianoRighe || [],
    chiave: dstr + '|' + rep,
    // numeri cassa scritti a mano: si ricorda anche dopo un nuovo render, cosi'
    // la rotazione non li sovrascrive (prima il flag spariva a ogni render)
    cdManuale: !!(rigaBrief && rigaBrief.contenuto && rigaBrief.contenuto.cdManuale),
  };
  // se il briefing era gia' salvato, controlla che i numeri cassa seguano
  // ancora la rotazione (ieri potrebbe essere stato corretto a mano)
  let cdDaAggiornare = false;
  if (salvato && !valetR && rep === 'slots') {
    try {
      const clone = righe.map((r) => Object.assign({}, r, { cd: '' }));
      await _briefAssegnaCd(clone, dstr);
      const diverse = clone
        .map((c, i) => ({
          i: i,
          atteso: String(c.cd || '').trim(),
          attuale: String((righe[i] && righe[i].cd) || '').trim(),
        }))
        .filter((x) => x.atteso && x.attuale && x.atteso !== x.attuale);
      if (diverse.length) {
        // I numeri cassa seguono la rotazione (chi chiude riapre il giorno
        // dopo): se ieri e' cambiato, oggi si aggiorna DA SOLO, senza premere
        // nulla. Se pero' i numeri di oggi sono stati scritti a mano, non si
        // sovrascrive niente: si avvisa e decide l'operatore.
        if (_briefState && _briefState.cdManuale) {
          cdDaAggiornare = true;
        } else {
          diverse.forEach((x) => {
            righe[x.i].cd = x.atteso;
          });
          if (_briefState) _briefState.righe = righe;
          clearTimeout(_briefSaveTimer);
          await briefSalvaBriefing();
          logAzione('Briefing: numeri cassa allineati', dstr + ' (' + diverse.length + ' celle, rotazione di ieri)');
          toast('Numeri cassa aggiornati dalla rotazione di ieri');
        }
      }
    } catch (e) {}
  }
  const puo = puoGestireBriefing();
  const valet = _briefIsValet();
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Briefing · ' +
    escP(rep.toUpperCase()) +
    '</div><div style="padding:12px 14px">';
  // barra dei comandi in tre gruppi: giorno, azioni, formato (piu' lo stato)
  h +=
    '<div class="brief-toolbar">' +
    '<span class="brief-grp"><span class="brief-grp-lbl">Giorno</span>' +
    '<button class="btn-export brief-btn" title="Giorno precedente" onclick="briefCambiaData(-1)">&#8592;</button>' +
    '<input type="date" id="brief-data" value="' +
    dstr +
    '" onchange="briefSetData(this.value)" style="padding:6px">' +
    '<button class="btn-export brief-btn" title="Giorno successivo" onclick="briefCambiaData(1)">&#8594;</button>' +
    '<strong style="font-size:1.05rem;background:#FFFF00;color:#000;padding:3px 12px;border:1px solid #999">' +
    _briefGiornoLbl(dstr) +
    ' ' +
    dstr.split('-').reverse().join('.') +
    '</strong></span>' +
    (puo
      ? '<span class="brief-grp"><span class="brief-grp-lbl">Azioni</span>' +
        '<button class="btn-export brief-btn brief-btn-ok" title="Riempie il briefing con i turni del piano di questo giorno" onclick="briefCompila()">Compila dal piano</button>' +
        '<button class="btn-export brief-btn" title="Assegna le pause secondo le regole del settore" onclick="briefGeneraPause()">Genera pause</button>' +
        (puo && !valet && rep === 'slots' && salvato
          ? '<button class="btn-export brief-btn" title="Riassegna la colonna CD con la rotazione (chi ha chiuso ieri riapre oggi), lasciando intatto tutto il resto" onclick="briefAggiornaCd()">Aggiorna numeri cassa</button>'
          : '') +
        '<button class="btn-export brief-btn" onclick="pdfBriefingGiorno()">Stampa briefing</button>' +
        '<button class="btn-export brief-btn" onclick="document.getElementById(\'brief-xlsx\').click()">Importa da Excel</button></span>' +
        '<input type="file" id="brief-xlsx" accept=".xlsx,.xls,.xlsm" style="display:none" onchange="importaBriefingExcel(this)">' +
        '<span class="brief-grp"><span class="brief-grp-lbl">Formato</span><span style="position:relative;display:inline-flex;align-items:center"><button class="btn-export brief-btn brief-btn-col" title="Applica alle celle o righe marcate il colore mostrato nella barretta (per cambiarlo usa la freccia accanto)" onclick="event.stopPropagation();briefColoreApplica(_colUltimo() || null)"><span style="display:flex;flex-direction:column;gap:3px;min-width:44px">Colora' +
        _colChipHtml() +
        '</span></button>' +
        '<button class="btn-export brief-btn brief-btn-col" style="padding-left:7px;padding-right:7px" title="Scegli colore o formato" onclick="event.stopPropagation();briefColoriToggle()">&#9662;</button>' +
        '<div id="brief-colori-bar" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
        PIANO_COLORI_CELLA.map(
          (c) =>
            '<span data-c="' +
            c +
            '" onclick="briefColoreApplica(\'' +
            c +
            '\')" style="display:inline-block;width:22px;height:22px;background:' +
            c +
            ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
        ).join('') +
        '<button data-c="" class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="briefColoreApplica(null)">Nessuno</button>' +
        '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
        '<button class="btn-export" style="font-size:.82rem;font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'b\')">G</button> ' +
        '<button class="btn-export" style="font-size:.82rem;font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'i\')">C</button>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<span style="font-size:.82rem;color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
        PIANO_COLORI_TESTO.map(
          (c) =>
            '<span title="Colore del testo" onclick="briefTestoApplica(\'' +
            c +
            '\')" style="display:inline-block;width:18px;height:18px;background:' +
            c +
            ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
        ).join('') +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:4px;vertical-align:middle" onclick="briefTestoApplica(null)">Auto</button>' +
        '</div>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Memorizza il formato della prima cella marcata" onclick="briefCopiaFormato()">Copia formato</button> ' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Applica il formato memorizzato alle celle marcate" onclick="briefIncollaFormato()">Incolla formato</button> ' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle;border-color:#c0392b;color:#c0392b" title="Toglie colori e formato dalle celle o righe marcate" onclick="briefCancellaFormato()">Cancella formato</button>' +
        '</div>' +
        '</div></span></span>'
      : '') +
    (cdDaAggiornare
      ? '<span style="font-size:.82rem;background:#ffd166;color:#5a4300;padding:3px 10px;border-radius:3px;font-weight:700">I numeri cassa di ieri sono cambiati: premi "Aggiorna numeri cassa"</span>'
      : '') +
    '<span id="brief-stato" style="font-size:.82rem;color:var(--muted)">' +
    (salvato
      ? 'Salvato'
      : righe.length
        ? 'Compilato dal piano · modifica una cella per salvare'
        : 'Nessun turno nel piano per questa data') +
    '</span></div>';
  // tabella briefing + tabella orari affiancate (stessa vista dell'Excel)
  h += '<div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap"><div style="overflow-x:auto">';
  h += '<table class="brief-table" style="border-collapse:collapse;font-size:.85rem"><thead><tr>';
  // ogni reparto ha il SUO briefing: slots con CD (numeri cassa), valet con
  // radio/badge, gli altri (es. tavoli, senza casse) tabella essenziale
  const cols = valet
    ? ['E', 'U', 'COLLABORATORE', 'TURNO', 'USCITA', 'FIRMA', 'RADIO', 'BADGE']
    : rep === 'slots'
      ? ['E', 'U', 'HOST', 'T', 'CD', 'USCITA', 'FIRMA']
      : ['E', 'U', 'COLLABORATORE', 'T', 'USCITA', 'FIRMA'];
  cols.forEach((c) => {
    const bg = c === 'E' ? '#00B050' : c === 'U' ? '#FF0000' : '#FFFF00';
    const fg = c === 'E' || c === 'U' ? '#fff' : '#000';
    h +=
      '<th style="border:1px solid #999;background:' +
      bg +
      ';color:' +
      fg +
      ';padding:4px 8px;font-size:.82rem">' +
      c +
      '</th>';
  });
  h += (puo ? '<th style="border:none"></th>' : '') + '</tr></thead><tbody>';
  let gPrec = null;
  righe.forEach((r, i) => {
    const g = _briefGruppo(r.turno);
    if (gPrec !== null && g !== gPrec)
      h +=
        '<tr>' +
        cols.map(() => '<td style="border:1px solid #999;padding:0;height:11px"></td>').join('') +
        (puo ? '<td style="border:none"></td>' : '') +
        '</tr>';
    gPrec = g;
    // stile della SINGOLA cella (r.cs[campo] = "#RRGGBB|bi") combinato col
    // formato dell'intera riga (r.bold / r.ital) e con i default della colonna
    const stDi = (campo) => _stileCella(r.cs && r.cs[campo]);
    const inp = (campo, val, larghezza, extra, bgDef, fwDef) => {
      const stC = stDi(campo);
      const bg = stC.c || bgDef || '';
      return (
        '<td data-campo="' +
        campo +
        '" style="border:1px solid #999;padding:0' +
        (bg ? ';background:' + bg : '') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        (extra || '') +
        ' value="' +
        escP(val || '') +
        '" oninput="briefCella(' +
        i +
        ",'" +
        campo +
        '\',this.value)" ' +
        'style="width:' +
        larghezza +
        'px;border:none;background:transparent;padding:4px 6px;font:inherit;color:inherit' +
        (stC.b || r.bold || fwDef ? ';font-weight:700' : '') +
        (stC.i || r.ital ? ';font-style:italic' : '') +
        (stC.t || r.colT ? ';color:' + (stC.t || r.colT) : '') +
        '"></td>'
      );
    };
    h += '<tr data-bidx="' + i + '">';
    // E e U si spuntano A PENNA sul foglio stampato: celle vuote
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    const stNome = stDi('nome');
    const bgNome = stNome.c || r.col || (r.fm ? '#FFFF00' : '');
    if (r.fm || bgNome) {
      // in formazione (giallo) o colorata: sfondo sulla cella del nome
      h +=
        '<td data-campo="nome" style="border:1px solid #999;padding:0;white-space:nowrap;background:' +
        (bgNome || 'transparent') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        'value="' +
        escP(r.nome || '') +
        '" oninput="briefCella(' +
        i +
        ",'nome',this.value)\" " +
        'style="width:' +
        (r.fm ? 86 : 138) +
        'px;border:none;background:transparent;padding:4px 2px 4px 6px;font:inherit;color:#000' +
        (stNome.b || r.bold || r.fm ? ';font-weight:700' : '') +
        (stNome.i || r.ital ? ';font-style:italic' : '') +
        (stNome.t || r.colT ? ';color:' + (stNome.t || r.colT) : '') +
        '">' +
        (r.fm
          ? '<span style="font-size:.82rem;font-weight:700;color:#000;padding-right:3px">(formazione)</span>'
          : '') +
        '</td>';
    } else h += inp('nome', r.nome, 150);
    const colTurno = _pianoColore(r.turno) || '';
    h += inp('turno', r.turno, 52, '', colTurno, true);
    if (valet) {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
      h += inp('radio', r.radio, 60);
      h += inp('badge', r.badge, 60);
    } else if (rep !== 'slots') {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
    } else {
      h += inp('cd', r.cd, 40, '', r.cd ? '#FFFF00' : '', true);
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
    }
    if (puo)
      h +=
        '<td style="border:none;padding:0 5px;white-space:nowrap;font-size:.85rem">' +
        '<span style="cursor:pointer;color:#2c6e49;font-weight:bold" title="Inserisci riga sotto" onclick="briefInserisciRiga(' +
        i +
        ')">+</span> ' +
        '<span style="cursor:pointer;color:var(--muted)" title="Sposta su" onclick="briefMuoviRiga(' +
        i +
        ',-1)">▲</span> ' +
        '<span style="cursor:pointer;color:var(--muted)" title="Sposta giù" onclick="briefMuoviRiga(' +
        i +
        ',1)">▼</span> ' +
        '<span style="cursor:pointer;color:#c0392b;font-weight:bold" title="Elimina riga" onclick="briefEliminaRiga(' +
        i +
        ')">×</span></td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  if (puo)
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;margin-top:8px" onclick="briefAggiungiRiga()">+ Aggiungi riga</button>';
  h += '</div>';
  // tabella ORARI (da piano_turni, sola lettura): SOLO i turni presenti
  // nel briefing di oggi
  const turniPresenti = {};
  righe.forEach((r) => {
    if (r.turno) turniPresenti[String(r.turno).trim().toUpperCase()] = true;
  });
  const turni = _pianoTurniReparto()
    .filter((t) => turniPresenti[t.codice.toUpperCase()])
    .sort((a, b) => {
      const g = _briefGruppo(a.codice) - _briefGruppo(b.codice);
      if (g) return g;
      const oa = _pianoOra((a.ora_inizio || '').substring(0, 5));
      const ob = _pianoOra((b.ora_inizio || '').substring(0, 5));
      const o = (oa == null ? 99 : oa) - (ob == null ? 99 : ob);
      if (o) return o;
      return a.codice < b.codice ? -1 : 1;
    });
  h +=
    '<div><table style="border-collapse:collapse;font-size:.8rem"><thead><tr><th colspan="3" style="border:1px solid #999;background:#FFFF00;color:#000;padding:4px 10px;font-size:.82rem">ORARI</th></tr></thead><tbody>';
  let gT = null;
  turni.forEach((t) => {
    const g = _briefGruppo(t.codice);
    if (gT !== null && g !== gT)
      h +=
        '<tr><td style="border:1px solid #999;height:9px"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td></tr>';
    gT = g;
    h +=
      '<tr><td style="border:1px solid #999;padding:2px 10px;font-weight:bold;background:' +
      (_pianoColore(t.codice) || '') +
      '">' +
      escP(t.codice) +
      '</td><td style="border:1px solid #999;padding:2px 10px">' +
      _briefOrarioHM(t.ora_inizio) +
      '</td><td style="border:1px solid #999;padding:2px 10px">' +
      _briefOrarioHM(t.ora_fine) +
      '</td></tr>';
  });
  h += '</tbody></table></div></div>';
  h += '</div></div>';
  h += _briefRenderPauseCard();
  h += _briefRenderEvidCard();
  return h;
}
function briefCambiaData(delta) {
  const d = new Date(_briefData + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  _briefData =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  renderPiano();
}
function briefSetData(v) {
  if (!v) return;
  _briefData = v;
  renderPiano();
}
function briefCella(i, campo, val) {
  if (!puoGestireBriefing() || !_briefState) return;
  _briefState.righe[i][campo] = val;
  if (campo === 'nome') _briefState.righe[i].nomeFull = null; // ri-matcha al salvataggio timbratura
  // numero cassa scritto a mano: da qui in poi la rotazione non lo sovrascrive
  // da sola, ma avvisa e lascia decidere (bottone "Aggiorna numeri cassa")
  if (campo === 'cd') _briefState.cdManuale = true;
  _briefDirtySalva();
}
function _briefDirtySalva() {
  clearTimeout(_briefSaveTimer);
  const el = document.getElementById('brief-stato');
  if (el) el.textContent = 'salvataggio…';
  _briefSaveTimer = setTimeout(briefSalvaBriefing, 900);
}
// SALVATAGGI IN SOSPESO. Il piano salva a ogni cella; il briefing aspetta
// 900ms dall'ultimo tasto per non scrivere a ogni lettera. Prima di cambiare
// pagina o tab, o di chiudere l'app, si forza il salvataggio: cosi' non si
// perde mai neanche l'ultima battitura.
function _pianoFlushSalva() {
  try {
    // cella del piano ancora aperta in modifica: si conferma e si salva
    document.querySelectorAll('#piano-content td.piano-cella input').forEach((el) => {
      el.blur();
      el.dispatchEvent(new FocusEvent('blur'));
    });
    if (_briefSaveTimer) {
      clearTimeout(_briefSaveTimer);
      _briefSaveTimer = null;
      if (_briefState) briefSalvaBriefing();
    }
  } catch (e) {}
}
if (!window._pianoUnloadBound) {
  window._pianoUnloadBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _pianoFlushSalva();
  });
  window.addEventListener('pagehide', _pianoFlushSalva);
  // unico caso in cui si avvisa prima di uscire: un salvataggio e' ancora
  // in corso in questo istante (meno di un secondo)
  window.addEventListener('beforeunload', (e) => {
    if (_briefSaveTimer || _briefSaving) {
      _pianoFlushSalva();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
async function briefSalvaBriefing() {
  if (!_briefState || _briefSaving) {
    if (_briefSaving) _briefSaveTimer = setTimeout(briefSalvaBriefing, 500);
    return;
  }
  _briefSaving = true;
  // lo stato si fissa QUI: se nel frattempo l'operatore cambia giorno, il
  // salvataggio resta agganciato al giorno e al settore di queste righe
  // (prima usava la data corrente e le righe finivano sul giorno sbagliato)
  const st = _briefState;
  const [dataSt, repSt] = String(st.chiave || '').split('|');
  try {
    const contenuto = { righe: st.righe, cdManuale: !!st.cdManuale };
    if (st.id) {
      await secPatch('piano_briefing', 'id=eq.' + st.id, {
        contenuto: contenuto,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    } else {
      const nuovo = await secPost('piano_briefing', {
        data: dataSt || _briefData,
        reparto_dip: repSt || _pianoReparto(),
        sezione: 'briefing',
        contenuto: contenuto,
        operatore: getOperatore(),
      });
      st.id = nuovo && nuovo[0] ? nuovo[0].id : null;
    }
    const el = document.getElementById('brief-stato');
    if (el) el.textContent = 'Salvato ✓';
  } catch (e) {
    const el = document.getElementById('brief-stato');
    if (el) el.textContent = 'ERRORE salvataggio';
  }
  _briefSaving = false;
}
async function briefAggiungiRiga() {
  if (!_briefState) return;
  _briefState.righe.push({
    e: '',
    u: '',
    nome: '',
    nomeFull: null,
    turno: '',
    cd: '',
    uscita: '',
    firma: '',
    radio: '',
    badge: '',
  });
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function _briefRigaVuota() {
  return { e: '', u: '', nome: '', nomeFull: null, turno: '', cd: '', uscita: '', firma: '', radio: '', badge: '' };
}
// COLORE DEL TESTO nel briefing: sulle celle marcate (r.cs) o sull'intera
// riga (r.colT), come nel piano
async function briefTestoApplica(col) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe, poi scegli il colore del testo');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC.t = col || '';
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)].colT = col || null;
      n++;
    }
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast(col ? 'Testo colorato (' + n + ')' : 'Colore del testo tolto (' + n + ')');
  renderPiano();
}
function briefCopiaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  const selC = _briefCelleSel();
  if (!selC.size || !_briefState) {
    toast('Marca prima la cella da cui copiare il formato');
    return;
  }
  const k = [...selC][0];
  const r = _briefState.righe[parseInt(k.split('|')[0])];
  window._briefFormatoCopiato = (r && r.cs && r.cs[k.split('|')[1]]) || null;
  const st = _stileCella(window._briefFormatoCopiato);
  toast(
    'Formato copiato' +
      (st.c || st.b || st.i || st.t
        ? ' (' +
          [st.c ? 'sfondo' : '', st.t ? 'testo' : '', st.b ? 'grassetto' : '', st.i ? 'corsivo' : '']
            .filter(Boolean)
            .join(', ') +
          ')'
        : ' (nessuno: incollandolo si pulisce)'),
  );
}
async function briefIncollaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  if (window._briefFormatoCopiato === undefined) {
    toast('Prima usa "Copia formato" su una cella');
    return;
  }
  const selC = _briefCelleSel();
  if (!selC.size) {
    toast('Marca le celle a cui applicare il formato');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (!r) return;
    r.cs = r.cs || {};
    if (window._briefFormatoCopiato) r.cs[k.split('|')[1]] = window._briefFormatoCopiato;
    else delete r.cs[k.split('|')[1]];
    n++;
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast('Formato applicato a ' + n + ' celle');
  renderPiano();
}
async function briefCancellaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima marca le celle o le righe da pulire');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (r && r.cs) {
      delete r.cs[k.split('|')[1]];
      n++;
    }
  });
  sel.forEach((i) => {
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.col = null;
    r.colT = null;
    r.bold = false;
    r.ital = false;
    r.cs = undefined;
    n++;
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast('Formato tolto (' + n + ')');
  renderPiano();
}
async function briefInserisciRiga(i) {
  if (!_briefState || !puoGestireBriefing()) return;
  _briefState.righe.splice(i + 1, 0, _briefRigaVuota());
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function briefColoriToggle() {
  const b = document.getElementById('brief-colori-bar');
  if (!b) return;
  if (b.style.display !== 'none') {
    b.style.display = 'none';
    return;
  }
  // all'apertura si evidenzia il colore che le celle/righe marcate hanno adesso
  const cc = [];
  _briefCelleSel().forEach((k) => {
    const r = _briefState && _briefState.righe[parseInt(k.split('|')[0])];
    if (r) cc.push(_stileCella(r.cs && r.cs[k.split('|')[1]]).c);
  });
  _briefRigheSel().forEach((i) => {
    const r = _briefState && _briefState.righe[parseInt(i)];
    if (r) cc.push(r.col || '');
  });
  const cur = cc.length && cc.every((x) => x === cc[0]) ? cc[0] : '__misto__';
  b.querySelectorAll('[data-c]').forEach((s) => {
    const on = s.dataset.c === cur;
    s.style.outline = on ? '2.5px solid #1a4a7a' : 'none';
    s.style.outlineOffset = on ? '1px' : '0';
  });
  b.style.display = 'block';
}
// SEMPLICE come nel piano: clicchi le righe per MARCARLE (bordo arancione),
// poi scegli il colore in alto e si applica alle righe marcate
function _briefRigheSel() {
  if (!window._briefSelSet) window._briefSelSet = new Set();
  return window._briefSelSet;
}
function _briefCelleSel() {
  if (!window._briefCelleSet) window._briefCelleSet = new Set();
  return window._briefCelleSet;
}
function _briefSelPulisci() {
  _briefRigheSel().clear();
  _briefCelleSel().clear();
  document.querySelectorAll('.brief-riga-sel').forEach((x) => x.classList.remove('brief-riga-sel'));
  document.querySelectorAll('.brief-cella-sel').forEach((x) => x.classList.remove('brief-cella-sel'));
}
function _briefSelezioneBind() {
  if (window._briefSelBound) return;
  window._briefSelBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('select, textarea, button, a, span[onclick], #brief-colori-bar')) return;
    const tr = e.target.closest('tr[data-bidx]');
    if (!tr) {
      // click fuori dal briefing: deseleziona tutto (gli input di altre
      // pagine non c'entrano con la selezione)
      if (e.target.closest('input')) return;
      if (_briefRigheSel().size || _briefCelleSel().size) _briefSelPulisci();
      return;
    }
    if (!puoGestireBriefing()) return;
    // come Excel: il click semplice seleziona SOLO quella cella o riga,
    // con Ctrl (o Cmd) si aggiunge o toglie dalla selezione
    const multi = e.ctrlKey || e.metaKey;
    const td = e.target.closest('td[data-campo]');
    if (td && e.target.closest('input')) {
      const selC = _briefCelleSel();
      const k = tr.dataset.bidx + '|' + td.dataset.campo;
      if (multi && selC.has(k)) {
        selC.delete(k);
        td.classList.remove('brief-cella-sel');
        return;
      }
      if (!multi) _briefSelPulisci();
      selC.add(k);
      td.classList.add('brief-cella-sel');
      return;
    }
    if (e.target.closest('input')) return;
    const sel = _briefRigheSel();
    const i = tr.dataset.bidx;
    if (multi && sel.has(i)) {
      sel.delete(i);
      tr.classList.remove('brief-riga-sel');
      return;
    }
    if (!multi) _briefSelPulisci();
    sel.add(i);
    tr.classList.add('brief-riga-sel');
  });
}
async function briefColoreApplica(col) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe da colorare, poi scegli il colore');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC.c = col || '';
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)].col = col || null;
      n++;
    }
  });
  _briefSelPulisci();
  _colUltimoSet(col || '');
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast(col ? 'Colore applicato (' + n + ')' : 'Colore tolto (' + n + ')');
  renderPiano();
}
// GRASSETTO / CORSIVO come Excel: celle marcate (o righe intere); se tutto
// il selezionato ha gia' il formato lo toglie, altrimenti lo applica
async function briefFormatoApplica(f) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe, poi scegli il formato');
    return;
  }
  const prop = f === 'b' ? 'bold' : 'ital';
  let tutte = true;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (r && !_stileCella(r.cs && r.cs[k.split('|')[1]])[f]) tutte = false;
  });
  sel.forEach((i) => {
    const r = _briefState.righe[parseInt(i)];
    if (r && !r[prop]) tutte = false;
  });
  const on = !tutte;
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC[f] = on;
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)][prop] = on;
      n++;
    }
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast((f === 'b' ? 'Grassetto' : 'Corsivo') + (on ? ' applicato (' : ' tolto (') + n + ')');
  renderPiano();
}
async function briefMuoviRiga(i, delta) {
  if (!_briefState || !puoGestireBriefing()) return;
  const j = i + delta;
  if (j < 0 || j >= _briefState.righe.length) return;
  const tmp = _briefState.righe[i];
  _briefState.righe[i] = _briefState.righe[j];
  _briefState.righe[j] = tmp;
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
async function briefEliminaRiga(i) {
  if (!_briefState || !puoGestireBriefing()) return;
  _briefState.righe.splice(i, 1);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// RICALCOLO dei soli numeri cassa su un briefing gia' salvato: si usa
// quando i CD di ieri sono stati cambiati a mano e la rotazione di oggi
// deve seguire. Le righe (nomi, turni, orari, colori) restano intatte.
async function briefAggiornaCd() {
  if (!_briefState || !puoGestireBriefing() || _briefIsValet()) return;
  if (
    !confirm(
      'Ricalcolo i numeri cassa di questo briefing con la rotazione aggiornata (chi ha chiuso ieri riapre oggi)?\n\nI nomi e i turni restano come sono; solo la colonna CD viene riassegnata.',
    )
  )
    return;
  _briefState.righe.forEach((r) => {
    r.cd = '';
  });
  await _briefAssegnaCd(_briefState.righe, _briefData);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  logAzione('Briefing: numeri cassa ricalcolati', _briefData);
  toast('Numeri cassa aggiornati');
  renderPiano();
}
async function briefCompila() {
  if (!_briefState || !puoGestireBriefing()) return;
  if (_briefState.righe.length && !confirm('Sostituisco le righe attuali con i turni del piano di ' + _briefData + '?'))
    return;
  _briefState.righe = _briefComponi(_briefState.pianoRighe);
  await _briefAggiungiScoperti(_briefState.righe, _briefData);
  if (!_briefIsValet() && _pianoReparto() === 'slots') await _briefAssegnaCd(_briefState.righe, _briefData);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// Card di configurazione delle evidenziazioni: quale colore messo nel PIANO
// diventa quale colore sul BRIEFING, con un'etichetta che dice cosa significa
function _briefRenderEvidCard() {
  if (!puoGestireBriefing()) return '';
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep);
  const opz = (sel, cb) =>
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<option value="' +
        c +
        '"' +
        (String(sel).toUpperCase() === c.toUpperCase() ? ' selected' : '') +
        ' style="background:' +
        c +
        '">' +
        c +
        '</option>',
    ).join('');
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Evidenziazioni dal piano · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:12px 14px">' +
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Quando una cella del piano ha un colore, sul briefing il nome di quella persona si evidenzia. Qui si decide <b>con quale colore</b> e <b>che cosa significa</b>: per esempio nel valet il coordinatore si segna in rosso sul piano e sul foglio del briefing appare in verde.</p>';
  if (!lista.length)
    h += '<p style="font-size:.85rem;color:var(--muted)">Nessuna evidenziazione configurata per questo settore.</p>';
  lista.forEach((ev, i) => {
    h +=
      '<div class="tipo-item"><span style="font-size:.85rem">nel piano</span> <select onchange="briefEvidSalva(' +
      i +
      ',\'da\',this.value)" style="padding:3px;background:' +
      escP(ev.da || '') +
      '">' +
      opz(ev.da) +
      '</select> <span style="font-size:.85rem">sul briefing diventa</span> <select onchange="briefEvidSalva(' +
      i +
      ',\'a\',this.value)" style="padding:3px;background:' +
      escP(ev.a || '') +
      '">' +
      opz(ev.a) +
      '</select> <input type="text" value="' +
      escP(ev.label || '') +
      '" placeholder="Significato (es. Coordinatore)" onchange="briefEvidSalva(' +
      i +
      ',\'label\',this.value)" style="flex:1;min-width:150px;padding:4px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"> <button class="btn-del-tipo" onclick="briefEvidRimuovi(' +
      i +
      ')">Rimuovi</button></div>';
  });
  h +=
    '<button class="btn-add-tipo" style="margin-top:8px" onclick="briefEvidAggiungi()">+ Aggiungi evidenziazione</button>';
  h += '</div></div>';
  return h;
}
async function _briefEvidPersisti(rep, lista) {
  const cfg = window._briefEvidCfg || {};
  cfg[rep] = lista;
  window._briefEvidCfg = cfg;
  if (!(await salvaImp('brief_evidenziazioni', JSON.stringify(cfg)))) return;
}
async function briefEvidAggiungi() {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  lista.push({ da: PIANO_COLORI_CELLA[0], a: PIANO_COLORI_CELLA[3], label: '' });
  await _briefEvidPersisti(rep, lista);
  toast('Evidenziazione aggiunta');
  renderPiano();
}
async function briefEvidSalva(i, campo, val) {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  if (!lista[i]) return;
  lista[i][campo] = String(val || '').trim();
  await _briefEvidPersisti(rep, lista);
  logAzione('Briefing: evidenziazione', rep + ' ' + (lista[i].label || '') + ' ' + lista[i].da + ' -> ' + lista[i].a);
  toast('Evidenziazione aggiornata');
  renderPiano();
}
async function briefEvidRimuovi(i) {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  if (!lista[i]) return;
  if (!confirm('Rimuovere questa evidenziazione?')) return;
  lista.splice(i, 1);
  await _briefEvidPersisti(rep, lista);
  toast('Evidenziazione rimossa');
  renderPiano();
}
function _briefRenderPauseCard() {
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Pause · ' +
    escP(_pianoReparto().toUpperCase()) +
    '</div><div style="padding:12px 14px" id="brief-pause-body">';
  h += _briefPauseBodyHtml();
  h += '</div></div>';
  return h;
}
function _briefPauseBodyHtml() {
  let h = '';
  const p = _briefState && _briefState.pause;
  if (p && p.contenuto && p.contenuto.tipo) {
    h +=
      '<div style="margin-bottom:8px"><button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pdfPauseGiorno()">Stampa pause</button></div>';
    h += _briefRenderPause(p.contenuto);
    const viol = typeof _peVerificaRegolePause === 'function' ? _peVerificaRegolePause(p.contenuto, _briefData) : [];
    if (viol.length)
      h +=
        '<div style="margin:8px 0;padding:6px 10px;font-size:.82rem;background:#fff3c4;border-left:3px solid #d4b86a"><b>Regole pause non rispettate (' +
        viol.length +
        ')</b>: ' +
        escP(viol.slice(0, 8).join(' · ')) +
        (viol.length > 8 ? ' · ...' : '') +
        '</div>';
  } else {
    h +=
      '<p style="font-size:.85rem;color:var(--muted)">Nessuna pausa generata per questa data. Compila il briefing e premi <b>Genera pause</b>.</p>';
  }
  h += _briefRenderPauseCfg();
  return h;
}

// ============================================================
// CORSI (CS, LRD, ANTINCENDIO...) · pianificatore: scegli codice,
// data, orario e partecipanti; le sigle finiscono da sole nel piano
// ============================================================
function _corsiLista() {
  const lista = Array.isArray(window._pianoCorsiLista) ? window._pianoCorsiLista : ['CS', 'LRD', 'ANTINCENDIO'];
  return lista
    .map((cod) => {
      const info = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod && x.attivo !== false);
      return info ? { codice: info.codice, descrizione: info.descrizione || '', ore: info.ore } : null;
    })
    .filter(Boolean);
}
// orario del corso aggiornabile anche dagli operatori (è solo il riferimento
// proposto alla prossima pianificazione, non tocca il piano)
async function corsoOrarioRapido(cod, inizio, fine) {
  const cur = ((window._pianoCorsiOrari || {})[cod] || '').split('-');
  const oi = inizio != null ? inizio : cur[0] || '';
  const of2 = fine != null ? fine : cur[1] || '';
  window._pianoCorsiOrari = window._pianoCorsiOrari || {};
  window._pianoCorsiOrari[cod] = oi && of2 ? oi + '-' + of2 : oi || of2 || '';
  try {
    if (!(await salvaImp('piano_corsi_orari', JSON.stringify(window._pianoCorsiOrari)))) return;
    logAzione('Corsi', cod + ' orario aggiornato: ' + window._pianoCorsiOrari[cod]);
    toast('Orario corso ' + cod + ' salvato');
  } catch (e) {
    toast('Errore salvataggio orario');
  }
}
async function _corsiSalvaLista() {
  if (!(await salvaImp('piano_corsi_lista', window._pianoCorsiLista.join(',')))) return;
}
async function corsoAggiungi() {
  if (!isAdmin()) return;
  const cod = ((document.getElementById('corso-nuovo-cod') || {}).value || '').trim().toUpperCase();
  const desc = ((document.getElementById('corso-nuovo-desc') || {}).value || '').trim();
  const ore = parseFloat((document.getElementById('corso-nuovo-ore') || {}).value) || 0;
  if (!cod) {
    toast('Inserisci la sigla del corso');
    return;
  }
  if ((window._pianoCorsiLista || []).includes(cod)) {
    toast('Corso già in lista');
    return;
  }
  try {
    const esiste = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod);
    if (!esiste) {
      const nuovo = await secPost('piano_codici', {
        codice: cod,
        descrizione: desc || 'Corso ' + cod,
        ore: ore,
        scala_percentuale: false,
        protetto: false,
        is_riposo: false,
        attivo: true,
        richiede_orario: false,
      });
      if (nuovo && nuovo[0]) pianoCodiciCache.push(nuovo[0]);
    } else if (desc) {
      await secPatch('piano_codici', 'id=eq.' + esiste.id, { descrizione: desc });
      esiste.descrizione = desc;
    }
    window._pianoCorsiLista = [...(window._pianoCorsiLista || []), cod];
    await _corsiSalvaLista();
    logAzione('Corsi', 'Aggiunto corso ' + cod + ' (' + ore + 'h)');
    toast('Corso ' + cod + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta corso');
  }
}
async function corsoRinomina(cod, desc) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod.toUpperCase());
  if (!c) return;
  try {
    await secPatch('piano_codici', 'id=eq.' + c.id, { descrizione: (desc || '').trim() });
    c.descrizione = (desc || '').trim();
    logAzione('Corsi', cod + ' rinominato: ' + desc);
    toast('Descrizione salvata');
  } catch (e) {
    toast('Errore salvataggio');
  }
}
async function corsoOre(cod, ore) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod.toUpperCase());
  if (!c) return;
  try {
    await secPatch('piano_codici', 'id=eq.' + c.id, { ore: parseFloat(ore) || 0 });
    c.ore = parseFloat(ore) || 0;
    logAzione('Corsi', cod + ' ore → ' + ore);
    toast('Ore corso salvate');
  } catch (e) {
    toast('Errore salvataggio');
  }
}
async function corsoRimuovi(cod) {
  if (!isAdmin()) return;
  if (!confirm('Togliere ' + cod + ' dalla lista corsi? (il codice resta tra i codici del piano)')) return;
  window._pianoCorsiLista = (window._pianoCorsiLista || []).filter((x) => x !== cod);
  await _corsiSalvaLista();
  logAzione('Corsi', 'Rimosso dalla lista: ' + cod);
  renderPiano();
}
function _renderPianoCorsiCard() {
  const corsi = _corsiLista();
  const puoCorsi = puoGestirePiano() || (typeof puoModificare === 'function' && puoModificare('gestione_corsi'));
  // operatori senza permesso corsi: elenco in sola lettura (orario aggiornabile)
  if (!puoCorsi) {
    let hRO =
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi</div><div style="padding:12px 14px"><table class="piano-table" style="min-width:420px;font-size:.85rem"><thead><tr><th>Sigla</th><th style="text-align:left">Descrizione</th><th title="Durata in ore decimali e, accanto, in ore e minuti: 8.33 = 8h20, perche 20 minuti sono un terzo di ora">Ore</th><th>Orario</th></tr></thead><tbody>';
    corsi.forEach((c) => {
      const orario = ((window._pianoCorsiOrari || {})[c.codice] || '').split('-');
      hRO +=
        '<tr><td style="font-weight:700">' +
        escP(c.codice) +
        '</td><td style="text-align:left">' +
        escP(c.descrizione) +
        '</td><td>' +
        (c.ore || 0) +
        '</td><td style="white-space:nowrap"><input type="time" value="' +
        (orario[0] || '') +
        '" onchange="corsoOrarioRapido(\'' +
        c.codice +
        '\',this.value,null)" style="padding:2px 4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"> - <input type="time" value="' +
        (orario[1] || '') +
        '" onchange="corsoOrarioRapido(\'' +
        c.codice +
        '\',null,this.value)" style="padding:2px 4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td></tr>';
    });
    hRO +=
      '</tbody></table><p style="font-size:.82rem;color:var(--muted);margin-top:6px">L&#39;orario del corso cambia di volta in volta: qui puoi aggiornarlo, viene proposto alla prossima pianificazione.</p></div></div>';
    return hRO;
  }
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi · inserimento automatico nel piano</div><div style="padding:12px 14px">';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-bottom:10px">Scegli il corso, la data, l&#39;orario e i partecipanti: la sigla viene scritta da sola nelle loro celle del piano (protetta, con orario e ore contate).</p>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">';
  h +=
    '<div class="field"><label>Corso</label><select id="corso-cod" style="padding:8px" onchange="corsoPrefillOrari()">' +
    corsi.map((c) => '<option' + (c.codice === 'CS' ? ' selected' : '') + '>' + escP(c.codice) + '</option>').join('') +
    '</select></div>';
  h += '<div class="field"><label>Data</label><input type="date" id="corso-data"></div>';
  const preCS = ((window._pianoCorsiOrari || {})['CS'] || '14:30-17:30').split('-');
  h +=
    '<div class="field"><label>Inizio</label><input type="time" id="corso-inizio" value="' +
    (preCS[0] || '') +
    '"></div>';
  h +=
    '<div class="field"><label>Fine</label><input type="time" id="corso-fine" value="' + (preCS[1] || '') + '"></div>';
  h +=
    '<button class="btn-export" style="font-size:.82rem;padding:4px 10px" title="La prossima volta questo corso partirà con questo orario" onclick="corsoSalvaOrarioDefault()">Salva orario predefinito</button>';
  h += '</div>';
  h +=
    '<div style="margin-bottom:6px;font-size:.82rem"><b>Partecipanti</b> · <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=true)">tutti</span> / <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=false)">nessuno</span></div>';
  h +=
    '<div style="max-height:180px;overflow-y:auto;border:1px solid var(--border,#ccc);padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 12px;font-size:.84rem">';
  collabs.forEach((c) => {
    h +=
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="corso-part" value="' +
      escP(c.nome) +
      '">' +
      escP(c.nome) +
      '</label>';
  });
  h += '</div>';
  h +=
    '<button class="btn-export" style="font-size:.85rem;padding:6px 16px;margin-top:10px;border-color:#2c6e49;color:#2c6e49" onclick="pianoInserisciCorso()">Inserisci nel piano</button>';
  // gestione della LISTA corsi (admin): aggiungi sigla, rinomina, rimuovi
  if (isAdmin()) {
    h +=
      '<p style="font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Gestisci corsi (admin)</p>';
    corsi.forEach((c) => {
      h +=
        '<div class="tipo-item"><div class="tipo-item-name" style="min-width:90px;font-weight:700">' +
        escP(c.codice) +
        '</div><input type="text" value="' +
        escP(c.descrizione) +
        '" placeholder="descrizione" onchange="corsoRinomina(\'' +
        c.codice +
        '\',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><input type="number" step="0.5" min="0" value="' +
        (c.ore || 0) +
        '" title="Ore conteggiate per il corso" onchange="corsoOre(\'' +
        c.codice +
        '\',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><button class="btn-del-tipo" onclick="corsoRimuovi(\'' +
        c.codice +
        '\')">Rimuovi</button></div>';
    });
    h +=
      '<div class="add-tipo-row" style="margin:6px 0 0"><div class="field"><label>Nuova sigla corso</label><input type="text" id="corso-nuovo-cod" placeholder="Es: PRIMO SOCCORSO" maxlength="14" style="width:150px"></div><div class="field"><label>Descrizione</label><input type="text" id="corso-nuovo-desc" placeholder="descrizione"></div><div class="field"><label>Ore</label><input type="number" id="corso-nuovo-ore" value="2" step="0.5" min="0" style="width:70px"></div><button class="btn-add-tipo" onclick="corsoAggiungi()">+ Aggiungi</button></div>';
    h +=
      '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 0">Rimuovere un corso lo toglie solo da questa lista: il codice resta tra i codici del piano e le celle gi&agrave; inserite non cambiano.</p>';
  }
  h += '</div></div>';
  return h;
}
function corsoPrefillOrari() {
  const cod = (document.getElementById('corso-cod') || {}).value;
  const pre = (window._pianoCorsiOrari || {})[cod] || '';
  const p = pre.split('-');
  document.getElementById('corso-inizio').value = p[0] || '';
  document.getElementById('corso-fine').value = p[1] || '';
}
// salva l'orario attuale come predefinito del corso selezionato
async function corsoSalvaOrarioDefault() {
  if (!puoGestirePiano()) return;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const inizio = (document.getElementById('corso-inizio') || {}).value;
  const fine = (document.getElementById('corso-fine') || {}).value;
  if (!cod) return;
  window._pianoCorsiOrari = window._pianoCorsiOrari || {};
  if (inizio && fine) window._pianoCorsiOrari[cod] = inizio + '-' + fine;
  else delete window._pianoCorsiOrari[cod];
  if (!(await salvaImp('piano_corsi_orari', JSON.stringify(window._pianoCorsiOrari)))) return;
  toast('Orario predefinito di ' + cod + (inizio && fine ? ': ' + inizio + '-' + fine : ' rimosso'));
}
async function pianoInserisciCorso() {
  if (!puoGestirePiano() && !(typeof puoModificare === 'function' && puoModificare('gestione_corsi'))) return;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const data = (document.getElementById('corso-data') || {}).value;
  const inizio = (document.getElementById('corso-inizio') || {}).value;
  const fine = (document.getElementById('corso-fine') || {}).value;
  const nomi = [...document.querySelectorAll('.corso-part:checked')].map((c) => c.value);
  if (!cod || !data || !nomi.length) {
    toast('Scegli corso, data e almeno un partecipante');
    return;
  }
  if (!_pianoConsentiScrittura(data)) return; // giorno chiuso: stessa regola del piano
  try {
    // celle di QUEL giorno di tutti i settori: chi lavora in due settori puo'
    // avere la cella nell'altro piano (prima risultava libero e l'inserimento
    // falliva a meta' per la riga doppia)
    const esistenti = (await secGet('piano?data=eq.' + data + '&limit=2000')) || [];
    const etichettaCorso = 'Corso ' + cod + (inizio && fine ? ' ' + inizio + '-' + fine : '');
    const ci = _pianoOra(inizio);
    const cf = _pianoOra(fine);
    // classifica: liberi / turno COMPATIBILE (corso nel commento, turno
    // intatto) / turno SOVRAPPOSTO (avviso!) / altre celle (assenze...)
    const liberi = [];
    const compatibili = [];
    const conflitti = [];
    const occupateAltre = [];
    for (const nome of nomi) {
      const ex = esistenti.find((r) => r.collaboratore === nome);
      if (!ex) {
        liberi.push(nome);
        continue;
      }
      const t = _pianoTurnoInfo(ex.codice);
      if (t && t.ora_inizio && ci != null && cf != null) {
        const ti = _pianoOra(t.ora_inizio);
        let tf = _pianoOra(t.ora_fine);
        if (tf <= ti) tf += 24;
        if (ci < tf && ti < cf) conflitti.push({ nome: nome, ex: ex, t: t });
        else compatibili.push({ nome: nome, ex: ex });
      } else {
        occupateAltre.push({ nome: nome, ex: ex });
      }
    }
    if (
      !confirm(
        etichettaCorso +
          ' del ' +
          data.split('-').reverse().join('.') +
          '\n\n• ' +
          liberi.length +
          ' con giorno libero: ricevono la cella ' +
          cod +
          (compatibili.length
            ? '\n• ' +
              compatibili.length +
              ' con turno COMPATIBILE (turno intatto, corso nel commento): ' +
              compatibili.map((x) => x.nome + ' (' + x.ex.codice + ')').join(', ')
            : '') +
          (conflitti.length
            ? '\n\nATTENZIONE - turno SOVRAPPOSTO al corso, NON lo ricevono: ' +
              conflitti
                .map(
                  (x) =>
                    x.nome +
                    ' (' +
                    x.ex.codice +
                    ' ' +
                    _briefOrarioHM(x.t.ora_inizio) +
                    '-' +
                    _briefOrarioHM(x.t.ora_fine) +
                    ')',
                )
                .join(', ')
            : '') +
          (occupateAltre.length
            ? '\n• Altre celle (assenze/congedi), esclusi: ' +
              occupateAltre.map((x) => x.nome + ' (' + x.ex.codice + ')').join(', ')
            : ''),
      )
    )
      return;
    let sovrascrivi = false;
    if (conflitti.length || occupateAltre.length)
      sovrascrivi = confirm(
        'Sovrascrivo comunque le celle di chi ha turno sovrapposto o altra cella?\n(Annulla = restano come sono, consigliato)',
      );
    let inseriti = 0;
    let annotati = 0;
    const datiCorso = {
      codice: cod,
      ora_inizio: inizio || null,
      ora_fine: fine || null,
      protetto: true,
      generato: false,
      commento: etichettaCorso + ' - ' + getOperatore(),
    };
    const errori = [];
    for (const nome of liberi) {
      try {
        await _pianoInserisciCella(
          Object.assign({ collaboratore: nome, data: data, reparto_dip: _pianoReparto() }, datiCorso),
        );
        inseriti++;
      } catch (e) {
        errori.push(nome + ': ' + (e.message || 'errore'));
      }
    }
    for (const cx of compatibili) {
      await secPatch('piano', 'id=eq.' + cx.ex.id, {
        commento: etichettaCorso + ' poi ' + cx.ex.codice + ' - ' + getOperatore(),
        protetto: true,
      });
      annotati++;
    }
    if (sovrascrivi) {
      for (const cx of conflitti.concat(occupateAltre)) {
        await secPatch('piano', 'id=eq.' + cx.ex.id, datiCorso);
        inseriti++;
      }
    }
    logAzione(
      'Corso inserito nel piano',
      cod + ' ' + data + ' · ' + inseriti + ' celle, ' + annotati + ' annotati sul turno',
    );
    if (errori.length) toastErrore('Corso non inserito per: ' + errori.join('; '));
    else
      toast('Corso ' + cod + ': ' + inseriti + ' celle' + (annotati ? ' + ' + annotati + ' annotati sul turno' : ''));
    if (_pianoMeseSel === data.substring(0, 7)) renderPiano();
  } catch (e) {
    console.error(e);
    toastErrore('Errore inserimento corso: ' + (e.message || ''));
  }
}
