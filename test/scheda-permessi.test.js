/**
 * Test automatici della scheda dei permessi (js/scheda-permessi.js).
 *
 * Come si lancia: node test/scheda-permessi.test.js
 */
const S = require('../js/scheda-permessi.js');

let passati = 0;
let falliti = 0;
function ok(cond, nome) {
  if (cond) {
    passati++;
    console.log('  OK  ' + nome);
  } else {
    falliti++;
    console.log('  FAIL ' + nome);
  }
}
const VOCI = {
  pagine: { rapporto: 'Rapporto', piano: 'Piano' },
  funzioni: { qr_code: 'QR' },
  permessi: { gestione_punti: 'Punti', piano_formazioni: 'Formazioni' },
  piano_schede: { ptab_congedi: 'Congedi' },
  piano_modifica: { ptabmod_calendario: 'Calendario' },
};
const ERED = ['piano_formazioni'];
const vis = {
  rapporto: { tipo: 'selezionati', operatori: ['Anna'] },
  piano_azioni_auto: { tipo: 'selezionati', operatori: ['Bruno'] },
  qr_code: 'nascosto',
};
console.log('== regole come il programma ==');
ok(S.concesso(vis, 'rapporto', 'Anna', VOCI, ERED) && !S.concesso(vis, 'rapporto', 'Bruno', VOCI, ERED), 'per nome');
ok(!S.concesso(vis, 'gestione_punti', 'Anna', VOCI, ERED), 'permesso di modifica non impostato: solo amministratore');
ok(
  S.concesso(vis, 'piano_formazioni', 'Bruno', VOCI, ERED) && !S.concesso(vis, 'piano_formazioni', 'Anna', VOCI, ERED),
  'azione automatica non impostata: segue piano_azioni_auto',
);
ok(!S.concesso(vis, 'piano', 'Anna', VOCI, ERED), 'pagina Piano non impostata: solo amministratore');
ok(S.concesso(vis, 'ptab_congedi', 'Anna', VOCI, ERED), 'scheda del Piano non impostata: tutti');
ok(!S.concesso(vis, 'qr_code', 'Anna', VOCI, ERED), 'nascosta');

console.log('== file della scheda ==');
const h = S.html({
  ops: ['Anna', 'Bruno'],
  nomiProfili: { sup: 'Supervisor' },
  profili: { Anna: 'sup' },
  settori: { Anna: 'slots' },
  extra: {},
  vis: vis,
  voci: VOCI,
  ereditati: ERED,
  oggi: '10.10.2026',
});
ok(
  /data-sel="ptab_congedi\|Anna"/.test(h) && /data-sel="ptabmod_calendario\|Bruno"/.test(h),
  'contiene le schede del Piano',
);
ok(/data-orig="si" data-sel="piano_formazioni\|Bruno"/.test(h), 'spunta gia messa dove il permesso c e');
ok(/data-orig="" data-sel="gestione_punti\|Anna"/.test(h), 'vuota dove il permesso non c e');
ok(
  !/html\.replace\('<\/body>'/.test(h) && /lastIndexOf\('<'\+'\/body>'\)/.test(h),
  'la copia compilata mette le risposte prima della fine della pagina',
);
ok(/DOMContentLoaded/.test(h), 'le risposte salvate si applicano dopo il caricamento');

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================');
process.exit(falliti ? 1 : 0);
