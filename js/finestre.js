/**
 * Diario Collaboratori · Casino Lugano SA
 * File: finestre.js
 *
 * FINESTRE DEL PROGRAMMA al posto di quelle del browser (confirm, prompt, alert):
 * stesso stile del resto, titolo, testo su piu righe, pulsanti chiari.
 *   await chiediConferma(testo, { titolo, ok, annulla, pericolo })  -> true / false
 *   await chiediTesto(testo, predefinito, { titolo, ok })            -> testo / null
 *   await mostraAvviso(testo, { titolo })                            -> dopo OK
 *   await chiediModulo(testo, gruppi, { titolo, ok, controlla })     -> { id: valore } / null
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

// FINESTRA CON PIU CAMPI (es. orari dei JG): un gruppo per riga con titolo,
// scelte a pulsante e caselle di testo. Restituisce { id: valore } oppure null.
//   await chiediModulo(testo, [{ titolo, campi: [{ id, tipo: 'scelta'|'testo',
//     opzioni: [{ valore, etichetta }], valore, etichetta, segnaposto, larghezza }] }], { titolo, ok })
function chiediModulo(testo, gruppi, opz) {
  const turno = _finestraCoda.then(() => _finestraModulo(testo, gruppi || [], opz || {}));
  _finestraCoda = turno.catch(() => {});
  return turno;
}
function _finestraModulo(testo, gruppi, opz) {
  return new Promise((risolvi) => {
    const velo = document.createElement('div');
    velo.className = 'finestra-velo';
    const box = document.createElement('div');
    box.className = 'finestra-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.maxWidth = '640px';
    const h = document.createElement('h3');
    h.textContent = opz.titolo || 'Inserisci';
    const t = document.createElement('div');
    t.className = 'finestra-testo';
    t.textContent = String(testo || '');
    box.appendChild(h);
    box.appendChild(t);
    const elenco = document.createElement('div');
    elenco.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-height:55vh;overflow:auto;margin:6px 0';
    const leggi = [];
    gruppi.forEach((g, gi) => {
      const riq = document.createElement('fieldset');
      riq.style.cssText =
        'border:1px solid var(--line,#ccc);border-radius:4px;padding:8px 10px;margin:0;display:flex;flex-direction:column;gap:6px';
      const leg = document.createElement('legend');
      leg.style.cssText = 'font-weight:bold;padding:0 4px';
      leg.textContent = g.titolo || '';
      riq.appendChild(leg);
      if (g.nota) {
        const n = document.createElement('div');
        n.style.cssText = 'color:var(--muted,#666);font-size:.9em';
        n.textContent = g.nota;
        riq.appendChild(n);
      }
      const riga = document.createElement('div');
      riga.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      (g.campi || []).forEach((cp) => {
        if (cp.tipo === 'scelta') {
          (cp.opzioni || []).forEach((o) => {
            const l = document.createElement('label');
            l.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer';
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = 'fm-' + gi + '-' + cp.id;
            r.value = o.valore;
            if (o.valore === cp.valore) r.checked = true;
            l.appendChild(r);
            l.appendChild(document.createTextNode(o.etichetta));
            riga.appendChild(l);
          });
          leggi.push(() => {
            const x = riq.querySelector('input[name="fm-' + gi + '-' + cp.id + '"]:checked');
            return [cp.id, x ? x.value : ''];
          });
        } else {
          if (cp.etichetta) riga.appendChild(document.createTextNode(cp.etichetta));
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'finestra-campo';
          inp.style.cssText = 'width:' + (cp.larghezza || 80) + 'px;margin:0';
          inp.placeholder = cp.segnaposto || '';
          inp.value = cp.valore == null ? '' : String(cp.valore);
          inp.autocomplete = 'off';
          riga.appendChild(inp);
          leggi.push(() => [cp.id, inp.value]);
        }
      });
      riq.appendChild(riga);
      elenco.appendChild(riq);
    });
    box.appendChild(elenco);
    const errore = document.createElement('div');
    errore.style.cssText = 'color:var(--c-rosso,#c0392b);font-weight:bold;min-height:1.2em';
    box.appendChild(errore);
    const puls = document.createElement('div');
    puls.className = 'finestra-pulsanti';
    const bNo = document.createElement('button');
    bNo.type = 'button';
    bNo.className = 'finestra-no';
    bNo.textContent = opz.annulla || 'Annulla';
    const bOk = document.createElement('button');
    bOk.type = 'button';
    bOk.className = 'finestra-ok';
    bOk.textContent = opz.ok || 'Conferma';
    puls.appendChild(bNo);
    puls.appendChild(bOk);
    box.appendChild(puls);
    velo.appendChild(box);
    const primaFocus = document.activeElement;
    const chiudi = (esito) => {
      document.removeEventListener('keydown', tasti, true);
      velo.remove();
      try {
        if (primaFocus && primaFocus.focus) primaFocus.focus();
      } catch (e) {}
      risolvi(esito);
    };
    const conferma = () => {
      const v = Object.fromEntries(leggi.map((f) => f()));
      // controllo facoltativo: restituisce il testo dell errore o ''
      const err = opz.controlla ? opz.controlla(v) : '';
      if (err) {
        errore.textContent = err;
        return;
      }
      chiudi(v);
    };
    const tasti = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        chiudi(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        conferma();
      } else if (e.key === 'Tab') {
        const el = [...velo.querySelectorAll('input,button')];
        const i = el.indexOf(document.activeElement);
        e.preventDefault();
        el[(i + (e.shiftKey ? -1 : 1) + el.length) % el.length].focus();
      }
    };
    bOk.addEventListener('click', conferma);
    bNo.addEventListener('click', () => chiudi(null));
    document.addEventListener('keydown', tasti, true);
    document.body.appendChild(velo);
    const primo = velo.querySelector('input[type="text"]') || bOk;
    primo.focus();
  });
}
