/**
 * Controllo 23/10/2026 (difetti D13, D14, D15, D29, D32), senza browser e senza database:
 *  - _cognomeParti / _cognomeDi (js/piano-briefing-ui.js): il cognome nel briefing, nelle
 *    pause, nei bigliettini e nelle etichette di Annulla (Di Tullio, Della Pace, Cerrato
 *    Lorenzo Mattia -> Cerrato, H. Scappaldi -> Scappaldi);
 *  - _briefTestoSu: testo bianco sul rosso pieno del coordinatore, nero sui colori chiari;
 *  - _pianoNotaCopre (js/piano-cambi.js): niente «Ex - - copre» sulla cella vuota;
 *  - _etichettaCorta (js/moduli.js): etichetta di Annulla tagliata a parola intera;
 *  - creaAnnulla (js/annulla.js): il gruppo tiene anche il testo intero (completa).
 *   node test/nomi-note-etichette.test.js
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
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n + ' (' + JSON.stringify(a) + ')');
function estrai(file, nomi) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  return nomi
    .map((n) => {
      const re = new RegExp('^(?:async )?function ' + n + '\\(|^(?:const|let) ' + n + ' =', 'm');
      const m = re.exec(src);
      if (!m) throw new Error(n + ' non trovata in ' + file);
      if (/^(const|let)/.test(m[0])) {
        const e = src.slice(m.index).search(/\n[\]}]\);?\n|\n\]\);?\n/);
        return src.substring(m.index, m.index + e + 4);
      }
      return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
    })
    .join('\n');
}
const ctx = { console, Date, Set, Map, JSON, String, Math, parseInt };
vm.createContext(ctx);
vm.runInContext(
  [
    estrai('piano-briefing-ui.js', ['_COGNOME_PARTICELLE', '_cognomeParti', '_cognomeDi', '_briefTestoSu']),
    estrai('piano-cambi.js', ['_pianoNotaCopre', '_pianoCopreMalattiaDi']),
    estrai('moduli.js', ['_etichettaCorta']),
    'this.T = { _cognomeParti, _cognomeDi, _briefTestoSu, _pianoNotaCopre, _pianoCopreMalattiaDi, _etichettaCorta };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;

console.log('Cognomi (D15, D29)');
eq(T._cognomeDi('Di Tullio Ivano'), 'Di Tullio', 'particella in testa');
eq(T._cognomeDi('Della Pace Jacopo'), 'Della Pace', 'Della');
eq(T._cognomeDi('Cerrato Lorenzo Mattia'), 'Cerrato', 'due nomi propri');
eq(T._cognomeDi('Troncao Camilo Hugo Miguel'), 'Troncao', 'tre nomi propri');
eq(T._cognomeDi('Lucas De Andrade Basso Caroline'), 'Lucas De Andrade', 'particella dentro il cognome');
eq(T._cognomeDi('H. Scappaldi Barbara'), 'Scappaldi', 'iniziale puntata davanti');
eq(T._cognomeDi('Da Costa F. Cristiana'), 'Da Costa', 'iniziale in mezzo');
eq(T._cognomeDi('Rossi'), 'Rossi', 'una parola');
eq(T._cognomeParti('Bianchi Mario Luca').proprio, 'Mario Luca', 'nome proprio');
eq(T._cognomeDi(''), '', 'vuoto');

console.log('Contrasto nel briefing (D32)');
eq(T._briefTestoSu('#FF0000'), '#fff', 'rosso pieno: bianco');
eq(T._briefTestoSu('#c0392b'), '#fff', 'rosso scuro: bianco');
eq(T._briefTestoSu('#FFFF00'), '#000', 'giallo: nero');
eq(T._briefTestoSu('#FF6B6B'), '#000', 'rosso chiaro della tavolozza: nero');
eq(T._briefTestoSu('#95E06C'), '#000', 'verde chiaro: nero');
eq(T._briefTestoSu(''), '#000', 'senza colore: nero');

console.log('Nota di chi copre (D14)');
const vuota = T._pianoNotaCopre('', 'Balliu Bledar', false, 'Admin');
eq(vuota, 'Era vuota - copre Balliu Bledar (malattia) - Admin', 'cella vuota');
ok(!/Ex - -/.test(vuota), 'niente «Ex - -»');
ok(T._pianoCopreMalattiaDi({ commento: vuota }, 'Balliu Bledar'), 'la copertura si ritrova dalla nota');
eq(
  T._pianoNotaCopre('C', 'Balliu Bledar', 'ASS', 'Admin'),
  'Ex C - copre Balliu Bledar (assenza) - Admin',
  'con sigla',
);

console.log('Etichetta di Annulla (D13)');
const lungo =
  'Balliu Bledar · Certificato medico dal 16/03/2027 al 17/03/2027 (2 giorni) ricevuto il 23.10.2026: 2 giorni del piano in malattia (M)';
const c = T._etichettaCorta(lungo, 110);
ok(c.length <= 111 && /…$/.test(c), 'accorciata con «…»');
ok(!/ricev…$/.test(c) && lungo.startsWith(c.slice(0, -1)), 'tagliata a parola intera: ' + c);
eq(T._etichettaCorta('breve', 110), 'breve', 'testo corto intero');

console.log('Annulla tiene il testo intero (D13)');
const A = require(path.join(__dirname, '..', 'js', 'annulla.js'));
const ann = A.creaAnnulla({
  leggi: async () => [],
  post: async (t, r) => [Object.assign({ id: 1 }, r)],
  patch: async () => [],
  del: async () => [],
  adesso: () => '2026-10-23T10:00:00Z',
  attesa: () => 1,
  annullaAttesa: () => {},
});
(async () => {
  ann.dopoPost('registrazioni', [{ id: 5, nome: 'X' }]);
  ann.chiudiGruppo('Certificato ricevuto · X · corto…', 'Certificato ricevuto · X · testo intero lungo');
  const st = ann.stato();
  eq(st.ultima, 'Certificato ricevuto · X · corto…', 'etichetta corta nella barra');
  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
