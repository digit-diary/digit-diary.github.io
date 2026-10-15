/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
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
// settori che ordinano il foglio per lettera della sigla (sotto). Ogni altro settore, anche
// nuovo, ordina solo per orario: prima solo Tavoli e Cleaning erano esclusi per nome e un
// settore nuovo ereditava i gruppi C/S/R/Z delle Slots.
const _BRIEF_SETTORI_ORDINE_LETTERE = ['slots', 'valet'];
function _briefGruppo(cod) {
  if (!cod) return 9;
  // le lettere (C cassa, S sala, R reception, Z, L1/9) sono delle sigle Slots (e del Valet,
  // che ne usa alcune): negli altri settori le sigle sono numeri o altro e si ordinano
  // solo per orario (prima il "9" dei Tavoli finiva in un gruppo a parte)
  const rep = typeof _pianoReparto === 'function' ? _pianoReparto() : 'slots';
  if (!_BRIEF_SETTORI_ORDINE_LETTERE.includes(rep)) return 1;
  const u = String(cod).toUpperCase();
  if (u === '9' || u === 'L1') return 3;
  if (u[0] === 'Z') return 4;
  if (u[0] === 'C') return 0;
  if (u[0] === 'S') return 1;
  if (u[0] === 'R') return 2;
  if (u[0] === 'X') return 1;
  return 5;
}
// COLONNE DEL BRIEFING PER SETTORE (v452): quali colonne, in che ordine e con che
// intestazione. Impostazione 'brief_colonne_<settore>' = [{ id, tit, vis, libera }]; senza
// impostazione valgono le colonne di sempre (identiche, a video e in stampa). Le colonne con
// logica (E e U a penna e maniglia della riga, nome con formazione e colori, turno con il
// suo colore, CD numeri cassa, uscita, firma) tengono la loro logica: si possono solo
// mostrare, nascondere, rinominare e spostare. Collaboratore e turno restano sempre (sono la
// base del foglio, delle pause e della tabella ORARI). Le colonne libere sono caselle di
// testo vuote (es. Note, Postazione), salvate nella riga del briefing come le altre.
const BRIEF_COLONNE_CATALOGO = {
  e: { nome: 'Entrata', spiega: 'si spunta a penna sul foglio; a video è la maniglia per spostare la riga' },
  u: { nome: 'Uscita a penna', spiega: 'si spunta a penna sul foglio; a video è la maniglia per spostare la riga' },
  nome: { nome: 'Collaboratore', spiega: 'cognome, formazione in giallo e colori dal piano', fissa: true },
  turno: { nome: 'Turno', spiega: 'sigla con il colore del turno', fissa: true },
  cd: { nome: 'Numero cassa', spiega: 'assegnato dalla rotazione "chi chiude riapre"', settori: ['slots'] },
  uscita: { nome: 'Ora di uscita', spiega: 'si scrive a mano' },
  firma: { nome: 'Firma', spiega: 'la colonna che si allarga di più in stampa' },
  radio: { nome: 'Radio', spiega: 'numero della radio' },
  badge: { nome: 'Badge', spiega: 'numero del badge' },
};
function _briefColonnePredefinite(rep) {
  if (rep === 'valet')
    return [
      ['e', 'E'],
      ['u', 'U'],
      ['nome', 'COLLABORATORE'],
      ['turno', 'TURNO'],
      ['uscita', 'USCITA'],
      ['firma', 'FIRMA'],
      ['radio', 'RADIO'],
      ['badge', 'BADGE'],
    ].map(([id, tit]) => ({ id, tit, vis: true }));
  const base =
    rep === 'slots'
      ? [
          ['e', 'E'],
          ['u', 'U'],
          ['nome', 'HOST'],
          ['turno', 'T'],
          ['cd', 'CD'],
          ['uscita', 'USCITA'],
          ['firma', 'FIRMA'],
        ]
      : [
          ['e', 'E'],
          ['u', 'U'],
          ['nome', 'COLLABORATORE'],
          ['turno', 'T'],
          ['uscita', 'USCITA'],
          ['firma', 'FIRMA'],
        ];
  const out = base.map(([id, tit]) => ({ id, tit, vis: true }));
  // radio e badge ci sono in tutti i settori, nascoste dove non si usavano
  ['radio', 'badge'].forEach((id) => out.push({ id, tit: id.toUpperCase(), vis: false }));
  return out;
}
// elenco completo (anche le nascoste) del settore, ripulito: colonne sconosciute tolte,
// collaboratore e turno sempre visibili, le colonne del catalogo mancanti in fondo nascoste
function _briefColonneTutte(rep) {
  rep = rep || _pianoReparto();
  const pred = _briefColonnePredefinite(rep);
  const salv = (window._briefColonneCfg || {})[rep];
  if (!Array.isArray(salv) || !salv.length) return pred;
  const ammessa = (id) => {
    const c = BRIEF_COLONNE_CATALOGO[id];
    return c && (!c.settori || c.settori.includes(rep));
  };
  const visti = new Set();
  const out = [];
  salv.forEach((c) => {
    if (!c || typeof c.id !== 'string' || visti.has(c.id)) return;
    const libera = /^x_[a-z0-9]{1,12}$/.test(c.id);
    if (!libera && !ammessa(c.id)) return;
    visti.add(c.id);
    const tit = String(c.tit == null ? '' : c.tit)
      .trim()
      .slice(0, 30);
    const fissa = !libera && BRIEF_COLONNE_CATALOGO[c.id].fissa;
    out.push({
      id: c.id,
      tit: tit || (libera ? 'NOTE' : (pred.find((p) => p.id === c.id) || {}).tit || c.id.toUpperCase()),
      vis: fissa ? true : c.vis !== false,
      libera: libera || undefined,
    });
  });
  pred.forEach((p) => {
    if (!visti.has(p.id)) out.push(Object.assign({}, p, { vis: !!BRIEF_COLONNE_CATALOGO[p.id].fissa }));
  });
  return out;
}
// le colonne mostrate (a video e in stampa), nell ordine scelto
function _briefColonne(rep) {
  return _briefColonneTutte(rep).filter((c) => c.vis);
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
function _briefComponi(pianoRighe) {
  const righe = [];
  // coordinatori del giorno (regola di gruppo "coordinatori"): rossi anche sul foglio
  const mappaCoord =
    typeof _pianoCoordinatoriDa === 'function'
      ? _pianoCoordinatoriDa(
          (pianoRighe || []).filter((r) => _pianoCopreQui(r)),
          _pianoReparto(),
        ).mappa
      : {};
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
      col: (() => {
        const c = typeof _pianoColoreCella === 'function' ? _pianoColoreCella(r, mappaCoord) : r.colore;
        return (c && _briefColoreDaPiano(_stileCella(c).c)) || undefined;
      })(),
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
  const [salvati, pianoRighe, pauseCfg, colonneCfg] = await Promise.all([
    secGet('piano_briefing?data=eq.' + dstr + '&reparto_dip=eq.' + rep),
    // senza filtro reparto: i multi-reparto (es. Balliu) entrano nel briefing
    // del reparto del TURNO che fanno quel giorno; _briefComponi filtra per turno
    secGet('piano?data=eq.' + dstr),
    getImp('piano_pause_cfg'),
    getImp('brief_colonne_' + rep),
  ]);
  try {
    window._briefPauseCfgObj = pauseCfg ? JSON.parse(pauseCfg) : {};
  } catch (e) {
    window._briefPauseCfgObj = {};
  }
  window._briefColonneCfg = window._briefColonneCfg || {};
  try {
    window._briefColonneCfg[rep] = colonneCfg ? JSON.parse(colonneCfg) : null;
  } catch (e) {
    window._briefColonneCfg[rep] = null;
  }
  const valetR = _briefIsValet();
  const rigaBrief = (salvati || []).find((x) => x.sezione === 'briefing');
  const rigaPause = (salvati || []).find((x) => x.sezione === 'pause');
  // fogli con intestazioni rovinate da una correzione a mano: si riparano aprendoli
  const intestRiparate =
    rigaPause && rigaPause.contenuto && typeof _pbSanaIntestazioni === 'function'
      ? _pbSanaIntestazioni(rigaPause.contenuto)
      : 0;
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
  // inizio della giornata del foglio pause (JG del mattino): vale per questo giorno
  if (typeof _peImpostaInizio === 'function') _peImpostaInizio(righe);
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
  if (intestRiparate && puoGestireBriefing() && typeof _briefSalvaPauseDebounce === 'function') {
    _briefSalvaPauseDebounce();
    logAzione('Pause: intestazioni riparate', dstr + ' · ' + intestRiparate);
  }

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
    escP(repartoLabel(rep).toUpperCase()) +
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
    '<strong style="font-size:var(--fs-lg,1.0625rem);background:#FFFF00;color:#000;padding:3px 12px;border:1px solid #999">' +
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
        '<button data-c="" class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="briefColoreApplica(null)">Nessuno</button>' +
        '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'b\')">G</button> ' +
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'i\')">C</button>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
        PIANO_COLORI_TESTO.map(
          (c) =>
            '<span title="Colore del testo" onclick="briefTestoApplica(\'' +
            c +
            '\')" style="display:inline-block;width:18px;height:18px;background:' +
            c +
            ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
        ).join('') +
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 8px;margin-left:4px;vertical-align:middle" onclick="briefTestoApplica(null)">Auto</button>' +
        '</div>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px;vertical-align:middle" title="Memorizza il formato della prima cella marcata" onclick="briefCopiaFormato()">Copia formato</button> ' +
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px;vertical-align:middle" title="Applica il formato memorizzato alle celle marcate" onclick="briefIncollaFormato()">Incolla formato</button> ' +
        '<button class="btn-export btn-pericolo" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px;vertical-align:middle" title="Toglie colori e formato dalle celle o righe marcate" onclick="briefCancellaFormato()">Cancella formato</button>' +
        '</div>' +
        '</div></span></span>'
      : '') +
    (cdDaAggiornare
      ? '<span style="font-size:var(--fs-sm,.8125rem);background:#ffd166;color:#5a4300;padding:3px 10px;border-radius:3px;font-weight:700">I numeri cassa di ieri sono cambiati: premi "Aggiorna numeri cassa"</span>'
      : '') +
    // Annulla / Ripristina del briefing: quelli generici in basso (Ctrl+Z / Ctrl+Y)
    '' +
    '<span id="brief-stato" style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
    (salvato
      ? 'Salvato'
      : righe.length
        ? 'Compilato dal piano · modifica una cella per salvare'
        : 'Nessun turno nel piano per questa data') +
    '</span></div>';
  // tabella briefing + tabella orari affiancate (stessa vista dell'Excel)
  h += '<div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap"><div style="overflow-x:auto">';
  h +=
    '<table id="brief-tabella" class="brief-table" style="border-collapse:collapse;font-size:var(--fs-md,.875rem)"><thead><tr>';
  // ogni reparto ha il SUO briefing: slots con CD (numeri cassa), valet con
  // radio/badge, gli altri (es. tavoli, senza casse) tabella essenziale. Colonne,
  // ordine e intestazioni si scelgono per settore (card "Colonne del briefing")
  const colonne = _briefColonne(rep);
  const cols = colonne.map((c) => c.tit);
  colonne.forEach((c) => {
    const bg = c.id === 'e' ? '#00B050' : c.id === 'u' ? '#FF0000' : '#FFFF00';
    // E: nero sul verde (bianco era 2,9:1, poco leggibile); U: bianco sul rosso
    const fg = c.id === 'u' ? '#fff' : '#000';
    h +=
      '<th style="border:1px solid #999;background:' +
      bg +
      ';color:' +
      fg +
      ';padding:4px 8px;font-size:var(--fs-sm,.8125rem)">' +
      escP(c.tit) +
      '</th>';
  });
  h += (puo ? '<th style="border:none"></th>' : '') + '</tr></thead><tbody>';
  let gPrec = null;
  // COLONNE CHE SI ALLARGANO DA SOLE: ogni colonna e larga almeno quanto il testo
  // piu lungo che contiene (es. un cognome lungo non viene tagliato)
  const lungMax = {};
  righe.forEach((r) =>
    ['nome', 'turno', 'cd', 'uscita', 'firma', 'radio', 'badge']
      .concat(colonne.filter((c) => c.libera).map((c) => c.id))
      .forEach((k) => {
        lungMax[k] = Math.max(lungMax[k] || 0, String(r[k] || '').length);
      }),
  );
  const largCol = (campo, base) =>
    'max(' + base + 'px,calc(' + ((lungMax[campo] || 0) * 1.12).toFixed(1) + 'ch + 14px))';
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
        '" data-ge="b|' +
        i +
        '|' +
        campo +
        '" style="border:1px solid #999;padding:0' +
        (bg ? ';background:' + bg : '') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        (extra || '') +
        ' value="' +
        escP(val || '') +
        '" data-base="' +
        larghezza +
        '" oninput="briefCella(' +
        i +
        ",'" +
        campo +
        '\',this.value);_briefAllarga(this)" ' +
        'style="width:' +
        largCol(campo, larghezza) +
        ';border:none;background:transparent;padding:4px 6px;font:inherit;color:inherit' +
        // sigle del turno e numero cassa al centro della casella
        (campo === 'turno' || campo === 'cd' ? ';text-align:center' : '') +
        (stC.b || r.bold || fwDef ? ';font-weight:700' : '') +
        (stC.i || r.ital ? ';font-style:italic' : '') +
        (stC.t || r.colT ? ';color:' + (stC.t || r.colT) : '') +
        '"></td>'
      );
    };
    h += '<tr data-bidx="' + i + '">';
    // E e U si spuntano A PENNA sul foglio stampato: celle vuote. A video sono la
    // maniglia della riga: si trascinano per spostare la riga intera
    const maniglia = puo ? ' data-ge-maniglia="1"' : '';
    const cellaNome = () => {
      const stNome = stDi('nome');
      const bgNome = stNome.c || r.col || (r.fm ? '#FFFF00' : '');
      if (!(r.fm || bgNome)) return inp('nome', r.nome, 150);
      // in formazione (giallo) o colorata: sfondo sulla cella del nome
      return (
        '<td data-campo="nome" data-ge="b|' +
        i +
        '|nome" style="border:1px solid #999;padding:0;white-space:nowrap;background:' +
        (bgNome || 'transparent') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        'value="' +
        escP(r.nome || '') +
        '" data-base="' +
        (r.fm ? 86 : 138) +
        '" oninput="briefCella(' +
        i +
        ",'nome',this.value);_briefAllarga(this)\" " +
        'style="width:' +
        largCol('nome', r.fm ? 86 : 138) +
        ';border:none;background:transparent;padding:4px 2px 4px 6px;font:inherit;color:#000' +
        (stNome.b || r.bold || r.fm ? ';font-weight:700' : '') +
        (stNome.i || r.ital ? ';font-style:italic' : '') +
        (stNome.t || r.colT ? ';color:' + (stNome.t || r.colT) : '') +
        '">' +
        (r.fm
          ? '<span style="font-size:var(--fs-sm,.8125rem);font-weight:700;color:#000;padding-right:3px">(formazione)</span>'
          : '') +
        '</td>'
      );
    };
    colonne.forEach((c) => {
      if (c.id === 'e' || c.id === 'u')
        // E e U si spuntano A PENNA sul foglio stampato: celle vuote. A video sono la
        // maniglia della riga: si trascinano per spostare la riga intera
        h += '<td' + maniglia + ' style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
      else if (c.id === 'nome') h += cellaNome();
      else if (c.id === 'turno') h += inp('turno', r.turno, 52, '', _pianoColore(r.turno) || '', true);
      else if (c.id === 'cd') h += inp('cd', r.cd, 40, '', r.cd ? '#FFFF00' : '', true);
      else if (c.id === 'uscita') h += inp('uscita', r.uscita, 70);
      else if (c.id === 'firma') h += inp('firma', r.firma, 90);
      else if (c.id === 'radio' || c.id === 'badge') h += inp(c.id, r[c.id], 60);
      else h += inp(c.id, r[c.id], 90); // colonna libera: testo da scrivere a mano
    });
    if (puo)
      h +=
        '<td style="border:none;padding:0 5px;white-space:nowrap;font-size:var(--fs-md,.875rem)">' +
        '<span style="cursor:pointer;color:var(--c-verde,#2c6e49);font-weight:bold" title="Inserisci riga sotto" onclick="briefInserisciRiga(' +
        i +
        ')">+</span> ' +
        '<span style="cursor:pointer;color:var(--c-rosso,#c0392b);font-weight:bold" title="Elimina riga" onclick="briefEliminaRiga(' +
        i +
        ')">×</span></td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  if (puo)
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;margin-top:8px" onclick="briefAggiungiRiga()">+ Aggiungi riga</button>';
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
    '<div><table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem)"><thead><tr><th colspan="3" style="border:1px solid #999;background:#FFFF00;color:#000;padding:4px 10px;font-size:var(--fs-sm,.8125rem)">ORARI</th></tr></thead><tbody>';
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
  h += _briefRenderColonneCard();
  return h;
}
// ANNULLA / RIPRISTINA del briefing: righe (nomi, turni, casse, colori, formato)
// e pause insieme. Ogni modifica salva prima una fotografia del giorno; Annulla
// torna alla fotografia precedente e la salva. Vale per il giorno e il settore
// aperti (cambiando giorno si riparte da zero), come il calendario del Piano.
let _briefUndo = { chiave: null, passi: [], rifatti: [], gruppo: null, t: 0 };
function _briefFoto() {
  return JSON.stringify({
    righe: _briefState.righe,
    cdManuale: !!_briefState.cdManuale,
    pause: _briefState.pause && _briefState.pause.contenuto ? _briefState.pause.contenuto : null,
  });
}
function _briefUndoCorrente() {
  if (!_briefState) return null;
  if (_briefUndo.chiave !== _briefState.chiave)
    _briefUndo = { chiave: _briefState.chiave, passi: [], rifatti: [], gruppo: null, t: 0 };
  return _briefUndo;
}
// gruppo: la battitura continua nello stesso campo diventa un solo passo
function _briefRicorda(gruppo) {
  const u = _briefUndoCorrente();
  if (!u) return;
  const ora = Date.now();
  if (gruppo && gruppo === u.gruppo && ora - u.t < 2500) {
    u.t = ora;
    return;
  }
  u.gruppo = gruppo || null;
  u.t = ora;
  u.passi.push(_briefFotoQuando());
  if (u.passi.length > 40) u.passi.shift();
  u.rifatti = [];
  _briefAggiornaAnnulla();
}
function _briefDimentica() {
  const u = _briefUndoCorrente();
  if (u && u.passi.length) u.passi.pop();
  _briefAggiornaAnnulla();
}
// fotografia con l istante, per l Annulla unico (l azione piu recente del programma)
function _briefFotoQuando() {
  try {
    const f = JSON.parse(_briefFoto());
    f.quando = new Date().toISOString();
    return JSON.stringify(f);
  } catch (e) {
    return _briefFoto();
  }
}
function _briefAggiornaAnnulla() {
  if (window._annullaAggiornaBarra) setTimeout(window._annullaAggiornaBarra, 0);
  const u = _briefUndoCorrente() || { passi: [], rifatti: [] };
  const a = document.getElementById('brief-btn-annulla');
  const r = document.getElementById('brief-btn-ripristina');
  if (a) a.disabled = !u.passi.length;
  if (r) r.disabled = !u.rifatti.length;
}
async function _briefApplicaFoto(json) {
  const f = JSON.parse(json);
  _briefState.righe = f.righe;
  _briefState.cdManuale = f.cdManuale;
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  // pause: si riportano come erano (anche generate o eliminate)
  if (typeof _briefPauseSaveTimer !== 'undefined') clearTimeout(_briefPauseSaveTimer);
  const p = _briefState.pause;
  try {
    if (f.pause && p && p.id) {
      p.contenuto = f.pause;
      await secPatch('piano_briefing', 'id=eq.' + p.id, {
        contenuto: f.pause,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    } else if (f.pause) {
      const [dataSt, repSt] = String(_briefState.chiave || '').split('|');
      const nuovo = await secPost('piano_briefing', {
        data: dataSt || _briefData,
        reparto_dip: repSt || _pianoReparto(),
        sezione: 'pause',
        contenuto: f.pause,
        operatore: getOperatore(),
      });
      _briefState.pause = nuovo && nuovo[0] ? nuovo[0] : { id: null, contenuto: f.pause };
    } else if (p && p.id) {
      await secDel('piano_briefing', 'id=eq.' + p.id);
      _briefState.pause = null;
    }
  } catch (e) {
    toastErrore('Pause non ripristinate: ' + (e.message || 'errore di salvataggio'));
  }
  window._briefPauseAvviso = null;
  renderPiano();
}
async function briefAnnulla() {
  if (!puoGestireBriefing() || !_briefState) return;
  const u = _briefUndoCorrente();
  if (!u.passi.length) return toast('Niente da annullare nel briefing');
  const ora = _briefFotoQuando();
  const prima = u.passi.pop();
  u.rifatti.push(ora);
  u.gruppo = null;
  await _briefApplicaFoto(prima);
  logAzione('Briefing: annullata modifica', _briefData);
  toast('Modifica annullata');
}
async function briefRipristina() {
  if (!puoGestireBriefing() || !_briefState) return;
  const u = _briefUndoCorrente();
  if (!u.rifatti.length) return toast('Niente da ripristinare');
  u.passi.push(_briefFotoQuando());
  u.gruppo = null;
  await _briefApplicaFoto(u.rifatti.pop());
  logAzione('Briefing: ripristinata modifica', _briefData);
  toast('Modifica ripristinata');
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
// mentre si scrive: la colonna si allarga (tutte le caselle della colonna insieme)
function _briefAllarga(el) {
  const td = el && el.closest('td');
  const campo = td && td.dataset.campo;
  if (!campo) return;
  const caselle = [...document.querySelectorAll('.brief-table td[data-campo="' + campo + '"] input')];
  const n = Math.max(0, ...caselle.map((x) => x.value.length));
  caselle.forEach(
    (x) => (x.style.width = 'max(' + (x.dataset.base || 40) + 'px,calc(' + (n * 1.12).toFixed(1) + 'ch + 14px))'),
  );
}
function briefCella(i, campo, val) {
  if (!puoGestireBriefing() || !_briefState) return;
  _briefRicorda('cella|' + i + '|' + campo);
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
    if (el) el.textContent = 'Salvato';
  } catch (e) {
    const el = document.getElementById('brief-stato');
    if (el) el.textContent = 'ERRORE salvataggio';
  }
  _briefSaving = false;
}
async function briefAggiungiRiga() {
  if (!_briefState) return;
  _briefRicorda();
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
  _briefRicorda();
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
  _briefRicorda();
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
  _briefRicorda();
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
  _briefRicorda();
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
    // rilascio dopo una selezione a trascinamento (griglia-excel.js): la selezione resta
    const tabGe = e.target.closest('.ge-tabella');
    if (tabGe && Date.now() - (tabGe._geDopoArea || 0) < 500) return;
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
  _briefRicorda();
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
  _briefRicorda();
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
// TRASCINAMENTO (griglia-excel.js): riga intera da una posizione all altra
async function briefMuoviRigaA(da, a) {
  if (!_briefState || !puoGestireBriefing()) return;
  const n = _briefState.righe.length;
  if (da === a || da < 0 || a < 0 || da >= n || a >= n) return;
  _briefRicorda();
  const [riga] = _briefState.righe.splice(da, 1);
  _briefState.righe.splice(a, 0, riga);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// TRASCINAMENTO di una cella sola: si SCAMBIA con la cella di arrivo (stessa
// colonna), formato compreso; il nome si porta dietro nome completo e formazione
async function briefScambiaCelle(i, j, campo) {
  if (!_briefState || !puoGestireBriefing()) return;
  const R = _briefState.righe;
  if (!R[i] || !R[j] || i === j) return;
  _briefRicorda();
  const campi = campo === 'nome' ? ['nome', 'nomeFull', 'fm'] : [campo];
  campi.forEach((c) => {
    const t = R[i][c];
    R[i][c] = R[j][c];
    R[j][c] = t;
  });
  R[i].cs = R[i].cs || {};
  R[j].cs = R[j].cs || {};
  const t = R[i].cs[campo];
  R[i].cs[campo] = R[j].cs[campo];
  R[j].cs[campo] = t;
  if (campo === 'cd') _briefState.cdManuale = true;
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function _briefGrigliaCollega() {
  const tab = document.getElementById('brief-tabella');
  if (!tab || typeof GrigliaExcel === 'undefined') return;
  const parte = (td) => String(td.dataset.ge || '').split('|');
  GrigliaExcel.collega(tab, {
    id: 'brief',
    // incolla / svuota piu celle: un solo passo di Annulla, un salvataggio
    scrivi: (lista) => {
      if (!puoGestireBriefing() || !_briefState) return;
      _briefRicorda();
      lista.forEach(({ td, val }) => {
        const [, i, campo] = parte(td);
        const r = _briefState.righe[parseInt(i)];
        if (!r) return;
        r[campo] = val;
        if (campo === 'nome') r.nomeFull = null;
        if (campo === 'cd') _briefState.cdManuale = true;
        const inp = td.querySelector('input');
        if (inp) {
          inp.value = val;
          if (typeof _briefAllarga === 'function') _briefAllarga(inp);
        }
      });
      _briefDirtySalva();
    },
    // la selezione vale anche per colori e formato (come il clic con Ctrl)
    selezione: (celle) => {
      if (celle.length < 2) return;
      _briefSelPulisci();
      celle.forEach((td) => {
        const tr = td.closest('tr[data-bidx]');
        if (!tr) return;
        _briefCelleSel().add(tr.dataset.bidx + '|' + td.dataset.campo);
        td.classList.add('brief-cella-sel');
      });
    },
    spostaRiga: (daTr, aTr) => briefMuoviRigaA(parseInt(daTr.dataset.bidx), parseInt(aTr.dataset.bidx)),
    stessaColonna: (a, b) => parte(a)[2] === parte(b)[2],
    scambiaCelle: (a, b) => briefScambiaCelle(parseInt(parte(a)[1]), parseInt(parte(b)[1]), parte(a)[2]),
  });
  GrigliaExcel.ripristina('brief');
  if (typeof _pauseGrigliaCollega === 'function') _pauseGrigliaCollega();
}
async function briefEliminaRiga(i) {
  if (!_briefState || !puoGestireBriefing()) return;
  _briefRicorda();
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
    !(await chiediConferma(
      'Ricalcolo i numeri cassa di questo briefing con la rotazione aggiornata (chi ha chiuso ieri riapre oggi)?\n\nI nomi e i turni restano come sono; solo la colonna CD viene riassegnata.',
    ))
  )
    return;
  _briefRicorda();
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
  if (
    _briefState.righe.length &&
    !(await chiediConferma('Sostituisco le righe attuali con i turni del piano di ' + _briefData + '?'))
  )
    return;
  _briefRicorda();
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
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Quando una cella del piano ha un colore, sul briefing il nome di quella persona si evidenzia. Qui si decide <b>con quale colore</b> e <b>che cosa significa</b>: per esempio nel valet il coordinatore si segna in rosso sul piano e sul foglio del briefing appare in verde.</p>';
  if (!lista.length)
    h +=
      '<p style="font-size:var(--fs-md,.875rem);color:var(--muted)">Nessuna evidenziazione configurata per questo settore.</p>';
  lista.forEach((ev, i) => {
    h +=
      '<div class="tipo-item"><span style="font-size:var(--fs-md,.875rem)">nel piano</span> <select onchange="briefEvidSalva(' +
      i +
      ',\'da\',this.value)" style="padding:3px;background:' +
      escP(ev.da || '') +
      '">' +
      opz(ev.da) +
      '</select> <span style="font-size:var(--fs-md,.875rem)">sul briefing diventa</span> <select onchange="briefEvidSalva(' +
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
  if (!(await chiediConferma('Rimuovere questa evidenziazione?'))) return;
  lista.splice(i, 1);
  await _briefEvidPersisti(rep, lista);
  toast('Evidenziazione rimossa');
  renderPiano();
}
// CARD "COLONNE DEL BRIEFING" (chi compila il briefing): per il settore aperto, quali
// colonne si vedono (a video e in stampa), in che ordine e con che intestazione. Ogni
// modifica si salva subito; "Rimetti le colonne predefinite" torna a quelle di sempre.
function _briefRenderColonneCard() {
  if (!puoGestireBriefing()) return '';
  const rep = _pianoReparto();
  const tutte = _briefColonneTutte(rep);
  const personalizzate = Array.isArray((window._briefColonneCfg || {})[rep]);
  const stIn =
    'padding:4px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font:inherit';
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Colonne del briefing · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:12px 14px">' +
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Scegli quali colonne ha il foglio del briefing di questo settore, in che ordine e con che intestazione. Vale a video e nella stampa. Le colonne speciali (E e U a penna, numeri cassa, colori del turno) tengono la loro funzione: si possono solo mostrare, nascondere, rinominare e spostare. Collaboratore e turno restano sempre. Le <b>colonne libere</b> (per esempio Note o Postazione) sono caselle vuote da compilare a mano.</p>' +
    '<p style="font-size:var(--fs-sm,.8125rem);margin-bottom:8px">' +
    (personalizzate
      ? '<b>Colonne personalizzate</b> per ' + escP(repartoLabel(rep)) + '.'
      : '<span style="color:var(--muted)">Colonne predefinite (quelle di sempre).</span>') +
    '</p>';
  tutte.forEach((c, i) => {
    const cat = BRIEF_COLONNE_CATALOGO[c.id];
    const fissa = !c.libera && cat && cat.fissa;
    h +=
      '<div class="tipo-item brief-col-riga"' +
      (c.vis ? '' : ' style="opacity:.6"') +
      '>' +
      '<button class="btn-export" style="padding:2px 8px" title="Sposta a sinistra (prima)" aria-label="Sposta prima"' +
      (i === 0 ? ' disabled' : '') +
      ' onclick="briefColSposta(' +
      i +
      ',-1)">&#8593;</button>' +
      '<button class="btn-export" style="padding:2px 8px" title="Sposta a destra (dopo)" aria-label="Sposta dopo"' +
      (i === tutte.length - 1 ? ' disabled' : '') +
      ' onclick="briefColSposta(' +
      i +
      ',1)">&#8595;</button>' +
      '<label style="display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-md,.875rem);min-width:82px"><input type="checkbox"' +
      (c.vis ? ' checked' : '') +
      (fissa ? ' disabled title="Collaboratore e turno restano sempre"' : '') +
      ' onchange="briefColMostra(' +
      i +
      ',this.checked)"> Mostra</label>' +
      '<input type="text" maxlength="30" value="' +
      escP(c.tit) +
      '" aria-label="Intestazione della colonna" onchange="briefColTitolo(' +
      i +
      ',this.value)" style="width:150px;' +
      stIn +
      '">' +
      '<span style="flex:1;min-width:180px;font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
      (c.libera
        ? '<b>Colonna libera</b>: testo scritto a mano'
        : '<b>' + escP(cat.nome) + '</b>: ' + escP(cat.spiega)) +
      '</span>' +
      (c.libera ? '<button class="btn-del-tipo" onclick="briefColRimuovi(' + i + ')">Rimuovi</button>' : '') +
      '</div>';
  });
  h +=
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn-add-tipo" onclick="briefColAggiungi()">+ Aggiungi colonna libera</button>' +
    (personalizzate
      ? '<button class="btn-export" onclick="briefColPredefinite()">Rimetti le colonne predefinite</button>'
      : '') +
    '</div></div></div>';
  return h;
}
async function _briefColPersisti(lista, descr) {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const valore = lista ? JSON.stringify(lista.map((c) => ({ id: c.id, tit: c.tit, vis: !!c.vis }))) : '';
  if (!(await salvaImp('brief_colonne_' + rep, valore))) {
    renderPiano();
    return;
  }
  window._briefColonneCfg = window._briefColonneCfg || {};
  window._briefColonneCfg[rep] = lista ? JSON.parse(valore) : null;
  logAzione('Briefing: colonne', repartoLabel(rep) + ' · ' + descr);
  renderPiano();
}
async function briefColSposta(i, d) {
  const lista = _briefColonneTutte();
  const j = i + d;
  if (!lista[i] || !lista[j]) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await _briefColPersisti(lista, lista[j].tit + ' spostata ' + (d < 0 ? 'prima' : 'dopo'));
}
async function briefColMostra(i, on) {
  const lista = _briefColonneTutte();
  const c = lista[i];
  if (!c || (!c.libera && BRIEF_COLONNE_CATALOGO[c.id].fissa)) return;
  c.vis = !!on;
  await _briefColPersisti(lista, c.tit + (on ? ' mostrata' : ' nascosta'));
}
async function briefColTitolo(i, val) {
  const lista = _briefColonneTutte();
  const c = lista[i];
  const t = String(val || '')
    .trim()
    .slice(0, 30);
  if (!c) return;
  if (!t) {
    toastErrore("L'intestazione non può restare vuota: resta quella di prima.");
    renderPiano();
    return;
  }
  const prima = c.tit;
  c.tit = t;
  await _briefColPersisti(lista, prima + ' rinominata ' + t);
}
async function briefColAggiungi() {
  if (!puoGestireBriefing()) return;
  const tit = await chiediTesto(
    'Intestazione della nuova colonna (per esempio NOTE o POSTAZIONE). Sul foglio sarà una casella vuota da compilare a mano.',
    'NOTE',
    { titolo: 'Nuova colonna libera', ok: 'Aggiungi' },
  );
  if (tit == null) return;
  const t = String(tit).trim().slice(0, 30);
  if (!t) return;
  const lista = _briefColonneTutte();
  let id;
  do id = 'x_' + Math.random().toString(36).slice(2, 8);
  while (lista.some((c) => c.id === id));
  lista.push({ id, tit: t, vis: true, libera: true });
  await _briefColPersisti(lista, t + ' aggiunta');
}
async function briefColRimuovi(i) {
  const lista = _briefColonneTutte();
  const c = lista[i];
  if (!c || !c.libera) return;
  if (
    !(await chiediConferma(
      'Rimuovere la colonna ' +
        c.tit +
        '?\n\nSparisce dal foglio di tutti i giorni; il testo già scritto resta salvato nel briefing e torna se la colonna viene rimessa con Annulla.',
    ))
  )
    return;
  lista.splice(i, 1);
  await _briefColPersisti(lista, c.tit + ' rimossa');
}
async function briefColPredefinite() {
  if (!puoGestireBriefing()) return;
  if (
    !(await chiediConferma(
      'Rimettere le colonne predefinite del briefing di ' +
        repartoLabel(_pianoReparto()) +
        '?\n\nLe colonne libere spariscono dal foglio (il testo già scritto resta salvato).',
      { ok: 'Rimetti' },
    ))
  )
    return;
  await _briefColPersisti(null, 'colonne predefinite');
}
function _briefRenderPauseCard() {
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Pause · ' +
    escP(repartoLabel(_pianoReparto()).toUpperCase()) +
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
      '<div style="margin-bottom:8px"><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 12px" onclick="pdfPauseGiorno()">Stampa pause</button></div>';
    if (window._briefPauseAvviso)
      h +=
        '<div class="pb-avviso" style="margin:0 0 8px;padding:6px 10px;font-size:var(--fs-sm,.8125rem);background:var(--c-azzurro-bg,#e6f0f8);border-left:3px solid var(--c-azzurro,#1f6fa3);display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>' +
        escP(window._briefPauseAvviso) +
        '</span><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px" onclick="briefAnnulla()">Annulla</button></div>';
    if (p.contenuto.tipo === 'slots' && typeof _pcAvvisiHtml === 'function') {
      h += _pcFormazioneHtml(p.contenuto);
      h += _pcProposteHtml(p.contenuto);
      h += _pcAvvisiHtml(p.contenuto);
      h += _pcAtteseHtml(p.contenuto);
    }
    h += _briefRenderPause(p.contenuto);
    const viol = typeof _peVerificaRegolePause === 'function' ? _peVerificaRegolePause(p.contenuto, _briefData) : [];
    if (viol.length)
      h +=
        '<div style="margin:8px 0;padding:6px 10px;font-size:var(--fs-sm,.8125rem);background:var(--avviso-bg-forte);border-left:3px solid var(--avviso-bordo)"><b>Regole pause non rispettate (' +
        viol.length +
        ')</b>: ' +
        escP(viol.slice(0, 8).join(' · ')) +
        (viol.length > 8 ? ' · ...' : '') +
        '</div>';
  } else {
    h +=
      '<p style="font-size:var(--fs-md,.875rem);color:var(--muted)">Nessuna pausa generata per questa data. Compila il briefing e premi <b>Genera pause</b>.</p>';
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
// I CORSI CONTANO COME LAVORO (decisione del titolare 15.10): riposo 11 ore, giorni di fila,
// ore. Il punto di verita e la regola "codici_lavoro" (piano-genera.js, _pianoCodiciLavoro);
// ogni corso della lista ci entra da solo (migrazione 20260918 per quelli di prima).
async function _corsiContaComeLavoro(codici) {
  const manca = (codici || []).map((c) => String(c).toUpperCase()).filter((c) => c && !_pianoIsLavoro(c));
  if (!manca.length) return true;
  try {
    const gen = pianoRegoleCache.find((x) => x.nome === 'codici_lavoro' && !String(x.settori || '').trim());
    const base = gen
      ? String(gen.valore || '')
      : typeof _PIANO_CODICI_LAVORO !== 'undefined'
        ? _PIANO_CODICI_LAVORO
        : '';
    const valore = [
      ...new Set(
        base
          .split(/[\s,;]+/)
          .filter(Boolean)
          .concat(manca),
      ),
    ].join(',');
    if (gen) {
      await secPatch('piano_regole', 'id=eq.' + gen.id, { valore: valore });
      gen.valore = valore;
    } else {
      const r = await secPost('piano_regole', {
        nome: 'codici_lavoro',
        valore: valore,
        tipo: 'HARD',
        peso: 0,
        attivo: true,
        descrizione:
          'Codici di lavoro che non sono turni (JG, ufficio, corsi, formazione): contano come lavoro per riposo, giorni di fila e ore',
      });
      if (r && r[0]) pianoRegoleCache.push(r[0]);
    }
    // nuovo elenco: la cache dei codici di lavoro si rilegge (cambia il riferimento)
    pianoRegoleCache = pianoRegoleCache.slice();
    logAzione('Corsi', 'Contano come lavoro: ' + manca.join(', '));
    return true;
  } catch (e) {
    toastErrore('Regola codici di lavoro non aggiornata: ' + ((e && e.message) || e));
    return false;
  }
}
async function corsiContaComeLavoro() {
  if (!isAdmin()) return;
  const lista = _corsiLista().map((c) => c.codice);
  if (await _corsiContaComeLavoro(lista)) {
    // e l orario, per contare le ore vere e il riposo prima e dopo
    for (const c of lista) {
      const cs = pianoCodiciCache.find((x) => String(x.codice).toUpperCase() === String(c).toUpperCase());
      if (cs && !cs.richiede_orario) {
        await secPatch('piano_codici', 'id=eq.' + cs.id, { richiede_orario: true }).catch(() => {});
        cs.richiede_orario = true;
      }
    }
    toast('I corsi contano come lavoro');
    renderPiano();
  }
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
        richiede_orario: true, // un corso ha un orario: ore vere e riposo prima e dopo
      });
      if (nuovo && nuovo[0]) pianoCodiciCache.push(nuovo[0]);
    } else if (desc) {
      await secPatch('piano_codici', 'id=eq.' + esiste.id, { descrizione: desc });
      esiste.descrizione = desc;
    }
    window._pianoCorsiLista = [...(window._pianoCorsiLista || []), cod];
    await _corsiSalvaLista();
    await _corsiContaComeLavoro([cod]);
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
  if (!(await chiediConferma('Togliere ' + cod + ' dalla lista corsi? (il codice resta tra i codici del piano)')))
    return;
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
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi</div><div style="padding:12px 14px"><table class="piano-table" style="min-width:420px;font-size:var(--fs-md,.875rem)"><thead><tr><th>Sigla</th><th style="text-align:left">Descrizione</th><th title="Durata in ore decimali e, accanto, in ore e minuti: 8.33 = 8h20, perché 20 minuti sono un terzo di ora">Ore</th><th>Orario</th></tr></thead><tbody>';
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
      '</tbody></table><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:6px">L&#39;orario del corso cambia di volta in volta: qui puoi aggiornarlo, viene proposto alla prossima pianificazione.</p></div></div>';
    return hRO;
  }
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi · inserimento automatico nel piano</div><div style="padding:12px 14px">';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:10px">Scegli il corso, la data, l&#39;orario e i partecipanti: la sigla viene scritta da sola nelle loro celle del piano (protetta, con orario e ore contate).</p>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">';
  h +=
    '<div class="field"><label>Corso</label><select id="corso-cod" style="padding:8px" onchange="corsoPrefillOrari();corsoAggiornaStati()">' +
    corsi.map((c) => '<option' + (c.codice === 'CS' ? ' selected' : '') + '>' + escP(c.codice) + '</option>').join('') +
    '</select></div>';
  h +=
    '<div class="field"><label>Data</label><input type="date" id="corso-data" onchange="corsoAggiornaStati()"></div>';
  const preCS = ((window._pianoCorsiOrari || {})['CS'] || '14:30-17:30').split('-');
  h +=
    '<div class="field"><label>Inizio</label><input type="time" id="corso-inizio" onchange="corsoAggiornaStati()" value="' +
    (preCS[0] || '') +
    '"></div>';
  h +=
    '<div class="field"><label>Fine</label><input type="time" id="corso-fine" onchange="corsoAggiornaStati()" value="' +
    (preCS[1] || '') +
    '"></div>';
  h +=
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" title="La prossima volta questo corso partirà con questo orario" onclick="corsoSalvaOrarioDefault()">Salva orario predefinito</button>';
  h += '</div>';
  // PARTECIPANTI (richiesta del titolare 12/10/2026: elenco piu professionale): divisi per
  // funzione, per ognuno com e quel giorno nel piano (libero, turno e se si sovrappone al
  // corso, vacanza, malattia) e se ha gia fatto il corso; filtri e spunta per gruppo.
  h +=
    '<div class="corso-part-testa"><b>Partecipanti</b><span id="corso-sel-n" class="corso-part-n">0 selezionati</span>' +
    '<button type="button" class="corso-link" onclick="corsoSpuntaVisibili(true)">Seleziona i visibili</button>' +
    '<button type="button" class="corso-link" onclick="corsoSpuntaVisibili(false)">Togli tutti</button></div>';
  h +=
    '<div class="corso-part-filtri"><input type="search" id="corso-cerca" placeholder="Cerca collaboratore..." autocomplete="off" aria-label="Cerca collaboratore" oninput="corsoFiltraPartecipanti(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();corsoSpuntaPrimo()}">' +
    '<span id="corso-cerca-info" class="corso-part-info">Invio spunta il primo trovato</span>' +
    '<span class="corso-filtri" role="group" aria-label="Mostra">' +
    [
      ['tutti', 'Tutti'],
      ['liberi', 'Liberi quel giorno'],
      ['mai', 'Non hanno ancora fatto il corso'],
    ]
      .map(
        ([k, t]) =>
          '<button type="button" class="corso-filtro' +
          ((window._corsoFiltro || 'tutti') === k ? ' attivo' : '') +
          '" data-filtro="' +
          k +
          '" onclick="corsoScegliFiltro(\'' +
          k +
          '\')">' +
          t +
          '</button>',
      )
      .join('') +
    '</span></div>';
  h += '<div id="corso-part-elenco" class="corso-elenco" onchange="corsoContaPartecipanti()">';
  h += _corsoElencoHtml(collabs);
  h += '</div>';
  h +=
    '<p class="corso-part-nota">Lo stato del giorno e lo storico del corso si leggono dal piano: scegli la data per vederli.</p>';
  setTimeout(() => corsoAggiornaStati(), 0);
  h +=
    '<button class="btn-export" style="font-size:var(--fs-md,.875rem);padding:6px 16px;margin-top:10px" onclick="pianoInserisciCorso()">Inserisci nel piano</button>';
  // gestione della LISTA corsi (admin): aggiungi sigla, rinomina, rimuovi
  if (isAdmin()) {
    const nonLav = corsi.filter((c) => !_pianoIsLavoro(c.codice)).map((c) => c.codice);
    if (nonLav.length)
      h +=
        '<div id="corsi-non-lavoro" style="margin-top:14px;padding:8px 12px;border-left:3px solid var(--c-rosso,#c0392b);background:var(--paper2)">' +
        escP(nonLav.join(', ')) +
        ' non ' +
        (nonLav.length === 1 ? 'conta' : 'contano') +
        ' come lavoro: un corso dopo una notte non controlla il riposo di 11 ore né i giorni di fila. <button class="btn-act" onclick="corsiContaComeLavoro()">Conta come lavoro</button></div>';
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Gestisci corsi</p>';
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
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:4px 0 0">Rimuovere un corso lo toglie solo da questa lista: il codice resta tra i codici del piano e le celle gi&agrave; inserite non cambiano.</p>';
  }
  h += '</div></div>';
  return h;
}
// elenco dei partecipanti diviso per funzione (RESP e SUP in cima, poi in ordine alfabetico)
function _corsoElencoHtml(collabs) {
  const nomeFz = (fz) =>
    (typeof funzioneNomeEsteso === 'function' && funzioneNomeEsteso(fz)) ||
    (typeof _GC_FUNZIONI_NOMI !== 'undefined' ? _GC_FUNZIONI_NOMI[fz] : '');
  const ordine = ['RESP', 'SUP'];
  const gruppi = {};
  collabs.forEach((c) => {
    const fz = String(c.funzione || '').toUpperCase() || '-';
    (gruppi[fz] = gruppi[fz] || []).push(c);
  });
  const chiavi = Object.keys(gruppi).sort((a, b) => {
    const ia = ordine.indexOf(a);
    const ib = ordine.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    if (a === '-') return 1;
    if (b === '-') return -1;
    return a.localeCompare(b);
  });
  return chiavi
    .map((fz) => {
      const tit = fz === '-' ? 'Senza funzione' : nomeFz(fz) ? nomeFz(fz) + ' (' + fz + ')' : fz;
      return (
        '<section class="corso-gruppo" data-gruppo="' +
        escP(fz) +
        '"><div class="corso-gruppo-tit"><span>' +
        escP(tit) +
        ' · <span class="corso-gruppo-n">' +
        gruppi[fz].length +
        '</span></span><button type="button" class="corso-link" onclick="corsoSpuntaGruppo(this)">Seleziona il gruppo</button></div>' +
        gruppi[fz]
          .map(
            (c) =>
              '<label class="corso-riga" data-nome="' +
              escP(c.nome) +
              '"><input type="checkbox" class="corso-part" value="' +
              escP(c.nome) +
              '"><span class="corso-nome">' +
              escP(c.nome) +
              '</span><span class="corso-stato" data-stato=""></span><span class="corso-fatto"></span></label>',
          )
          .join('') +
        '</section>'
      );
    })
    .join('');
}
// stato di ognuno nel giorno scelto e storico del corso (una lettura per giorno e per corso)
async function corsoAggiornaStati() {
  const data = (document.getElementById('corso-data') || {}).value;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const ci = _pianoOra((document.getElementById('corso-inizio') || {}).value);
  const cf = _pianoOra((document.getElementById('corso-fine') || {}).value);
  const righe = [...document.querySelectorAll('#corso-part-elenco .corso-riga')];
  if (!righe.length) return;
  const cache = (window._corsoCache = window._corsoCache || { giorni: {}, storico: {} });
  try {
    if (data && !cache.giorni[data]) cache.giorni[data] = (await secGet('piano?data=eq.' + data + '&limit=2000')) || [];
    if (cod && !cache.storico[cod])
      cache.storico[cod] =
        (await secGet(
          'piano?codice=eq.' + encodeURIComponent(cod) + '&select=collaboratore,data&order=data.desc&limit=5000',
        )) || [];
  } catch (e) {
    /* senza rete l elenco resta senza stati: si puo comunque scegliere */
  }
  const giorno = data ? cache.giorni[data] || [] : null;
  const storico = cod ? cache.storico[cod] || [] : [];
  const oggi = typeof oggiLocale === 'function' ? oggiLocale() : '';
  righe.forEach((l) => {
    const nome = l.dataset.nome;
    const st = l.querySelector('.corso-stato');
    const fatto = l.querySelector('.corso-fatto');
    let testo = '';
    let tipo = '';
    if (giorno) {
      if (typeof _pianoOperativoIl === 'function' && !_pianoOperativoIl(nome, data)) {
        testo = 'Fuori contratto';
        tipo = 'no';
      } else {
        const r = giorno.find((x) => x.collaboratore === nome);
        const t = r ? _pianoTurnoInfo(r.codice) : null;
        if (!r || !r.codice) {
          testo = 'Libero';
          tipo = 'ok';
        } else if (t) {
          const ti = _pianoOra(r.ora_inizio || t.ora_inizio);
          let tf = _pianoOra(r.ora_fine || t.ora_fine);
          if (ti != null && tf != null && tf <= ti) tf += 24;
          const orario =
            (r.ora_inizio || t.ora_inizio || '').slice(0, 5) + '–' + (r.ora_fine || t.ora_fine || '').slice(0, 5);
          const sovr = ci != null && cf != null && ti != null && tf != null && ci < tf && ti < cf;
          testo = 'Turno ' + r.codice + ' ' + orario + (sovr ? ' · si sovrappone al corso' : ' · compatibile');
          tipo = sovr ? 'avviso' : 'ok';
        } else {
          const c = String(r.codice).toUpperCase();
          const info = typeof _pianoCodiceInfo === 'function' ? _pianoCodiceInfo(r.codice) : null;
          testo =
            c === 'V'
              ? 'Vacanza'
              : c === 'M'
                ? 'Malattia'
                : c === 'C'
                  ? 'Riposo'
                  : c === cod
                    ? 'Già iscritto a questo corso'
                    : (info && info.descrizione) || r.codice;
          tipo = c === 'C' ? 'ok' : c === cod ? 'fatto' : 'no';
        }
      }
    }
    st.textContent = testo;
    st.dataset.stato = tipo;
    l.dataset.libero = tipo === 'ok' ? '1' : '';
    // storico: ultima volta che ha fatto questo corso (prima di oggi)
    const g = storico.find((x) => x.collaboratore === nome && String(x.data).slice(0, 10) < (data || oggi));
    fatto.textContent = g ? 'Fatto il ' + String(g.data).slice(0, 10).split('-').reverse().join('.') : 'Mai fatto';
    fatto.classList.toggle('mai', !g);
    l.dataset.mai = g ? '' : '1';
  });
  corsoFiltraPartecipanti((document.getElementById('corso-cerca') || {}).value || '');
}
function corsoScegliFiltro(k) {
  window._corsoFiltro = k;
  document.querySelectorAll('.corso-filtro').forEach((b) => b.classList.toggle('attivo', b.dataset.filtro === k));
  corsoFiltraPartecipanti((document.getElementById('corso-cerca') || {}).value || '');
}
function corsoSpuntaGruppo(btn) {
  const sez = btn.closest('.corso-gruppo');
  const vis = [...sez.querySelectorAll('.corso-riga')].filter((l) => l.style.display !== 'none');
  const tutti = vis.every((l) => l.querySelector('input').checked);
  vis.forEach((l) => (l.querySelector('input').checked = !tutti));
  corsoContaPartecipanti();
}
function corsoSpuntaVisibili(si) {
  document.querySelectorAll('#corso-part-elenco .corso-riga').forEach((l) => {
    if (!si || l.style.display !== 'none') l.querySelector('input').checked = !!si;
  });
  corsoContaPartecipanti();
}
// ricerca nell elenco dei partecipanti: tutte le parole scritte, in qualsiasi ordine
function corsoFiltraPartecipanti(testo) {
  const parole = String(testo || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  let n = 0;
  document.querySelectorAll('#corso-part-elenco label[data-nome]').forEach((l) => {
    const nome = (l.dataset.nome || '').toLowerCase();
    const filtro = window._corsoFiltro || 'tutti';
    const ok =
      parole.every((p) => nome.includes(p)) &&
      (filtro !== 'liberi' || l.dataset.libero === '1') &&
      (filtro !== 'mai' || l.dataset.mai === '1');
    l.style.display = ok ? '' : 'none';
    if (ok) n++;
  });
  document.querySelectorAll('#corso-part-elenco .corso-gruppo').forEach((g) => {
    const vis = [...g.querySelectorAll('.corso-riga')].filter((l) => l.style.display !== 'none').length;
    g.style.display = vis ? '' : 'none';
    const nn = g.querySelector('.corso-gruppo-n');
    if (nn) nn.textContent = vis;
  });
  const info = document.getElementById('corso-cerca-info');
  if (info)
    info.textContent = !parole.length
      ? 'Invio spunta il primo trovato'
      : n
        ? n + (n === 1 ? ' trovato · Invio lo spunta' : ' trovati · Invio spunta il primo')
        : 'nessuno in questo settore con questo nome';
}
function corsoSpuntaPrimo() {
  const l = [...document.querySelectorAll('#corso-part-elenco label[data-nome]')].find(
    (x) => x.style.display !== 'none',
  );
  if (!l) return;
  const cb = l.querySelector('input');
  cb.checked = true;
  const c = document.getElementById('corso-cerca');
  if (c) {
    c.value = '';
    corsoFiltraPartecipanti('');
    c.focus();
  }
  corsoContaPartecipanti();
}
function corsoContaPartecipanti() {
  const n = document.querySelectorAll('.corso-part:checked').length;
  const el = document.getElementById('corso-sel-n');
  if (el) el.textContent = n + (n === 1 ? ' selezionato' : ' selezionati');
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
// CORSO NEL PIANO (segnalazione del titolare 15.10: "il corso non rispetta le 11 ore ne i
// giorni di fila"). Il corso e lavoro con i suoi orari: chi lo riceve passa dalle stesse regole
// di Valida (_pianoViolazioniMosse: riposo minimo con gli orari veri, giorni di fila anche a
// cavallo del mese, riposo attorno alla domenica, ore della settimana...). Chi le violerebbe
// NON lo riceve e si dice il motivo per persona; chi gestisce il piano puo forzare, con una
// seconda conferma esplicita, e la violazione resta scritta nel commento della cella e nel
// registro (come per una cella scritta a mano). Vacanze, malattie, ND, CGF e celle riservate
// non si sovrascrivono mai da qui. Tutte le celle in UNA scrittura, con Annulla.
function pianoInserisciCorso() {
  return unaVoltaSola('piano-inserisci-corso', () => _pianoConScrittura(() => _pianoInserisciCorsoEsegui()));
}
// orario unito di un turno e del corso nello stesso giorno (per il riposo prima e dopo)
function _corsoOrarioUnito(t, r, dstr, inizio, fine) {
  const eff = typeof _pianoTurnoDelGiorno === 'function' ? _pianoTurnoDelGiorno(t, dstr) : null;
  const ti0 = (r && r.ora_inizio) || (eff && eff.ora_inizio) || t.ora_inizio;
  const tf0 = (r && r.ora_fine) || (eff && eff.ora_fine) || t.ora_fine;
  const ti = _pianoOra(String(ti0 || '').substring(0, 5));
  let tf = _pianoOra(String(tf0 || '').substring(0, 5));
  const ci = _pianoOra(inizio);
  let cf = _pianoOra(fine);
  if (ti == null || tf == null || ci == null || cf == null) return null;
  if (tf <= ti) tf += 24;
  if (cf <= ci) cf += 24;
  const hh = (x) =>
    String(Math.floor((((x % 24) + 24) % 24) + 1e-9)).padStart(2, '0') +
    ':' +
    String(Math.round((x % 1) * 60) % 60).padStart(2, '0');
  return {
    sovrapposto: ci < tf && ti < cf,
    ti: ti,
    tf: tf,
    ora_inizio: hh(Math.min(ti, ci)),
    ora_fine: hh(Math.max(tf, cf)),
  };
}
async function _pianoInserisciCorsoEsegui() {
  const responsabile = puoGestirePiano();
  if (!responsabile && !(typeof puoModificare === 'function' && puoModificare('gestione_corsi'))) return;
  const avvisoRete = !!window._sessioneScadutaAvvisata;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const data = (document.getElementById('corso-data') || {}).value;
  const inizio = (document.getElementById('corso-inizio') || {}).value;
  const fine = (document.getElementById('corso-fine') || {}).value;
  const nomi = [...document.querySelectorAll('.corso-part:checked')].map((c) => c.value);
  if (!cod || !data || !nomi.length) {
    toast('Scegli corso, data e almeno un partecipante');
    return;
  }
  if (!inizio || !fine) {
    // senza orario il riposo prima e dopo il corso non si puo controllare
    toast('Scrivi l orario del corso (inizio e fine): serve per il riposo e le ore');
    return;
  }
  if (!(await _pianoConsentiScrittura(data))) return; // giorno chiuso: stessa regola del piano
  const op = getOperatore();
  const dataIt = data.split('-').reverse().join('.');
  const etichettaCorso = 'Corso ' + cod + ' ' + inizio + '-' + fine;
  let esistenti;
  try {
    // celle di QUEL giorno di tutti i settori: chi lavora in due settori puo avere la
    // cella nell altro piano
    esistenti = (await secGet('piano?data=eq.' + data + '&limit=2000')) || [];
  } catch (e) {
    _pianoErroreScrittura('Corso NON inserito: ', e, avvisoRete);
    return;
  }
  const assente = _pianoAssenzeLettore(); // ND, malattie e congedi del Diario
  const ricevono = []; // giorno libero: la cella diventa il corso
  const compatibili = []; // turno che non si sovrappone: corso nel commento, turno intatto
  const sovrapposti = []; // turno (o altro lavoro) negli stessi orari
  const esclusi = []; // vacanza, malattia, ND, recupero, cella riservata: mai sovrascritte
  const fuoriContratto = [];
  for (const nome of nomi) {
    if (typeof _pianoOperativoIl === 'function' && !_pianoOperativoIl(nome, data)) {
      fuoriContratto.push(nome + ' (' + _pianoMotivoFuoriRapporto(nome, data) + ')');
      continue;
    }
    const ex = esistenti.find((r) => r.collaboratore === nome) || null;
    const c = ex ? String(ex.codice || '').toUpperCase() : '';
    if (ex && c === String(cod).toUpperCase()) {
      esclusi.push({ nome: nome, motivo: 'già iscritto a questo corso' });
      continue;
    }
    if (ex && _pianoCellaRiservata(ex)) {
      esclusi.push({ nome: nome, motivo: 'cella riservata (' + _pianoCellaRiservata(ex) + ')' });
      continue;
    }
    if (assente(nome, data) && !(ex && _pianoTurnoInfo(c))) {
      esclusi.push({ nome: nome, motivo: 'assente nel Diario (ND, malattia o congedo)' });
      continue;
    }
    const t = ex ? _pianoTurnoInfo(c) : null;
    if (t) {
      const u = _corsoOrarioUnito(t, ex, data, inizio, fine);
      if (u && !u.sovrapposto) compatibili.push({ nome: nome, ex: ex, t: t, u: u });
      else
        sovrapposti.push({
          nome: nome,
          ex: ex,
          testo: c + ' ' + _briefOrarioHM(t.ora_inizio) + '-' + _briefOrarioHM(t.ora_fine),
        });
      continue;
    }
    const cs = ex ? _pianoCodiceInfo(c) : null;
    const riposo = !ex || !c || c === 'C' || (cs && cs.is_riposo && !/^V|^M|^CGF$|^WD$|^ND$/.test(c));
    // le C messe dal programma attorno alle vacanze (generate e protette) restano
    if (riposo && !(ex && ex.protetto && ex.generato && c === 'C' && _pianoCongediAttornoVacanze())) {
      ricevono.push({ nome: nome, ex: ex });
      continue;
    }
    if (ex && _pianoIsLavoro(c)) {
      sovrapposti.push({ nome: nome, ex: ex, testo: c + ' (altro lavoro)' });
      continue;
    }
    const nomeC =
      c === 'V' || c === 'V1'
        ? 'vacanza'
        : c === 'M' || c === 'M1'
          ? 'malattia'
          : c === 'CGF'
            ? 'recupero festivo'
            : c === 'C'
              ? 'congedo attorno alle vacanze'
              : (cs && cs.descrizione) || c;
    esclusi.push({ nome: nome, motivo: nomeC + ' (' + c + ')' });
  }
  // REGOLE: una lettura per tutti, con tutte le celle nuove insieme
  const mossaCorso = (x) => ({ nome: x.nome, data: data, codice: cod, ora_inizio: inizio, ora_fine: fine });
  let viol = {};
  try {
    viol = await _pianoViolazioniMosse(
      ricevono
        .map(mossaCorso)
        .concat(sovrapposti.map(mossaCorso))
        .concat(
          compatibili.map((x) => ({
            nome: x.nome,
            data: data,
            codice: x.ex.codice,
            ora_inizio: x.u.ora_inizio,
            ora_fine: x.u.ora_fine,
          })),
        ),
    );
  } catch (e) {
    _pianoErroreScrittura('Corso NON inserito (controllo delle regole non riuscito): ', e, avvisoRete);
    return;
  }
  // per chi tiene il turno contano solo i riposi (le ore del giorno unito sono gonfiate)
  const motivi = (nome, soloRiposi) =>
    (viol[nome] || []).filter((v) => !v.ore && (!soloRiposi || /riposo/i.test(v.msg))).map((v) => v.msg);
  const noteOre = (nome) => (viol[nome] || []).filter((v) => v.ore).map((v) => v.msg);
  const okRic = ricevono.filter((x) => !motivi(x.nome).length);
  const noRic = ricevono.filter((x) => motivi(x.nome).length);
  const okComp = compatibili.filter((x) => !motivi(x.nome, true).length);
  const noComp = compatibili.filter((x) => motivi(x.nome, true).length);
  const riga = (n, m) => '\n   – ' + n + ': ' + m.join('; ');
  const conOre = okRic.concat(okComp).filter((x) => noteOre(x.nome).length);
  const nonLavoro = !_pianoIsLavoro(cod);
  let testo =
    etichettaCorso +
    ' del ' +
    dataIt +
    '\n\n• ' +
    okRic.length +
    ' ricevono la cella ' +
    cod +
    (okRic.length
      ? ': ' + okRic.map((x) => x.nome + (x.ex && x.ex.codice ? ' (era ' + x.ex.codice + ')' : '')).join(', ')
      : '') +
    (okComp.length
      ? '\n• ' +
        okComp.length +
        ' con un turno negli altri orari (turno intatto, corso nel commento): ' +
        okComp.map((x) => x.nome + ' (' + x.ex.codice + ')').join(', ')
      : '') +
    (noRic.length || noComp.length
      ? '\n\nNON LO RICEVONO, violerebbero le regole:' +
        noRic.map((x) => riga(x.nome, motivi(x.nome))).join('') +
        noComp.map((x) => riga(x.nome + ' (con ' + x.ex.codice + ')', motivi(x.nome, true))).join('')
      : '') +
    (sovrapposti.length
      ? '\n\nTurno negli stessi orari del corso, NON lo ricevono: ' +
        sovrapposti.map((x) => x.nome + ' (' + x.testo + ')').join(', ')
      : '') +
    (esclusi.length ? '\n\nEsclusi: ' + esclusi.map((x) => x.nome + ' (' + x.motivo + ')').join(', ') : '') +
    (fuoriContratto.length ? '\n\nFuori dal contratto quel giorno, esclusi: ' + fuoriContratto.join(', ') : '') +
    (conOre.length
      ? '\n\nSolo avviso (tolleranza ore, regola aziendale):' +
        conOre.map((x) => riga(x.nome, noteOre(x.nome))).join('')
      : '') +
    (nonLavoro
      ? '\n\nATTENZIONE: ' +
        cod +
        ' non è tra i codici di lavoro (Regole › codici di lavoro): il piano non lo conta come lavoro né come ore.'
      : '');
  const nOk = okRic.length + okComp.length;
  const daForzare = noRic.concat(noComp).concat(sovrapposti);
  if (!nOk && !(responsabile && daForzare.length)) {
    await mostraAvviso(testo + '\n\nNessuno può ricevere il corso: niente è stato scritto.', {
      titolo: 'Corso ' + cod,
    });
    return;
  }
  if (!(await chiediConferma(testo, { titolo: 'Corso ' + cod, ok: nOk ? 'Inserisci (' + nOk + ')' : 'Avanti' })))
    return;
  // FORZARE: solo chi gestisce il piano, con una seconda conferma che dice cosa si rompe
  let forzati = [];
  if (responsabile && daForzare.length) {
    const elenco = daForzare
      .map((x) =>
        riga(
          x.nome,
          sovrapposti.includes(x)
            ? ['il turno ' + x.testo + ' viene tolto e resta scoperto'].concat(motivi(x.nome))
            : motivi(x.nome, compatibili.includes(x)),
        ),
      )
      .join('');
    const forza = await chiediConferma(
      'FORZARE LE REGOLE? Il corso va scritto anche a:' +
        elenco +
        '\n\nSolo se il corso è obbligatorio quel giorno e la violazione è decisa dal responsabile: resta scritta nel commento della cella (⚠) e nel registro. Annulla = il corso va solo a chi rispetta le regole.',
      { titolo: 'Forzare le regole', ok: 'Forza le regole', annulla: 'No, solo gli altri' },
    );
    if (forza) forzati = daForzare;
  }
  if (!nOk && !forzati.length) return;
  const ora = new Date().toISOString();
  const ops = [];
  const cellaCorso = (x, nota, exTurno) => {
    const dati = {
      codice: cod,
      ora_inizio: inizio,
      ora_fine: fine,
      fasce: null,
      protetto: true,
      generato: false,
      commento: (
        (nota ? '⚠ ' + nota + ' · ' : '') +
        (exTurno ? 'Ex ' + exTurno + ' - ' : '') +
        etichettaCorso +
        ' - ' +
        op
      ).substring(0, 400),
      operatore: op,
    };
    if (x.ex) dati.updated_at = ora;
    else dati.reparto_dip = _pianoReparto();
    ops.push({ collaboratore: x.nome, data: data, atteso: x.ex ? _pianoAttesoDi(x.ex) : null, dati: dati });
  };
  const notaTurno = (x, nota) => {
    const vecchia = String(x.ex.commento || '').trim();
    ops.push({
      collaboratore: x.nome,
      data: data,
      atteso: _pianoAttesoDi(x.ex),
      dati: {
        commento: (
          (nota ? '⚠ ' + nota + ' · ' : '') +
          etichettaCorso +
          ' e poi ' +
          x.ex.codice +
          ' - ' +
          op +
          (vecchia ? ' · ' + vecchia : '')
        ).substring(0, 400),
        protetto: true,
        operatore: op,
        updated_at: ora,
      },
    });
  };
  okRic.forEach((x) => cellaCorso(x, '', ''));
  okComp.forEach((x) => notaTurno(x, ''));
  forzati.forEach((x) => {
    if (compatibili.includes(x)) notaTurno(x, motivi(x.nome, true).join(' · '));
    else if (sovrapposti.includes(x))
      cellaCorso(x, ['turno ' + x.ex.codice + ' tolto per il corso'].concat(motivi(x.nome)).join(' · '), x.ex.codice);
    else cellaCorso(x, motivi(x.nome).join(' · '), '');
  });
  const passo = _pianoUndoSnap('corso ' + cod + ' ' + dataIt);
  let esito;
  try {
    esito = await _pianoScriviCelle(ops);
  } catch (e) {
    _pianoUndoScarta(passo);
    _pianoErroreScrittura('Corso NON inserito: ', e, avvisoRete);
    return;
  }
  if (!esito.ok) {
    _pianoUndoScarta(passo);
    await _pianoAvvisaConflitti(esito.conflitti, 'Corso non inserito');
    return;
  }
  _pianoMemoriaDopo(esito.ops, esito.righe);
  const nCelle = okRic.length + forzati.filter((x) => !compatibili.includes(x)).length;
  const nNote = okComp.length + forzati.filter((x) => compatibili.includes(x)).length;
  logAzione(
    'Corso inserito nel piano',
    cod +
      ' ' +
      data +
      ' · ' +
      nCelle +
      ' celle, ' +
      nNote +
      ' annotati sul turno' +
      (forzati.length ? ', ' + forzati.length + ' forzati' : ''),
  );
  if (forzati.length)
    logAzione(
      'Corso: regole forzate',
      cod +
        ' ' +
        data +
        ' da ' +
        op +
        ' · ' +
        forzati
          .map(
            (x) =>
              x.nome +
              ': ' +
              (sovrapposti.includes(x) ? 'turno ' + x.ex.codice + ' tolto; ' : '') +
              motivi(x.nome).join('; '),
          )
          .join(' | '),
    );
  const nonRic = daForzare.length - forzati.length;
  toast(
    'Corso ' +
      cod +
      ': ' +
      nCelle +
      ' celle' +
      (nNote ? ' + ' + nNote + ' annotati sul turno' : '') +
      (nonRic ? ' · ' + nonRic + ' non inseriti' : '') +
      (forzati.length ? ' · ' + forzati.length + ' con regole forzate' : ''),
    6000,
  );
  window._corsoCache = null; // gli stati del giorno si rileggono
  if (_pianoMeseSel === data.substring(0, 7)) renderPiano();
}
