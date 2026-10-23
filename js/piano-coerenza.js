// ================================================================
// COERENZA DIARIO / PIANO (controllo 23/10/2026, D27-D29)
// Controlla il sistema › Coerenza Diario/Piano: elenca dove Diario e Piano non dicono la
// stessa cosa e propone la correzione UNA PER UNA, ognuna con la sua conferma. Non corregge
// mai niente da solo.
//  1) M (o M1) e ASS nel piano senza la registrazione nel Diario (Malattia, Assenza): si
//     propone di registrarle nel Diario (_pianoMalattiaNelDiario, la stessa strada di una M
//     scritta nel calendario). Prova sui dati veri: Troncao 2-4.10, Della Pace, Perozziello,
//     Blancato (F2);
//  2) malattie e assenze del Diario che non sono nel piano (sulla cella c e un turno o un
//     altra sigla): si propone di riallineare il piano alla registrazione
//     (sincronizzaMalattiaPiano, la stessa strada della correzione nel Diario), F1;
//  3) cognomi del foglio (briefing, pause, bigliettini): nomi che sembrano scritti al
//     contrario (Nicole Marchitelli) e nomi di tre o piu parole. Si sceglie il cognome da
//     stampare; resta nell impostazione cognomi_foglio (il nome della scheda non cambia), F5.
// Si guarda dall inizio della finestra del Diario in memoria (datiCache) in poi.
// ================================================================

// nomi propri comuni (oltre a quelli che compaiono come nome nell anagrafica)
const COERENZA_NOMI_PROPRI =
  'alessandro andrea angelo anna antonio carla carlo chiara claudia cristina daniele davide elena elisa emma federica federico ferdinando francesca francesco gabriele giacomo gianluca giorgio giovanni giulia giuseppe giusy ilaria laura lorenzo luca lucia luigi marco maria mario marta massimo matteo michele monica nicola nicole paola paolo pietro roberta roberto rosa salvatore sara serena silvia simone sofia stefania stefano valentina valerio vincenzo carlajoy dejvi tamer joy jessica kevin mohamed ahmed ali fatima ana jose juan';

// Funzione pura (test/piano-controllo-d.test.js).
// righe: celle del piano [{collaboratore,data,codice}]; reg: registrazioni [{id,nome,tipo,testo,data}]
// opz: { tipoMal, tipoAss, giorniDi(reg) -> [dstr], eTurno(codice), operativo(nome,dstr),
//        da: 'YYYY-MM-DD' } -> { senzaDiario: [...], senzaPiano: [...] }
function _coerenzaConfronta(righe, reg, opz) {
  const k = (n, d) => String(n || '').toLowerCase() + '|' + d;
  const da = opz.da || '0000-00-00';
  const malDi = {}; // k -> true
  const assDi = {};
  const regMal = [];
  const regAss = [];
  (reg || []).forEach((e) => {
    if (e.eliminato) return;
    if (e.tipo !== opz.tipoMal && e.tipo !== opz.tipoAss) return;
    const gg = (opz.giorniDi(e) || []).filter((d) => d >= da);
    if (!gg.length) return;
    (e.tipo === opz.tipoMal ? regMal : regAss).push({ e: e, gg: gg });
    gg.forEach((d) => ((e.tipo === opz.tipoMal ? malDi : assDi)[k(e.nome, d)] = true));
  });
  const cella = {}; // k -> riga
  const mesiConCelle = new Set(); // nome|ym: mese pianificato per la persona
  (righe || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    cella[k(r.collaboratore, d)] = r;
    mesiConCelle.add(String(r.collaboratore).toLowerCase() + '|' + d.substring(0, 7));
  });
  // 1) M / ASS senza registrazione, raccolte in periodi di giorni di fila per persona e sigla
  const singoli = [];
  (righe || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    if (d < da) return;
    const c = String(r.codice || '').toUpperCase();
    if ((c === 'M' || c === 'M1') && !malDi[k(r.collaboratore, d)])
      singoli.push({ nome: r.collaboratore, codice: 'M', d: d, sigla: c });
    // un ASS sotto una malattia registrata e coerente (la M arriva col certificato)
    else if (c === 'ASS' && !assDi[k(r.collaboratore, d)] && !malDi[k(r.collaboratore, d)])
      singoli.push({ nome: r.collaboratore, codice: 'ASS', d: d, sigla: c });
  });
  singoli.sort((a, b) => a.nome.localeCompare(b.nome) || a.codice.localeCompare(b.codice) || a.d.localeCompare(b.d));
  const dopo = (d) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + 1);
    return (
      x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
    );
  };
  const senzaDiario = [];
  singoli.forEach((s) => {
    const u = senzaDiario[senzaDiario.length - 1];
    if (u && u.nome === s.nome && u.codice === s.codice && dopo(u.al) === s.d) {
      u.al = s.d;
      u.giorni.push(s.d);
    } else senzaDiario.push({ nome: s.nome, codice: s.codice, dal: s.d, al: s.d, giorni: [s.d] });
  });
  // 2) registrazioni con giorni che il piano non segna
  const senzaPiano = [];
  const controlla = (lista, eAss) =>
    lista.forEach(({ e, gg }) => {
      const giorni = [];
      gg.forEach((d) => {
        if (opz.operativo && !opz.operativo(e.nome, d)) return;
        const r = cella[k(e.nome, d)];
        const c = r ? String(r.codice || '').toUpperCase() : '';
        if (eAss) {
          // l assenza va solo sopra un turno; sotto una malattia resta la M
          if (r && opz.eTurno(c) && c !== 'ASS' && !malDi[k(e.nome, d)]) giorni.push({ d: d, cella: c });
        } else if (r) {
          // la M copre qualsiasi sigla; ASS sotto la malattia aspetta il certificato
          if (c !== 'M' && c !== 'M1' && c !== 'ASS') giorni.push({ d: d, cella: c });
        } else if (mesiConCelle.has(String(e.nome).toLowerCase() + '|' + d.substring(0, 7)))
          giorni.push({ d: d, cella: '' }); // mese gia pianificato: la M si scrive anche senza turno
      });
      if (giorni.length)
        senzaPiano.push({
          id: e.id,
          nome: e.nome,
          tipo: e.tipo,
          ass: eAss,
          testo: e.testo,
          data: e.data,
          giorni: giorni,
        });
    });
  controlla(regMal, false);
  controlla(regAss, true);
  senzaPiano.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorni[0].d.localeCompare(b.giorni[0].d));
  return { senzaDiario: senzaDiario, senzaPiano: senzaPiano };
}

// COGNOMI DA CONTROLLARE (funzione pura): nomi -> [{ nome, oggi, proposte, motivo }]
// oggi = cognome che il foglio stampa adesso; proposte = cognomi possibili (il primo e quello
// consigliato). Restano fuori i nomi gia decisi (fatti: { nome: cognome }).
function _coerenzaCognomi(nomi, cognomeDi, fatti, nomiPropriExtra) {
  const seme = new Set(COERENZA_NOMI_PROPRI.split(' '));
  (nomiPropriExtra || []).forEach((w) => seme.add(String(w).toLowerCase()));
  // i nomi propri dell anagrafica: le parole dopo il cognome, imparate dagli ALTRI nomi (un
  // nome scritto al contrario non deve insegnare il suo cognome come nome proprio)
  const imparati = {}; // parola -> Set(nomi da cui viene)
  (nomi || []).forEach((n) => {
    const p = String(n).trim().split(/\s+/);
    if (seme.has(String(p[0]).toLowerCase())) return;
    const c = String(cognomeDi(n) || '').split(/\s+/).length;
    p.slice(c).forEach((w) => {
      if (w.length > 2 && !/\.$/.test(w)) (imparati[w.toLowerCase()] = imparati[w.toLowerCase()] || new Set()).add(n);
    });
  });
  const propri = { has: (w, n) => seme.has(w) || (imparati[w] && [...imparati[w]].some((x) => x !== n)) };
  const out = [];
  (nomi || []).forEach((n) => {
    if (fatti && Object.prototype.hasOwnProperty.call(fatti, n)) return;
    const p = String(n).trim().split(/\s+/).filter(Boolean);
    if (p.length < 2) return;
    const oggi = String(cognomeDi(n) || '');
    const nc = oggi.split(/\s+/).length;
    const primo = p[0].toLowerCase();
    const ultimo = p[p.length - 1].toLowerCase();
    // al contrario: la prima parola e un nome proprio e l ultima no (Nicole Marchitelli)
    if (p.length === 2 && propri.has(primo, n) && !propri.has(ultimo, n)) {
      out.push({ nome: n, oggi: oggi, proposte: [p[1], p[0]], motivo: 'sembra scritto Nome Cognome' });
      return;
    }
    // tre o piu parole: cognome doppio o nomi doppi? (Azevedo Morais Marco Paulo)
    // (solo se dopo il cognome restano parole che non sono tutte nomi propri noti: Di Tullio
    // Ivano e Cerrato Lorenzo Mattia sono chiari)
    const dopoCog = p.slice(nc).filter((w) => !/\.$/.test(w));
    if (p.length >= 3 && dopoCog.length >= 2 && !dopoCog.every((w) => propri.has(w.toLowerCase(), n))) {
      const prop = [];
      for (let i = 1; i < p.length; i++) prop.push(p.slice(0, i).join(' '));
      // quello di oggi per primo
      prop.sort((a, b) => (a === oggi ? -1 : b === oggi ? 1 : 0));
      out.push({ nome: n, oggi: oggi, proposte: prop, motivo: 'nome di ' + p.length + ' parole' });
    }
  });
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

// EX COLLABORATORI SENZA FINE RAPPORTO (decisione del titolare 23/10/2026: «Tonati» e un ex
// collaboratore vero, non si cancella; se manca la data di fine rapporto si segnala).
// Funzione pura: inattivi [{id,nome,data_fine_rapporto}], ultimo { nome: 'YYYY-MM-DD' ultimo
// giorno con una cella, n } -> [{ id, nome, ultimo, n, gemello }] solo chi ha celle nel piano
function _coerenzaExSenzaFine(inattivi, ultimo) {
  const lista = (inattivi || []).filter((c) => !c.data_fine_rapporto && ultimo[c.nome]);
  return lista
    .map((c) => {
      const cog = String(c.nome).split(/\s+/)[0].toLowerCase();
      // due schede della stessa persona? (Tonati e Tonati Edoardo: stesso cognome, stessi giorni)
      const g = lista.find(
        (x) =>
          x.nome !== c.nome &&
          String(x.nome).split(/\s+/)[0].toLowerCase() === cog &&
          ultimo[x.nome].ultimo === ultimo[c.nome].ultimo &&
          ultimo[x.nome].n === ultimo[c.nome].n,
      );
      return { id: c.id, nome: c.nome, ultimo: ultimo[c.nome].ultimo, n: ultimo[c.nome].n, gemello: g ? g.nome : '' };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------- lettura
async function _coerenzaCognomiFatti() {
  try {
    const v = await getImp('cognomi_foglio');
    const o = v ? JSON.parse(v) : {};
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}
// da dove guardare: predefinito il primo giorno del mese scorso (i piani importati da Excel
// prima del programma non hanno le malattie nel Diario: sui dati veri 2026 erano centinaia
// di giorni di gennaio-giugno). Si puo scegliere una data diversa nella finestra, mai prima
// della finestra del Diario in memoria
function _coerenzaDaPredefinito() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}
async function _coerenzaCalcola(daScelto) {
  // turni, codici e cognomi del foglio (anche se il Piano non e ancora stato aperto)
  if (typeof _pianoCaricaCfg === 'function') await _pianoCaricaCfg();
  const finestra = typeof diarioFinestraDa !== 'undefined' && diarioFinestraDa ? diarioFinestraDa : '0000-00-00';
  let da = /^\d{4}-\d{2}-\d{2}$/.test(String(daScelto || '')) ? daScelto : _coerenzaDaPredefinito();
  if (da < finestra) da = finestra;
  // SOLO LE CELLE CHE SERVONO (riverifica D-N3): prima tutto il piano dalla finestra del Diario
  // a pagine di 10000 (avviso «Lettura arrivata al limite»), per usare poi solo M e ASS.
  //  - M, M1, ASS di tutti dalla data scelta (piano senza registrazione);
  //  - le celle delle persone con una malattia o un assenza nel Diario, fino all ultimo giorno
  //    registrato (registrazione senza la cella giusta nel piano, mese gia pianificato).
  // Le letture senza limite passano a pagine (secGet): nessuna riga persa, nessun avviso.
  const tipoMalR = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const tipoAssR = _pianoTipoAssenza();
  const nomiReg = new Set();
  let ultimoReg = da;
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.eliminato || (e.tipo !== tipoMalR && e.tipo !== tipoAssR) || !e.nome) return;
    const gg = (_pianoGiorniRegistrazione(e.testo || '', e.data) || []).filter((d) => d >= da);
    if (!gg.length) return;
    nomiReg.add(e.nome);
    gg.forEach((d) => {
      if (d > ultimoReg) ultimoReg = d;
    });
  });
  const perId = new Map();
  const assenze = (await secGet('piano?data=gte.' + da + '&codice=in.(M,M1,ASS)')) || [];
  assenze.forEach((r) => perId.set(r.id, r));
  const nomiLista = [...nomiReg].filter((n) => !/[,()]/.test(n));
  for (let i = 0; i < nomiLista.length; i += 40) {
    const parte = nomiLista.slice(i, i + 40).map((n) => encodeURIComponent(n));
    const pz =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + ultimoReg + '&collaboratore=in.(' + parte.join(',') + ')',
      )) || [];
    pz.forEach((r) => perId.set(r.id, r));
  }
  const righe = [...perId.values()].map((r) => ({
    id: r.id,
    collaboratore: r.collaboratore,
    data: r.data,
    codice: r.codice,
    reparto_dip: r.reparto_dip,
  }));
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const tipoAss = _pianoTipoAssenza();
  const collab = typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : [];
  const info = (n) => collab.find((c) => c.nome.toLowerCase() === String(n).toLowerCase());
  const conf = _coerenzaConfronta(righe, typeof datiCache !== 'undefined' ? datiCache : [], {
    tipoMal: tipoMal,
    tipoAss: tipoAss,
    da: da,
    giorniDi: (e) => _pianoGiorniRegistrazione(e.testo || '', e.data),
    eTurno: (c) => !!_pianoTurnoInfo(c),
    operativo: (n, d) => {
      const c = info(n);
      return !c || typeof _pianoOperativoIl !== 'function' || _pianoOperativoIl(c, d);
    },
  });
  // gli ex collaboratori hanno la loro sezione (fine rapporto): qui solo chi e attivo
  const attivo = (n) => {
    const c = info(n);
    return !!c && c.attivo !== false;
  };
  conf.senzaDiario = conf.senzaDiario.filter((x) => attivo(x.nome));
  conf.senzaPiano = conf.senzaPiano.filter((x) => attivo(x.nome));
  const fatti = await _coerenzaCognomiFatti();
  const nomi = collab.filter((c) => c.attivo !== false).map((c) => c.nome);
  const cognomi = _coerenzaCognomi(
    nomi,
    (n) => (typeof _cognomeDi === 'function' ? _cognomeDi(n) : n.split(' ')[0]),
    fatti,
  );
  // ex collaboratori (scheda disattivata) con celle nel piano e senza fine rapporto
  let ex = [];
  try {
    const inattivi =
      (await secGet('collaboratori?attivo=eq.false&select=id,nome,data_fine_rapporto,reparto_dip&limit=2000')) || [];
    const senza = inattivi.filter((c) => !c.data_fine_rapporto);
    const ultimo = {};
    for (let i = 0; i < senza.length; i += 10) {
      await Promise.all(
        senza.slice(i, i + 10).map(async (c) => {
          const rr =
            (await secGet(
              'piano?collaboratore=eq.' + encodeURIComponent(c.nome) + '&select=data&order=data.desc&limit=50000',
            )) || [];
          if (rr.length) ultimo[c.nome] = { ultimo: String(rr[0].data).substring(0, 10), n: rr.length };
        }),
      );
    }
    ex = _coerenzaExSenzaFine(senza, ultimo);
  } catch (e) {
    console.warn('ex collaboratori non letti', e);
  }
  return { da: da, senzaDiario: conf.senzaDiario, senzaPiano: conf.senzaPiano, cognomi: cognomi, ex: ex, fatti: fatti };
}
// per Controlla il sistema: quanti casi
async function coerenzaDiarioPianoConta() {
  const c = await _coerenzaCalcola();
  return { n: c.senzaDiario.length + c.senzaPiano.length + c.cognomi.length + c.ex.length, c: c };
}

// ---------------------------------------------------------------- finestra
let _coerenzaStato = null; // { c, fatto: { chiave: 'fatto'|'saltato'|'errore: ...' } }
const _coerenzaGg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7) + '.' + d.substring(0, 4);
async function apriCoerenzaDiarioPiano(daScelto) {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Controllo Diario e Piano…</p>';
  try {
    _coerenzaStato = { c: await _coerenzaCalcola(daScelto || (_coerenzaStato && _coerenzaStato.c.da)), fatto: {} };
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Controllo non riuscito: ' + escP((e && e.message) || '') + '</p>';
    return;
  }
  _coerenzaDisegna();
}
function _coerenzaDisegna() {
  const el = document.getElementById('salute-content');
  if (!el || !_coerenzaStato) return;
  const { c, fatto } = _coerenzaStato;
  const adm = typeof isAdmin === 'function' && isAdmin();
  const tot = c.senzaDiario.length + c.senzaPiano.length + c.cognomi.length + c.ex.length;
  const bt = (chiave, testo) => {
    const f = fatto[chiave];
    if (f)
      return (
        '<span style="font-weight:700;color:' +
        (f === 'fatto' ? 'var(--c-verde,#2c6e49)' : f === 'saltato' ? 'var(--muted)' : 'var(--accent)') +
        '">' +
        escP(f === 'fatto' ? 'Corretto' : f === 'saltato' ? 'Saltato' : f) +
        '</span>'
      );
    return (
      '<button class="btn-act" onclick="coerenzaCorreggi(\'' +
      chiave +
      '\')">' +
      testo +
      '</button> <button class="btn-export" style="padding:3px 10px" onclick="coerenzaSalta(\'' +
      chiave +
      '\')">Salta</button>'
    );
  };
  let h =
    '<p style="font-size:var(--fs-md,.875rem);margin-bottom:6px"><b>Coerenza Diario/Piano: ' +
    (tot ? tot + (tot === 1 ? ' caso da controllare' : ' casi da controllare') : 'nessun caso') +
    '</b> (dal ' +
    _coerenzaGg(c.da) +
    ' in poi). Ogni correzione chiede conferma; niente si corregge da solo.</p>' +
    '<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center"><label style="font-size:var(--fs-sm,.8125rem)">Malattie e assenze dal <input type="date" id="coer-da" value="' +
    c.da +
    '" style="padding:3px 6px"></label><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="apriCoerenzaDiarioPiano((document.getElementById(\'coer-da\')||{}).value)">Ricontrolla</button> ' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="controlloSalute()">Torna al controllo</button></div>';
  const tab = (titolo, spiega, intest, righe) =>
    '<h4 style="margin:14px 0 4px">' +
    titolo +
    ' (' +
    righe.length +
    ')</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">' +
    spiega +
    '</p>' +
    (righe.length
      ? '<div style="overflow-x:auto"><table class="collab-table" style="font-size:var(--fs-md,.875rem)"><thead><tr>' +
        intest.map((x) => '<th>' + x + '</th>').join('') +
        '</tr></thead><tbody>' +
        righe.join('') +
        '</tbody></table></div>'
      : '<p style="color:var(--c-verde,#2c6e49)">Nessuno.</p>');
  h += tab(
    'Nel piano ma non nel Diario',
    'M o ASS scritte nel piano senza la registrazione nel Diario: la scheda del collaboratore e il Rapporto non le contano. Correggi = registro il periodo nel Diario come quando la M si scrive nel calendario. Se la M era sbagliata, Salta e toglila dal calendario.',
    ['Collaboratore', 'Sigla', 'Giorni', ''],
    c.senzaDiario.map(
      (x, i) =>
        '<tr><td><b>' +
        escP(x.nome) +
        '</b></td><td>' +
        escP(x.codice) +
        '</td><td>' +
        _coerenzaGg(x.dal) +
        (x.al !== x.dal ? ' - ' + _coerenzaGg(x.al) : '') +
        ' (' +
        x.giorni.length +
        (x.giorni.length === 1 ? ' giorno' : ' giorni') +
        ')</td><td style="white-space:nowrap">' +
        bt('d' + i, 'Registra nel Diario') +
        '</td></tr>',
    ),
  );
  h += tab(
    'Nel Diario ma non nel piano',
    'Malattie e assenze registrate nel Diario che il piano non segna (sulla cella c è un turno o un altra sigla). Correggi = il piano si riallinea alla registrazione (la sigla di prima resta nella nota e torna se la registrazione si toglie).',
    ['Collaboratore', 'Registrazione', 'Giorni nel piano', ''],
    c.senzaPiano.map(
      (x, i) =>
        '<tr><td><b>' +
        escP(x.nome) +
        '</b></td><td>' +
        escP(x.tipo) +
        ' del ' +
        _coerenzaGg(String(x.data).substring(0, 10)) +
        '</td><td>' +
        x.giorni.map((g) => _coerenzaGg(g.d).substring(0, 5) + ' ' + escP(g.cella || 'vuota')).join(', ') +
        '</td><td style="white-space:nowrap">' +
        bt('p' + i, 'Riallinea il piano') +
        '</td></tr>',
    ),
  );
  h += tab(
    'Cognomi sul foglio',
    'Briefing, pause e bigliettini stampano il cognome. Questi nomi sembrano scritti al contrario o hanno più parole: scegli il cognome da stampare. Il nome della scheda non cambia.',
    ['Collaboratore', 'Oggi sul foglio', 'Cognome', ''],
    c.cognomi.map(
      (x, i) =>
        '<tr><td><b>' +
        escP(x.nome) +
        '</b> <span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">' +
        escP(x.motivo) +
        '</span></td><td>' +
        escP(String(x.oggi).toUpperCase()) +
        '</td><td><select id="coer-cog-' +
        i +
        '"' +
        (fatto['c' + i] ? ' disabled' : '') +
        '>' +
        x.proposte.map((p) => '<option value="' + escP(p) + '">' + escP(p.toUpperCase()) + '</option>').join('') +
        '</select></td><td style="white-space:nowrap">' +
        bt('c' + i, 'Usa questo cognome') +
        '</td></tr>',
    ),
  );
  h += tab(
    'Ex collaboratori senza fine rapporto',
    'Schede disattivate con turni nel piano ma senza la data di fine rapporto: ore, saldo e conteggi non sanno quando il rapporto è finito. Correggi = scrivi la data di fine (proposta: l ultimo giorno con una cella). La scheda resta: è una persona vera, non si cancella.',
    ['Collaboratore', 'Ultimo giorno nel piano', 'Celle', ''],
    c.ex.map(
      (x, i) =>
        '<tr><td><b>' +
        escP(x.nome) +
        '</b>' +
        (x.gemello
          ? ' <span style="color:var(--accent);font-size:var(--fs-sm,.8125rem)">stessi giorni di «' +
            escP(x.gemello) +
            '»: forse la stessa persona</span>'
          : '') +
        '</td><td>' +
        _coerenzaGg(x.ultimo) +
        '</td><td>' +
        x.n +
        '</td><td style="white-space:nowrap">' +
        bt('e' + i, 'Scrivi la fine rapporto') +
        (x.gemello && adm
          ? ' <button class="btn-export" style="padding:3px 10px" onclick="coerenzaUnisciApri(' +
            escP(JSON.stringify(x.gemello)) +
            ',' +
            escP(JSON.stringify(x.nome)) +
            ')">Unisci schede</button>'
          : '') +
        '</td></tr>',
    ),
  );
  // UNISCI SCHEDE: solo amministratore (il database fa lo stesso controllo)
  if (adm)
    h +=
      '<h4 style="margin:14px 0 4px">Due schede della stessa persona</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Se una persona ha due schede (es. scritta una volta con il nome e una senza), uniscile: scegli quella da tenere, guarda l anteprima, poi tutto passa a quella scheda in un unica operazione. La scheda tolta va nel Cestino.</p><button class="btn-act" onclick="coerenzaUnisciApri()">Unisci schede…</button>';
  el.innerHTML = h;
}
function coerenzaSalta(chiave) {
  if (!_coerenzaStato) return;
  _coerenzaStato.fatto[chiave] = 'saltato';
  _coerenzaDisegna();
}
function coerenzaCorreggi(chiave) {
  return unaVoltaSola('coerenza|' + chiave, () => _coerenzaCorreggiEsegui(chiave));
}
async function _coerenzaCorreggiEsegui(chiave) {
  if (!_coerenzaStato || _coerenzaStato.fatto[chiave]) return;
  const { c, fatto } = _coerenzaStato;
  const tipo = chiave.charAt(0);
  const i = parseInt(chiave.substring(1));
  try {
    if (tipo === 'd') {
      const x = c.senzaDiario[i];
      const cosa = x.codice === 'ASS' ? 'l assenza (attesa certificato)' : 'la malattia';
      if (
        !(await chiediConferma(
          'Registrare nel Diario ' +
            cosa +
            ' di ' +
            x.nome +
            ' dal ' +
            _coerenzaGg(x.dal) +
            ' al ' +
            _coerenzaGg(x.al) +
            '?\n\nNel piano ci sono ' +
            x.giorni.length +
            (x.giorni.length === 1 ? ' giorno ' : ' giorni ') +
            x.codice +
            ' senza registrazione. Il Diario conterà questi giorni come se la ' +
            x.codice +
            ' fosse scritta adesso nel calendario.',
          { titolo: 'Coerenza Diario/Piano', ok: 'Registra' },
        ))
      )
        return;
      const n = await _pianoMalattiaNelDiario(x.nome, x.dal, x.al, false, null, x.codice === 'ASS' ? 'ASS' : undefined);
      logAzione(
        'Coerenza Diario/Piano: registrata nel Diario',
        x.nome + ' · ' + x.dal + ' - ' + x.al + ' · ' + x.codice,
      );
      fatto[chiave] = n || n === 0 ? 'fatto' : 'errore: non registrata';
    } else if (tipo === 'p') {
      const x = c.senzaPiano[i];
      if (
        !(await chiediConferma(
          'Riallineare il piano alla registrazione «' +
            x.tipo +
            '» di ' +
            x.nome +
            '?\n\n' +
            x.giorni
              .map(
                (g) =>
                  '• ' +
                  _coerenzaGg(g.d) +
                  ': ' +
                  (g.cella || 'vuota') +
                  ' diventa ' +
                  (x.ass ? 'ASS' : 'M') +
                  (g.cella ? ' (la sigla resta nella nota)' : ''),
              )
              .join('\n'),
          { titolo: 'Coerenza Diario/Piano', ok: 'Riallinea' },
        ))
      )
        return;
      await sincronizzaMalattiaPiano(x.nome, '', x.data, x.testo || '', {
        codice: x.ass ? 'ASS' : undefined,
        idReg: x.id,
        senzaDomande: true,
      });
      logAzione(
        'Coerenza Diario/Piano: piano riallineato',
        x.nome + ' · ' + x.tipo + ' · ' + x.giorni.map((g) => g.d).join(', '),
      );
      fatto[chiave] = 'fatto';
    } else if (tipo === 'e') {
      const x = c.ex[i];
      const v = await chiediTesto(
        x.nome +
          ': scheda disattivata senza data di fine rapporto. L ultimo giorno con una cella nel piano è il ' +
          _coerenzaGg(x.ultimo) +
          '.\n\nData di fine rapporto (gg.mm.aaaa):',
        _coerenzaGg(x.ultimo),
        { titolo: 'Coerenza Diario/Piano', ok: 'Salva la data' },
      );
      if (v === null) return;
      const m = String(v)
        .trim()
        .match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
      const iso = m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
      const dt = iso ? new Date(iso + 'T12:00:00') : null;
      if (!dt || isNaN(dt) || dt.getDate() !== parseInt(m[1]) || dt.getMonth() + 1 !== parseInt(m[2])) {
        toastErrore('Data non valida: scrivi gg.mm.aaaa (es. ' + _coerenzaGg(x.ultimo) + ')');
        return;
      }
      await secPatch('collaboratori', 'id=eq.' + x.id, { data_fine_rapporto: iso });
      logAzione('Coerenza Diario/Piano: fine rapporto', x.nome + ' -> ' + iso);
      fatto[chiave] = 'fatto';
    } else if (tipo === 'c') {
      const x = c.cognomi[i];
      const sel = document.getElementById('coer-cog-' + i);
      const cog = sel ? sel.value : x.proposte[0];
      if (
        !(await chiediConferma(
          'Sul foglio (briefing, pause, bigliettini) ' +
            x.nome +
            ' comparirà come «' +
            cog.toUpperCase() +
            '»' +
            (cog === x.oggi ? ' (come oggi: non lo chiedo più)' : ' invece di «' + String(x.oggi).toUpperCase() + '»') +
            '.\n\nIl nome della scheda non cambia.',
          { titolo: 'Coerenza Diario/Piano', ok: 'Usa ' + cog.toUpperCase() },
        ))
      )
        return;
      const tutti = await _coerenzaCognomiFatti();
      tutti[x.nome] = cog;
      await setImp('cognomi_foglio', JSON.stringify(tutti));
      window._cognomiFoglio = tutti;
      logAzione('Coerenza Diario/Piano: cognome sul foglio', x.nome + ' -> ' + cog);
      fatto[chiave] = 'fatto';
    }
  } catch (e) {
    fatto[chiave] = 'errore: ' + ((e && e.message) || e);
  }
  _coerenzaDisegna();
}

// ---------------------------------------------------------------- unisci due schede
// UNISCI SCHEDE (23/10/2026, richiesta del titolare: «Tonati» e «Tonati Edoardo» sono la stessa
// persona). Solo amministratore: si sceglie la scheda da tenere e quella da togliere, si guarda
// l anteprima di cosa si sposta e delle righe doppie, poi UNA operazione nel database
// (collaboratori_unisci, migrazione 20260930_c): tutto o niente, una riga nel Registro. Le righe
// doppie (stesso giorno, settimana, anno...) non si sovrascrivono: resta quella della scheda
// tenuta e l altra va nel Cestino con la scheda tolta, da dove si ripristina.
const COERENZA_UNISCI_GRUPPI = [
  ['piano', 'Piano'],
  ['diario', 'Diario'],
  ['moduli', 'Moduli'],
  ['punti', 'Punti'],
  ['hr', 'HR e valutazioni'],
  ['storico', 'Storico'],
  ['preferenze', 'Preferenze'],
  ['permessi', 'Permessi e regole'],
];
const COERENZA_UNISCI_TABELLE = {
  piano: 'celle del piano',
  piano_timbrature: 'timbrature',
  piano_vacanze: 'vacanze',
  piano_ore_mese: 'ore reali del mese',
  piano_recupero_ore: 'recuperi ore',
  piano_saldo_iniziale: 'riporti ore',
  piano_cgf_riporto: 'riporti CGF',
  collab_congedi_np: 'congedi non pagati',
  registrazioni: 'registrazioni del Diario',
  moduli: 'moduli',
  punti_eventi: 'punti',
  'punti_eventi.rif_assente': 'punti di chi lo ha coperto',
  hr_eventi: 'righe dello Storico HR',
  hr_allegati: 'allegati HR',
  valutazioni: 'valutazioni',
  piano_storico: 'storico delle celle',
  collab_scelte_storico: 'storico delle scelte',
  piano_ordine_collab: 'ordine nel piano',
  piano_vacanze_ok: 'vacanze confermate',
  giubileo_notificati: 'avvisi di giubileo',
  briefing_futuri: 'briefing da oggi in poi',
  regole_piano: 'regole del piano (coordinatori, turni riservati)',
};
// RIEPILOGO DELL ANTEPRIMA (funzione pura, test/unisci-schede.test.js): gruppi con le voci che
// hanno righe, nell ordine dei gruppi. Preferenze = campi della scheda e impostazioni con il
// nome; Permessi = regole del piano e accesso al programma.
function _coerenzaUnisciRiepilogo(a) {
  const per = {};
  const add = (g, v) => (per[g] = per[g] || []).push(v);
  Object.keys((a && a.tabelle) || {})
    .sort()
    .forEach((t) => {
      const x = a.tabelle[t];
      if (!x || !(x.righe > 0)) return;
      add(x.gruppo || 'piano', {
        tab: t,
        etichetta: COERENZA_UNISCI_TABELLE[t] || t,
        righe: x.righe,
        doppie: x.doppie || 0,
      });
    });
  const imp = (a && a.impostazioni) || {};
  Object.keys(imp)
    .sort()
    .forEach((k) =>
      add(k === 'regole_piano' ? 'permessi' : 'preferenze', {
        tab: k,
        etichetta: COERENZA_UNISCI_TABELLE[k] || k,
        righe: imp[k],
        doppie: 0,
      }),
    );
  const campi = (a && a.campi) || [];
  const completa = campi.filter((c) => c.azione === 'completa').length;
  const diversi = campi.length - completa;
  if (completa) add('preferenze', { tab: 'campi', etichetta: 'campi vuoti da completare', righe: completa, doppie: 0 });
  if (diversi)
    add('preferenze', {
      tab: 'campi_diversi',
      etichetta: 'campi diversi (resta la scheda tenuta)',
      righe: diversi,
      doppie: 0,
    });
  if (a && a.operatore)
    add('permessi', { tab: 'operatore', etichetta: 'accesso al programma (resta com e)', righe: 1, doppie: 0 });
  const gruppi = COERENZA_UNISCI_GRUPPI.filter(([g]) => per[g]).map(([g, nome]) => ({
    gruppo: g,
    nome: nome,
    voci: per[g],
  }));
  const doppie = Object.keys((a && a.tabelle) || {}).reduce((s, t) => s + ((a.tabelle[t] || {}).doppie || 0), 0);
  return { gruppi: gruppi, doppie: doppie };
}
// una riga doppia in parole: la chiave (giorno, settimana...) e cosa cambia fra le due
function _coerenzaUnisciDoppia(tab, d) {
  const ch = d.chiave || {};
  const gg = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v)) ? _coerenzaGg(String(v).substring(0, 10)) : String(v));
  const chiave = Object.keys(ch)
    .map((k) => (k === 'data' ? gg(ch[k]) : k === 'settimana' ? 'settimana ' + ch[k] : ch[k]))
    .join(' ');
  const val = (r, k) => (r && r[k] != null && r[k] !== '' ? String(r[k]) : '—');
  const diversi = d.diversi || [];
  let tieni;
  let togli;
  if (tab === 'piano') {
    const cella = (r) =>
      val(r, 'codice') +
      (r && r.reparto_dip ? ' (' + r.reparto_dip + ')' : '') +
      (r && r.commento ? ' «' + r.commento + '»' : '');
    tieni = cella(d.tieni);
    togli = cella(d.togli);
  } else {
    tieni = diversi.map((k) => k + ' ' + val(d.tieni, k)).join(', ') || 'uguale';
    togli = diversi.map((k) => k + ' ' + val(d.togli, k)).join(', ') || 'uguale';
  }
  return { chiave: chiave, tieni: tieni, togli: togli, uguali: !diversi.length, diversi: diversi };
}
let _coerenzaUnisci = null; // { schede, anteprima, tieni, togli }
async function coerenzaUnisciApri(nomeA, nomeB) {
  if (typeof isAdmin !== 'function' || !isAdmin()) {
    toastErrore('Unire due schede: solo amministratore');
    return;
  }
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Carico le schede…</p>';
  let schede = [];
  try {
    schede = (await secGet('collaboratori?select=id,nome,attivo,reparto_dip&order=nome.asc&limit=5000')) || [];
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Schede non lette: ' + escP((e && e.message) || '') + '</p>';
    return;
  }
  const trova = (n) => schede.find((s) => s.nome === n);
  const a = trova(nomeA);
  const b = trova(nomeB);
  _coerenzaUnisci = { schede: schede, anteprima: null, tieni: a ? a.id : null, togli: b ? b.id : null };
  _coerenzaUnisciDisegna();
}
function _coerenzaUnisciDisegna() {
  const el = document.getElementById('salute-content');
  const u = _coerenzaUnisci;
  if (!el || !u) return;
  const opz = (sel) =>
    '<option value="">scegli…</option>' +
    u.schede
      .map(
        (s) =>
          '<option value="' +
          s.id +
          '"' +
          (s.id === sel ? ' selected' : '') +
          '>' +
          escP(s.nome) +
          ' · ' +
          escP(s.reparto_dip || 'slots') +
          (s.attivo === false ? ' (disattivata)' : '') +
          '</option>',
      )
      .join('');
  let h =
    '<p style="font-size:var(--fs-md,.875rem);margin-bottom:6px"><b>Unisci due schede della stessa persona</b></p>' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Tutto quello che ha la scheda da togliere (piano, Diario, moduli, punti, HR, storico, preferenze, regole) passa alla scheda da tenere, in un unica operazione: o tutto o niente. Le righe doppie nello stesso giorno non si sovrascrivono: resta quella della scheda da tenere, l altra va nel Cestino con la scheda tolta (da lì si ripristina).</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:10px">' +
    '<label style="font-size:var(--fs-sm,.8125rem)">Scheda da tenere<br><select id="unisci-tieni" onchange="coerenzaUnisciScegli()">' +
    opz(u.tieni) +
    '</select></label>' +
    '<label style="font-size:var(--fs-sm,.8125rem)">Scheda da togliere<br><select id="unisci-togli" onchange="coerenzaUnisciScegli()">' +
    opz(u.togli) +
    '</select></label>' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="coerenzaUnisciScambia()">Scambia</button>' +
    '<button class="btn-act" onclick="coerenzaUnisciAnteprima()">Anteprima</button>' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="apriCoerenzaDiarioPiano()">Torna alla coerenza</button></div>';
  const a = u.anteprima;
  if (a) {
    const r = _coerenzaUnisciRiepilogo(a);
    h +=
      '<div id="unisci-anteprima"><h4 style="margin:12px 0 4px">Anteprima: «' +
      escP(a.togli.nome) +
      '» entra in «' +
      escP(a.tieni.nome) +
      '»</h4>';
    if (!r.gruppi.length)
      h += '<p style="color:var(--muted)">La scheda da togliere non ha dati: si toglie soltanto la scheda.</p>';
    else
      h +=
        '<div style="overflow-x:auto"><table class="collab-table" style="font-size:var(--fs-md,.875rem)"><thead><tr><th>Cosa</th><th>Righe che si spostano</th><th>Doppie</th></tr></thead><tbody>' +
        r.gruppi
          .map(
            (g) =>
              '<tr><td colspan="3" style="font-weight:700;background:var(--paper2,#f5f2ea)">' +
              escP(g.nome) +
              '</td></tr>' +
              g.voci
                .map(
                  (v) =>
                    '<tr><td>' +
                    escP(v.etichetta) +
                    '</td><td>' +
                    (v.righe - v.doppie) +
                    '</td><td' +
                    (v.doppie ? ' style="color:var(--accent);font-weight:700"' : '') +
                    '>' +
                    (v.doppie || '') +
                    '</td></tr>',
                )
                .join(''),
          )
          .join('') +
        '</tbody></table></div>';
    // campi della scheda
    const campi = a.campi || [];
    if (campi.length)
      h +=
        '<h4 style="margin:12px 0 4px">Campi della scheda</h4><div style="overflow-x:auto"><table class="collab-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th>Campo</th><th>Da tenere</th><th>Da togliere</th><th></th></tr></thead><tbody>' +
        campi
          .map(
            (c) =>
              '<tr><td>' +
              escP(c.campo) +
              '</td><td>' +
              escP(c.tieni == null ? '—' : typeof c.tieni === 'object' ? JSON.stringify(c.tieni) : String(c.tieni)) +
              '</td><td>' +
              escP(c.togli == null ? '—' : typeof c.togli === 'object' ? JSON.stringify(c.togli) : String(c.togli)) +
              '</td><td>' +
              (c.azione === 'completa' ? 'vuoto: si completa se spunti sotto' : 'resta quello della scheda da tenere') +
              '</td></tr>',
          )
          .join('') +
        '</tbody></table></div>';
    // righe doppie: conflitto mostrato, mai sovrascritto
    const dop = a.doppie || {};
    const tabDop = Object.keys(dop).filter((t) => t !== 'registrazioni' && (dop[t] || []).length);
    if (tabDop.length) {
      h +=
        '<h4 style="margin:12px 0 4px;color:var(--accent)">Righe doppie (' +
        r.doppie +
        '): resta quella di «' +
        escP(a.tieni.nome) +
        '»</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Nessuna si sovrascrive: quella di «' +
        escP(a.togli.nome) +
        '» va nel Cestino con la scheda (con Ripristina torna com era).</p>';
      tabDop.forEach((t) => {
        const righe = dop[t].map((d) => _coerenzaUnisciDoppia(t, d));
        // prima quelle che contano: nel piano la sigla diversa, altrove le righe non identiche
        const conta = (x) => (t === 'piano' ? x.diversi.includes('codice') : !x.uguali);
        righe.sort((x, y) => conta(y) - conta(x));
        const uguali = righe.filter((x) => x.uguali).length;
        // nel piano conta la sigla: stessa sigla (cambia solo il settore o la nota) o sigla diversa
        const stessa = t === 'piano' ? righe.filter((x) => !x.diversi.includes('codice')).length : 0;
        h +=
          '<p style="font-size:var(--fs-sm,.8125rem);margin:6px 0 2px"><b>' +
          escP(COERENZA_UNISCI_TABELLE[t] || t) +
          '</b>: ' +
          righe.length +
          (uguali ? ' (' + uguali + ' identiche)' : '') +
          (t === 'piano' && stessa < righe.length
            ? ', ' +
              stessa +
              ' con la stessa sigla, <b style="color:var(--accent)">' +
              (righe.length - stessa) +
              ' con una sigla diversa</b>'
            : '') +
          '</p><div style="max-height:260px;overflow:auto"><table class="collab-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th>Quando</th><th>Resta («' +
          escP(a.tieni.nome) +
          '»)</th><th>Nel Cestino («' +
          escP(a.togli.nome) +
          '»)</th></tr></thead><tbody>' +
          righe
            .map(
              (x) =>
                '<tr><td>' +
                escP(x.chiave) +
                '</td><td>' +
                escP(x.tieni) +
                '</td><td' +
                ((t === 'piano' ? x.diversi.includes('codice') : !x.uguali)
                  ? ' style="color:var(--accent);font-weight:700"'
                  : '') +
                '>' +
                escP(x.togli) +
                '</td></tr>',
            )
            .join('') +
          '</tbody></table></div>';
      });
    }
    const regDop = dop.registrazioni || [];
    if (regDop.length)
      h +=
        '<p style="font-size:var(--fs-sm,.8125rem);margin-top:8px">Diario: ' +
        regDop.length +
        (regDop.length === 1 ? ' giorno ha' : ' giorni hanno') +
        ' una registrazione dello stesso tipo in tutte e due le schede (' +
        regDop
          .slice(0, 8)
          .map((x) => _coerenzaGg(String(x.giorno)) + ' ' + escP(x.tipo))
          .join(', ') +
        (regDop.length > 8 ? '…' : '') +
        '): si spostano tutte, nessuna si cancella. Controllale dopo nel Diario.</p>';
    if (a.operatore)
      h +=
        '<p style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">«' +
        escP(a.togli.nome) +
        '» è anche un accesso al programma: l accesso e la chat restano com erano.</p>';
    const nCompleta = campi.filter((c) => c.azione === 'completa').length;
    h +=
      '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:var(--fs-sm,.8125rem)">' +
      (nCompleta
        ? '<label><input type="checkbox" id="unisci-completa" checked> Completa i ' +
          nCompleta +
          ' campi vuoti della scheda da tenere con quelli dell altra (quelli pieni non cambiano)</label>'
        : '') +
      (r.doppie
        ? '<label><input type="checkbox" id="unisci-doppie" onchange="document.getElementById(\'unisci-esegui\').disabled=!this.checked"> Ho visto le ' +
          r.doppie +
          ' righe doppie: resta quella di «' +
          escP(a.tieni.nome) +
          '», l altra va nel Cestino</label>'
        : '') +
      '<div><button class="btn-act" id="unisci-esegui"' +
      (r.doppie ? ' disabled' : '') +
      ' onclick="coerenzaUnisciEsegui()">Unisci schede</button></div></div></div>';
  }
  el.innerHTML = h;
}
function coerenzaUnisciScegli() {
  if (!_coerenzaUnisci) return;
  const v = (id) => parseInt((document.getElementById(id) || {}).value) || null;
  _coerenzaUnisci.tieni = v('unisci-tieni');
  _coerenzaUnisci.togli = v('unisci-togli');
  _coerenzaUnisci.anteprima = null;
  _coerenzaUnisciDisegna();
}
function coerenzaUnisciScambia() {
  if (!_coerenzaUnisci) return;
  const u = _coerenzaUnisci;
  [u.tieni, u.togli] = [u.togli, u.tieni];
  u.anteprima = null;
  _coerenzaUnisciDisegna();
}
async function coerenzaUnisciAnteprima() {
  const u = _coerenzaUnisci;
  if (!u) return;
  if (!u.tieni || !u.togli || u.tieni === u.togli) {
    toastErrore('Scegli due schede diverse: quella da tenere e quella da togliere');
    return;
  }
  try {
    u.anteprima = await _conSessione(
      (t) => _rpcSicura('collaboratori_unisci_anteprima', { p_token: t, p_tieni: u.tieni, p_togli: u.togli }),
      getOpToken(),
    );
  } catch (e) {
    toastErrore('Anteprima non riuscita: ' + ((e && e.message) || e), 9000);
    return;
  }
  _coerenzaUnisciDisegna();
}
function coerenzaUnisciEsegui() {
  return unaVoltaSola('coerenza-unisci', () => _coerenzaUnisciEsegui());
}
async function _coerenzaUnisciEsegui() {
  const u = _coerenzaUnisci;
  const a = u && u.anteprima;
  if (!a || !isAdmin()) return;
  const r = _coerenzaUnisciRiepilogo(a);
  const completa = !!(document.getElementById('unisci-completa') || {}).checked;
  const doppieOk = !r.doppie || !!(document.getElementById('unisci-doppie') || {}).checked;
  if (!doppieOk) {
    toastErrore('Conferma prima le righe doppie');
    return;
  }
  if (
    !(await chiediConferma(
      'Unire «' +
        a.togli.nome +
        '» in «' +
        a.tieni.nome +
        '»?\n\n' +
        r.gruppi
          .map((g) => '• ' + g.nome + ': ' + g.voci.map((v) => v.righe + ' ' + v.etichetta).join(', '))
          .join('\n') +
        (r.doppie ? '\n\nRighe doppie: ' + r.doppie + ', resta quella di «' + a.tieni.nome + '».' : '') +
        '\n\nLa scheda «' +
        a.togli.nome +
        '» va nel Cestino (non si cancella).',
      { titolo: 'Unisci schede', ok: 'Unisci' },
    ))
  )
    return;
  let es;
  try {
    es = await _conSessione(
      (t) =>
        _rpcSicura('collaboratori_unisci', {
          p_token: t,
          p_tieni: a.tieni.id,
          p_togli: a.togli.id,
          p_firma: a.firma,
          p_completa: completa,
          p_conferma_doppie: doppieOk,
        }),
      getOpToken(),
      true, // niente secondo tentativo alla cieca
    );
  } catch (e) {
    toastErrore('Schede NON unite (niente è cambiato): ' + ((e && e.message) || e), 10000);
    return;
  }
  if (!es || !es.ok) {
    toastErrore('Schede NON unite: il database non ha confermato', 9000);
    return;
  }
  toast('«' + es.togli + '» unita in «' + es.tieni + '»: la scheda tolta è nel Cestino');
  // dati in memoria come nel database (elenchi, Diario, piano)
  try {
    if (typeof loadAll === 'function') await loadAll();
  } catch (e) {
    console.warn('ricarica dopo l unione', e);
  }
  _coerenzaUnisci = null;
  apriCoerenzaDiarioPiano();
}
