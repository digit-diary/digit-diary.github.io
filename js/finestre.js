/**
 * Diario Collaboratori · Casino Lugano SA
 * File: finestre.js
 *
 * FINESTRE DEL PROGRAMMA al posto di quelle del browser (confirm, prompt, alert):
 * stesso stile del resto, titolo, testo su piu righe, pulsanti chiari.
 *   await chiediConferma(testo, { titolo, ok, annulla, pericolo })  -> true / false
 *   await chiediTesto(testo, predefinito, { titolo, ok })            -> testo / null
 *   await mostraAvviso(testo, { titolo })                            -> dopo OK
 * Invio conferma, Esc annulla. Se ne arrivano due insieme, la seconda aspetta
 * la prima (come facevano quelle del browser).
 */
let _finestraCoda = Promise.resolve();

function _finestraApri(tipo, testo, predefinito, opz) {
  const turno = _finestraCoda.then(() => _finestraMostra(tipo, testo, predefinito, opz || {}));
  _finestraCoda = turno.catch(() => {});
  return turno;
}

function _finestraMostra(tipo, testo, predefinito, opz) {
  return new Promise((risolvi) => {
    const t = String(testo == null ? '' : testo);
    // pulsante rosso quando la domanda riguarda un eliminazione o una cancellazione
    const pericolo = opz.pericolo != null ? opz.pericolo : /\b(elimin|cancell|rimuov|svuot|sovrascriv)/i.test(t);
    const titolo = opz.titolo || (tipo === 'avviso' ? 'Avviso' : tipo === 'testo' ? 'Inserisci' : 'Conferma');
    const okLbl =
      opz.ok || (tipo === 'avviso' ? 'OK' : tipo === 'testo' ? 'Conferma' : pericolo ? 'Elimina' : 'Conferma');
    const noLbl = opz.annulla || 'Annulla';

    const velo = document.createElement('div');
    velo.className = 'finestra-velo';
    velo.innerHTML =
      '<div class="finestra-box" role="dialog" aria-modal="true" aria-labelledby="finestra-titolo">' +
      '<h3 id="finestra-titolo"></h3><div class="finestra-testo"></div>' +
      (tipo === 'testo' ? '<input type="text" class="finestra-campo" autocomplete="off">' : '') +
      '<div class="finestra-pulsanti">' +
      (tipo === 'avviso' ? '' : '<button type="button" class="finestra-no"></button>') +
      '<button type="button" class="finestra-ok' +
      (pericolo && tipo === 'conferma' ? ' finestra-pericolo' : '') +
      '"></button></div></div>';
    // testi inseriti come testo, mai come HTML
    velo.querySelector('h3').textContent = titolo;
    velo.querySelector('.finestra-testo').textContent = t;
    velo.querySelector('.finestra-ok').textContent = okLbl;
    const bNo = velo.querySelector('.finestra-no');
    if (bNo) bNo.textContent = noLbl;
    const campo = velo.querySelector('.finestra-campo');
    if (campo) campo.value = predefinito == null ? '' : String(predefinito);

    const primaFocus = document.activeElement;
    const chiudi = (esito) => {
      document.removeEventListener('keydown', tasti, true);
      velo.remove();
      try {
        if (primaFocus && primaFocus.focus) primaFocus.focus();
      } catch (e) {}
      risolvi(esito);
    };
    const conferma = () => chiudi(tipo === 'testo' ? campo.value : tipo === 'avviso' ? undefined : true);
    const annulla = () => chiudi(tipo === 'testo' ? null : tipo === 'avviso' ? undefined : false);
    const tasti = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        annulla();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        conferma();
      } else if (e.key === 'Tab') {
        // il tasto Tab resta dentro la finestra
        const el = [...velo.querySelectorAll('input,button')];
        const i = el.indexOf(document.activeElement);
        e.preventDefault();
        el[(i + (e.shiftKey ? -1 : 1) + el.length) % el.length].focus();
      }
    };
    velo.querySelector('.finestra-ok').addEventListener('click', conferma);
    if (bNo) bNo.addEventListener('click', annulla);
    document.addEventListener('keydown', tasti, true);
    document.body.appendChild(velo);
    if (campo) {
      campo.focus();
      campo.select();
    } else velo.querySelector('.finestra-ok').focus();
  });
}

function chiediConferma(testo, opz) {
  return _finestraApri('conferma', testo, null, opz);
}
function chiediTesto(testo, predefinito, opz) {
  return _finestraApri('testo', testo, predefinito, opz);
}
function mostraAvviso(testo, opz) {
  return _finestraApri('avviso', testo, null, opz);
}
