/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
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
 *  - la griglia del Piano (tabella piano) e il briefing (righe e pause, in
 *    piano-briefing-ui.js) hanno il loro Annulla e restano fuori; le chat e il registro non si annullano.
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
  // colonna che identifica la riga, se non e "id" (note_fissate: una riga per registrazione)
  const CHIAVI = { note_fissate: 'registrazione_id' };
  const chiave = (t) => CHIAVI[t] || 'id';
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
  // DATA E ORA: lo stesso istante arriva scritto in modi diversi (il programma scrive
  // 2026-10-03T22:12:34.567Z, il database rilegge 2026-10-04 00:12:34.567+02): si
  // confrontano gli istanti, non il testo. Prima un Elimina seguito da Annulla
  // finiva sempre in "modificata da qualcun altro". Solo date con l ora e il fuso.
  const RE_ISTANTE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;
  const istante = (v) => {
    if (typeof v !== 'string' || !RE_ISTANTE.test(v)) return NaN;
    // fuso corto del database (+02 o +0200) nella forma che ogni browser legge (+02:00)
    const t = v
      .replace(' ', 'T')
      .replace(/([+-]\d{2})$/, '$1:00')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    return Date.parse(t);
  };
  const uguale = (a, b) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return String(a || '') === String(b || '');
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    if (String(a) === String(b)) return true;
    const ta = istante(a);
    const tb = istante(b);
    if (!isNaN(ta) && !isNaN(tb)) return ta === tb;
    // numeri: 1.5 e "1.50" sono lo stesso valore (colonne numeriche rilette come testo)
    if ((typeof a === 'number' || typeof b === 'number') && String(a).trim() !== '' && String(b).trim() !== '')
      return Number(a) === Number(b);
    return false;
  };

  // canale = { leggi(query), patch(tabella, filtro, dati), post(tabella, riga), del(tabella, filtro),
  //            imp(chiave, valore), adesso(), operatore(), attesa(ms, fn) -> id, annullaAttesa(id) }
  function creaAnnulla(canale, opzioni) {
    const opz = Object.assign({ limite: 30, quiete: 2000 }, opzioni || {});
    const st = { pila: [], redo: [], pendenti: [], prof: 0, timer: null, ascoltatori: [] };
    // ANNULLA IN CORSO O SCRITTURE "SENZA TRACCIA": un contatore, non un si/no (15/10/2026).
    // Prima senzaTraccia salvava il valore e lo rimetteva alla fine: se si accavallava con un
    // Annulla (es. il riallineamento dei moduli ND partito durante un Annulla) rimetteva "in
    // corso" per sempre, e da li Annulla e Ripristina non facevano piu niente (pulsanti spenti).
    const occupato = () => st.prof > 0;
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
      const verbo = op.tipo === 'post' ? 'Aggiunta' : op.tipo === 'del' ? 'Eliminazione' : 'Modifica';
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
      if (occupato() || !tracciata(table) || !filter) return null;
      let prima;
      try {
        prima = await canale.leggi(table + '?' + filter);
      } catch (e) {
        return null;
      }
      if (!prima || !prima.length) return null;
      if (prima.some((r) => r[chiave(table)] == null)) return null;
      return { tipo: 'patch', table: table, prima: copia(prima), dati: copia(data) };
    }
    async function primaDiDel(table, filter) {
      if (occupato() || !tracciata(table) || !filter) return null;
      let righe;
      try {
        righe = await canale.leggi(table + '?' + filter);
      } catch (e) {
        return null;
      }
      if (!righe || !righe.length || righe.some((r) => r[chiave(table)] == null)) return null;
      return { tipo: 'del', table: table, righe: copia(righe) };
    }
    function conferma(op) {
      aggiungi(op);
    }
    function dopoPost(table, righe) {
      if (occupato() || !tracciata(table)) return;
      const ok = (righe || []).filter((r) => r && r[chiave(table)] != null);
      if (!ok.length) return;
      aggiungi({ tipo: 'post', table: table, righe: copia(ok) });
    }
    async function primaDiImp(chiave) {
      if (occupato()) return null;
      try {
        const v = await canale.leggiImp(chiave);
        return { chiave: chiave, prima: v == null ? null : String(v) };
      } catch (e) {
        return null;
      }
    }
    function dopoImp(pre, chiave, valore) {
      if (occupato()) return;
      const prima = pre && pre.chiave === chiave ? pre.prima : null;
      if (uguale(prima, valore)) return;
      aggiungi({ tipo: 'imp', chiave: chiave, prima: prima, dopo: valore == null ? '' : String(valore) });
    }
    function chiudiGruppo(etichetta) {
      if (occupato()) return;
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
      const cur = (await canale.leggi(table + '?' + chiave(table) + '=eq.' + id))[0];
      if (!cur) throw new Error('La riga ' + parola(table) + ' non esiste più');
      Object.keys(attesi).forEach((k) => {
        if (!uguale(cur[k], attesi[k]))
          throw new Error(
            'Nel frattempo ' +
              parola(table) +
              ' e stata modificata da qualcun altro: annullamento fermato per non sovrascrivere',
          );
      });
    }
    const filtroRiga = (t, r) => chiave(t) + '=eq.' + r[chiave(t)];
    // AGGIUNTE E IMPOSTAZIONI (11/10/2026): prima di toglierle o rimetterle si guarda se
    // sono ancora come le aveva lasciate l azione. Se un collega le ha cambiate si chiede
    // (canale.chiedi); senza risposta o con un no, l annullamento si ferma come per le
    // modifiche. Prima si cancellava o si riscriveva sopra la modifica del collega.
    async function chiediSeCambiata(testo) {
      const msg =
        'Nel frattempo ' + testo + ' e stata modificata da qualcun altro: annullamento fermato per non sovrascrivere';
      if (typeof canale.chiedi !== 'function') throw new Error(msg);
      const si = await canale.chiedi(
        'Nel frattempo ' +
          testo +
          ' e stata modificata da qualcun altro.\n\nConferma = annullo comunque (la sua modifica si perde). Annulla = mi fermo qui.',
      );
      if (!si) throw new Error(msg);
    }
    // la riga aggiunta e ancora come l ha scritta l azione? (data di aggiornamento esclusa)
    async function controllaAggiunta(table, r) {
      const cur = (await canale.leggi(table + '?' + chiave(table) + '=eq.' + r[chiave(table)]))[0];
      if (!cur) return false; // gia tolta da qualcun altro: niente da fare
      const cambiata = Object.keys(r).some((k) => k !== 'updated_at' && k in cur && !uguale(cur[k], r[k]));
      if (cambiata) await chiediSeCambiata('la riga aggiunta (' + parola(table) + ')');
      return true;
    }
    async function controllaImp(chiaveImp, atteso) {
      const cur = await canale.leggiImp(chiaveImp);
      if (!uguale(cur == null ? '' : String(cur), atteso == null ? '' : String(atteso)))
        await chiediSeCambiata('l impostazione "' + chiaveImp + '"');
    }
    async function inverti(op) {
      if (op.tipo === 'patch') {
        for (const r of op.prima) {
          await controllaConflitto(op.table, r[chiave(op.table)], op.dati);
          const indietro = {};
          Object.keys(op.dati).forEach((k) => (indietro[k] = r[k] === undefined ? null : r[k]));
          await canale.patch(op.table, filtroRiga(op.table, r), indietro);
        }
      } else if (op.tipo === 'post') {
        for (const r of op.righe) {
          if (!(await controllaAggiunta(op.table, r))) continue;
          if (CON_CESTINO.indexOf(op.table) >= 0 && 'eliminato' in r)
            await canale.patch(op.table, filtroRiga(op.table, r), {
              eliminato: true,
              eliminato_da: canale.operatore(),
              eliminato_at: canale.adesso(),
            });
          else await canale.del(op.table, filtroRiga(op.table, r));
        }
      } else if (op.tipo === 'del') {
        for (const r of op.righe) await canale.post(op.table, r);
      } else if (op.tipo === 'imp') {
        await controllaImp(op.chiave, op.dopo);
        await canale.imp(op.chiave, op.prima == null ? '' : op.prima);
      } else if (op.tipo === 'rinomina') {
        await canale.rinomina(op.a, op.da); // al contrario, in tutto il programma
      }
    }
    async function riapplica(op) {
      if (op.tipo === 'patch') {
        for (const r of op.prima) {
          const attesi = {};
          Object.keys(op.dati).forEach((k) => (attesi[k] = r[k] === undefined ? null : r[k]));
          await controllaConflitto(op.table, r[chiave(op.table)], attesi);
          await canale.patch(op.table, filtroRiga(op.table, r), op.dati);
        }
      } else if (op.tipo === 'post') {
        for (const r of op.righe) {
          if (CON_CESTINO.indexOf(op.table) >= 0 && 'eliminato' in r)
            await canale.patch(op.table, filtroRiga(op.table, r), {
              eliminato: false,
              eliminato_da: null,
              eliminato_at: null,
            });
          else await canale.post(op.table, r);
        }
      } else if (op.tipo === 'del') {
        for (const r of op.righe) await canale.del(op.table, filtroRiga(op.table, r));
      } else if (op.tipo === 'imp') {
        await controllaImp(op.chiave, op.prima);
        await canale.imp(op.chiave, op.dopo);
      } else if (op.tipo === 'rinomina') {
        await canale.rinomina(op.da, op.a);
      }
    }
    async function annulla() {
      chiudiGruppo();
      const g = st.pila.pop();
      if (!g) return null;
      st.prof++;
      let i = g.ops.length - 1;
      try {
        for (; i >= 0; i--) await inverti(g.ops[i]);
      } catch (e) {
        // fermo a meta: le operazioni gia annullate vanno fra quelle da Ripristinare, le
        // altre restano da annullare (prima tornava nella pila tutto il gruppo: il nuovo
        // Annulla ripeteva quelle gia fatte e dava conflitti all infinito)
        const resto = g.ops.slice(0, i + 1);
        const fatte = g.ops.slice(i + 1);
        if (resto.length) st.pila.push(Object.assign({}, g, { ops: resto }));
        if (fatte.length) st.redo.push(Object.assign({}, g, { ops: fatte, quandoAnnullato: canale.adesso() }));
        notifica();
        e.annullaParziale = fatte.length;
        throw e;
      } finally {
        st.prof--;
      }
      g.quandoAnnullato = canale.adesso();
      st.redo.push(g);
      notifica();
      return g;
    }
    async function ripristina() {
      chiudiGruppo();
      const g = st.redo.pop();
      if (!g) return null;
      st.prof++;
      let i = 0;
      try {
        for (; i < g.ops.length; i++) await riapplica(g.ops[i]);
      } catch (e) {
        const fatte = g.ops.slice(0, i);
        const resto = g.ops.slice(i);
        if (resto.length) st.redo.push(Object.assign({}, g, { ops: resto }));
        if (fatte.length) st.pila.push(Object.assign({}, g, { ops: fatte }));
        notifica();
        e.annullaParziale = fatte.length;
        throw e;
      } finally {
        st.prof--;
      }
      g.quando = canale.adesso(); // ripristinato: torna l ultima azione
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
        // istanti per scegliere, fra programma, calendario e briefing, l azione piu recente
        quandoUltima: st.pendenti.length
          ? canale.adesso()
          : st.pila.length
            ? st.pila[st.pila.length - 1].quando || ''
            : '',
        quandoProssima: st.redo.length ? st.redo[st.redo.length - 1].quandoAnnullato || '' : '',
        inCorso: occupato(),
      };
    }
    function onCambio(f) {
      st.ascoltatori.push(f);
    }
    // AZIONE COMPOSTA che il canale sa invertire da sola (es. rinomina di un collaboratore
    // in tutte le tabelle): entra nella pila come un azione unica con la sua etichetta
    function azione(op, etichetta) {
      if (occupato()) return;
      chiudiGruppo();
      aggiungi(op);
      chiudiGruppo(etichetta);
    }
    // scritture di conseguenza (riallineamenti dopo Annulla o Ripristina): non sono
    // azioni dell utente, quindi non entrano nella pila e non svuotano Ripristina
    async function senzaTraccia(fn) {
      st.prof++;
      try {
        return await fn();
      } finally {
        st.prof--;
      }
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
      senzaTraccia,
      azione,
      stato,
      onCambio,
      azzera,
      tracciata,
      inCorso: occupato,
    };
  }

  // CODA DI ANNULLA E RIPRISTINA (15/10/2026, segnalazione del titolare: premuti piu volte
  // di fila andavano in tilt). Ogni clic o Ctrl+Z / Ctrl+Y diventa una richiesta in coda;
  // le richieste si eseguono UNA ALLA VOLTA, nell ordine: 5 clic = 5 passi, mai due
  // insieme. Prima ogni clic partiva subito: due Annulla del Piano si sovrapponevano (il
  // secondo prendeva la pila prima che il primo avesse scritto), un Ripristina prendeva il
  // passo sbagliato, le celle restavano miste e comparivano conflitti finti "cambiata da
  // un altro operatore"; con l Annulla generale in corso i clic si perdevano.
  //  - si accetta una richiesta solo se c e un passo da fare, contando quelli gia in coda
  //    (tenere premuto Ctrl+Z non accoda cento passi);
  //  - un passo non riuscito (o una conferma rifiutata) ferma i passi che seguono: la coda
  //    si svuota e si dice quanti ne sono stati tolti;
  //  - stato(): in corso, in coda, passi ancora disponibili (per i pulsanti).
  // opz = { esegui(tipo, giro) -> { ok, niente, fermo, silenzioso } | lancia,
  //         disponibili() -> { annulla, ripristina }, fermati(n, esito), cambio(stato) }
  // tipo: 'annulla' | 'ripristina' | 'tutto'. giro: oggetto condiviso dai passi di una
  // stessa raffica (es. la conferma chiesta una volta sola).
  function creaCodaAnnulla(opz) {
    const st = { coda: [], attiva: false, v: null, attese: [], giro: null };
    const notifica = () => {
      try {
        if (opz.cambio) opz.cambio(stato());
      } catch (e) {}
    };
    function virtuali() {
      if (!st.v) {
        const d = opz.disponibili() || {};
        st.v = { annulla: d.annulla || 0, ripristina: d.ripristina || 0 };
      }
      return st.v;
    }
    function stato() {
      const d = st.attiva || st.coda.length ? virtuali() : opz.disponibili() || {};
      return {
        inCorso: st.attiva,
        inCoda: st.coda.length,
        annulla: Math.max(0, d.annulla || 0),
        ripristina: Math.max(0, d.ripristina || 0),
      };
    }
    function chiedi(tipo) {
      const v = virtuali();
      if (tipo === 'annulla') {
        if (v.annulla <= 0) return false;
        v.annulla--;
        v.ripristina++;
      } else if (tipo === 'ripristina') {
        if (v.ripristina <= 0) return false;
        v.ripristina--;
        v.annulla++;
      } else if (tipo === 'tutto') {
        // dopo Annulla tutto i conti si rifanno al passo: si accetta e si vede al momento
        v.annulla = Infinity;
        v.ripristina = Infinity;
      } else return false;
      st.coda.push(tipo);
      notifica();
      if (!st.attiva) gira();
      return true;
    }
    async function gira() {
      st.attiva = true;
      st.giro = {};
      notifica();
      try {
        while (st.coda.length) {
          const tipo = st.coda.shift();
          notifica();
          let es;
          try {
            es = await opz.esegui(tipo, st.giro);
          } catch (e) {
            es = { ok: false, errore: e };
          }
          if (!es || es.ok === false) {
            const tolti = st.coda.length;
            st.coda = [];
            if (opz.fermati) {
              try {
                opz.fermati(tolti, es || { ok: false });
              } catch (e) {}
            }
            break;
          }
        }
      } finally {
        st.attiva = false;
        st.v = null;
        st.giro = null;
        notifica();
        const a = st.attese;
        st.attese = [];
        a.forEach((f) => f());
      }
    }
    // promessa che si risolve a coda vuota (prove e chiusura della pagina)
    function vuota() {
      if (!st.attiva && !st.coda.length) return Promise.resolve();
      return new Promise((r) => st.attese.push(r));
    }
    function svuota() {
      st.coda = [];
      if (!st.attiva) st.v = null;
      notifica();
    }
    return { chiedi, stato, vuota, svuota, occupata: () => st.attiva || st.coda.length > 0 };
  }

  root.creaAnnulla = creaAnnulla;
  root.creaCodaAnnulla = creaCodaAnnulla;
  root.ANNULLA_TABELLE = TRACCIATE;
  if (typeof module !== 'undefined' && module.exports)
    module.exports = { creaAnnulla, creaCodaAnnulla, TRACCIATE, PAROLE };
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
    rinomina: (da, a) => _rinominaCollaboratoreTutto(da, a),
    // riga o impostazione cambiata da un collega dopo l azione: si chiede prima di annullare
    chiedi: (testo) => chiediConferma(testo, { titolo: 'Modifica di un altro operatore' }),
    adesso: () => new Date().toISOString(),
    operatore: () => (typeof getOperatore === 'function' && getOperatore()) || 'Admin',
    attesa: (ms, fn) => setTimeout(fn, ms),
    annullaAttesa: (id) => clearTimeout(id),
  });
  // UN SOLO ANNULLA (07.10, richiesta del titolare): la barra annulla l azione piu recente
  // di tutto il programma, compreso il calendario del piano e il briefing (che hanno le
  // loro fotografie: _pianoUndo / _briefUndo). Prima il calendario aveva le sue frecce e
  // Ctrl+Z li non faceva niente.
  function _annullaFonti(redo) {
    const out = [];
    const g = window.Annulla.stato();
    if (!redo && g.annulla) out.push({ tipo: 'g', quando: g.quandoUltima || '', etichetta: g.ultima });
    if (redo && g.ripristina) out.push({ tipo: 'g', quando: g.quandoProssima || '', etichetta: g.prossima });
    const puoPiano = typeof puoGestirePiano === 'function' && puoGestirePiano();
    const pila = redo ? window._pianoRedo || [] : window._pianoUndo || [];
    if (puoPiano && pila.length) {
      const x = pila[pila.length - 1];
      out.push({ tipo: 'p', quando: x.quando || '', etichetta: 'Piano: ' + (x.label || 'modifica') });
    }
    const u = typeof _briefUndoCorrente === 'function' ? _briefUndoCorrente() : null;
    const puoBrief = typeof puoGestireBriefing === 'function' && puoGestireBriefing();
    const bl = u && puoBrief ? (redo ? u.rifatti : u.passi) : [];
    if (bl && bl.length) {
      const x = bl[bl.length - 1];
      let q = '';
      try {
        q = JSON.parse(x).quando || '';
      } catch (e) {}
      out.push({
        tipo: 'b',
        quando: q,
        etichetta:
          'Briefing: modifica del ' +
          String(_briefData || '')
            .split('-')
            .reverse()
            .join('.'),
      });
    }
    out.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    return out[0] || null;
  }
  // passi disponibili in tutto il programma, come li sceglie _annullaFonti: Annulla
  // generale, calendario del Piano (per chi lo gestisce), briefing del giorno aperto
  function _annullaConteggi() {
    const g = window.Annulla.stato();
    const puoPiano = typeof puoGestirePiano === 'function' && puoGestirePiano();
    const u = typeof _briefUndoCorrente === 'function' ? _briefUndoCorrente() : null;
    const puoBrief = !!u && typeof puoGestireBriefing === 'function' && puoGestireBriefing();
    return {
      annulla: g.annulla + (puoPiano ? (window._pianoUndo || []).length : 0) + (puoBrief ? (u.passi || []).length : 0),
      ripristina:
        g.ripristina + (puoPiano ? (window._pianoRedo || []).length : 0) + (puoBrief ? (u.rifatti || []).length : 0),
    };
  }
  // PULSANTI: mostrano quanti passi si possono ancora fare e, durante una raffica, che
  // l annullamento e in corso e quanti passi aspettano. Non si spengono mentre lavora: un
  // clic in piu si mette in coda (prima si spegnevano e il clic andava perso).
  function _annullaAggiornaBarra() {
    const bar = document.getElementById('annulla-bar');
    if (!bar || !window._annullaCoda) return;
    const c = window._annullaCoda.stato();
    const occupata = c.inCorso || c.inCoda > 0;
    const a = _annullaFonti(false);
    const r = _annullaFonti(true);
    const nA = occupata ? c.annulla : a ? Math.max(1, c.annulla) : 0;
    const nR = occupata ? c.ripristina : r ? Math.max(1, c.ripristina) : 0;
    bar.style.display = a || r || occupata ? 'flex' : 'none';
    bar.setAttribute('aria-busy', occupata ? 'true' : 'false');
    const bA = document.getElementById('annulla-btn');
    const bR = document.getElementById('ripristina-btn');
    if (bA) {
      bA.disabled = nA <= 0;
      bA.textContent = '↶ Annulla' + (nA > 0 ? ' (' + nA + ')' : '');
      bA.title = a ? 'Annulla: ' + a.etichetta + ' (Ctrl+Z)' : 'Niente da annullare';
      bA.style.cursor = occupata ? 'progress' : '';
    }
    if (bR) {
      bR.disabled = nR <= 0;
      bR.textContent = '↷ Ripristina' + (nR > 0 ? ' (' + nR + ')' : '');
      bR.title = r ? 'Ripristina: ' + r.etichetta + ' (Ctrl+Y)' : 'Niente da ripristinare';
      bR.style.cursor = occupata ? 'progress' : '';
    }
    const lbl = document.getElementById('annulla-lbl');
    if (lbl)
      lbl.textContent = occupata
        ? 'In corso…' + (c.inCoda ? ' ' + c.inCoda + (c.inCoda === 1 ? ' passo' : ' passi') + ' in coda' : '')
        : a
          ? a.etichetta
          : r
            ? 'Ripristina: ' + r.etichetta
            : '';
  }
  window._annullaAggiornaBarra = _annullaAggiornaBarra;
  // dopo un annullamento i dati in memoria vanno riletti e la pagina ridisegnata
  // MALATTIE annullate o ripristinate: il piano non fa parte di Annulla, quindi le M si
  // riallineano allo stato della registrazione prima e dopo (come quando si crea, si
  // modifica o si cancella dal Diario). annullato = true per Annulla, false per Ripristina.
  // Lo stesso per l ASSENZA in attesa di certificato (celle ASS): prima la malattia, poi
  // l assenza, cosi Annulla di un «Certificato ricevuto» rimette le ASS sui turni (M -> ASS)
  // e i giorni liberi com erano; Ripristina le rifa M.
  async function _annullaMalattie(g, annullato) {
    if (typeof sincronizzaMalattiaPiano !== 'function' || typeof nomeCorrente !== 'function') return;
    for (const [tipoX, opz] of [
      [nomeCorrente('Malattia'), undefined],
      [nomeCorrente('Assenza'), { codice: 'ASS' }],
    ])
      await _annullaMalattieTipo(g, annullato, tipoX, opz);
  }
  async function _annullaMalattieTipo(g, annullato, tipoMal, opz) {
    const attiva = (x) => (x && !x.eliminato && x.tipo === tipoMal ? x.testo || '' : '');
    for (const o of g.ops || []) {
      if (o.table !== 'registrazioni') continue;
      for (const r of o.righe || o.prima || []) {
        // stato prima (A) e dopo (B) l azione originale
        let A = null;
        let B = null;
        if (o.tipo === 'post') B = r;
        else if (o.tipo === 'del') A = r;
        else if (o.tipo === 'patch') {
          A = r;
          B = Object.assign({}, r, o.dati);
        }
        const da = annullato ? B : A;
        const a = annullato ? A : B;
        if (attiva(da) === attiva(a) || (!attiva(da) && !attiva(a))) continue;
        try {
          await sincronizzaMalattiaPiano(
            r.nome,
            attiva(da),
            r.data,
            attiva(a),
            opz ? Object.assign({ idReg: r.id }, opz) : undefined,
          );
        } catch (e) {
          if (typeof toastErrore === 'function')
            toastErrore('Malattia di ' + r.nome + ': piano non riallineato (' + ((e && e.message) || e) + ')');
        }
      }
    }
  }
  async function _annullaRicarica(g, annullato) {
    const tab = new Set((g.ops || []).map((o) => (o.tipo === 'imp' ? 'impostazioni' : o.table)));
    if (typeof loadAll === 'function') await loadAll();
    await window.Annulla.senzaTraccia(() => _annullaMalattie(g, annullato));
    // CERTIFICATO RICEVUTO annullato o rimesso (assenze.js): lo Storico HR e un registro (le
    // righe le cancella solo l amministratore), si aggiunge una riga che lo dice
    const mCert = /^Certificato ricevuto · ([^·]+?) · (.+)$/.exec(String(g.etichetta || ''));
    if (mCert && typeof _insertHrEvento === 'function')
      await window.Annulla.senzaTraccia(() =>
        _insertHrEvento(
          mCert[1].trim(),
          'certificato',
          (annullato ? 'Annullato (Annulla): ' : 'Rimesso (Ripristina): ') + mCert[2].trim(),
          oggiLocale(),
        ),
      );
    // non disponibilita del Diario annullate o ripristinate: modulo e piano si riallineano
    // (il piano non fa parte di Annulla: le ND scritte sopra i turni tornano al turno)
    const regND = [];
    (g.ops || []).forEach((o) => {
      if (o.table !== 'registrazioni') return;
      (o.righe || o.prima || []).forEach((r) => regND.push(r));
    });
    if (regND.length && typeof _diarioNdRiallinea === 'function')
      await window.Annulla.senzaTraccia(() => _diarioNdRiallinea(regND));
    const toccaPiano = [...tab].some((t) => /^piano_|^collab_congedi/.test(t));
    if (toccaPiano && typeof _pianoCaricaCfg === 'function') await _pianoCaricaCfg();
    const pg = localStorage.getItem('pagina_corrente') || 'dashboard';
    if (typeof switchPage === 'function') switchPage(pg);
    if (pg === 'piano' && typeof renderPiano === 'function') renderPiano();
    if (pg === 'impostazioni' && typeof _settingsAggiornaIndice === 'function') _settingsAggiornaIndice();
  }
  // UN PASSO DELLA CODA (annulla, ripristina o Annulla tutto del Piano): l azione da fare
  // si sceglie ADESSO, non al momento del clic (con la coda il clic e di qualche passo fa)
  async function _annullaPasso(tipo, giro) {
    // una scrittura del Piano ancora in viaggio (cella appena scritta) finisce prima: il
    // suo passo deve contenerla. Prima Ctrl+Z subito dopo Invio chiudeva il passo prima
    // della scrittura e la cella restava.
    if (typeof _pianoAttendiScritture === 'function') await _pianoAttendiScritture(120000);
    // le scritture fatte da Annulla e Ripristina del Piano e del briefing (foglio dello
    // scambio, malattia, punti) non sono azioni nuove: fuori dall Annulla generale
    if (tipo === 'tutto') {
      if (typeof pianoAnnullaTutto !== 'function') return { ok: true, niente: true };
      const ok = await window.Annulla.senzaTraccia(() => pianoAnnullaTutto());
      return { ok: ok !== false };
    }
    const redo = tipo === 'ripristina';
    let f = _annullaFonti(redo);
    if (!f) return { ok: true, niente: true };
    // una conferma per raffica: "Annullare: ...?" al primo Annulla, poi i passi chiesti
    // vanno uno dopo l altro
    if (!redo && !giro.confermato) {
      const altri = window._annullaCoda.stato().inCoda;
      const si = await chiediConferma(
        'Annullare: ' +
          f.etichetta +
          '?' +
          (altri > 0
            ? '\n\nHai chiesto altri ' + altri + ' passi: con Conferma si fanno uno dopo l altro, nell ordine.'
            : ''),
      );
      if (!si) return { ok: false, fermo: true };
      giro.confermato = true;
      f = _annullaFonti(false);
      if (!f) return { ok: true, niente: true };
    }
    if (f.tipo === 'p') {
      const ok = await window.Annulla.senzaTraccia(() => (redo ? pianoRipristina() : pianoAnnulla()));
      return { ok: ok !== false };
    }
    if (f.tipo === 'b') {
      await window.Annulla.senzaTraccia(() => (redo ? briefRipristina() : briefAnnulla()));
      return { ok: true };
    }
    try {
      const g = await (redo ? window.Annulla.ripristina() : window.Annulla.annulla());
      if (!g) return { ok: true, niente: true };
      if (typeof logAzione === 'function') logAzione(redo ? 'Ripristinata azione' : 'Annullata azione', g.etichetta);
      await _annullaRicarica(g, !redo);
      toast((redo ? 'Ripristinato: ' : 'Annullato: ') + g.etichetta);
      return { ok: true };
    } catch (e) {
      toastErrore((e && e.message) || (redo ? 'Ripristino non riuscito' : 'Annullamento non riuscito'));
      return { ok: false };
    }
  }
  const _annullaCoda = window.creaCodaAnnulla({
    esegui: _annullaPasso,
    disponibili: _annullaConteggi,
    cambio: () => _annullaAggiornaBarra(),
    // passo non riuscito o conferma rifiutata: i passi chiesti dopo non partono (sarebbero
    // calcolati su uno stato diverso da quello che l utente si aspetta)
    fermati: (n, es) => {
      if (!n) return;
      const passi =
        n + (n === 1 ? ' passo chiesto dopo non e stato fatto' : ' passi chiesti dopo non sono stati fatti');
      if (es && es.fermo) toast('Fermato: ' + passi);
      else
        setTimeout(
          () => toastErrore('Il passo non e riuscito: ' + passi + '. Controlla il piano e riprova.', 9000),
          1200,
        );
    },
  });
  window._annullaCoda = _annullaCoda;
  window.Annulla.onCambio(_annullaAggiornaBarra);
  function annullaGlobale() {
    return _annullaCoda.chiedi('annulla');
  }
  function ripristinaGlobale() {
    return _annullaCoda.chiedi('ripristina');
  }
  // il pulsante rosso "Annulla tutto" del Piano: in coda, dopo i passi gia chiesti
  function annullaTuttoPiano() {
    return _annullaCoda.chiedi('tutto');
  }
  // Ctrl+Z / Ctrl+Y fuori dai campi di testo (anche tenuti premuti: un passo per
  // ripetizione, finche ce ne sono)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    const k = String(e.key || '').toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      annullaGlobale();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      ripristinaGlobale();
    }
  });
  // I pulsanti della barretta le chiamano da onclick, quindi devono stare nello
  // scope globale (le function dichiarate dentro un blocco restano chiuse nel blocco).
  window.annullaGlobale = annullaGlobale;
  window.ripristinaGlobale = ripristinaGlobale;
  window.annullaTuttoPiano = annullaTuttoPiano;
}
