/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: utils.js
 * Utility: capitalizzaNome, toast, escP, fmtCHF
 */

// DATE DEL GIORNO IN ORA LOCALE (Svizzera). toISOString() da la data di Londra:
// tra mezzanotte e le 2 (ora legale) restituiva il giorno PRIMA, e una malattia
// registrata alle 00.30 finiva sul giorno sbagliato. Usare sempre queste due.
function dataLocaleISO(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function oggiLocale() {
  return dataLocaleISO(new Date());
}
// PAUSE DELLE OPERAZIONI LUNGHE ANCHE CON LA PAGINA NASCOSTA (02/11/2026). Prepara il mese,
// Migliora, Prepara piu mesi e le proposte della Formazione lasciano respirare la pagina ogni
// ~40 ms (barra, Ferma). Con setTimeout(0), a pagina nascosta (altra scheda, PC bloccato con
// Win+L, finestra coperta) Chrome concede al massimo un giro al secondo e dopo 5 minuti uno al
// minuto: misurato su Slots dicembre, la bozza passava da pochi secondi a minuti e Migliora si
// fermava al freno di tempo con una parte delle iterazioni (risultato diverso). I messaggi di
// un MessageChannel non hanno quel freno: stessa pausa (la pagina disegna e legge i clic),
// velocita piena anche in secondo piano, stesse scelte (nessun calcolo dipende dalla pausa).
let _cediCanale = null;
const _cediCoda = [];
function pianoCedi() {
  if (typeof MessageChannel !== 'function') return new Promise((r) => setTimeout(r, 0));
  if (!_cediCanale) {
    _cediCanale = new MessageChannel();
    _cediCanale.port1.onmessage = () => {
      const r = _cediCoda.shift();
      // in node (test) la porta tiene vivo il processo solo finche c e una pausa in attesa
      if (!_cediCoda.length && typeof _cediCanale.port1.unref === 'function') _cediCanale.port1.unref();
      if (r) r();
    };
  }
  if (typeof _cediCanale.port1.ref === 'function') _cediCanale.port1.ref();
  return new Promise((r) => {
    _cediCoda.push(r);
    _cediCanale.port2.postMessage(0);
  });
}
// OROLOGIO DI LAVORO (02/11/2026, decisione del titolare). A pagina nascosta (altra scheda, PC
// bloccato) Chrome fa girare la pagina 15-20 volte piu lenta (misurato: 1 s di calcolo -> 17-24 s),
// anche senza pause. Con i freni a tempo reale Migliora si fermava prima (meno iterazioni,
// risultato diverso da quello a pagina visibile) e lo schema a blocchi lavorava meno. Questo
// orologio conta il tempo reale solo a pagina visibile; a pagina nascosta conta il LAVORO fatto
// (n = iterazioni, giri...) al ritmo misurato a pagina visibile nella stessa operazione: lo
// stesso lavoro vale lo stesso tempo, quindi freni e durate danno lo stesso lavoro della
// pagina visibile (con il PC bloccato ci mette solo di piu). Se l operazione parte gia
// nascosta (nessun ritmo misurato) conta il tempo reale, come prima.
// Uso: const o = pianoOrologio(); ... o.passo(n) -> millisecondi "di lavoro" dall inizio.
function pianoPaginaNascosta() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
function pianoOrologio() {
  let ultimo = Date.now();
  let visMs = 0;
  let visLavoro = 0;
  let nascostoEq = 0;
  let nascostoReale = 0;
  return {
    passo(n) {
      const ora = Date.now();
      const dt = ora - ultimo;
      ultimo = ora;
      if (!pianoPaginaNascosta()) {
        visMs += dt;
        visLavoro += n || 0;
      } else {
        nascostoReale += dt;
        nascostoEq += visLavoro > 0 && visMs > 0 ? (n || 0) * (visMs / visLavoro) : dt;
      }
      return visMs + nascostoEq;
    },
    // millisecondi reali passati a pagina nascosta (per l avviso "piu lento")
    nascosto: () => nascostoReale,
  };
}
// TEMPO IN SECONDO PIANO DELL OPERAZIONE LUNGA IN CORSO: per dire nei riquadri di avanzamento
// che, mentre il Diario era nascosto, il lavoro e andato avanti piu lento (il risultato e lo stesso)
let _nascostoDa = null;
let _nascostoMs = 0;
function pianoNascostoAzzera() {
  _nascostoMs = 0;
  _nascostoDa = pianoPaginaNascosta() ? Date.now() : null;
}
function pianoNascostoMs() {
  return _nascostoMs + (_nascostoDa != null ? Date.now() - _nascostoDa : 0);
}
function pianoNascostoNota() {
  const ms = pianoNascostoMs();
  if (ms < 5000) return '';
  const min = Math.round(ms / 60000);
  return (
    'Il Diario è stato in secondo piano o con il PC bloccato per ' +
    (min < 1 ? 'meno di un minuto' : min === 1 ? '1 minuto' : min + ' minuti') +
    ': lì il lavoro continua ma va più lento (il risultato non cambia).'
  );
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (pianoPaginaNascosta()) {
      if (_nascostoDa == null) _nascostoDa = Date.now();
    } else if (_nascostoDa != null) {
      _nascostoMs += Date.now() - _nascostoDa;
      _nascostoDa = null;
    }
  });
}
// Giorno (ora locale) di un valore salvato: un istante con l ora ("...T22:30:00Z")
// diventa il giorno svizzero; una data semplice ("2026-10-05") resta com e.
function giornoDi(v) {
  const s = String(v || '');
  if (!s) return '';
  if (s.length <= 10 || !/T\d/.test(s)) return s.substring(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s.substring(0, 10) : dataLocaleISO(d);
}
// LIBRERIE PESANTI A RICHIESTA (Excel, Word, PDF, QR: circa 2.6 MB). Non si
// caricano piu all apertura: partono in sottofondo appena il programma e pronto
// (preparaLibrerie) e ogni funzione che le usa le aspetta con libreria(nome).
// Stessi file e stessi controlli di integrita di prima.
const _LIBRERIE = {
  jspdf: [
    ['libs/jspdf.umd.min.js', 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'],
    ['libs/jspdf.plugin.autotable.min.js', 'sha384-Xl/CUCfJbzsngMp0CFxkmF0VW/8C160IsGujqeQlIhaGxKz2+JsIGORFqtCPeldF'],
  ],
  xlsx: [['libs/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw']],
  mammoth: [['libs/mammoth.browser.min.js', 'sha384-nFoSjZIoH3CCp8W639jJyQkuPHinJ2NHe7on1xvlUA7SuGfJAfvMldrsoAVm6ECz']],
  pdf: [['libs/pdf.min.js', 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e']],
  qrcode: [['libs/qrcode.min.js', 'sha384-lQXOAyZwHXE55JFyrOMB7nY2Wv+m5ZWNtJcHrd1rceRQXAYNLak8ukN5TjBTcIwz']],
};
const _libreriePromesse = {};
function libreria(nome) {
  if (_libreriePromesse[nome]) return _libreriePromesse[nome];
  const file = _LIBRERIE[nome];
  if (!file) return Promise.reject(new Error('libreria sconosciuta: ' + nome));
  _libreriePromesse[nome] = file
    .reduce(
      (prima, [src, sri]) =>
        prima.then(
          () =>
            new Promise((ok, ko) => {
              const s = document.createElement('script');
              s.src = src;
              s.integrity = sri;
              s.crossOrigin = 'anonymous';
              s.onload = ok;
              s.onerror = () => ko(new Error('libreria non caricata: ' + src));
              document.head.appendChild(s);
            }),
        ),
      Promise.resolve(),
    )
    .catch((e) => {
      delete _libreriePromesse[nome]; // al prossimo uso si riprova
      throw e;
    });
  return _libreriePromesse[nome];
}
// da usare all inizio di ogni funzione che ne ha bisogno: true se pronta,
// altrimenti avviso rosso con il motivo (mai un errore muto)
async function assicuraLibreria(nome) {
  try {
    await libreria(nome);
    return true;
  } catch (e) {
    toastErrore('Funzione non disponibile: ' + ((e && e.message) || e) + '. Ricarica la pagina e riprova.');
    return false;
  }
}
// ESPORTA UNA TABELLA IN EXCEL cosi come si vede: solo le righe visibili (dopo una
// ricerca), senza pulsanti e campi. tabella = elemento o id/selettore.
async function esportaTabellaExcel(tabella, nomeFile) {
  const t = typeof tabella === 'string' ? document.getElementById(tabella) || document.querySelector(tabella) : tabella;
  if (!t || !t.querySelector('tbody tr')) {
    toast('Niente da esportare');
    return;
  }
  if (!(await assicuraLibreria('xlsx'))) return;
  const copia = t.cloneNode(true);
  const originali = t.querySelectorAll('tr');
  copia.querySelectorAll('tr').forEach((tr, i) => {
    const o = originali[i];
    if (o && (o.hidden || o.style.display === 'none' || o.offsetParent === null)) tr.remove();
  });
  copia.querySelectorAll('button, input, select, textarea, svg').forEach((x) => x.remove());
  // raw: il testo resta com e (con raw:false SheetJS leggeva "03.10.2026" come
  // 10 marzo e "Mar 06.10" come numero). Solo i numeri puri diventano numeri.
  const wb = XLSX.utils.table_to_book(copia, { raw: true });
  wb.SheetNames.forEach((sn) => {
    const ws = wb.Sheets[sn];
    Object.keys(ws).forEach((k) => {
      const c = ws[k];
      if (k[0] === '!' || !c || typeof c.v !== 'string') return;
      const v = c.v.trim();
      if (/^[+-]?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) {
        c.t = 'n';
        c.v = parseFloat(v);
      }
    });
  });
  const nome = String(nomeFile || 'tabella').replace(/[^a-z0-9_-]+/gi, '_') + '_' + oggiLocale() + '.xlsx';
  XLSX.writeFile(wb, nome);
  if (typeof logAzione === 'function') logAzione('Esportazione Excel', nome);
  toast('Esportato: ' + nome);
}
function preparaLibrerie() {
  const via = () => Object.keys(_LIBRERIE).forEach((n) => libreria(n).catch(() => {}));
  if (typeof requestIdleCallback === 'function') requestIdleCallback(via, { timeout: 3000 });
  else setTimeout(via, 1200);
}
const _NOMI_PARTICELLE = [
  'di',
  'da',
  'de',
  'del',
  'della',
  'dello',
  'dei',
  'degli',
  'delle',
  'dal',
  'dalla',
  'con',
  'e',
  'in',
  'la',
  'le',
  'lo',
  'il',
  'gli',
  'von',
  'van',
  'el',
  'al',
  'ben',
];
// Iniziali maiuscole nei nomi. SIGLE (23/10/2026): in un nome scritto con maiuscole e minuscole
// una parola tutta maiuscola di 2-4 caratteri (es. "QA-B", "BL", "SA") e' una sigla voluta e resta
// com'e'; un nome scritto tutto in maiuscolo ("ROSSI MARIO") si sistema come sempre.
function _nomeSigla(w, tutto) {
  if (tutto === tutto.toUpperCase()) return false;
  const lettere = w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  return lettere.length >= 2 && w.length <= 4 && w === w.toUpperCase() && w !== w.toLowerCase();
}
function capitalizzaNome(s) {
  return s.replace(/\S+/g, (w) => {
    const l = w.toLowerCase();
    if (_nomeSigla(w, s) && !_NOMI_PARTICELLE.includes(l)) return w;
    if (_NOMI_PARTICELLE.includes(l) && s.indexOf(w) > 0) return l;
    return l.replace(/(^|['-])(\w)/g, (m, sep, ch) => sep + ch.toUpperCase());
  });
}

// TOAST & UTILS
// ERRORI IN PAROLE SEMPLICI (controllo del 09/10/2026): i messaggi del database e della
// rete arrivavano a schermo in inglese tecnico ("duplicate key value...", "Failed to
// fetch"). Qui si traducono SOLO per chi legge: il testo originale resta nell errore (i
// controlli del programma lo riconoscono) e nella console.
const _ERRORI_IN_CHIARO = [
  [/duplicate key value violates unique constraint\s*"?[\w.]*"?/gi, 'esiste già (dato doppio)'],
  [/(TypeError:\s*)?(Failed to fetch|NetworkError[^\s.,;:)]*|Load failed)/gi, 'connessione assente'],
  [/violates foreign key constraint\s*"?[\w.]*"?/gi, 'è collegato ad altri dati'],
  [/null value in column "?(\w+)"?[^,.;]*violates not-null constraint/gi, 'manca un dato obbligatorio ($1)'],
  [/violates not-null constraint/gi, 'manca un dato obbligatorio'],
  [/value too long for type[^,.;)]*/gi, 'testo troppo lungo'],
  [/invalid input syntax for type \w+[^,.;)]*/gi, 'valore non valido'],
  [/date\/time field value out of range[^,;)]*/gi, 'data che non esiste nel calendario'],
  [/permission denied[^,.;)]*/gi, 'permesso negato dal database'],
  [/JWT expired/gi, 'sessione scaduta: esci e rientra'],
  [/canceling statement due to statement timeout|statement timeout/gi, 'il database ha impiegato troppo: riprova'],
  [/Could not find the function[^,;)]*/gi, "funzione non presente sul server: serve l'aggiornamento (avvisa l'IT)"],
];
function erroreInChiaro(m) {
  let t = String(m == null ? '' : m);
  _ERRORI_IN_CHIARO.forEach(([re, it]) => (t = t.replace(re, it)));
  return t;
}
// true la prima volta del giorno per questa chiave, su questo browser (poi false fino a domani)
function _unaVoltaAlGiorno(chiave) {
  const oggi = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem('giorno_' + chiave) === oggi) return false;
    localStorage.setItem('giorno_' + chiave, oggi);
  } catch (e) {}
  return true;
}
function toast(m, durata, tipo) {
  const t = document.getElementById('toast');
  const originale = String(m == null ? '' : m);
  const chiaro = erroreInChiaro(originale);
  if (chiaro !== originale) console.warn('Messaggio originale:', originale);
  t.textContent = chiaro;
  // tipo 'errore': rosso e piu' a lungo, per i rifiuti che l'operatore deve vedere
  t.classList.toggle('errore', tipo === 'errore');
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), durata || (tipo === 'errore' ? 6000 : 2500));
}
function toastErrore(m, durata) {
  toast(m, durata, 'errore');
}
// "Cosa NON e' riuscito: perche'" (23/10/2026), al posto dei vecchi "Errore eliminazione",
// "Errore salvataggio nota": il motivo arriva dall'errore, in parole semplici
function toastNonRiuscito(cosa, e) {
  const motivo = erroreInChiaro((e && e.message) || e || '').trim();
  console.warn(cosa, e);
  toastErrore(cosa + (motivo ? ': ' + motivo : '') + '. Riprova; se succede ancora avvisa l’amministratore.', 9000);
}
// Anche le virgolette vanno convertite: un nome con " o ' finiva dentro
// value="..." (o value='...') e chiudeva l'attributo (iniezione di attributi).
// Come escP, ma gli a capo diventano <br>. Usata solo in testo e attributi HTML.
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}
function escP(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Testo da mettere come argomento tra apici singoli dentro un attributo onclick="..."
// (o un altro on...="..."). Due livelli: prima la stringa JavaScript (backslash,
// apostrofo, a capo, "<"), poi l attributo HTML (& e virgolette). Con il solo
// apostrofo scappato un nome come  x\');alert(1);//  o con le virgolette usciva
// dalla stringa e veniva eseguito. Usarla SEMPRE per i testi nei click.
function _jsArg(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\x3c')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}
// UN SALVATAGGIO ALLA VOLTA. Il doppio click (o Ctrl+Invio premuto due volte) su
// Salva faceva partire due salvataggi insieme: due righe uguali nel database.
// Finche il primo e in corso, un secondo con la stessa chiave viene ignorato; il
// pulsante (quello passato, o quello appena cliccato) resta disabilitato e torna
// attivo alla fine, anche se il salvataggio fallisce.
const _salvataggiInCorso = new Set();
async function unaVoltaSola(chiave, fn, pulsante) {
  // il pulsante si prende SUBITO: dopo il primo await l evento del click non c e piu
  let btn = typeof pulsante === 'string' ? document.getElementById(pulsante) : pulsante || null;
  if (!btn && typeof window !== 'undefined' && window.event && window.event.type === 'click') {
    const t = window.event.currentTarget || window.event.target;
    btn = t && t.closest ? t.closest('button') : null;
  }
  if (_salvataggiInCorso.has(chiave)) return;
  _salvataggiInCorso.add(chiave);
  const eraDisabilitato = btn ? btn.disabled : false;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    _salvataggiInCorso.delete(chiave);
    if (btn && !eraDisabilitato) btn.disabled = false;
  }
}
// Salva un'impostazione e rende visibile il rifiuto: setImp lancia se il
// database non risponde e chi chiama da un bottone non avrebbe altro avviso.
// Ritorna false se non salvata, cosi' chi chiama non annuncia un successo.
async function salvaImp(k, v) {
  try {
    await setImp(k, v);
    return true;
  } catch (e) {
    toastErrore('Impostazione non salvata: ' + (e.message || e));
    return false;
  }
}

// ANTEPRIMA PDF: unica strada per TUTTI i PDF del programma (moduli, scheda, piano,
// rapporti...). Le pagine si disegnano DENTRO il programma con pdf.js (libs/pdf.min.js),
// senza passare dal lettore PDF del browser. Prima il PDF andava in un iframe come blob:
// funzionava solo se il browser lo apriva lui; con il lettore di Chrome disattivato, con
// l estensione di Adobe Acrobat (che si prende i PDF e apre una scheda sua) o sul
// telefono si vedeva una scheda con il contenuto grezzo del file, illeggibile, oppure
// niente. "Scarica PDF" salva il file vero con il suo nome; "Stampa" stampa le pagine.
let _pdfPreviewBlob = null,
  _pdfPreviewName = '',
  _pdfPreviewGen = 0, // ogni anteprima nuova ferma il disegno di quella prima
  _pdfPreviewDoc = null; // documento pdf.js aperto (per la stampa)
function _pdfNomeFile(n) {
  let s = String(n || 'documento.pdf')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  if (!/\.pdf$/i.test(s)) s += '.pdf';
  return s;
}
// contenitore delle pagine al posto dell iframe (creato una volta) + pulsante Stampa
function _pdfPreviewPagine() {
  const iframe = document.getElementById('pdf-preview-iframe');
  let box = document.getElementById('pdf-preview-pagine');
  if (!box && iframe) {
    box = document.createElement('div');
    box.id = 'pdf-preview-pagine';
    box.setAttribute('role', 'document');
    box.style.cssText =
      'flex:1;overflow:auto;background:#525659;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:12px;-webkit-overflow-scrolling:touch';
    iframe.parentNode.insertBefore(box, iframe);
    const scarica = document.querySelector('#pdf-preview-modal .btn-export-pdf');
    if (scarica && !document.getElementById('pdf-preview-stampa')) {
      const st = document.createElement('button');
      st.id = 'pdf-preview-stampa';
      st.type = 'button';
      st.className = scarica.className;
      st.style.cssText = scarica.style.cssText;
      st.textContent = 'Stampa';
      st.addEventListener('click', stampaPdfPreview);
      scarica.parentNode.insertBefore(st, scarica.nextSibling);
    }
  }
  if (iframe) {
    iframe.style.display = 'none';
    iframe.removeAttribute('src');
  }
  return box;
}
// pdf.js pronto (libreria + worker dello stesso sito)
async function _pdfJsPronto() {
  await libreria('pdf');
  if (pdfjsLib.GlobalWorkerOptions.workerSrc !== 'libs/pdf.worker.min.js')
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
  return pdfjsLib;
}
// disegna tutte le pagine di un PDF (blob) dentro box, larghe quanto il box.
// gen: se nel frattempo e partita un altra anteprima si smette. Ritorna il documento pdf.js.
async function pdfDisegnaPagine(blob, box, gen, controlla) {
  const lib = await _pdfJsPronto();
  const dati = new Uint8Array(await blob.arrayBuffer());
  const pdf = await lib.getDocument({ data: dati, isEvalSupported: false }).promise;
  const ancora = () => !controlla || controlla(gen);
  if (!ancora()) {
    pdf.destroy();
    return null;
  }
  box.innerHTML = '';
  const larghezza = Math.max(280, Math.min(box.clientWidth - 24, 900));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let n = 1; n <= pdf.numPages; n++) {
    const pag = await pdf.getPage(n);
    if (!ancora()) {
      pdf.destroy();
      return null;
    }
    const v1 = pag.getViewport({ scale: 1 });
    const scala = Math.max(1, (larghezza / v1.width) * dpr);
    const vp = pag.getViewport({ scale: scala });
    const cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width);
    cv.height = Math.floor(vp.height);
    cv.style.cssText =
      'width:' + larghezza + 'px;max-width:100%;height:auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    cv.setAttribute('aria-label', 'Pagina ' + n + ' di ' + pdf.numPages);
    box.appendChild(cv);
    await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  }
  return pdf;
}
function mostraPdfPreview(doc, filename, titolo) {
  // il blob si fa subito (errori di jsPDF a chi chiama, come prima)
  return mostraPdfBlob(doc.output('blob'), filename, titolo);
}
// stessa anteprima per un PDF gia fatto (blob o byte), per esempio un allegato
async function mostraPdfBlob(blob, filename, titolo) {
  if (!(blob instanceof Blob)) blob = new Blob([blob], { type: 'application/pdf' });
  else if (blob.type !== 'application/pdf') blob = new Blob([blob], { type: 'application/pdf' });
  const gen = ++_pdfPreviewGen;
  if (_pdfPreviewDoc) {
    try {
      _pdfPreviewDoc.destroy();
    } catch (e) {}
    _pdfPreviewDoc = null;
  }
  _pdfPreviewName = _pdfNomeFile(filename);
  _pdfPreviewBlob = blob;
  document.getElementById('pdf-preview-title').textContent = titolo || 'Anteprima PDF';
  const box = _pdfPreviewPagine();
  box.innerHTML = '<p style="color:#fff;margin:auto;font-size:var(--fs-sm,.8125rem)">Preparazione del PDF...</p>';
  document.getElementById('pdf-preview-modal').classList.remove('hidden');
  const attuale = (g) =>
    g === _pdfPreviewGen && !document.getElementById('pdf-preview-modal').classList.contains('hidden');
  try {
    const pdf = await pdfDisegnaPagine(blob, box, gen, attuale);
    if (pdf && attuale(gen)) _pdfPreviewDoc = pdf;
    else if (pdf) pdf.destroy();
  } catch (e) {
    console.error('Anteprima PDF', e);
    if (gen !== _pdfPreviewGen) return;
    // senza anteprima il PDF resta comunque scaricabile con il suo nome
    box.innerHTML =
      '<div style="margin:auto;max-width:420px;text-align:center;color:#fff;line-height:1.5"><p>Anteprima non disponibile in questo browser (' +
      escP((e && e.message) || String(e)) +
      ').</p><p>Il PDF è pronto: premi <b>Scarica PDF</b> e aprilo dal computer.</p></div>';
  }
}
function scaricaPdfPreview() {
  if (!_pdfPreviewBlob) return;
  const url = URL.createObjectURL(_pdfPreviewBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = _pdfPreviewName || 'documento.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('PDF scaricato: ' + (_pdfPreviewName || 'documento.pdf'));
}
// stampa: pagine ridisegnate a ~200 dpi in un riquadro nascosto, poi la stampa del browser
async function stampaPdfPreview() {
  const pdf = _pdfPreviewDoc;
  if (!pdf) {
    toast('Il PDF non è ancora pronto');
    return;
  }
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  try {
    const imgs = [];
    let formato = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const pag = await pdf.getPage(n);
      const v1 = pag.getViewport({ scale: 1 });
      if (n === 1) formato = v1.width > v1.height ? 'A4 landscape' : 'A4 portrait';
      const vp = pag.getViewport({ scale: 200 / 72 });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width);
      cv.height = Math.floor(vp.height);
      await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      imgs.push(cv.toDataURL('image/png'));
    }
    const d = fr.contentDocument;
    d.open();
    d.write(
      '<!doctype html><html><head><title>' +
        escP(_pdfPreviewName) +
        '</title><style>@page{size:' +
        formato +
        ';margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>' +
        imgs.map((s) => '<img src="' + s + '">').join('') +
        '</body></html>',
    );
    d.close();
    await Promise.all([...d.images].map((i) => (i.complete ? null : new Promise((ok) => (i.onload = i.onerror = ok)))));
    fr.contentWindow.focus();
    fr.contentWindow.print();
  } catch (e) {
    toastErrore('Stampa non riuscita: ' + ((e && e.message) || e) + '. Scarica il PDF e stampalo dal computer.');
  }
  setTimeout(() => fr.remove(), 60000);
}
function chiudiPdfPreview() {
  _pdfPreviewGen++;
  document.getElementById('pdf-preview-modal').classList.add('hidden');
  const box = document.getElementById('pdf-preview-pagine');
  if (box) box.innerHTML = '';
  if (_pdfPreviewDoc) {
    try {
      _pdfPreviewDoc.destroy();
    } catch (e) {}
    _pdfPreviewDoc = null;
  }
  const iframe = document.getElementById('pdf-preview-iframe');
  if (iframe && iframe.src) {
    URL.revokeObjectURL(iframe.src);
    iframe.removeAttribute('src');
  }
}

// MALATTIA DAL/AL
let _malFpInit = false;
function _initMalFlatpickr() {
  if (_malFpInit || !window.flatpickr) return;
  _malFpInit = true;
  const o = {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
  };
  flatpickr('#inp-mal-dal', o);
  flatpickr('#inp-mal-al', o);
}
function resetMalFiltri() {
  ['inp-mal-dal', 'inp-mal-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
}
// Mini-calendario Non Disponibilità · selezione giorni sparsi
let _ndSelectedDates = [];
let _ndCalMonth = new Date().getMonth();
let _ndCalYear = new Date().getFullYear();
function _initNdCal() {
  _ndSelectedDates = [];
  _ndCalMonth = new Date().getMonth();
  _ndCalYear = new Date().getFullYear();
  _renderNdCal();
}
// Una non disponibilita' per il mese M va consegnata entro il giorno limite
// del mese precedente (regola nd_jolly_giorno, direttiva 16-007): oltre quel
// termine il giorno e' "fuori tempo" (si puo' comunque registrare, con conferma)
function ndGiornoFuoriTempo(dstr) {
  const lim = typeof _pianoGiornoNd === 'function' ? _pianoGiornoNd() : 3;
  const p = String(dstr).split('-');
  const scadenza = new Date(parseInt(p[0]), parseInt(p[1]) - 2, lim, 23, 59, 59);
  return new Date() > scadenza;
}
function _renderNdCal() {
  const container = document.getElementById('nd-cal-container');
  if (!container) return;
  const mesi = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ];
  const giorni = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'];
  const primo = new Date(_ndCalYear, _ndCalMonth, 1);
  const ultimoGiorno = new Date(_ndCalYear, _ndCalMonth + 1, 0).getDate();
  let startDay = primo.getDay() - 1;
  if (startDay < 0) startDay = 6; // lunedì=0
  const oggi = oggiLocale();
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html +=
    '<button onclick="_ndCalNav(-1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:var(--fs-lg,1.0625rem)">&#9664;</button>';
  html += '<strong style="font-size:var(--fs-base,.9375rem)">' + mesi[_ndCalMonth] + ' ' + _ndCalYear + '</strong>';
  html +=
    '<button onclick="_ndCalNav(1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:var(--fs-lg,1.0625rem)">&#9654;</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';
  giorni.forEach((g) => {
    html +=
      '<div style="font-size:var(--fs-sm,.8125rem);font-weight:700;color:var(--muted);padding:4px 0">' + g + '</div>';
  });
  for (let i = 0; i < startDay; i++) html += '<div></div>';
  for (let d = 1; d <= ultimoGiorno; d++) {
    const ds = _ndCalYear + '-' + String(_ndCalMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isSel = _ndSelectedDates.includes(ds);
    const isToday = ds === oggi;
    const fuori = ndGiornoFuoriTempo(ds);
    let style = 'padding:6px 0;border-radius:2px;cursor:pointer;font-size:var(--fs-md,.875rem);font-weight:600;';
    if (isSel) style += fuori ? 'background:#c0392b;color:white;' : 'background:var(--accent2);color:white;';
    else if (fuori) style += 'background:var(--errore-bg);color:var(--c-rosso,#c0392b);';
    else if (isToday) style += 'background:var(--paper2);border:1px solid var(--accent2);';
    else style += 'background:var(--paper);';
    html +=
      '<div onclick="_ndToggleDate(\'' +
      ds +
      '\')" title="' +
      (fuori
        ? 'FUORI TEMPO: il termine per questo mese era il ' +
          (typeof _pianoGiornoNd === 'function' ? _pianoGiornoNd() : 3) +
          ' del mese precedente'
        : '') +
      '" style="' +
      style +
      '">' +
      d +
      '</div>';
  }
  html += '</div>';
  if (_ndSelectedDates.length) {
    html +=
      '<div style="margin-top:6px"><button onclick="_ndSelectedDates=[];_renderNdCal()" style="font-size:var(--fs-sm,.8125rem);background:none;border:1px solid var(--line);border-radius:2px;padding:2px 8px;cursor:pointer;color:var(--muted)">Pulisci selezione</button></div>';
  }
  container.innerHTML = html;
  // Update selected display
  const selEl = document.getElementById('nd-cal-selected');
  if (selEl) {
    if (_ndSelectedDates.length) {
      const sorted = [..._ndSelectedDates].sort();
      selEl.innerHTML =
        '<strong>Selezionati:</strong> ' +
        sorted.map((ds) => new Date(ds + 'T12:00:00').toLocaleDateString('it-IT')).join(', ') +
        ' <span style="color:var(--accent2);font-weight:700">(' +
        _ndSelectedDates.length +
        ' giorn' +
        (_ndSelectedDates.length === 1 ? 'o' : 'i') +
        ')</span>';
    } else selEl.innerHTML = '';
  }
}
function _ndToggleDate(ds) {
  const idx = _ndSelectedDates.indexOf(ds);
  if (idx >= 0) _ndSelectedDates.splice(idx, 1);
  else _ndSelectedDates.push(ds);
  _renderNdCal();
}
function _ndCalNav(dir) {
  _ndCalMonth += dir;
  if (_ndCalMonth > 11) {
    _ndCalMonth = 0;
    _ndCalYear++;
  }
  if (_ndCalMonth < 0) {
    _ndCalMonth = 11;
    _ndCalYear--;
  }
  _renderNdCal();
}
function resetNdFiltri() {
  _ndSelectedDates = [];
  _renderNdCal();
}
// CORE CRUD
// NOTIFICA BANNER + SUONO
let _notifTimeout = null,
  _notifAction = null;
let _userHasInteracted = false;
document.addEventListener(
  'click',
  () => {
    _userHasInteracted = true;
  },
  { once: true },
);
document.addEventListener(
  'keydown',
  () => {
    _userHasInteracted = true;
  },
  { once: true },
);
document.addEventListener(
  'touchstart',
  () => {
    _userHasInteracted = true;
  },
  { once: true },
);
function _playNotifSound() {
  if (!_userHasInteracted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}
function mostraNotifBanner(tipo, titolo, testo, azione) {
  const icons = {
    nota: '<i class="icx icx-mail"></i>',
    consegna: '<i class="icx icx-penna"></i>',
    promemoria: '<i class="icx icx-clipboard"></i>',
    urgente: '&#10071;',
  };
  const b = document.getElementById('notif-banner');
  b.className = 'notif-banner ' + (tipo || 'nota');
  document.getElementById('notif-icon').innerHTML = icons[tipo] || '<i class="icx icx-campana"></i>';
  document.getElementById('notif-title').textContent = titolo;
  document.getElementById('notif-text').textContent = testo;
  _notifAction = azione || null;
  clearTimeout(_notifTimeout);
  b.classList.add('show');
  _playNotifSound();
  _notifTimeout = setTimeout(() => b.classList.remove('show'), 6000);
}
function chiudiNotifBanner() {
  clearTimeout(_notifTimeout);
  document.getElementById('notif-banner').classList.remove('show');
}
function notifBannerClick() {
  chiudiNotifBanner();
  if (_notifAction) _notifAction();
}

// FINESTRE A PROMESSA nel pwd-modal: chi aspetta una risposta dice qui cosa vale
// "annulla". Chiusa cliccando fuori (maison-helpers.js) o con Esc, la promessa riceve quel
// valore invece di restare appesa: prima restava appesa e unaVoltaSola non liberava piu
// il Salva del Diario. Il segno sta DENTRO il contenuto: cambiato il contenuto, sparisce.
function pwdModalSeAnnullata(fn) {
  const b = document.getElementById('pwd-modal-content');
  if (!b || typeof fn !== 'function') return;
  const m = document.createElement('span');
  m.hidden = true;
  m.className = 'pwd-modal-annulla';
  m._annulla = fn;
  b.appendChild(m);
}
// chiude il pwd-modal come "annulla": risolve la promessa in attesa, se c e
function pwdModalAnnulla() {
  const modal = document.getElementById('pwd-modal');
  if (modal) modal.classList.add('hidden');
  const b = document.getElementById('pwd-modal-content');
  const m = b && b.querySelector('.pwd-modal-annulla');
  if (m && typeof m._annulla === 'function') {
    const f = m._annulla;
    m._annulla = null;
    f();
  }
}
// c e una finestra a promessa aperta nel pwd-modal?
function pwdModalInAttesa() {
  const modal = document.getElementById('pwd-modal');
  const b = document.getElementById('pwd-modal-content');
  const m = b && b.querySelector('.pwd-modal-annulla');
  return !!(modal && !modal.classList.contains('hidden') && m && m._annulla);
}
// QUANTO DUE NOMI SI SOMIGLIANO (23/10/2026), per la finestra "Nome simile": 0 = uguali,
// Infinity = da non proporre. Errori di battitura ammessi in proporzione alla lunghezza
// (parola di 3 lettere: nessuno; 4-6: uno; 7 e oltre: due). Con piu parole scritte devono
// somigliare TUTTE (a parole diverse del nome): una sola parola uguale non basta. Prima
// "Kaya Sevina" proponeva "Bujic Nada" (Kaya/Nada, 2 errori su 4 lettere).
function _nomeSimileSoglia(len) {
  return len >= 7 ? 2 : len >= 4 ? 1 : 0;
}
function _nomeSimileDist(scritto, nome) {
  const a = String(scritto || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const b = String(nome || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!a || !b) return Infinity;
  if (a === b) return 0;
  const intero = _levenshtein(a, b);
  if (intero <= _nomeSimileSoglia(Math.min(a.replace(/ /g, '').length, b.replace(/ /g, '').length))) return intero;
  const pa = a.split(' ');
  const pb = b.split(' ');
  const usate = new Set();
  let somma = 0;
  for (const w of pa) {
    let mig = Infinity,
      jMig = -1;
    pb.forEach((cw, j) => {
      if (usate.has(j)) return;
      const d = _levenshtein(w, cw);
      if (d <= _nomeSimileSoglia(Math.min(w.length, cw.length)) && d < mig) {
        mig = d;
        jMig = j;
      }
    });
    if (jMig < 0) return Infinity;
    usate.add(jMig);
    somma += mig;
  }
  // una parola sola (di almeno 3 lettere) che e' un pezzo del nome: "Rossi" per "Rossi Mario"
  if (pa.length === 1 && a.length < 3) return Infinity;
  return somma;
}
// VERIFICA NOME COLLABORATORE (anti-doppioni). Ritorna il nome scelto. Finestra chiusa
// senza scegliere (clic fuori, Esc): con annullabile=true ritorna null e chi chiama si
// ferma (Diario); altrimenti il nome cosi come e stato scritto, senza aggiungerlo.
async function _verificaNome(nome, annullabile) {
  const _annulla = () => (annullabile ? null : nome);
  if (!nome) return nome;
  const nl = nome.toLowerCase();
  // Esiste esattamente? Vale il nome dell anagrafica, non quello scritto: capitalizzaNome
  // trasformava «QA-A Rossi» in «Qa-A Rossi» e «De Andrade» in «de Andrade», e la
  // registrazione (e la malattia nel Piano, che cerca il nome esatto) restava staccata (A18)
  const _esatto = getCollaboratoriReparto().find((c) => c.nome.toLowerCase() === nl);
  if (_esatto) return _esatto.nome;
  // Cerca simile · solo tra i collaboratori del reparto corrente (soglie in _nomeSimileDist)
  let best = null,
    bestDist = 3;
  for (const c of getCollaboratoriReparto()) {
    const dist = _nomeSimileDist(nome, c.nome);
    if (dist < bestDist) {
      bestDist = dist;
      best = c.nome;
    }
  }
  if (best && bestDist <= 2) {
    return new Promise((res) => {
      const b = document.getElementById('pwd-modal-content');
      // Niente dati dentro codice inline: con un apostrofo nel nome (D'Amico)
      // l'onclick era un errore di sintassi e il modal restava bloccato
      b.innerHTML =
        '<h3>Nome simile trovato</h3><p style="margin-bottom:16px">Hai scritto <strong>"' +
        escP(nome) +
        '"</strong> ma esiste già un collaboratore simile:</p><div style="text-align:center;margin-bottom:20px"><button class="btn-salva" data-verify-usa="best" style="padding:12px 24px;font-size:var(--fs-lg,1.0625rem)">Usa "' +
        escP(best) +
        '"</button></div><div style="text-align:center"><button class="btn-salva" data-verify-usa="nome" style="background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:var(--fs-md,.875rem);box-shadow:none">No, usa "' +
        escP(nome) +
        '" così com\'è</button></div>';
      const scelte = { best, nome };
      b.querySelectorAll('[data-verify-usa]').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.getElementById('pwd-modal').classList.add('hidden');
          res(scelte[btn.dataset.verifyUsa]);
        });
      });
      pwdModalSeAnnullata(() => res(_annulla()));
      document.getElementById('pwd-modal').classList.remove('hidden');
    });
  }
  // Non esiste e nessun simile → chiedi se aggiungere
  return new Promise((res) => {
    const b = document.getElementById('pwd-modal-content');
    b.innerHTML =
      '<h3>Collaboratore non trovato</h3><p style="margin-bottom:16px"><strong>"' +
      escP(nome) +
      '"</strong> non è nella lista collaboratori.</p><div style="text-align:center;margin-bottom:16px"><button class="btn-salva" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\');document.querySelector(\'[data-verify-resolve]\').dataset.result=\'add\';document.querySelector(\'[data-verify-resolve]\').click()" style="padding:12px 24px;font-size:var(--fs-base,.9375rem)">Aggiungi "' +
      escP(nome) +
      "\" alla lista</button></div><div style=\"text-align:center\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='use';document.querySelector('[data-verify-resolve]').click()\" style=\"background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:var(--fs-md,.875rem);box-shadow:none\">Usa senza aggiungere</button></div>";
    const resolver = document.createElement('button');
    resolver.style.display = 'none';
    resolver.dataset.verifyResolve = '1';
    resolver.onclick = async function () {
      if (this.dataset.result === 'add') {
        try {
          const _cr = await secPost('collaboratori', {
            nome,
            attivo: true,
            reparto_dip: currentReparto,
          });
          collaboratoriCache.push(_cr && _cr[0] ? _cr[0] : { nome, attivo: true, reparto_dip: currentReparto });
          collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
          aggiornaNomi();
          toast(nome + ' aggiunto alla lista');
        } catch (e) {}
      }
      res(nome);
      this.remove();
    };
    document.body.appendChild(resolver);
    pwdModalSeAnnullata(() => {
      resolver.remove();
      res(_annulla());
    });
    document.getElementById('pwd-modal').classList.remove('hidden');
  });
}

// PARSER DATA NASCITA FLESSIBILE
// ANNO DI NASCITA scritto con due cifre: una data di nascita non puo essere nel
// futuro, quindi 20xx solo fino all anno in corso, altrimenti 19xx (43 -> 1943).
function annoNascitaDaDueCifre(a) {
  const y = parseInt(a);
  if (isNaN(y) || y >= 100) return y;
  const oggi = new Date().getFullYear();
  return 2000 + y <= oggi ? 2000 + y : 1900 + y;
}
// data di nascita ISO nel futuro (anno letto male): la si riporta al secolo prima
function nascitaNonFutura(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso;
  const oggi = oggiLocale();
  return iso > oggi ? String(parseInt(iso.slice(0, 4)) - 100) + iso.slice(4) : iso;
}
// giorno che esiste davvero nel calendario (31.02 e 31.04 no, 29.02 solo negli anni bisestili):
// prima passava e il database rispondeva con "date/time field value out of range" (C21)
function _dataEsiste(a, m, g) {
  const d = new Date(a, m - 1, g);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === g;
}
function _parseDataNascita(input) {
  if (!input) return '';
  input = input.trim();
  // Prova formato ISO (YYYY-MM-DD) già valido
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [ia, im, ig] = input.split('-').map((x) => parseInt(x, 10));
    return _dataEsiste(ia, im, ig) ? input : '';
  }
  // Solo giorno e mese (12.01): l'anno non e' noto, si usa 1900 come segnaposto
  // e in lettura non viene mostrato. Serve per i compleanni presi dalle liste.
  const sm = input.match(/^(\d{1,2})[\/\.\-](\d{1,2})$/);
  if (sm) {
    const g0 = parseInt(sm[1]);
    const m0 = parseInt(sm[2]);
    // l anno segnaposto 1900 non e bisestile: il 29.02 serve con l anno (il database lo rifiuta)
    if (!_dataEsiste(1900, m0, g0)) return '';
    return '1900-' + String(m0).padStart(2, '0') + '-' + String(g0).padStart(2, '0');
  }
  // Match: gg.mm.aaaa, gg/mm/aaaa, gg-mm-aaaa, gg.mm.aa, gg/mm/aa, ecc.
  const m = input.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (!m) return '';
  const g = parseInt(m[1]),
    me = parseInt(m[2]);
  let a = parseInt(m[3]);
  if (a < 100) a = annoNascitaDaDueCifre(a); // 97 -> 1997, 05 -> 2005, 43 -> 1943
  if (a < 1900 || a > 2030 || !_dataEsiste(a, me, g)) return '';
  return a + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
}
function _initNascitaInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Rimuovi flatpickr se presente (prima di tutto)
  if (el._flatpickr) {
    el._flatpickr.destroy();
    delete el._flatpickr;
  }
  // Rimuovi altInput creato da flatpickr
  const altInput = el.nextElementSibling;
  if (altInput && altInput.classList && altInput.classList.contains('flatpickr-input')) altInput.remove();
  el.removeAttribute('readonly');
  el.style.cursor = 'text';
  el.style.display = '';
  el.placeholder = 'es: 12.01.1997';
  if (!el._nascitaInit) {
    el._nascitaInit = true;
    el.addEventListener('blur', function () {
      const parsed = _parseDataNascita(this.value);
      if (parsed) {
        this.value = new Date(parsed + 'T12:00:00').toLocaleDateString('it-IT');
        this.dataset.isoValue = parsed;
      } else if (this.value.trim()) {
        toast('Formato data non valido');
        this.value = '';
        this.dataset.isoValue = '';
      }
    });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}
function _getNascitaValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.dataset.isoValue) return el.dataset.isoValue;
  return _parseDataNascita(el.value);
}

// ===== CONSERVAZIONE DEI DATI (regolamento aziendale / RAP) =====
// I dati del personale vanno conservati per un numero minimo di anni. La
// cancellazione definitiva di un record che rientra nell'archivio protetto
// viene bloccata; restano possibili le correzioni di quanto inserito da poco
// (errori di battitura), che non sono "archivio".
function conservazioneAnni() {
  const v = typeof conservazioneAnniCfg !== 'undefined' ? parseInt(conservazioneAnniCfg) : NaN;
  return !isNaN(v) && v >= 0 ? v : 5; // default: 5 anni
}
// Giorni entro i quali un record e' considerato "appena inserito" e si puo'
// ancora eliminare davvero (correzione), configurabile, default 30 giorni.
function conservazioneGiorniGrazia() {
  const v = typeof conservazioneGraziaCfg !== 'undefined' ? parseInt(conservazioneGraziaCfg) : NaN;
  return !isNaN(v) && v >= 0 ? v : 30;
}
// true = il record e' nell'archivio protetto e NON va eliminato definitivamente.
// dataRecord = data del fatto (archivio: ultimi N anni); inseritoIl = quando e stato
// scritto (created_at): la correzione di cio che e appena stato inserito vale da QUESTA
// data. Prima la tolleranza si misurava sulla data del fatto: una voce scritta oggi per un
// fatto di agosto risultava archivio, una scritta nel 2024 con data futura si eliminava
// (controllo C, C16). Senza inseritoIl nessuna tolleranza: vale solo l archivio.
function inArchivioProtetto(dataRecord, inseritoIl) {
  const anni = conservazioneAnni();
  if (!anni) return false; // protezione disattivata
  const d = new Date(dataRecord);
  if (isNaN(d.getTime())) return true; // data illeggibile: si protegge per prudenza
  const oggi = new Date();
  const ins = inseritoIl ? new Date(inseritoIl) : null;
  if (ins && !isNaN(ins.getTime())) {
    const etaIns = (oggi - ins) / 86400000; // giorni da quando e stato scritto
    if (etaIns >= 0 && etaIns < conservazioneGiorniGrazia()) return false; // correzione ammessa
  }
  const limite = new Date(oggi);
  limite.setFullYear(limite.getFullYear() - anni);
  return d >= limite; // dentro la finestra dei N anni = protetto
}

// ORDINE UNICO dei collaboratori in tutto il programma = ordine della lista
// del piano (supervisori in alto, poi back office, fissi, jolly). Per chi non
// e' nell'ordine salvato: gruppo per funzione e poi alfabetico.
// Il RESPONSABILE di settore (RESP) e sempre il primo, anche sopra l ordine trascinato
// a mano (richiesta del titolare 08/10/2026). Prima ogni vista del piano aveva la sua
// copia di questa regola, con piccole differenze; ora la usano tutte.
function ordineCollabPiano(nomi, reparto) {
  const rep =
    reparto ||
    (typeof _pianoRepartoSel !== 'undefined' && _pianoRepartoSel
      ? _pianoRepartoSel
      : typeof currentReparto !== 'undefined'
        ? currentReparto
        : 'slots');
  const pos = {};
  ((window._pianoOrdineCollab || {})[rep] || []).forEach((n, i) => (pos[n] = i));
  const info = {};
  (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : []).forEach((c) => (info[c.nome] = c));
  const rank = (n) => {
    const c = info[n] || {};
    const f = String(c.funzione || '').toUpperCase();
    if (f === 'RESP') return -1; // sempre in cima
    if (c.is_jolly || c.impiego === 'jolly') return 4;
    if (f === 'SOSTRESP' || f === 'VICERESP') return 0;
    if (f === 'SUP') return 1;
    if (f === 'BO') return 2;
    return 3;
  };
  return nomi.slice().sort((a, b) => {
    const ra = rank(a) === -1;
    const rb = rank(b) === -1;
    if (ra !== rb) return ra ? -1 : 1;
    const pa = pos[a] != null ? pos[a] : 9999;
    const pb = pos[b] != null ? pos[b] : 9999;
    if (pa !== pb) return pa - pb;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

// Data di nascita leggibile: se l'anno e' 1900 significa "anno non noto"
// (import da liste che riportano solo giorno e mese) e si mostra solo gg/mm
function dataNascitaLabel(d, conNota) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt.getTime())) return '';
  const gg = String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
  if (dt.getFullYear() > 1900) return gg + '/' + dt.getFullYear();
  // anno non indicato (liste compleanni con solo giorno e mese): si dice, cosi'
  // non sembra un dato incompleto per errore
  return conNota === false ? gg : gg + ' (anno non indicato)';
}
// Solo giorno e mese, per gli elenchi compatti
function compleannoLabel(d) {
  return dataNascitaLabel(d, false);
}

// Importo di una registrazione con segno: per le differenze cassa la
// direzione sta nel testo (ammanco = negativo, eccedenza = positivo).
// Ritorna { txt: '-100.00', colore: '#c62828' } pronto da mostrare.
function importoConSegno(e) {
  const v = parseFloat(e && e.importo) || 0;
  if (!v) return null;
  if (/ammanco/i.test((e && e.testo) || '')) return { txt: '-' + fmtCHF(v), colore: '#c62828' };
  if (/eccedenza/i.test((e && e.testo) || '')) return { txt: '+' + fmtCHF(v), colore: '#2e7d32' };
  return { txt: fmtCHF(v), colore: '' };
}

// Conta giorni malattia da una registrazione (1 se singola, N se range)
function _contaGiorniMalattia(entry) {
  const m = (entry.testo || '').match(/\((\d+)\s*giorni/);
  return m ? parseInt(m[1]) : 1;
}
function _contaTotaleMalattie(entries, tipoMal) {
  return entries.filter((e) => e.tipo === tipoMal).reduce((s, e) => s + _contaGiorniMalattia(e), 0);
}

function _highlightField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'border-color .2s,box-shadow .2s';
  el.style.borderColor = 'var(--accent)';
  el.style.boxShadow = '0 0 0 2px rgba(192,57,43,0.2)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, 2000);
  el.focus();
}

// ================================================================
// REPARTI / SETTORI · personalizzabili da admin (Impostazioni → Settori)
// Slots e Tavoli sono fissi (dati storici); gli altri sono configurabili
// in impostazioni 'reparti_config'. La chiave (key) è immutabile perché
// salvata in reparto_dip di ogni record; label e colore sono modificabili.
// ================================================================
const REPARTI_BASE = [
  { key: 'slots', label: 'Slots', colore: '#1a4a7a', fisso: true },
  { key: 'tavoli', label: 'Tavoli', colore: '#8e44ad', fisso: true },
];
const REPARTI_CUSTOM_DEFAULT = [
  { key: 'valet', label: 'Valet', colore: '#1a7a6d', attivo: true },
  { key: 'cleaning', label: 'Cleaning', colore: '#5d6d7e', attivo: true },
];
function getRepartiCustom() {
  return typeof repartiConfig !== 'undefined' && Array.isArray(repartiConfig)
    ? repartiConfig
    : REPARTI_CUSTOM_DEFAULT.map((r) => Object.assign({}, r));
}
function getRepartiTutti() {
  return REPARTI_BASE.concat(getRepartiCustom());
}
function getReparti() {
  return REPARTI_BASE.concat(getRepartiCustom().filter((r) => r.attivo !== false));
}
function getRepartoInfo(key) {
  return getRepartiTutti().find((r) => r.key === key) || null;
}
function repartoLabel(key) {
  if (key === 'entrambi') return 'Tutti i settori';
  const r = getRepartoInfo(key);
  return r ? r.label : key || '';
}
// NOME DEL SETTORE NEI DOCUMENTI (fogli di cambio turno, stampe del Piano, briefing,
// vacanze, crediti): si imposta per settore in Impostazioni > Settori. Vuoto = nome breve.
let repartiNomiDocumenti = {};
function repartoNomeDocumento(key) {
  return (repartiNomiDocumenti && repartiNomiDocumenti[key]) || repartoLabel(key);
}
// testo gia salvato in un documento archiviato (es. "Slots"): nome attuale nei documenti
function settoreNomeDocumento(testo) {
  if (!testo) return testo;
  const r = getRepartiTutti().find((x) => x.label === testo || x.key === testo);
  return r ? repartoNomeDocumento(r.key) : testo;
}
// SETTORE CON BRIEFING E PAUSE (decisione del titolare 01/11/2026): la proprieta briefing del
// settore in reparti_config; senza (Slots, Tavoli e i settori di prima) il briefing c e
function repartoConBriefing(key) {
  const info = getRepartoInfo(key);
  return !(info && info.briefing === false);
}
function repartoColore(key) {
  const r = getRepartoInfo(key);
  return r && r.colore ? r.colore : 'var(--muted)';
}
function repartoLettera(key) {
  const r = getRepartoInfo(key);
  return r && r.label ? r.label.charAt(0).toUpperCase() : '';
}
// Badge lettera reparto (es. S/T/V/C) col colore del settore
function _repBadge(rep, piccolo) {
  if (!rep || rep === 'entrambi' || !getRepartoInfo(rep)) return '';
  return piccolo
    ? '<span style="font-size:var(--fs-sm,.8125rem);--cat:' +
        repartoColore(rep) +
        ';color:var(--cat);font-weight:700;margin-left:4px">' +
        repartoLettera(rep) +
        '</span>'
    : ' <span style="font-size:var(--fs-sm,.8125rem);--cat:' +
        repartoColore(rep) +
        ';color:var(--cat);font-weight:700">' +
        repartoLettera(rep) +
        '</span>';
}
// Opzioni <select> settore (con eventuale voce 'Tutti i settori')
function opzioniRepartoHtml(selezionato, conEntrambi) {
  let h = conEntrambi
    ? '<option value="entrambi"' + (selezionato === 'entrambi' ? ' selected' : '') + '>Tutti i settori</option>'
    : '';
  getReparti().forEach((r) => {
    h +=
      '<option value="' + r.key + '"' + (selezionato === r.key ? ' selected' : '') + '>' + escP(r.label) + '</option>';
  });
  return h;
}
// Select settore nella schermata di login: popolato dalla cache locale
// (le impostazioni non sono leggibili prima del login)
function popolaLoginSettore() {
  const sel = document.getElementById('login-settore');
  if (!sel) return;
  let lista = null;
  try {
    lista = JSON.parse(localStorage.getItem('_cache_reparti') || 'null');
  } catch (e) {}
  if (!lista || !lista.length) lista = getReparti().map((r) => ({ key: r.key, label: r.label }));
  const cur = sel.value;
  sel.innerHTML = lista.map((r) => '<option value="' + r.key + '">' + escP(r.label) + '</option>').join('');
  if (lista.some((r) => r.key === cur)) sel.value = cur;
}
document.addEventListener('DOMContentLoaded', popolaLoginSettore);
function _salvaCacheReparti() {
  try {
    localStorage.setItem('_cache_reparti', JSON.stringify(getReparti().map((r) => ({ key: r.key, label: r.label }))));
  } catch (e) {}
}

// ---- Ripristino scroll dopo il refresh ----
// L'app ridisegna tutto da zero al refresh, quindi il browser non può
// ripristinare da solo la posizione (la pagina è ancora vuota quando ci
// prova). Salviamo posizione+pagina e torniamo lì appena il contenuto
// è pronto; qualsiasi interazione dell'utente annulla il ripristino.
(function () {
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch (e) {}
  let salvaT = null;
  window.addEventListener(
    'scroll',
    () => {
      if (window._scrollRipristino) return;
      clearTimeout(salvaT);
      salvaT = setTimeout(() => {
        try {
          sessionStorage.setItem('scroll_y', String(Math.round(window.scrollY)));
          sessionStorage.setItem('scroll_pg', localStorage.getItem('pagina_corrente') || '');
        } catch (e) {}
      }, 150);
    },
    { passive: true },
  );
  let y = 0;
  let pg = '';
  try {
    y = parseInt(sessionStorage.getItem('scroll_y') || '0');
    pg = sessionStorage.getItem('scroll_pg') || '';
  } catch (e) {}
  if (!y) return;
  window._scrollRipristino = true;
  let tentativi = 0;
  let timer = null;
  const annulla = () => {
    window._scrollRipristino = false;
    if (timer) clearInterval(timer);
    try {
      sessionStorage.removeItem('scroll_y');
      sessionStorage.removeItem('scroll_pg');
    } catch (e) {}
  };
  ['wheel', 'touchstart', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, annulla, { once: true, passive: true }),
  );
  timer = setInterval(() => {
    tentativi++;
    if (!window._scrollRipristino) {
      clearInterval(timer);
      return;
    }
    const overlay = document.getElementById('login-overlay');
    const app = overlay && overlay.classList.contains('hidden');
    const pgAttuale = localStorage.getItem('pagina_corrente') || '';
    if (app && pgAttuale && pgAttuale !== pg) {
      annulla(); // pagina diversa: niente ripristino, si torna a salvare subito
      return;
    }
    const pronta = app && pgAttuale === pg && document.body.scrollHeight >= y + window.innerHeight / 2;
    if (pronta) {
      window.scrollTo(0, y);
      setTimeout(annulla, 300);
    } else if (tentativi > 60) {
      annulla();
    }
  }, 250);
})();

// ---- Anti-salto in cima sui ridisegni ----
// Molte sezioni ridisegnano il contenuto (innerHTML) e per un attimo la
// pagina si accorcia: il browser forza lo scroll a 0 e ti ritrovi in cima.
// Riconosciamo QUEL caso (l'altezza non basta più per la posizione in cui
// eri) e torniamo lì appena il contenuto riprende altezza. Se invece sei tu
// a scrollare in cima, l'altezza è invariata e non tocchiamo nulla.
(function () {
  let lastY = 0;
  let ripristinoT = null;
  const annullaRipristino = () => {
    if (ripristinoT) {
      clearInterval(ripristinoT);
      ripristinoT = null;
    }
  };
  ['wheel', 'touchmove'].forEach((ev) => window.addEventListener(ev, annullaRipristino, { passive: true }));
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (y < 5 && lastY > 150 && !window._scrollRipristino) {
        const collassata = document.documentElement.scrollHeight < lastY + window.innerHeight;
        if (collassata) {
          const target = lastY;
          annullaRipristino();
          let tent = 0;
          ripristinoT = setInterval(() => {
            tent++;
            if (document.documentElement.scrollHeight >= target + window.innerHeight / 2) {
              window.scrollTo(0, target);
              annullaRipristino();
            } else if (tent > 25) {
              annullaRipristino();
            }
          }, 100);
        }
      }
      lastY = y;
    },
    { passive: true },
  );
})();
