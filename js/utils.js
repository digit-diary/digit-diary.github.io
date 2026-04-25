/**
 * Diario Collaboratori — Casino Lugano SA
 * File: utils.js
 * Utility: capitalizzaNome, toast, escP, fmtCHF
 */

function capitalizzaNome(s) {
  return s.replace(/\S+/g, (w) => {
    const l = w.toLowerCase();
    if (
      [
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
      ].includes(l) &&
      s.indexOf(w) > 0
    )
      return l;
    return l.replace(/(^|['-])(\w)/g, (m, sep, ch) => sep + ch.toUpperCase());
  });
}

// TOAST & UTILS
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function escP(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// PDF PREVIEW
let _pdfPreviewBlob = null,
  _pdfPreviewName = '';
function mostraPdfPreview(doc, filename, titolo) {
  _pdfPreviewName = filename;
  const blob = doc.output('blob');
  _pdfPreviewBlob = blob;
  const url = URL.createObjectURL(blob);
  document.getElementById('pdf-preview-title').textContent = titolo || 'Anteprima PDF';
  document.getElementById('pdf-preview-iframe').src = url;
  document.getElementById('pdf-preview-modal').classList.remove('hidden');
}
function scaricaPdfPreview() {
  if (!_pdfPreviewBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(_pdfPreviewBlob);
  a.download = _pdfPreviewName || 'documento.pdf';
  a.click();
  toast('PDF scaricato!');
}
function chiudiPdfPreview() {
  document.getElementById('pdf-preview-modal').classList.add('hidden');
  const iframe = document.getElementById('pdf-preview-iframe');
  if (iframe.src) {
    URL.revokeObjectURL(iframe.src);
    iframe.src = '';
  }
}
_pdfPreviewBlob = null;

// MALATTIA DAL/AL
let _malFpInit = false;
function _initMalFlatpickr() {
  if (_malFpInit || !window.flatpickr) return;
  _malFpInit = true;
  const o = { locale: 'it', dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: false };
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
// Mini-calendario Non Disponibilità — selezione giorni sparsi
let _ndSelectedDates = [];
let _ndCalMonth = new Date().getMonth();
let _ndCalYear = new Date().getFullYear();
function _initNdCal() {
  _ndSelectedDates = [];
  _ndCalMonth = new Date().getMonth();
  _ndCalYear = new Date().getFullYear();
  _renderNdCal();
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
  const oggi = new Date().toISOString().substring(0, 10);
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html +=
    '<button onclick="_ndCalNav(-1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:1rem">&#9664;</button>';
  html += '<strong style="font-size:.92rem">' + mesi[_ndCalMonth] + ' ' + _ndCalYear + '</strong>';
  html +=
    '<button onclick="_ndCalNav(1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:1rem">&#9654;</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';
  giorni.forEach((g) => {
    html += '<div style="font-size:.72rem;font-weight:700;color:var(--muted);padding:4px 0">' + g + '</div>';
  });
  for (let i = 0; i < startDay; i++) html += '<div></div>';
  for (let d = 1; d <= ultimoGiorno; d++) {
    const ds = _ndCalYear + '-' + String(_ndCalMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isSel = _ndSelectedDates.includes(ds);
    const isToday = ds === oggi;
    let style = 'padding:6px 0;border-radius:2px;cursor:pointer;font-size:.84rem;font-weight:600;';
    if (isSel) style += 'background:var(--accent2);color:white;';
    else if (isToday) style += 'background:var(--paper2);border:1px solid var(--accent2);';
    else style += 'background:var(--paper);';
    html += '<div onclick="_ndToggleDate(\'' + ds + '\')" style="' + style + '">' + d + '</div>';
  }
  html += '</div>';
  if (_ndSelectedDates.length) {
    html +=
      '<div style="margin-top:6px"><button onclick="_ndSelectedDates=[];_renderNdCal()" style="font-size:.75rem;background:none;border:1px solid var(--line);border-radius:2px;padding:2px 8px;cursor:pointer;color:var(--muted)">Pulisci selezione</button></div>';
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
  const icons = { nota: '&#9993;', consegna: '&#128221;', promemoria: '&#128203;', urgente: '&#10071;' };
  const b = document.getElementById('notif-banner');
  b.className = 'notif-banner ' + (tipo || 'nota');
  document.getElementById('notif-icon').innerHTML = icons[tipo] || '&#128276;';
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

// VERIFICA NOME COLLABORATORE (anti-doppioni)
async function _verificaNome(nome) {
  if (!nome) return nome;
  const nl = nome.toLowerCase();
  // Esiste esattamente?
  if (collaboratoriCache.find((c) => c.nome.toLowerCase() === nl)) return nome;
  // Cerca simile (Levenshtein ≤ 2)
  let best = null,
    bestDist = 3;
  for (const c of collaboratoriCache) {
    const dist = _levenshtein(nl, c.nome.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = c.nome;
    }
    // Anche per singole parole (cognome)
    const words = c.nome.toLowerCase().split(/\s+/);
    const nWords = nl.split(/\s+/);
    for (const w of nWords) {
      for (const cw of words) {
        const wd = _levenshtein(w, cw);
        if (wd < bestDist && w.length >= 3) {
          bestDist = wd;
          best = c.nome;
        }
      }
    }
  }
  if (best && bestDist <= 2) {
    return new Promise((res) => {
      const b = document.getElementById('pwd-modal-content');
      b.innerHTML =
        '<h3>Nome simile trovato</h3><p style="margin-bottom:16px">Hai scritto <strong>"' +
        escP(nome) +
        "\"</strong> ma esiste gia un collaboratore simile:</p><div style=\"text-align:center;margin-bottom:20px\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='" +
        escP(best) +
        '\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:#2c6e49;padding:12px 24px;font-size:1rem">Usa "' +
        escP(best) +
        "\"</button></div><div style=\"text-align:center\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='" +
        escP(nome) +
        '\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:.88rem;box-shadow:none">No, usa "' +
        escP(nome) +
        '" cosi com\'e</button></div>';
      const resolver = document.createElement('button');
      resolver.style.display = 'none';
      resolver.dataset.verifyResolve = '1';
      resolver.onclick = function () {
        res(this.dataset.result);
        this.remove();
      };
      document.body.appendChild(resolver);
      document.getElementById('pwd-modal').classList.remove('hidden');
    });
  }
  // Non esiste e nessun simile → chiedi se aggiungere
  return new Promise((res) => {
    const b = document.getElementById('pwd-modal-content');
    b.innerHTML =
      '<h3>Collaboratore non trovato</h3><p style="margin-bottom:16px"><strong>"' +
      escP(nome) +
      '"</strong> non e nella lista collaboratori.</p><div style="text-align:center;margin-bottom:16px"><button class="btn-salva" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\');document.querySelector(\'[data-verify-resolve]\').dataset.result=\'add\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:#2c6e49;padding:12px 24px;font-size:.95rem">Aggiungi "' +
      escP(nome) +
      "\" alla lista</button></div><div style=\"text-align:center\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='use';document.querySelector('[data-verify-resolve]').click()\" style=\"background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:.88rem;box-shadow:none\">Usa senza aggiungere</button></div>";
    const resolver = document.createElement('button');
    resolver.style.display = 'none';
    resolver.dataset.verifyResolve = '1';
    resolver.onclick = async function () {
      if (this.dataset.result === 'add') {
        try {
          await secPost('collaboratori', { nome, attivo: true });
          collaboratoriCache.push({ nome, attivo: true });
          collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
          aggiornaNomi();
          toast(nome + ' aggiunto alla lista');
        } catch (e) {}
      }
      res(nome);
      this.remove();
    };
    document.body.appendChild(resolver);
    document.getElementById('pwd-modal').classList.remove('hidden');
  });
}

// PARSER DATA NASCITA FLESSIBILE
function _parseDataNascita(input) {
  if (!input) return '';
  input = input.trim();
  // Prova formato ISO (YYYY-MM-DD) già valido
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  // Match: gg.mm.aaaa, gg/mm/aaaa, gg-mm-aaaa, gg.mm.aa, gg/mm/aa, ecc.
  const m = input.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (!m) return '';
  const g = parseInt(m[1]),
    me = parseInt(m[2]);
  let a = parseInt(m[3]);
  if (a < 100) {
    a = a <= 30 ? 2000 + a : 1900 + a;
  } // 97→1997, 05→2005
  if (g < 1 || g > 31 || me < 1 || me > 12 || a < 1900 || a > 2030) return '';
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
