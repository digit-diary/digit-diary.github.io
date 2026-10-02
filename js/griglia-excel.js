/**
 * Diario Collaboratori · Casino Lugano SA
 * File: griglia-excel.js
 *
 * TABELLE CON CELLE MODIFICABILI CHE SI USANO COME EXCEL (briefing, pause).
 * Le celle sono <td data-ge="chiave"> con dentro un <input>.
 *  - clic: seleziona la cella (manina, nessuna modifica);
 *  - doppio clic, Invio o F2: modifica (cursore alla fine);
 *  - scrivere su una cella selezionata: il testo la sostituisce;
 *  - frecce: si spostano tra le celle (su/giu nella stessa colonna, saltando le
 *    righe senza campi); in modifica su/giu, Invio e Tab confermano e spostano,
 *    destra/sinistra spostano solo se la modifica e partita scrivendo;
 *  - Canc: svuota la cella; Esc: annulla la modifica in corso;
 *  - trascinamento (mouse o dito): dalla maniglia della riga (td[data-ge-maniglia])
 *    si sposta la riga intera; da una cella gia selezionata la si scambia con
 *    un altra cella della stessa colonna.
 * Il salvataggio resta quello della tabella: gli eventi input/change del campo.
 * La cella attiva si ricorda per chiave, cosi sopravvive al ridisegno.
 */
const GrigliaExcel = (function () {
  'use strict';
  const stato = {}; // id tabella -> { chiave, t }

  function inputDi(td) {
    const i = td && td.querySelector('input');
    return i && !i.disabled ? i : null;
  }
  function cellaDi(el) {
    const td = el && el.closest ? el.closest('td[data-ge]') : null;
    return td && inputDi(td) ? td : null;
  }
  // la cella sotto (o sopra): la riga vicina con una cella che occupa la stessa x
  function vicinaVerticale(td, dir) {
    const r = td.getBoundingClientRect();
    const x = r.left + r.width / 2;
    let tr = td.parentElement;
    for (;;) {
      tr = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling;
      if (!tr) return null;
      const celle = [...tr.querySelectorAll('td[data-ge]')].filter(inputDi);
      const c = celle.find((t) => {
        const q = t.getBoundingClientRect();
        return x >= q.left && x <= q.right;
      });
      if (c) return c;
    }
  }
  function vicinaOrizzontale(td, dir) {
    let t = td;
    for (;;) {
      t = dir > 0 ? t.nextElementSibling : t.previousElementSibling;
      if (!t) return null;
      if (t.matches && t.matches('td[data-ge]') && inputDi(t)) return t;
    }
  }
  // SELEZIONE DI PIU CELLE (rettangolo tra la cella di partenza e quella di arrivo,
  // per posizione sullo schermo: vale anche per tabelle con colonne unite)
  // cella del foglio (anche intestazione o colonna senza campo); non le colonne dei
  // comandi (+, x) e gli spazi senza bordo
  function cellaFoglio(el, table) {
    const c = el && el.closest ? el.closest('th, td') : null;
    if (!c || c.closest('table') !== table || c.classList.contains('pb-maniglia')) return null;
    const st = getComputedStyle(c);
    if (!c.dataset.ge && st.borderTopStyle === 'none' && st.borderLeftStyle === 'none') return null;
    return c;
  }
  // tutte = anche intestazioni e celle senza campo (per evidenziare e copiare);
  // altrimenti solo le celle modificabili (per scrivere, incollare, svuotare)
  function celleRange(table, tutte) {
    const a = table._geAncora;
    const b = table._geFine;
    if (!a || !b || !document.body.contains(a) || !document.body.contains(b)) return [];
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x1 = Math.min(ra.left, rb.left) - 1;
    const x2 = Math.max(ra.right, rb.right) + 1;
    const y1 = Math.min(ra.top, rb.top) - 1;
    const y2 = Math.max(ra.bottom, rb.bottom) + 1;
    const candidate = tutte
      ? [...table.querySelectorAll('th, td')].filter((c) => cellaFoglio(c, table) === c)
      : [...table.querySelectorAll('td[data-ge]')].filter((c) => inputDi(c));
    return candidate.filter((td) => {
      const r = td.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
    });
  }
  function evidenziaRange(table) {
    table.querySelectorAll('.ge-sel').forEach((x) => x.classList.remove('ge-sel'));
    const tutte = celleRange(table, true);
    if (tutte.length > 1) tutte.forEach((td) => td.classList.add('ge-sel'));
    const l = celleRange(table);
    if (table._geOpz && table._geOpz.selezione)
      table._geOpz.selezione(l.length ? l : table._geAncora ? [table._geAncora] : []);
    return l;
  }
  // celle raggruppate per riga (dall alto), ognuna da sinistra
  function perRighe(celle) {
    const righe = new Map();
    celle.forEach((td) => {
      const tr = td.parentElement;
      if (!righe.has(tr)) righe.set(tr, []);
      righe.get(tr).push(td);
    });
    return [...righe.entries()]
      .sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top)
      .map(([, l]) => l.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left));
  }
  const testoCella = (c) => {
    const i = c.querySelector('input');
    return String(i ? i.value : c.innerText || '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  // colore di fondo vero di una cella (trasparente = bianco del foglio) e testo leggibile
  const coloriCella = (c) => {
    const st = getComputedStyle(c);
    let bg = st.backgroundColor;
    if (!bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) bg = '#ffffff';
    const sorg = c.querySelector('input') || c;
    let fg = getComputedStyle(sorg).color;
    const lum = (col) => {
      const m = String(col).match(/\d+/g);
      if (!m) return 0;
      return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    };
    // tema scuro: testo chiaro su fondo bianco diventerebbe illeggibile
    if (lum(bg === '#ffffff' ? 'rgb(255,255,255)' : bg) > 0.55 && lum(fg) > 0.6) fg = '#14100a';
    return { bg: bg, fg: fg, st: getComputedStyle(sorg) };
  };
  function celleDaCopiare(table) {
    const l = celleRange(table, true);
    return l.length ? l : table._geAncora ? [table._geAncora] : [];
  }
  function testoTabella(celle) {
    return perRighe(celle)
      .map((r) => r.map(testoCella).join('\t'))
      .join('\n');
  }
  // tabella con colori e bordi: incollata in un email si vede come il foglio (come Excel)
  function htmlTabella(celle) {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let h = '<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px">';
    perRighe(celle).forEach((r) => {
      h += '<tr>';
      r.forEach((c) => {
        const { bg, fg, st } = coloriCella(c);
        const span = c.colSpan > 1 ? ' colspan="' + c.colSpan + '"' : '';
        h +=
          '<td' +
          span +
          ' style="border:1px solid #999;padding:3px 8px;background:' +
          bg +
          ';color:' +
          fg +
          ';font-weight:' +
          st.fontWeight +
          ';font-style:' +
          st.fontStyle +
          ';text-align:' +
          (st.textAlign === 'center' ? 'center' : 'left') +
          ';white-space:nowrap">' +
          esc(testoCella(c)) +
          '</td>';
      });
      h += '</tr>';
    });
    return h + '</table>';
  }
  // IMMAGINE della selezione (come "Copia come immagine" di Excel): disegnata cella per
  // cella con i suoi colori, bordi e testo, a doppia risoluzione per l email
  function immagineTabella(celle) {
    const rects = celle.map((c) => c.getBoundingClientRect());
    const x0 = Math.min(...rects.map((r) => r.left));
    const y0 = Math.min(...rects.map((r) => r.top));
    const x1 = Math.max(...rects.map((r) => r.right));
    const y1 = Math.max(...rects.map((r) => r.bottom));
    const sc = 2;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * sc) + 2;
    cv.height = Math.ceil((y1 - y0) * sc) + 2;
    const g = cv.getContext('2d');
    g.scale(sc, sc);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, x1 - x0 + 1, y1 - y0 + 1);
    celle.forEach((c, k) => {
      const r = rects[k];
      const x = r.left - x0;
      const y = r.top - y0;
      const { bg, fg, st } = coloriCella(c);
      g.fillStyle = bg;
      g.fillRect(x, y, r.width, r.height);
      g.strokeStyle = '#999';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, r.width - 1, r.height - 1);
      const t = testoCella(c);
      if (!t) return;
      g.save();
      g.beginPath();
      g.rect(x + 1, y + 1, r.width - 2, r.height - 2);
      g.clip();
      g.fillStyle = fg;
      g.font = st.fontStyle + ' ' + st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
      g.textBaseline = 'middle';
      const centro = st.textAlign === 'center' || c.tagName === 'TH';
      g.textAlign = centro ? 'center' : 'left';
      g.fillText(t, centro ? x + r.width / 2 : x + 6, y + r.height / 2 + 0.5);
      g.restore();
    });
    return new Promise((ok) => cv.toBlob(ok, 'image/png'));
  }
  async function copiaNegliAppunti(table, comeImmagine) {
    const celle = celleDaCopiare(table);
    if (!celle.length) return;
    const testo = testoTabella(celle);
    const html = htmlTabella(celle);
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('appunti non disponibili');
      const dati = comeImmagine
        ? { 'image/png': immagineTabella(celle) }
        : {
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([testo], { type: 'text/plain' }),
          };
      await navigator.clipboard.write([new ClipboardItem(dati)]);
      if (typeof toast === 'function')
        toast(
          comeImmagine
            ? 'Copiata come immagine: incollala nell email'
            : 'Copiato: si incolla come tabella (anche in un email o in Excel)',
        );
    } catch (e) {
      // browser o indirizzo senza accesso agli appunti (es. server interno in http)
      if (comeImmagine) {
        const blob = await immagineTabella(celle);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'selezione.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        if (typeof toast === 'function')
          toast('Gli appunti non sono disponibili qui: immagine salvata come file (selezione.png)');
      } else {
        table._geCopiaForzata = true;
        table.focus({ preventScroll: true });
        document.execCommand('copy');
        table._geCopiaForzata = false;
        if (typeof toast === 'function') toast('Copiato');
      }
    }
  }
  // MENU DEL TASTO DESTRO sulla selezione
  function chiudiMenu() {
    const m = document.getElementById('ge-ctx');
    if (m) m.remove();
  }
  function apriMenu(table, x, y) {
    chiudiMenu();
    const modificabili = celleRange(table).length || (table._geAncora && inputDi(table._geAncora)) ? true : false;
    const m = document.createElement('div');
    m.id = 'ge-ctx';
    const voce = (testo, tasto, fn) => {
      const d = document.createElement('div');
      d.className = 'piano-ctx-item';
      d.innerHTML = testo + (tasto ? '<span class="ge-ctx-tasto">' + tasto + '</span>' : '');
      d.addEventListener('click', () => {
        chiudiMenu();
        fn();
      });
      m.appendChild(d);
    };
    const mac = /Mac/i.test(navigator.platform || '');
    const k = (l) => (mac ? 'Cmd+' : 'Ctrl+') + l;
    voce('Copia', k('C'), () => copiaNegliAppunti(table, false));
    voce('Copia come immagine', '', () => copiaNegliAppunti(table, true));
    if (modificabili) {
      voce('Taglia', k('X'), () => {
        copiaNegliAppunti(table, false).then(() => svuotaSelezione(table));
      });
      voce('Incolla', k('V'), async () => {
        try {
          const t = await navigator.clipboard.readText();
          incollaTesto(table, t);
        } catch (e) {
          if (typeof toast === 'function')
            toast('Per incollare usa ' + k('V') + ' (il browser non permette di leggere gli appunti da qui)');
        }
      });
      voce('Cancella contenuto', 'Canc', () => svuotaSelezione(table));
    }
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }
  function svuotaSelezione(table) {
    const l = celleRange(table);
    const celle = l.length ? l : table._geAncora && inputDi(table._geAncora) ? [table._geAncora] : [];
    scriviCelle(
      table,
      celle.map((x) => ({ td: x, val: '' })),
    );
  }
  // incolla testo a tabulazioni dall angolo in alto a sinistra della selezione
  function incollaTesto(table, testoIn) {
    const sel = celleRange(table);
    const td = sel.length ? perRighe(sel)[0][0] : table._geAncora && inputDi(table._geAncora) ? table._geAncora : null;
    if (!td) return;
    const testo = String(testoIn || '').replace(/\r/g, '');
    const righe = testo.split('\n');
    if (righe.length > 1 && righe[righe.length - 1] === '') righe.pop();
    const dati = righe.map((r) => r.split('\t'));
    let lista = [];
    if (dati.length === 1 && dati[0].length === 1 && sel.length > 1) {
      lista = sel.map((x) => ({ td: x, val: dati[0][0] }));
    } else {
      let partenza = td;
      dati.forEach((riga, i) => {
        if (i > 0) partenza = partenza ? vicinaVerticale(partenza, 1) : null;
        let cur = partenza;
        riga.forEach((val, j) => {
          if (j > 0) cur = cur ? vicinaOrizzontale(cur, 1) : null;
          if (cur) lista.push({ td: cur, val: val.trim() });
        });
      });
    }
    scriviCelle(table, lista);
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('#ge-ctx')) chiudiMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') chiudiMenu();
  });
  window.addEventListener('scroll', chiudiMenu, true);
  // scrive piu celle in una volta: con opz.scrivi la tabella salva e ridisegna una
  // volta sola; altrimenti cella per cella con gli eventi del campo
  function scriviCelle(table, lista) {
    if (!lista.length) return;
    const opz = table._geOpz || {};
    if (opz.scrivi) return opz.scrivi(lista);
    lista.forEach(({ td, val }) => {
      const inp = inputDi(td);
      if (!inp || inp.value === val) return;
      inp.value = val;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function attiva(td, id) {
    const tab = td.closest('table');
    tab.querySelectorAll('td.ge-attiva').forEach((x) => x !== td && x.classList.remove('ge-attiva'));
    td.classList.add('ge-attiva');
    stato[id] = { chiave: td.dataset.ge, t: Date.now() };
  }
  function seleziona(td, id, tieniRange) {
    const inp = inputDi(td);
    if (!inp) return;
    fineModifica(inp, false);
    const tab = td.closest('table');
    if (!tieniRange && tab) {
      tab._geAncora = td;
      tab._geFine = td;
      evidenziaRange(tab);
    }
    attiva(td, id);
    inp.readOnly = true;
    if (document.activeElement !== inp) inp.focus({ preventScroll: true });
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function iniziaModifica(inp, testo) {
    inp._geOriginale = inp.value;
    inp._geDigitato = testo != null;
    inp.readOnly = false;
    inp.closest('td').classList.add('ge-modifica');
    if (testo != null) {
      inp.value = testo;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const n = inp.value.length;
    try {
      inp.setSelectionRange(n, n);
    } catch (e) {}
  }
  // chiude la modifica; con annulla rimette il valore di prima. Se il valore e
  // cambiato il campo perde il focus: cosi il browser manda il suo "change" una
  // volta sola (le tabelle che salvano su change, come le pause). Ritorna true se
  // e cambiato (la tabella puo essersi ridisegnata).
  function fineModifica(inp, annulla) {
    if (!inp || inp.readOnly) return false;
    if (annulla && inp._geOriginale != null && inp.value !== inp._geOriginale) {
      inp.value = inp._geOriginale;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const cambiato = inp._geOriginale != null && inp.value !== inp._geOriginale;
    inp.readOnly = true;
    inp._geOriginale = null;
    const td = inp.closest('td');
    if (td) td.classList.remove('ge-modifica');
    if (cambiato && document.activeElement === inp) inp.blur();
    return cambiato;
  }

  function collega(table, opz) {
    if (!table || table._geCollegata) return;
    table._geCollegata = true;
    table._geOpz = opz;
    table.tabIndex = -1; // riceve Ctrl+C quando la selezione parte da un intestazione
    const id = opz.id;
    table.classList.add('ge-tabella');
    table.querySelectorAll('td[data-ge]').forEach((td) => {
      const inp = inputDi(td);
      if (inp) {
        inp.readOnly = true;
        inp.classList.add('ge-input');
      }
    });
    table.querySelectorAll('td[data-ge-maniglia]').forEach((td) => {
      td.title = td.title || 'Trascina per spostare la riga';
    });

    table.addEventListener('focusin', (e) => {
      const td = cellaDi(e.target);
      if (td) attiva(td, id);
    });
    table.addEventListener('dblclick', (e) => {
      const td = cellaDi(e.target);
      if (!td) return;
      const inp = inputDi(td);
      if (inp.readOnly) iniziaModifica(inp);
    });
    table.addEventListener('focusout', (e) => {
      const inp = e.target;
      if (inp && inp.classList && inp.classList.contains('ge-input')) fineModifica(inp, false);
    });
    table.addEventListener('keydown', (e) => {
      const td = cellaDi(e.target);
      if (!td) return;
      const inp = inputDi(td);
      const vai = (dest) => {
        if (dest) seleziona(dest, id);
      };
      if (inp.readOnly) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const m = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }[e.key];
        if (m && e.shiftKey) {
          // Maiusc + frecce: allarga la selezione (la cella attiva resta quella di partenza)
          e.preventDefault();
          const base = table._geFine && document.body.contains(table._geFine) ? table._geFine : td;
          const dest = m[1] ? vicinaVerticale(base, m[1]) : vicinaOrizzontale(base, m[0]);
          if (dest) {
            if (!table._geAncora || !document.body.contains(table._geAncora)) table._geAncora = td;
            table._geFine = dest;
            evidenziaRange(table);
            dest.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        } else if (m) {
          e.preventDefault();
          vai(m[1] ? vicinaVerticale(td, m[1]) : vicinaOrizzontale(td, m[0]));
        } else if (e.key === 'Tab') {
          e.preventDefault();
          vai(vicinaOrizzontale(td, e.shiftKey ? -1 : 1));
        } else if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          iniziaModifica(inp);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && celleRange(table).length > 1) {
          e.preventDefault();
          stato[id] = { chiave: td.dataset.ge, t: Date.now() };
          scriviCelle(
            table,
            celleRange(table).map((x) => ({ td: x, val: '' })),
          );
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (inp.value === '') return;
          iniziaModifica(inp, '');
          stato[id] = { chiave: td.dataset.ge, t: Date.now() };
          fineModifica(inp, false);
          if (document.body.contains(td)) seleziona(td, id);
          else ripristina(id);
        } else if (e.key.length === 1) {
          e.preventDefault();
          iniziaModifica(inp, e.key);
        }
        return;
      }
      // in modifica
      let m = null;
      if (e.key === 'Enter') m = [0, e.shiftKey ? -1 : 1];
      else if (e.key === 'Tab') m = [e.shiftKey ? -1 : 1, 0];
      else if (e.key === 'ArrowDown') m = [0, 1];
      else if (e.key === 'ArrowUp') m = [0, -1];
      else if (inp._geDigitato && e.key === 'ArrowRight') m = [1, 0];
      else if (inp._geDigitato && e.key === 'ArrowLeft') m = [-1, 0];
      if (m) {
        e.preventDefault();
        const dest = m[1] ? vicinaVerticale(td, m[1]) : vicinaOrizzontale(td, m[0]);
        fineModifica(inp, false);
        // la tabella puo essersi ridisegnata col salvataggio: si riparte dalla chiave
        const d = dest && document.body.contains(dest) ? dest : null;
        if (d) seleziona(d, id);
        else if (dest) {
          stato[id] = { chiave: dest.dataset.ge, t: Date.now() };
          ripristina(id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        fineModifica(inp, true);
        if (document.body.contains(td)) seleziona(td, id);
      }
    });

    // COPIA / TAGLIA / INCOLLA (Ctrl o Cmd + C, X, V) come Excel: testo con le
    // colonne separate da tabulazione, quindi si scambia anche con Excel
    const inSelezione = (e) => {
      const td = cellaDi(e.target);
      const inp = td && inputDi(td);
      return td && inp && inp.readOnly ? td : null;
    };
    table.addEventListener('copy', (e) => {
      // dalla cella selezionata oppure dalla tabella (selezione partita da un intestazione)
      if (!inSelezione(e) && e.target !== table && !table._geCopiaForzata) return;
      e.preventDefault();
      const celle = celleDaCopiare(table);
      e.clipboardData.setData('text/plain', testoTabella(celle));
      e.clipboardData.setData('text/html', htmlTabella(celle));
    });
    table.addEventListener('contextmenu', (e) => {
      const c = cellaFoglio(e.target, table);
      if (!c) return;
      e.preventDefault();
      const dentro = c.classList.contains('ge-sel') || c === table._geAncora;
      if (!dentro) {
        if (c.dataset.ge && inputDi(c)) seleziona(c, id);
        else {
          table._geAncora = c;
          table._geFine = c;
          evidenziaRange(table);
          c.classList.add('ge-sel');
        }
      }
      apriMenu(table, e.clientX, e.clientY);
    });
    table.addEventListener('cut', (e) => {
      if (!inSelezione(e)) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', testoTabella(celleDaCopiare(table)));
      e.clipboardData.setData('text/html', htmlTabella(celleDaCopiare(table)));
      const l = celleRange(table);
      scriviCelle(
        table,
        (l.length ? l : [table._geAncora]).filter(Boolean).map((x) => ({ td: x, val: '' })),
      );
    });
    table.addEventListener('paste', (e) => {
      const td = inSelezione(e);
      if (!td) return;
      e.preventDefault();
      stato[id] = { chiave: td.dataset.ge, t: Date.now() };
      incollaTesto(table, e.clipboardData.getData('text/plain') || '');
    });

    // TRASCINAMENTO con mouse o dito
    let tr = null; // { tipo: 'riga'|'cella', da, x0, y0, attivo, fantasma, bersaglio }
    const pulisci = () => {
      if (!tr) return;
      if (tr.fantasma) tr.fantasma.remove();
      table.querySelectorAll('.ge-bersaglio').forEach((x) => x.classList.remove('ge-bersaglio'));
      document.body.classList.remove('ge-trascino');
      tr = null;
    };
    let area = null; // selezione a rettangolo in corso
    table.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const man = e.target.closest('td[data-ge-maniglia]');
      if (man && opz.spostaRiga) {
        tr = { tipo: 'riga', da: man.closest('tr'), x0: e.clientX, y0: e.clientY };
        e.preventDefault();
        return;
      }
      const td = cellaDi(e.target);
      if (!td) {
        // intestazione (HOST, T, CD...) o cella senza campo: parte una selezione
        const c = cellaFoglio(e.target, table);
        if (!c) return;
        e.preventDefault();
        if (e.shiftKey && table._geAncora) table._geFine = c;
        else {
          table._geAncora = c;
          table._geFine = c;
        }
        table.focus({ preventScroll: true }); // Ctrl+C arriva alla tabella
        evidenziaRange(table);
        c.classList.add('ge-sel');
        area = { pointerId: e.pointerId };
        return;
      }
      const inp = inputDi(td);
      if (!inp.readOnly) return; // in modifica: il mouse muove il cursore nel testo
      const giaAttiva = td.classList.contains('ge-attiva') && document.activeElement === inp;
      const singola = celleRange(table).length <= 1;
      if (e.shiftKey) {
        // Maiusc + clic: allarga la selezione fino a qui
        e.preventDefault();
        table._geFine = td;
        evidenziaRange(table);
        return;
      }
      if (giaAttiva && singola && opz.scambiaCelle) {
        // si trascina una cella gia selezionata: scambio con un altra cella
        tr = { tipo: 'cella', da: td, x0: e.clientX, y0: e.clientY };
        return;
      }
      // premere e trascinare: selezione di piu celle (come Excel)
      e.preventDefault();
      seleziona(td, id);
      area = { pointerId: e.pointerId };
    });
    table.addEventListener('pointermove', (e) => {
      if (!area) return;
      const sotto = document.elementFromPoint(e.clientX, e.clientY);
      const td = sotto && table.contains(sotto) ? cellaFoglio(sotto, table) : null;
      if (td && td !== table._geFine) {
        if (!area.preso) {
          area.preso = true;
          try {
            table.setPointerCapture(e.pointerId);
          } catch (x) {}
        }
        table._geFine = td;
        evidenziaRange(table);
      }
    });
    const fineArea = (e) => {
      if (!area) return;
      // il clic che segue il rilascio non deve cambiare la selezione appena fatta
      if (area.preso) table._geDopoArea = Date.now();
      area = null;
      try {
        table.releasePointerCapture(e.pointerId);
      } catch (x) {}
    };
    table.addEventListener('pointerup', fineArea);
    table.addEventListener('pointercancel', fineArea);
    table.addEventListener('pointermove', (e) => {
      if (!tr) return;
      if (!tr.attivo) {
        if (Math.abs(e.clientX - tr.x0) + Math.abs(e.clientY - tr.y0) < 7) return;
        tr.attivo = true;
        // il mouse si "prende" solo ora che il trascinamento e partito: un doppio
        // clic sulla cella selezionata resta un doppio clic (apre la modifica)
        try {
          table.setPointerCapture(e.pointerId);
        } catch (x) {}
        document.body.classList.add('ge-trascino');
        const f = document.createElement('div');
        f.className = 'ge-fantasma';
        f.textContent =
          tr.tipo === 'riga'
            ? [...tr.da.querySelectorAll('input')]
                .map((i) => i.value)
                .filter(Boolean)
                .join('  ·  ') || 'riga'
            : inputDi(tr.da).value || '(vuota)';
        document.body.appendChild(f);
        tr.fantasma = f;
      }
      e.preventDefault();
      tr.fantasma.style.left = e.clientX + 12 + 'px';
      tr.fantasma.style.top = e.clientY + 10 + 'px';
      const sotto = document.elementFromPoint(e.clientX, e.clientY);
      table.querySelectorAll('.ge-bersaglio').forEach((x) => x.classList.remove('ge-bersaglio'));
      tr.bersaglio = null;
      if (!sotto || !table.contains(sotto)) return;
      if (tr.tipo === 'riga') {
        const riga = sotto.closest('tr');
        if (riga && riga !== tr.da && riga.querySelector('td[data-ge-maniglia]')) {
          riga.classList.add('ge-bersaglio');
          tr.bersaglio = riga;
        }
      } else {
        const td = cellaDi(sotto);
        if (td && td !== tr.da && (!opz.stessaColonna || opz.stessaColonna(tr.da, td))) {
          td.classList.add('ge-bersaglio');
          tr.bersaglio = td;
        }
      }
    });
    const fine = (e) => {
      if (!tr) return;
      const t = tr;
      pulisci();
      try {
        table.releasePointerCapture(e.pointerId);
      } catch (x) {}
      if (!t.attivo || !t.bersaglio) return;
      if (t.tipo === 'riga') opz.spostaRiga(t.da, t.bersaglio);
      else opz.scambiaCelle(t.da, t.bersaglio);
    };
    table.addEventListener('pointerup', fine);
    table.addEventListener('pointercancel', () => pulisci());
  }

  // dopo un ridisegno: rimette la cella attiva se l utente ci stava lavorando
  function ripristina(id) {
    const s = stato[id];
    if (!s || Date.now() - s.t > 120000) return;
    const td = document.querySelector('td[data-ge="' + CSS.escape(s.chiave) + '"]');
    if (!td || !inputDi(td)) return;
    const att = document.activeElement;
    if (att && att !== document.body && !att.closest('.ge-tabella')) return; // l utente e altrove
    seleziona(td, id);
  }

  return { collega: collega, ripristina: ripristina, seleziona: seleziona };
})();
if (typeof window !== 'undefined') window.GrigliaExcel = GrigliaExcel;
