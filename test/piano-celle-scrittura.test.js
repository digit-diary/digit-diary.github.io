/**
 * Scrittura nella cella del calendario (controllo D, 23/10/2026), senza browser e senza
 * database (js/piano-celle.js):
 *  - _pianoSiglaDisattivata: un codice o un turno disattivato non si scrive piu (D10); un
 *    turno attivo di un altro settore resta valido (coperture);
 *  - _pianoLunghezzaSigla: il campo accetta la sigla piu lunga (ANTINCENDIO, D16);
 *  - _pianoDescriviProtetta e _pianoCellaSoloAMano: la cella scritta a mano non e
 *    «piano consolidato, vacanza o assenza confermata» (D9).
 * Le sigle scritte in fila e gli avvisi di regola (D3, D26) si provano dal percorso vero
 * (puppeteer): sono legati ai tasti e alle finestre.
 *   node test/piano-celle-scrittura.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let passati = 0,
  falliti = 0;
const ok = (c, n) => {
  c ? passati++ : falliti++;
  console.log((c ? '  OK  ' : '  FAIL ') + n);
};
function estrai(file, nomi) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  return nomi
    .map((n) => {
      const re = new RegExp('^(?:async )?function ' + n + '\\(|^(?:const|let) ' + n + ' =', 'm');
      const m = re.exec(src);
      if (!m) throw new Error(n + ' non trovata in ' + file);
      if (/^(const|let)/.test(m[0])) return src.substring(m.index, src.indexOf('\n', m.index));
      return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
    })
    .join('\n');
}
const ctx = { console, Set, Map, JSON, Object, Array, String, Math };
vm.createContext(ctx);
vm.runInContext(
  estrai('piano-celle.js', [
    '_PIANO_SIGLE_ASSENZA',
    '_pianoDescriviProtetta',
    '_pianoCellaSoloAMano',
    '_pianoSiglaDisattivata',
    '_pianoLunghezzaSigla',
  ]) + '\nthis.T = { _pianoDescriviProtetta, _pianoCellaSoloAMano, _pianoSiglaDisattivata, _pianoLunghezzaSigla };',
  ctx,
);
const T = ctx.T;
ctx.pianoTurniCache = [
  { codice: '9', attivo: false, reparto_dip: 'slots' },
  { codice: '9', attivo: true, reparto_dip: 'tavoli' },
  { codice: 'Z8', attivo: false, reparto_dip: 'slots' },
  { codice: 'R22', attivo: true, reparto_dip: 'slots' },
];
ctx.pianoCodiciCache = [
  { codice: 'TR', attivo: false },
  { codice: 'ANTINCENDIO', attivo: true },
  { codice: 'M', attivo: true },
];

console.log('\nD10 · codici e turni disattivati');
ok(/codice disattivato/.test(T._pianoSiglaDisattivata('TR')), 'TR disattivato: rifiutato con «codice disattivato»');
ok(/codice disattivato/.test(T._pianoSiglaDisattivata('tr')), 'anche scritto in minuscolo');
ok(/turno disattivato/.test(T._pianoSiglaDisattivata('Z8')), 'turno Z8 disattivato: rifiutato');
ok(T._pianoSiglaDisattivata('9') === '', '9 disattivato nelle Slots ma attivo nei Tavoli: si scrive');
ok(T._pianoSiglaDisattivata('R22') === '', 'turno attivo (anche di un altro settore): si scrive');
ok(T._pianoSiglaDisattivata('M') === '', 'codice attivo: si scrive');
ok(T._pianoSiglaDisattivata('XYZ') === '', 'sigla inesistente: la gestisce il messaggio «sigla sbagliata»');
ok(T._pianoSiglaDisattivata('') === '', 'cella svuotata: nessun controllo');

console.log('\nD16 · lunghezza del campo');
ok(T._pianoLunghezzaSigla() === 11, 'ANTINCENDIO (11 lettere) sta nel campo');
ctx.pianoCodiciCache = [{ codice: 'M', attivo: true }];
ctx.pianoTurniCache = [{ codice: '9', attivo: true }];
ok(T._pianoLunghezzaSigla() === 6, 'sigle corte: almeno 6 come prima');

console.log('\nD9 · perche una cella e protetta');
const aMano = { codice: '21', protetto: true, generato: false, operatore: 'Admin' };
ok(T._pianoCellaSoloAMano(aMano), 'turno scritto a mano: nessuna conferma «cella protetta»');
ok(/scritta a mano da Admin/.test(T._pianoDescriviProtetta(aMano)), 'testo: «scritta a mano da Admin»');
ok(!T._pianoCellaSoloAMano({ codice: 'V', protetto: true, generato: true }), 'vacanza: conferma');
ok(/^vacanza/.test(T._pianoDescriviProtetta({ codice: 'V', protetto: true, generato: true })), 'testo vacanza');
ok(!T._pianoCellaSoloAMano({ codice: 'M', protetto: true, operatore: 'Admin' }), 'malattia a mano: conferma');
ok(/assenza registrata \(ASS\)/.test(T._pianoDescriviProtetta({ codice: 'ASS', protetto: true })), 'testo ASS');
const imp = { codice: '21', protetto: true, generato: false, operatore: null };
ok(
  !T._pianoCellaSoloAMano(imp) && /piano consolidato/.test(T._pianoDescriviProtetta(imp)),
  'importata: piano consolidato',
);
const bl = { codice: '21', protetto: true, operatore: 'Admin', motivo_blocco: 'visita' };
ok(!T._pianoCellaSoloAMano(bl) && /BLOCCATA per: visita/.test(T._pianoDescriviProtetta(bl)), 'bloccata: motivo');
const cv = { codice: 'C', protetto: true, generato: true, operatore: 'Admin' };
ok(!T._pianoCellaSoloAMano(cv) && /congedo protetto/.test(T._pianoDescriviProtetta(cv)), 'C attorno alle vacanze');
ok(
  !T._pianoCellaSoloAMano({ codice: 'PC', protetto: true, operatore: 'Admin', commento: 'Piano vacanze: PC' }),
  'assenza dalla scheda Vacanze: conferma',
);

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
