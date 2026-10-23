// Controllo C del 23/10/2026 (Formazione, Gestione collaboratori, Cestino, Registro): le
// correzioni che si possono provare senza browser e senza database.
//  C12 proposta dei livelli in blocco: chi non ha competenze conta come non formato
//  C14 fisso/jolly: impiego (elenco) e is_jolly (piano) in contraddizione
//  C16 Cestino: correzione dalla data di inserimento, archivio dalla data del fatto
//  C21 date di nascita che non esistono nel calendario
const fs = require('fs');
const path = require('path');
const js = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
// estrae una funzione dal sorgente (dalla dichiarazione alla graffa che la chiude a inizio riga)
const estrai = (src, nome) => {
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('funzione non trovata: ' + nome);
  const j = src.indexOf('\n}\n', i) + 3;
  return src.slice(i, j);
};
let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  if (JSON.stringify(r) === JSON.stringify(atteso)) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + ' (atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(r) + ')');
  }
};

// ---- C12 ----
{
  const src = js('piano-extra.js');
  const core = js('piano-core.js');
  const amb = {
    turni: { X7: { gruppo: 'VALET' }, R1: { gruppo: 'REC' }, S1: { gruppo: 'SALA' }, NN: { gruppo: 'ALTRO' } },
    mappa: { valet: 'VALET', rec: 'REC', sala: 'SALA' },
    collab: {},
  };
  const f = new Function(
    'amb',
    `const _pianoTurnoInfo = (c) => amb.turni[c] || null;
     const _pianoCompetenzeGruppi = () => amb.mappa;
     const _pianoCollabInfo = (n) => amb.collab[n] || null;
     const _pianoFunzioniFannoTutto = () => new Set(['RESP']);
     const _pianoAccompagnamentoDi = () => [];
     ${estrai(core, '_pianoSettoriEffettivi')}
     ${estrai(src, '_pianoGruppiConFormazione')}
     ${estrai(src, '_pianoGruppoNonFormato')}
     return _pianoGruppoNonFormato;`,
  )(amb);
  amb.collab = {
    Nuovo: { nome: 'Nuovo', competenze: {} },
    ConSettori: { nome: 'ConSettori', settori_piano: 'VALET', competenze: {} },
    Formato: { nome: 'Formato', competenze: { valet: true } },
    SoloSala: { nome: 'SoloSala', competenze: { sala: true } },
    Resp: { nome: 'Resp', funzione: 'RESP', competenze: {} },
  };
  const B = { inBlocco: true };
  eq(f('Nuovo', 'X7', ''), null, 'C12 cella singola: senza competenze resta "puo tutto" (nessun avviso)');
  eq(f('Nuovo', 'X7', '', B), 'VALET', 'C12 in blocco: senza competenze e proposto per VALET');
  eq(f('ConSettori', 'X7', '', B), 'VALET', 'C12 in blocco: settori importati ma nessuna competenza = non formato');
  eq(f('Formato', 'X7', '', B), null, 'C12 in blocco: chi ha la competenza non e proposto');
  eq(f('SoloSala', 'R1', '', B), 'REC', 'C12 in blocco: L1 sala che fa reception (come prima)');
  eq(f('SoloSala', 'R1', ''), 'REC', 'C12 cella singola: invariato per chi ha competenze');
  eq(f('Nuovo', 'X7', 'in formazione', B), null, 'C12 in blocco: turno in formazione non conta');
  eq(f('Resp', 'X7', '', B), null, 'C12 in blocco: chi fa tutto resta esente');
  eq(f('Nuovo', 'NN', '', B), null, 'C12 in blocco: gruppo senza competenza collegata non conta');
}

// ---- C14 ----
{
  const gc = new Function(estrai(js('settings.js'), '_gcJollyIncoerente') + '; return _gcJollyIncoerente;')();
  const al = new Function(estrai(js('cestino-core.js'), '_jollyDaAllineare') + '; return _jollyDaAllineare;')();
  const casi = [
    [{ impiego: 'jolly', is_jolly: false }, true, 'Fusetti/Nebiaj: elenco Jolly, piano fisso'],
    [{ impiego: '', is_jolly: true }, true, 'Tavoli: impiego da indicare, piano Jolly'],
    [{ impiego: null, is_jolly: false }, false, 'da indicare e fisso nel piano: niente da allineare'],
    [{ impiego: 'jolly', is_jolly: true }, false, 'jolly coerente'],
    [{ impiego: 'fisso', is_jolly: true }, true, 'fisso con is_jolly'],
    [{ impiego: 'fisso', is_jolly: false }, false, 'fisso coerente'],
  ];
  casi.forEach(([c, atteso, nome]) => {
    eq(gc(c), atteso, 'C14 scheda: ' + nome);
    eq(al(Object.assign({ attivo: true }, c)), atteso, 'C14 Controlla il sistema: ' + nome);
  });
  eq(al({ attivo: false, impiego: 'jolly', is_jolly: false }), false, 'C14 i disattivati non si propongono');
}

// ---- C16 ----
{
  const u = js('utils.js');
  const f = new Function(
    `let conservazioneAnniCfg = 5, conservazioneGraziaCfg = 30;
     ${estrai(u, 'conservazioneAnni')}
     ${estrai(u, 'conservazioneGiorniGrazia')}
     ${estrai(u, 'inArchivioProtetto')}
     return inArchivioProtetto;`,
  )();
  const giorni = (n) => new Date(Date.now() + n * 86400000).toISOString();
  eq(f(giorni(-60), giorni(0)), false, 'C16 inserita oggi per un fatto di 2 mesi fa: correzione ammessa');
  eq(f(giorni(-60), giorni(-59)), true, 'C16 inserita 2 mesi fa: archivio');
  eq(f(giorni(+30), giorni(-700)), true, 'C16 inserita nel passato con data futura: archivio (prima si eliminava)');
  eq(f(giorni(-5), giorni(-5)), false, 'C16 inserita 5 giorni fa: correzione ammessa');
  eq(f(giorni(-6 * 365), giorni(-6 * 365)), false, 'C16 oltre i 5 anni: fuori archivio');
  eq(f(giorni(-6 * 365), giorni(0)), false, 'C16 fatto vecchio inserito oggi: correzione ammessa');
  eq(f(giorni(-60)), true, 'C16 senza data di inserimento: vale solo l archivio');
  eq(f('non una data', giorni(0)), true, 'C16 data illeggibile: protetta');
}

// ---- C21 ----
{
  const u = js('utils.js');
  const f = new Function(
    `const annoNascitaDaDueCifre = (a) => (a > 30 ? 1900 + a : 2000 + a);
     ${estrai(u, '_dataEsiste')}
     ${estrai(u, '_parseDataNascita')}
     return _parseDataNascita;`,
  )();
  eq(f('31.02.1990'), '', 'C21 31.02.1990 non esiste');
  eq(f('31.04.1990'), '', 'C21 31.04 non esiste');
  eq(f('29.02.1992'), '1992-02-29', 'C21 29.02 anno bisestile');
  eq(f('29.02.1993'), '', 'C21 29.02 anno non bisestile');
  eq(f('12.01.1997'), '1997-01-12', 'C21 data normale');
  eq(f('12.01'), '1900-01-12', 'C21 solo giorno e mese');
  eq(f('31.02'), '', 'C21 31.02 senza anno');
  eq(f('29.02'), '', 'C21 29.02 senza anno (il 1900 non e bisestile)');
  eq(f('1990-02-31'), '', 'C21 formato ISO impossibile');
  eq(f('1990-02-28'), '1990-02-28', 'C21 formato ISO valido');
}

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
