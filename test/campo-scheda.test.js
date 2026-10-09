// Requisito sulla scheda (regola richiede_campo, _pianoCampoOk in js/piano-core.js):
// nome del campo senza maiuscole/minuscole (il modulo salva la regola in maiuscolo) e
// tutti i confronti offerti dal modulo. Controllo del 09/10/2026.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'piano-core.js'), 'utf8');
const i = src.indexOf('function _pianoCampoOk');
const j = src.indexOf('\n}\n', i) + 3;
const _pianoCampoOk = new Function(src.slice(i, j) + '; return _pianoCampoOk;')();
let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  if (r === atteso) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + ' (atteso ' + atteso + ', ottenuto ' + r + ')');
  }
};
eq(_pianoCampoOk({ accoglienza: 2 }, 'accoglienza>0'), true, 'minuscolo come prima');
eq(_pianoCampoOk({ accoglienza: 2 }, 'ACCOGLIENZA>0'), true, 'salvata in maiuscolo dal modulo');
eq(_pianoCampoOk({ accoglienza: 0 }, 'ACCOGLIENZA>0'), false, 'campo a zero escluso');
eq(_pianoCampoOk({}, 'ACCOGLIENZA>0'), false, 'campo vuoto = 0');
eq(_pianoCampoOk({ categoria: 3 }, 'CATEGORIA>=3'), true, 'maggiore o uguale');
eq(_pianoCampoOk({ categoria: 2 }, 'CATEGORIA>=3'), false, 'sotto la soglia');
eq(_pianoCampoOk({ accoglienza: 1 }, 'ACCOGLIENZA<=1'), true, 'minore o uguale');
eq(_pianoCampoOk({ accoglienza: 1 }, 'ACCOGLIENZA<1'), false, 'minore');
eq(_pianoCampoOk({ accoglienza: 1 }, 'ACCOGLIENZA=0'), false, 'uguale numerico');
eq(_pianoCampoOk({ lingue: 'IT, EN' }, 'LINGUE=EN'), true, 'lista che contiene il valore');
eq(_pianoCampoOk({ lingue: 'IT' }, 'LINGUE=EN'), false, 'lista senza il valore');
eq(_pianoCampoOk({ impiego: 'jolly' }, 'IMPIEGO!=JOLLY'), false, 'diverso, testo');
eq(_pianoCampoOk({ impiego: 'fisso' }, 'IMPIEGO!=JOLLY'), true, 'diverso, testo che passa');
eq(_pianoCampoOk({ accoglienza: 2 }, 'formato sbagliato'), true, 'regola illeggibile non blocca');
console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
