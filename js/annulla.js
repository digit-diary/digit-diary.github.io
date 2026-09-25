/**
 * Diario Collaboratori · Casino Lugano SA
 * File: annulla.js
 *
 * ANNULLA / RIPRISTINA generale (come nel calendario del Piano, ma per tutto
 * il programma). Ogni scrittura che passa dal canale sicuro (secPatch,
 * secPost, secDel, setImp) viene annotata in un diario della sessione con
 * com'era la riga PRIMA e com'e DOPO. Le scritture nate da una stessa azione
 * (es. una malattia che tocca dieci righe) formano un GRUPPO: il gruppo si
 * chiude quando l'azione scrive nel registro (logAzione) oppure dopo due
 * secondi di quiete. Annulla = si torna indietro di un gruppo intero.
 *
 * Regole (sono quelle che rendono la cosa sicura):
 *  - vale per la sessione corrente e per chi ha fatto la modifica;
 *  - se nel frattempo un altro operatore ha toccato la stessa riga, si avvisa
 *    e non si sovrascrive;
 *  - un documento creato (modulo, registrazione) annullato va nel Cestino,
 *    non sparisce;
 *  - ogni annullamento e a sua volta un'azione nel registro;
 *  - la griglia del Piano (tabella piano) e il briefing hanno il loro Annulla
 *    e restano fuori; le chat e il registro non si annullano.
 *
 * La parte di logica e una fabbrica pura (creaAnnulla) che riceve il canale
 * dati come parametro: cosi si prova con Node (test/annulla.test.js).
 */
(function (root) {
  const TRACCIATE = [
    'registrazioni',
    'note_fissate',
    'scadenze',
    'collaboratori',
    'moduli',
    'costi_maison',
    'maison_budget',
    'promemoria',
    'consegne_turno',
    'spese_extra',
    'regali_maison',
    'note_clienti',
    'rapporti_giornalieri',
    'inventario',
    'valutazioni',
    'punti_eventi',
    'hr_eventi',
    'hr_allegati',
    'piano_turni',
    'piano_codici',
    'piano_fabbisogni',
    'piano_regole',
    'piano_regole_gruppo',
    'piano_festivi',
    'piano_festivita',
    'piano_timbrature',
    'piano_mappature',
    'piano_vacanze',
    'piano_formulari',
    'piano_recupero_ore',
    'piano_saldo_iniziale',
    'piano_cgf_riporto',
    'piano_ore_mese',
    'collab_congedi_np',
  ];
  // tabelle con il Cestino: una creazione annullata finisce li
  const CON_CESTINO = ['registrazioni', 'moduli'];
  const PAROLE = {
    registrazioni: 'registrazione',
    note_fissate: 'nota fissata',
    scadenze: 'scadenza',
    collaboratori: 'scheda collaboratore',
    moduli: 'modulo',
    costi_maison: 'costo Maison',
    maison_budget: 'budget Maison',
    promemoria: 'promemoria',
    consegne_turno: 'consegna turno',
    spese_extra: 'spesa extra',
    regali_maison: 'regalo Maison',
    note_clienti: 'nota cliente',
    rapporti_giornalieri: 'rapporto giornaliero',
    inventario: 'inventario',
    valutazioni: 'valutazione',
    punti_eventi: 'punti',
    hr_eventi: 'storico HR',
    hr_allegati: 'allegato HR',
    piano_turni: 'turno',
    piano_codici: 'codice del piano',
    piano_fabbisogni: 'fabbisogno',
    piano_regole: 'regola del piano',
    piano_regole_gruppo: 'regola di gruppo',
    piano_festivi: 'festivo',
    piano_festivita: 'festivita',
    piano_timbrature: 'timbratura',
    piano_mappature: 'mappatura',
    piano_vacanze: 'vacanza',
    piano_formulari: 'formulario',
    piano_recupero_ore: 'recupero ore',
    piano_saldo_iniziale: 'riporto ore',
    piano_cgf_riporto: 'riporto CGF',
    piano_ore_mese: 'ore reali del mese',
    collab_congedi_np: 'congedo non pagato',
    impostazioni: 'impostazione',
  };
  const copia = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const uguale = (a, b) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return String(a || '') === String(b || '');
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return String(a) === String(b);
  };

  // canale = { leggi(query), patch(tabella, filtro, dati), post(tabella, riga), del(tabella, filtro),
  //            imp(chiave, valore), adesso(), operatore(), attesa(ms, fn) -> id, annullaAttesa(id) }
  function creaAnnulla(canale, opzioni) {
    const opz = Object.assign({ limite: 30, quiete: 2000 }, opzioni || {});
    const st = { pila: [], redo: [], pendenti: [], inCorso: false, timer: null, ascoltatori: [] };
    const tracciata = (t) => TRACCIATE.indexOf(t) >= 0;
    const notifica = () =>
      st.ascoltatori.forEach((f) => {
        try {
          f(stato());
        } catch (e) {}
      });
    const parola = (t) => PAROLE[t] || t;

    function etichettaAuto() {
      const op = st.pendenti[0];
      if (!op) return 'Modifica';
      const t = op.tipo === 'imp' ? 'impostazioni' : op.table;
      const verbo = op.tipo === 'post' ? 'Nuovo' : op.tipo === 'del' ? 'Eliminazione' : 'Modifica';
      return verbo + ' ' + parola(t) + (st.pendenti.length > 1 ? ' (+' + (st.pendenti.length - 1) + ')' : '');
    }
    function armaTimer() {
      if (st.timer != null) canale.annullaAttesa(st.timer);
      st.timer = canale.attesa(opz.quiete, () => chiudiGruppo());
    }
    function aggiungi(op) {
      if (!op) return;
      st.pendenti.push(op);
      st.redo = [];
      armaTimer();
      notifica();
    }
    // ---- annotazioni chiamate dal canale sicuro ----
    async function primaDiPatch(table, filter, data) {
      if (st.inCorso || !tracciata(table) || !filter) return null;
      let prima;
      try {
        prima = await canale.leggi(table + '?' + filter);
      } catch (e) {
        return null;
      }
      if (!prima || !prima.length) return null;
      if (prima.some((r) => r.id == null)) return null;
      return { tipo: 'patch', table: table, prima: copia(prima), dati: copia(data) };
    }
    async function primaDiDel(table, filter) {
      if (st.inCorso || !tracciata(table) || !filter) return null;
      let righe;
      try {
        righe = await canale.leggi(table + '?' + filter);
      } catch (e) {
        return null;
      }
      if (!righe || !righe.length || righe.some((r) => r.id == null)) return null;
      return { tipo: 'del', table: table, righe: copia(righe) };
    }
    function conferma(op) {
      aggiungi(op);
    }
    function dopoPost(table, righe) {
      if (st.inCorso || !tracciata(table)) return;
      const ok = (righe || []).filter((r) => r && r.id != null);
      if (!ok.length) return;
      aggiungi({ tipo: 'post', table: table, righe: copia(ok) });
    }
    async function primaDiImp(chiave) {
      if (st.inCorso) return null;
      try {
        const v = await canale.leggiImp(chiave);
        return { chiave: chiave, prima: v == null ? null : String(v) };
      } catch (e) {
        return null;
      }
    }
    function dopoImp(pre, chiave, valore) {
      if (st.inCorso) return;
      const prima = pre && pre.chiave === chiave ? pre.prima : null;
      if (uguale(prima, valore)) return;
      aggiungi({ tipo: 'imp', chiave: chiave, prima: prima, dopo: valore == null ? '' : String(valore) });
    }
    function chiudiGruppo(etichetta) {
      if (st.inCorso) return;
      if (st.timer != null) {
        canale.annullaAttesa(st.timer);
        st.timer = null;
      }
      if (!st.pendenti.length) return;
      st.pila.push({ etichetta: etichetta || etichettaAuto(), ops: st.pendenti, quando: canale.adesso() });
      st.pendenti = [];
      while (st.pila.length > opz.limite) st.pila.shift();
      notifica();
    }
    // ---- inversione e riapplicazione ----
    async function controllaConflitto(table, id, attesi) {
      const cur = (await canale.leggi(table + '?id=eq.' + id))[0];
      if (!cur) throw new Error('La riga ' + parola(table) + ' non esiste piu');
      Object.keys(attesi).forEach((k) => {
        if (!uguale(cur[k], attesi[k]))
          throw new Error(
            'Nel frattempo ' +
              parola(table) +
              ' e stata modificata da qualcun altro: annullamento fermato per non sovrascrivere',
          );
      });
    }
    async function inverti(op) {
      if (op.tipo === 'patch') {
        for (const r of op.prima) {
          await controllaConflitto(op.table, r.id, op.dati);
          const indietro = {};
          Object.keys(op.dati).forEach((k) => (indietro[k] = r[k] === undefined ? null : r[k]));
          await canale.patch(op.table, 'id=eq.' + r.id, indietro);
        }
      } else if (op.tipo === 'post') {
        for (const r of op.righe) {
          if (CON_CESTINO.indexOf(op.table) >= 0 && 'eliminato' in r)
            await canale.patch(op.table, 'id=eq.' + r.id, {
              eliminato: true,
              eliminato_da: canale.operatore(),
              eliminato_at: canale.adesso(),
            });
          else await canale.del(op.table, 'id=eq.' + r.id);
        }
      } else if (op.tipo === 'del') {
        for (const r of op.righe) await canale.post(op.table, r);
      } else if (op.tipo === 'imp') {
        await canale.imp(op.chiave, op.prima == null ? '' : op.prima);
      }
    }
    async function riapplica(op) {
      if (op.tipo === 'patch') {
        for (const r of op.prima) {
          const attesi = {};
          Object.keys(op.dati).forEach((k) => (attesi[k] = r[k] === undefined ? null : r[k]));
          await controllaConflitto(op.table, r.id, attesi);
          await canale.patch(op.table, 'id=eq.' + r.id, op.dati);
        }
      } else if (op.tipo === 'post') {
        for (const r of op.righe) {
          if (CON_CESTINO.indexOf(op.table) >= 0 && 'eliminato' in r)
            await canale.patch(op.table, 'id=eq.' + r.id, { eliminato: false, eliminato_da: null, eliminato_at: null });
          else await canale.post(op.table, r);
        }
      } else if (op.tipo === 'del') {
        for (const r of op.righe) await canale.del(op.table, 'id=eq.' + r.id);
      } else if (op.tipo === 'imp') {
        await canale.imp(op.chiave, op.dopo);
      }
    }
    async function annulla() {
      chiudiGruppo();
      const g = st.pila.pop();
      if (!g) return null;
      st.inCorso = true;
      try {
        for (let i = g.ops.length - 1; i >= 0; i--) await inverti(g.ops[i]);
      } catch (e) {
        st.pila.push(g);
        throw e;
      } finally {
        st.inCorso = false;
      }
      st.redo.push(g);
      notifica();
      return g;
    }
    async function ripristina() {
      chiudiGruppo();
      const g = st.redo.pop();
      if (!g) return null;
      st.inCorso = true;
      try {
        for (let i = 0; i < g.ops.length; i++) await riapplica(g.ops[i]);
      } catch (e) {
        st.redo.push(g);
        throw e;
      } finally {
        st.inCorso = false;
      }
      st.pila.push(g);
      notifica();
      return g;
    }
    function stato() {
      const pend = st.pendenti.length ? 1 : 0;
      return {
        annulla: st.pila.length + pend,
        ripristina: st.redo.length,
        ultima: st.pendenti.length ? etichettaAuto() : st.pila.length ? st.pila[st.pila.length - 1].etichetta : '',
        prossima: st.redo.length ? st.redo[st.redo.length - 1].etichetta : '',
        inCorso: st.inCorso,
      };
    }
    function onCambio(f) {
      st.ascoltatori.push(f);
    }
    function azzera() {
      st.pila = [];
      st.redo = [];
      st.pendenti = [];
      notifica();
    }
    return {
      primaDiPatch,
      primaDiDel,
      conferma,
      dopoPost,
      primaDiImp,
      dopoImp,
      chiudiGruppo,
      annulla,
      ripristina,
      stato,
      onCambio,
      azzera,
      tracciata,
      inCorso: () => st.inCorso,
    };
  }

  root.creaAnnulla = creaAnnulla;
  root.ANNULLA_TABELLE = TRACCIATE;
  if (typeof module !== 'undefined' && module.exports) module.exports = { creaAnnulla, TRACCIATE, PAROLE };
})(typeof window !== 'undefined' ? window : globalThis);

// ---------------- parte per il browser ----------------
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.Annulla = window.creaAnnulla({
    leggi: (q) => secGet(q),
    leggiImp: (k) => getImp(k),
    patch: (t, f, d) => secPatch(t, f, d),
    post: (t, r) => secPost(t, r),
    del: (t, f) => secDel(t, f),
    imp: (k, v) => setImp(k, v),
    adesso: () => new Date().toISOString(),
    operatore: () => (typeof getOperatore === 'function' && getOperatore()) || 'Admin',
    attesa: (ms, fn) => setTimeout(fn, ms),
    annullaAttesa: (id) => clearTimeout(id),
  });
  function _annullaAggiornaBarra() {
    const bar = document.getElementById('annulla-bar');
    if (!bar) return;
    const s = window.Annulla.stato();
    bar.style.display = s.annulla || s.ripristina ? 'flex' : 'none';
    const bA = document.getElementById('annulla-btn');
    const bR = document.getElementById('ripristina-btn');
    if (bA) {
      bA.disabled = !s.annulla || s.inCorso;
      bA.title = s.annulla ? 'Annulla: ' + s.ultima : 'Niente da annullare';
    }
    if (bR) {
      bR.disabled = !s.ripristina || s.inCorso;
      bR.title = s.ripristina ? 'Ripristina: ' + s.prossima : 'Niente da ripristinare';
    }
    const lbl = document.getElementById('annulla-lbl');
    if (lbl) lbl.textContent = s.annulla ? s.ultima : s.prossima ? 'Ripristina: ' + s.prossima : '';
  }
  window.Annulla.onCambio(_annullaAggiornaBarra);
  // dopo un annullamento i dati in memoria vanno riletti e la pagina ridisegnata
  async function _annullaRicarica(g) {
    const tab = new Set((g.ops || []).map((o) => (o.tipo === 'imp' ? 'impostazioni' : o.table)));
    if (typeof loadAll === 'function') await loadAll();
    const toccaPiano = [...tab].some((t) => /^piano_|^collab_congedi/.test(t));
    if (toccaPiano && typeof _pianoCaricaCfg === 'function') await _pianoCaricaCfg();
    const pg = localStorage.getItem('pagina_corrente') || 'dashboard';
    if (typeof switchPage === 'function') switchPage(pg);
    if (pg === 'piano' && typeof renderPiano === 'function') renderPiano();
    if (pg === 'impostazioni' && typeof _settingsAggiornaIndice === 'function') _settingsAggiornaIndice();
  }
  async function annullaGlobale() {
    const s = window.Annulla.stato();
    if (!s.annulla || s.inCorso) return;
    if (!confirm('Annullare: ' + s.ultima + '?')) return;
    try {
      const g = await window.Annulla.annulla();
      if (!g) return;
      if (typeof logAzione === 'function') logAzione('Annullata azione', g.etichetta);
      await _annullaRicarica(g);
      toast('Annullato: ' + g.etichetta);
    } catch (e) {
      toastErrore(e.message || 'Annullamento non riuscito');
      _annullaAggiornaBarra();
    }
  }
  async function ripristinaGlobale() {
    const s = window.Annulla.stato();
    if (!s.ripristina || s.inCorso) return;
    try {
      const g = await window.Annulla.ripristina();
      if (!g) return;
      if (typeof logAzione === 'function') logAzione('Ripristinata azione', g.etichetta);
      await _annullaRicarica(g);
      toast('Ripristinato: ' + g.etichetta);
    } catch (e) {
      toastErrore(e.message || 'Ripristino non riuscito');
      _annullaAggiornaBarra();
    }
  }
  // Ctrl+Z / Ctrl+Y fuori dai campi di testo (nel calendario del Piano vale il suo Annulla)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    const pg = localStorage.getItem('pagina_corrente') || '';
    if (pg === 'piano' && typeof _pianoTab !== 'undefined' && _pianoTab === 'calendario') return;
    const k = String(e.key || '').toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      annullaGlobale();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      ripristinaGlobale();
    }
  });
}
