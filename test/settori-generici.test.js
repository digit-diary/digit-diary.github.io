// Pezzi scritti per le Slots resi generici per ogni settore (v453):
// 1) esenzione dall avviso "non formato": unica fonte la regola funzioni_fanno_tutto
//    (js/piano-extra.js, js/piano-core.js, predefinito in js/piano-config.js)
// 2) formazioni lette dai commenti del piano: gruppi e competenze del settore per nome e
//    sigla (js/piano-extra.js), con le parole di sempre ancora valide per le Slots
// 3) punti e premi del passaggio di livello per settore, con i valori globali come base
//    (js/formazione.js)
// Come si lancia: node test/settori-generici.test.js
const fs = require('fs');
const path = require('path');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  const j = src.indexOf('\n}\n', i);
  const k = src.indexOf('\n};\n', i);
  const fine = k >= 0 && (j < 0 || k < j) ? k + 4 : j + 3;
  return src.slice(i, fine);
};
const extra = leggi('piano-extra.js');
const core = leggi('piano-core.js');
const config = leggi('piano-config.js');
const form = leggi('formazione.js');

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  if (JSON.stringify(r) === JSON.stringify(atteso)) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + JSON.stringify(atteso) + '\n  ottenuto ' + JSON.stringify(r));
  }
};

// ---------------------------------------------------------------- 1) funzioni_fanno_tutto
const catalogo = new Function(pezzo(config, 'const PIANO_REGOLE_GUIDA') + '; return PIANO_REGOLE_GUIDA;')();
eq(catalogo.funzioni_fanno_tutto.p, 'SUP,SOSTRESP,RESP', 'predefinito della regola = le tre funzioni esenti di prima');
let valoreRegola = null; // null = nessuna riga nel database
const collab = {
  Sup: { funzione: 'SUP', settori_piano: 'SALA' },
  Sost: { funzione: 'SOSTRESP', settori_piano: 'SALA' },
  Resp: { funzione: 'RESP', settori_piano: 'SALA' },
  Host: { funzione: 'HOST', settori_piano: 'SALA' },
};
const nonFormato = new Function(
  '_pianoRegolaVal',
  '_pianoRegolaPredefinita',
  '_pianoTurnoInfo',
  '_pianoCompetenzeGruppi',
  '_pianoCollabInfo',
  '_pianoAccompagnamentoDi',
  '_pianoSettoriEffettivi',
  pezzo(core, 'function _pianoFunzioniFannoTutto(') +
    pezzo(extra, 'function _pianoGruppiConFormazione(') +
    pezzo(extra, 'function _pianoGruppoNonFormato(') +
    '; return _pianoGruppoNonFormato;',
)(
  () => valoreRegola,
  (n) => catalogo[n].p,
  (c) => (c === 'C0' ? { codice: 'C0', gruppo: 'CASSA' } : null),
  () => ({ sala: 'SALA', cassa: 'CASSA' }),
  (n) => collab[n],
  () => [],
  (info) => info.settori_piano.split(','),
);
eq(
  ['Sup', 'Sost', 'Resp', 'Host'].map((n) => nonFormato(n, 'C0', '')),
  [null, null, null, 'CASSA'],
  'senza riga: SUP, SOSTRESP e RESP esenti come prima',
);
valoreRegola = 'SUP,RESP';
eq(
  ['Sup', 'Sost', 'Resp', 'Host'].map((n) => nonFormato(n, 'C0', '')),
  [null, 'CASSA', null, 'CASSA'],
  'regola SUP,RESP: SOSTRESP non e piu esente',
);
valoreRegola = '';
eq(
  ['Sup', 'Sost', 'Resp', 'Host'].map((n) => nonFormato(n, 'C0', '')),
  ['CASSA', 'CASSA', 'CASSA', 'CASSA'],
  'regola svuotata: nessuno esente',
);
valoreRegola = 'HOST';
eq(
  ['Sup', 'Host'].map((n) => nonFormato(n, 'C0', '')),
  ['CASSA', null],
  'regola con altre funzioni: vale solo la regola',
);
eq(nonFormato('Host', 'C0', 'formazione cassa'), null, 'commento di formazione: nessun avviso');
eq(/\['SUP', 'SOSTRESP', 'RESP'\]/.test(extra), false, 'nessuna lista fissa nel codice');

// ---------------------------------------------------------------- 2) formazioni dai commenti
const COMP = {
  slots: [
    { key: 'sala', label: 'Sala Slot', livello: 1 },
    { key: 'reception', label: 'Reception', livello: 2 },
    { key: 'cassa', label: 'Cassa', livello: 3 },
    { key: 'accoglienza', label: 'Accoglienza', livello: 4 },
    { key: 'bo', label: 'Back Office (BO)', livello: 5 },
    { key: 'sup', label: 'Supervisor (SUP)', livello: 6 },
  ],
  tavoli: [
    { key: 'croupier', label: 'Croupier', livello: 1 },
    { key: 'ispettore', label: 'Ispettore tavolo', livello: 2 },
    { key: 'cassa_tavoli', label: 'Cassa Tavoli', livello: 3 },
  ],
  valet: [
    { key: 'valet_servizio', label: 'Servizio Valet', livello: 1 },
    { key: 'valet_accoglienza', label: 'Accoglienza clienti', livello: 2 },
  ],
  bar: [{ key: 'barman', label: 'Barman (BAR)', livello: 1 }],
};
const MAPPA = {
  sala: 'SALA',
  reception: 'REC',
  cassa: 'CASSA',
  bo: 'BO',
  sup: 'SUP',
  croupier: 'TAVOLI',
  ispettore: 'TAVOLI',
  cassa_tavoli: 'TAVOLI',
  valet_servizio: 'VALET',
  valet_accoglienza: 'VALET',
  barman: 'BANCO',
};
const pianoTurniCache = []
  .concat(
    ['SALA', 'REC', 'CASSA', 'ACCOGLIENZA', 'BO', 'SUP'].map((g) => ({ codice: g, gruppo: g, reparto_dip: 'slots' })),
  )
  .concat([{ codice: '1', gruppo: 'TAVOLI', reparto_dip: 'tavoli' }])
  .concat([{ codice: 'X1', gruppo: 'VALET', reparto_dip: 'valet' }])
  .concat([{ codice: 'B1', gruppo: 'BANCO', reparto_dip: 'bar' }]);
const F = new Function(
  'pianoTurniCache',
  '_repartoDi',
  '_pianoCompetenzeGruppi',
  'getCompetenzeConfigAll',
  '_pianoReparto',
  pezzo(extra, 'function _pianoParoleDi(') +
    pezzo(extra, 'function _pianoVociFormazioneSettore(') +
    pezzo(extra, 'function _pianoParolaCorrisponde(') +
    pezzo(extra, 'function _pianoCommentoHaTermine(') +
    pezzo(extra, 'function _pianoSettoreDaCommentoVoci(') +
    pezzo(extra, 'function _pianoSettoreDaCommento(') +
    '; return { _pianoSettoreDaCommento };',
)(
  pianoTurniCache,
  (x) => x.reparto_dip,
  () => MAPPA,
  () => COMP,
  () => 'slots',
);
// la funzione di prima (solo Slots), per il confronto
const vecchia = (commento, gruppoTurno) => {
  const c = (commento || '').toLowerCase();
  if (/cass/.test(c)) return 'CASSA';
  if (/rec/.test(c)) return 'REC';
  if (/sala/.test(c)) return 'SALA';
  if (/acc/.test(c)) return 'ACCOGLIENZA';
  return gruppoTurno;
};
// commenti veri del piano Slots (database di prova) e varianti delle parole di sempre
[
  'FORMAZIONE CASSA',
  'FORMAZIONE REC',
  'FORMAZIONE',
  'formazione rec',
  'formazione DALLE 10:00 ALLE 12 AFF. CON MG',
  'FORMAZIONE REC+GUARDAROBA',
  'formazione r23',
  'DALLE 10-12 CON MG FINO ALLE 20:00 FORMAZIONE',
  'FORMAZIONE S22',
  'FORMAZIONE REC GRASSO VALENTINA',
  'formazione cassa',
  'FORMAZIONE CON PERAINO',
  'formazione rec con raineri r23',
  'FORMAZIONE INIZIO ORE 10:00 FINO ALLE 20:00',
  'formazione rec FUSETTI INIZIO 09:45 R22',
  'FORMAZIONE  S31 CON MATTIA fino ore 23.00',
  'NON TOCCARE DIRETTIVA DI LARA PER FORMAZIONE',
  'X2 FORMAZIONI',
  'FORMAZIONE CON SOMMA OK DI LARA  TRIPLA FORMAZIONE',
  'affiancamento sala',
  'affiancamento sala e cassa',
  'affiancamento reception',
  'formazione casse',
  'formazione acc.',
  'formazione accoglienza',
  'formazione sala rec',
  'FORMAZIONE SLOT',
  'formazione slot con sapio',
].forEach((c) => {
  ['SALA', 'REC', 'CASSA'].forEach((g) =>
    eq(F._pianoSettoreDaCommento(c, g, 'slots'), vecchia(c, g), 'Slots come prima: "' + c + '" su ' + g),
  );
});
eq(
  F._pianoSettoreDaCommento('formazione back office', 'SALA', 'slots'),
  'BO',
  'Slots: nome della competenza (Back Office)',
);
eq(F._pianoSettoreDaCommento('affiancamento sup', 'SALA', 'slots'), 'SUP', 'Slots: sigla fra parentesi (SUP)');
eq(F._pianoSettoreDaCommento('formazione sala slot', 'ACCOGLIENZA', 'slots'), 'SALA', 'Slots: nome intero "Sala Slot"');
eq(F._pianoSettoreDaCommento('formazione croupier', '', 'tavoli'), 'TAVOLI', 'Tavoli: competenza Croupier');
eq(F._pianoSettoreDaCommento('affiancamento ispettore', '', 'tavoli'), 'TAVOLI', 'Tavoli: competenza Ispettore');
eq(
  F._pianoSettoreDaCommento('formazione cassa', 'TAVOLI', 'tavoli'),
  'TAVOLI',
  'Tavoli: "cassa" e la Cassa Tavoli, non la CASSA delle Slots',
);
eq(F._pianoSettoreDaCommento('formazione valet', '', 'valet'), 'VALET', 'Valet: gruppo VALET');
eq(F._pianoSettoreDaCommento('formazione accoglienza clienti', '', 'valet'), 'VALET', 'Valet: nome della competenza');
eq(
  F._pianoSettoreDaCommento('formazione servizio', 'X', 'valet'),
  'X',
  'Valet: parola sola di un nome di due parole non basta',
);
eq(F._pianoSettoreDaCommento('formazione bar', '', 'bar'), 'BANCO', 'settore nuovo: sigla della competenza');
eq(F._pianoSettoreDaCommento('formazione barman', '', 'bar'), 'BANCO', 'settore nuovo: nome della competenza');
eq(F._pianoSettoreDaCommento('formazione banco', '', 'bar'), 'BANCO', 'settore nuovo: nome del gruppo');
eq(
  F._pianoSettoreDaCommento('formazione sala', 'BANCO', 'bar'),
  'BANCO',
  'settore nuovo: le parole delle Slots non contano',
);

// ---------------------------------------------------------------- 3) incentivi per settore
const PUNTI_DEFAULT = new Function(pezzo(form, 'const PUNTI_DEFAULT') + '; return PUNTI_DEFAULT;')();
eq(
  PUNTI_DEFAULT.premi_livello,
  { 2: 'Aperitivo di team', 3: 'Cena + proposta riconoscimento HR' },
  'premi predefiniti invariati',
);
const I = new Function(
  'PUNTI_DEFAULT',
  'cfgRef',
  'let puntiConfig; Object.defineProperty(this, "x", {});' +
    'const getPC = () => cfgRef.v;' +
    pezzo(form, 'function getPuntiConfig(').replace(/puntiConfig/g, 'cfgRef.v') +
    pezzo(form, 'function incentiviLivelloSettore(') +
    pezzo(form, 'function _incLivelloVoce(') +
    pezzo(form, 'function puntiLivelloDi(') +
    pezzo(form, 'function premioLivelloDi(') +
    pezzo(form, 'function premiLivelloDelSettore(') +
    '; return { getPuntiConfig, puntiLivelloDi, premioLivelloDi, premiLivelloDelSettore };',
);
const ref = { v: null }; // puntiConfig del programma
const inc = I(PUNTI_DEFAULT, ref);
eq(
  [1, 2, 3, 4].map((l) => inc.puntiLivelloDi(l, 'tavoli')),
  [0, 0, 0, 0],
  'senza configurazione: punti predefiniti (0)',
);
eq(
  inc.premioLivelloDi(3, 'tavoli'),
  'Cena + proposta riconoscimento HR',
  'senza configurazione: premio predefinito L3',
);
eq(inc.premioLivelloDi(4, 'slots'), '', 'oltre L3 nessun premio predefinito');
ref.v = {
  premi_livello: { 2: 'Aperitivo', 3: 'Cena', 4: 'Buono' },
  punti_livello: { 1: 5, 2: 10, 3: 15 },
  per_settore: { tavoli: { punti_livello: { 1: 7, 2: 0 }, premi_livello: { 2: 'Pranzo', 3: '' } } },
};
eq(
  [1, 2, 3].map((l) => inc.puntiLivelloDi(l, 'slots')),
  [5, 10, 15],
  'Slots senza valori propri: globali',
);
eq(
  [1, 2, 3].map((l) => inc.puntiLivelloDi(l, 'tavoli')),
  [7, 0, 15],
  'Tavoli: valori propri, L3 mancante = globale',
);
eq(
  [2, 3, 4].map((l) => inc.premioLivelloDi(l, 'tavoli')),
  ['Pranzo', '', 'Buono'],
  'Tavoli: premio proprio, vuoto = nessun premio, L4 globale',
);
eq(
  [2, 3].map((l) => inc.premioLivelloDi(l, 'valet')),
  ['Aperitivo', 'Cena'],
  'Valet senza valori propri: globali',
);
eq(inc.premiLivelloDelSettore('tavoli'), { 2: 'Pranzo', 4: 'Buono' }, 'elenco premi del settore senza i vuoti');
eq(inc.getPuntiConfig().per_settore.tavoli.punti_livello[1], 7, 'getPuntiConfig conserva i valori per settore');
ref.v = { premi_livello: { 2: 'A' }, punti_livello: { 1: 0 } };
eq(inc.getPuntiConfig().per_settore, {}, 'configurazione di prima (senza per_settore): oggetto vuoto');

console.log(passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
