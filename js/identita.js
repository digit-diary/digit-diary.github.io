/**
 * Diario Collaboratori
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: identita.js
 */

// ================================================================
// IDENTITA DEL PROGRAMMA (nome, azienda cliente, sigla, riga sopra il titolo,
// logo, colori). Un'unica fonte: identita(). La legge tutto il programma
// (testata, accesso, titolo della pagina, intestazioni e piedi dei PDF e
// delle stampe). Si imposta in Impostazioni generali > Settori e moduli >
// Identita del programma (solo amministratore, impostazione 'identita').
// Prima dell'accesso il database non e leggibile: l'ultima identita vista
// resta in localStorage e vale subito alla schermata di accesso.
// La riga del proprietario del programma in fondo alla pagina ha il testo
// fisso in index.html (.app-copyright, mai in stampa): da qui si decide solo
// se si vede (predefinito: nascosta).
// ================================================================
const IDENTITA_PREDEFINITA = Object.freeze({
  programma: 'Diario Collaboratori',
  azienda: 'Casinò Lugano SA',
  sigla: 'CLSA',
  riga: 'Registro Aziendale',
  logo: '', // vuoto = il file logo_casino.png
  colore: '', // vuoto = colori del tema (--accent)
  accento: '', // vuoto = colori del tema (--accent2)
  proprietario: false, // riga del proprietario del programma in fondo alla pagina (testo fisso)
});
const IDENTITA_LOGO_FILE = 'logo_casino.png';
const IDENTITA_LOGO_MAX_BYTE = 300 * 1024; // limite del logo salvato (immagine decodificata)
const IDENTITA_LOGO_MAX_LATO = 400; // lato lungo massimo in pixel
const _IDENTITA_LS = 'diario_identita';
const _IDENTITA_LUNGHEZZE = { programma: 60, azienda: 80, sigla: 12, riga: 60 };

let _identitaCfg = {}; // solo i valori diversi dai predefiniti

// pulisce un oggetto letto dal database o da localStorage: solo i campi noti,
// testi accorciati, logo solo PNG/JPEG in data URL, colori solo #rrggbb
function _identitaPulisci(o) {
  const r = {};
  if (!o || typeof o !== 'object') return r;
  Object.keys(_IDENTITA_LUNGHEZZE).forEach((k) => {
    if (typeof o[k] !== 'string') return;
    const v = o[k].replace(/\s+/g, ' ').trim().slice(0, _IDENTITA_LUNGHEZZE[k]);
    if (v && v !== IDENTITA_PREDEFINITA[k]) r[k] = v;
  });
  if (
    typeof o.logo === 'string' &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(o.logo) &&
    o.logo.length <= Math.ceil((IDENTITA_LOGO_MAX_BYTE * 4) / 3) + 40
  )
    r.logo = o.logo;
  ['colore', 'accento'].forEach((k) => {
    if (typeof o[k] === 'string' && /^#[0-9a-f]{6}$/i.test(o[k])) r[k] = o[k].toLowerCase();
  });
  if (o.proprietario === true) r.proprietario = true;
  return r;
}

// L'IDENTITA IN USO: sempre completa (i campi mancanti hanno il valore predefinito).
// logoUrl e l'immagine da mostrare (logo caricato oppure il file predefinito).
function identita() {
  const r = Object.assign({}, IDENTITA_PREDEFINITA, _identitaCfg);
  r.logoUrl = r.logo || IDENTITA_LOGO_FILE;
  r.personalizzata = Object.keys(_identitaCfg).length > 0;
  return r;
}
// testo da salvare nel database (solo i valori cambiati; '{}' = tutto predefinito)
function identitaJson(o) {
  return JSON.stringify(_identitaPulisci(o));
}

// imposta l'identita (dal database, dalla copia locale o dal pannello) e la applica
function identitaImposta(o, opz) {
  const prima = JSON.stringify(_identitaCfg);
  _identitaCfg = _identitaPulisci(o);
  const dopo = JSON.stringify(_identitaCfg);
  if (!opz || opz.locale !== false) {
    try {
      if (dopo === '{}') localStorage.removeItem(_IDENTITA_LS);
      else localStorage.setItem(_IDENTITA_LS, dopo);
    } catch (e) {}
  }
  identitaApplica();
  // logo dei PDF: si ricarica solo se e cambiato
  if (prima !== dopo) {
    _logoB64 = null;
    if (typeof _ndLogo !== 'undefined') _ndLogo = null;
    _loadLogo();
  }
}
// dal valore del database (testo JSON o null)
function identitaDaImpostazione(v) {
  let o = {};
  if (v)
    try {
      o = JSON.parse(v) || {};
    } catch (e) {
      o = {};
    }
  identitaImposta(o);
}

// ---- colori: contrasto leggibile in tema chiaro e scuro ----
function _idRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _idHex(rgb) {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function _idLum(rgb) {
  const c = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function _idContrasto(a, b) {
  const la = _idLum(_idRgb(a)),
    lb = _idLum(_idRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// il colore scelto, schiarito o scurito il minimo per leggere bene sul fondo (4,5:1)
function identitaColorePerFondo(hex, fondo) {
  const verso = _idLum(_idRgb(fondo)) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  const base = _idRgb(hex);
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = _idHex(base.map((v, i) => v + (verso[i] - v) * t));
    if (_idContrasto(c, fondo) >= 4.5) return c;
  }
  return _idHex(verso);
}
// fondi dei riquadri dei due temi (css/style.css, --paper)
const _IDENTITA_FONDO_CHIARO = '#faf7f2';
const _IDENTITA_FONDO_SCURO = '#241d17';
function _identitaCss(id) {
  const chiaro = [],
    scuro = [];
  [
    ['colore', '--accent'],
    ['accento', '--accent2'],
  ].forEach(([k, v]) => {
    if (!id[k]) return;
    chiaro.push(v + ':' + identitaColorePerFondo(id[k], _IDENTITA_FONDO_CHIARO));
    scuro.push(v + ':' + identitaColorePerFondo(id[k], _IDENTITA_FONDO_SCURO));
  });
  if (!chiaro.length) return '';
  return ':root{' + chiaro.join(';') + '}body.dark-theme{' + scuro.join(';') + '}';
}

// ---- applica a pagina, testata, accesso ----
function _idTesto(id, testo) {
  const el = document.getElementById(id);
  if (el && el.textContent !== testo) el.textContent = testo;
}
function identitaApplica() {
  if (typeof document === 'undefined') return;
  const id = identita();
  document.title = id.programma + ' – ' + id.azienda;
  const mt = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (mt) mt.setAttribute('content', id.personalizzata ? id.programma : 'Diario CL');
  _idTesto('id-riga', id.riga);
  _idTesto('id-programma', id.programma);
  _idTesto('id-azienda', id.azienda);
  const pr = document.querySelector('footer.app-copyright');
  if (pr) pr.hidden = !id.proprietario;
  const lg = document.getElementById('login-logo');
  if (lg) {
    if (lg.getAttribute('src') !== id.logoUrl) lg.setAttribute('src', id.logoUrl);
    lg.setAttribute('alt', id.azienda);
  }
  let st = document.getElementById('identita-colori');
  const css = _identitaCss(id);
  if (css) {
    if (!st) {
      st = document.createElement('style');
      st.id = 'identita-colori';
      (document.head || document.documentElement).appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  } else if (st) st.remove();
}

// ---- logo nei PDF (jsPDF) ----
let _logoB64 = null;
let _logoRatio = 1224 / 689; // larghezza / altezza del logo predefinito
let _logoCaricamento = null;
function _loadLogo() {
  const url = identita().logoUrl;
  const p = (async () => {
    try {
      let dati = url;
      if (!/^data:/.test(url)) {
        const r = await fetch(url);
        if (!r.ok) return;
        const b = await r.blob();
        dati = await new Promise((res) => {
          const rd = new FileReader();
          rd.onloadend = () => res(rd.result);
          rd.readAsDataURL(b);
        });
      }
      const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = ko;
        i.src = dati;
      });
      // una risposta arrivata dopo un cambio di logo non sovrascrive quello nuovo
      if (identita().logoUrl !== url) return;
      if (img.width && img.height) _logoRatio = img.width / img.height;
      _logoB64 = dati;
    } catch (e) {}
  })();
  _logoCaricamento = p;
  return p;
}
function _identitaFormatoImg(dati) {
  return /^data:image\/jpe?g/i.test(dati || '') ? 'JPEG' : 'PNG';
}
// Disegna il logo dentro un riquadro w x h (mm) senza deformarlo.
// centrato=true: x e il centro orizzontale; altrimenti il bordo sinistro.
// Il logo predefinito ha le proporzioni dei riquadri storici: esce identico.
function identitaLogoPdf(doc, x, y, w, h, centrato) {
  if (!_logoB64) return null;
  let lw = w,
    lh = h;
  const box = w / h;
  if (Math.abs(box - _logoRatio) / box > 0.01) {
    if (_logoRatio > box) lh = w / _logoRatio;
    else lw = h * _logoRatio;
  }
  const lx = centrato ? x - lw / 2 : x;
  const ly = y + (h - lh) / 2;
  try {
    // alias: il logo entra nel PDF una volta sola anche su piu pagine; FAST = compresso
    doc.addImage(_logoB64, _identitaFormatoImg(_logoB64), lx, ly, lw, lh, 'identita-logo', 'FAST');
  } catch (e) {
    return null;
  }
  return { w: lw, h: lh };
}

// ---- pannello in Impostazioni generali (solo amministratore) ----
let _identitaBozza = null;
function _identitaCampo(k, etichetta, segnaposto) {
  return (
    '<div class="field"><label for="identita-' +
    k +
    '">' +
    etichetta +
    '</label><input type="text" id="identita-' +
    k +
    '" maxlength="' +
    _IDENTITA_LUNGHEZZE[k] +
    '" placeholder="' +
    escP(segnaposto) +
    '" oninput="_identitaDaModulo()" /></div>'
  );
}
function _identitaColoreCampo(k, etichetta, cssVar) {
  return (
    '<div class="field"><label for="identita-' +
    k +
    '">' +
    etichetta +
    '</label><div style="display:flex;gap:6px;align-items:center"><input type="color" id="identita-' +
    k +
    '" oninput="_identitaDaModulo(\'' +
    k +
    '\')" style="width:48px;height:32px;padding:2px" /><label style="display:flex;gap:4px;align-items:center;font-size:var(--fs-sm,.8125rem)"><input type="checkbox" id="identita-' +
    k +
    '-tema" onchange="_identitaDaModulo()" /> colori del tema</label></div><span class="sez-stato" style="font-size:var(--fs-xs,.75rem)">' +
    'Predefinito: ' +
    cssVar +
    '</span></div>'
  );
}
function renderIdentitaUI() {
  const box = document.getElementById('identita-ui');
  if (!box) return;
  const p = IDENTITA_PREDEFINITA;
  box.innerHTML =
    '<div class="add-tipo-row sez-form">' +
    _identitaCampo('programma', 'Nome del programma', p.programma) +
    _identitaCampo('azienda', 'Azienda', p.azienda) +
    _identitaCampo('sigla', 'Sigla breve', p.sigla) +
    _identitaCampo('riga', 'Riga sopra il titolo', p.riga) +
    '</div>' +
    '<div class="add-tipo-row sez-form">' +
    _identitaColoreCampo('colore', 'Colore principale', 'rosso del tema (bordi, schede attive)') +
    _identitaColoreCampo('accento', 'Colore di accento', 'oro del tema (nome dell azienda)') +
    '<div class="field"><label>Logo</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
    '<button type="button" class="btn-secondario" onclick="document.getElementById(\'identita-logo-file\').click()"><i class="icx icx-file"></i> Carica logo</button>' +
    '<button type="button" class="btn-secondario" id="identita-logo-togli" onclick="_identitaTogliLogo()">Logo predefinito</button>' +
    '<input type="file" id="identita-logo-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" style="display:none" onchange="_identitaCaricaLogo(this)" />' +
    '</div><span class="sez-stato" id="identita-logo-info" style="font-size:var(--fs-xs,.75rem)"></span></div>' +
    '</div>' +
    '<div class="add-tipo-row sez-form"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="identita-proprietario" onchange="_identitaDaModulo()" /> Mostra il proprietario del programma in fondo alla pagina</label></div>' +
    '<p class="sez-sottotitolo">Anteprima</p>' +
    '<div id="identita-anteprima" style="display:flex;gap:16px;flex-wrap:wrap;align-items:stretch"></div>' +
    '<p class="sez-stato" style="font-size:var(--fs-sm,.8125rem)">I colori scelti vengono schiariti o scuriti il minimo necessario per restare leggibili nel tema chiaro e nel tema scuro; lo sfondo non cambia. Il nome del programma, l azienda e il logo valgono anche alla schermata di accesso dal prossimo avvio di ogni dispositivo.</p>' +
    '<div class="sez-azioni-riga" style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button type="button" class="btn-add-tipo" onclick="salvaIdentita(this)">Salva</button>' +
    '<button type="button" class="btn-secondario" onclick="_identitaPredefiniti()">Rimetti i valori predefiniti</button>' +
    '</div><p class="sez-stato" id="identita-stato"></p>';
  _identitaBozza = Object.assign({}, _identitaCfg);
  _identitaRiempiModulo();
}
function _identitaRiempiModulo() {
  const b = Object.assign({}, IDENTITA_PREDEFINITA, _identitaBozza);
  ['programma', 'azienda', 'sigla', 'riga'].forEach((k) => {
    const el = document.getElementById('identita-' + k);
    if (el) el.value = _identitaBozza[k] || '';
  });
  const pr = document.getElementById('identita-proprietario');
  if (pr) pr.checked = !!_identitaBozza.proprietario;
  [
    ['colore', '#c0392b'],
    ['accento', '#8b6914'],
  ].forEach(([k, def]) => {
    const c = document.getElementById('identita-' + k);
    const t = document.getElementById('identita-' + k + '-tema');
    if (c) c.value = b[k] || def;
    if (t) t.checked = !b[k];
  });
  _identitaAnteprima();
}
// legge il modulo nella bozza (scegliere un colore toglie la spunta "colori del tema")
function _identitaDaModulo(coloreToccato) {
  if (!_identitaBozza) _identitaBozza = {};
  ['programma', 'azienda', 'sigla', 'riga'].forEach((k) => {
    const el = document.getElementById('identita-' + k);
    if (el) _identitaBozza[k] = el.value;
  });
  const pr = document.getElementById('identita-proprietario');
  if (pr) _identitaBozza.proprietario = pr.checked;
  ['colore', 'accento'].forEach((k) => {
    const c = document.getElementById('identita-' + k);
    const t = document.getElementById('identita-' + k + '-tema');
    if (coloreToccato === k && t) t.checked = false;
    if (c && t) _identitaBozza[k] = t.checked ? '' : c.value;
  });
  _identitaAnteprima();
}
function _identitaAnteprima() {
  const box = document.getElementById('identita-anteprima');
  if (!box) return;
  const id = Object.assign({}, IDENTITA_PREDEFINITA, _identitaPulisci(_identitaBozza));
  const logo = id.logo || IDENTITA_LOGO_FILE;
  const scuro = document.body.classList.contains('dark-theme');
  const fondo = scuro ? _IDENTITA_FONDO_SCURO : _IDENTITA_FONDO_CHIARO;
  const acc = id.colore ? identitaColorePerFondo(id.colore, fondo) : 'var(--accent)';
  const acc2 = id.accento ? identitaColorePerFondo(id.accento, fondo) : 'var(--accent2)';
  box.innerHTML =
    // testata
    '<div style="flex:1 1 280px;min-width:0;background:var(--paper);border:1px solid var(--line);border-radius:var(--r-2);padding:12px 14px">' +
    '<div style="font-size:var(--fs-xs,.75rem);color:var(--muted);margin-bottom:6px">Testata del programma</div>' +
    '<div style="border-bottom:2px solid ' +
    acc +
    ";padding-bottom:8px;font-family:'Playfair Display',serif;font-size:var(--fs-xl,1.25rem);color:var(--ink);line-height:1.15;overflow-wrap:anywhere\">" +
    '<span style="display:block;font-family:\'Source Sans 3\',sans-serif;font-size:var(--fs-xs,.75rem);font-weight:300;color:var(--muted);letter-spacing:.12em;text-transform:uppercase">' +
    escP(id.riga) +
    '</span>' +
    escP(id.programma) +
    "<span style=\"display:block;font-family:'Source Sans 3',sans-serif;font-size:var(--fs-xs,.75rem);font-weight:600;color:" +
    acc2 +
    ';letter-spacing:.1em;text-transform:uppercase;margin-top:3px">' +
    escP(id.azienda) +
    '</span></div></div>' +
    // pagina di stampa (sempre su carta bianca)
    '<div style="flex:1 1 280px;min-width:0;background:#fff;color:#222;border:1px solid var(--line);border-radius:var(--r-2);padding:10px 14px;display:flex;flex-direction:column;gap:6px">' +
    '<div style="font-size:var(--fs-xs,.75rem);color:#666">Documento stampato o PDF</div>' +
    '<div style="text-align:center"><img src="' +
    escP(logo) +
    '" alt="" style="max-width:110px;max-height:62px;object-fit:contain" /></div>' +
    '<div style="text-align:center;font-weight:700;font-size:var(--fs-md,.875rem)">RAPPORTO</div>' +
    '<div style="text-align:center;font-size:var(--fs-xs,.75rem);color:#555">' +
    escP(id.azienda) +
    ' · dal 01.10.2026 al 31.10.2026</div>' +
    '<div style="flex:1;min-height:18px;border-top:1px dashed #ccc;margin-top:4px"></div>' +
    '<div style="font-size:var(--fs-xs,.75rem);color:#888">' +
    escP(id.azienda) +
    ' · Pag. 1/1</div></div>';
  const info = document.getElementById('identita-logo-info');
  if (info)
    info.textContent = id.logo
      ? 'Logo caricato (' + Math.round((id.logo.length * 3) / 4 / 1024) + ' KB)'
      : 'Logo predefinito (' + IDENTITA_LOGO_FILE + ')';
  const tg = document.getElementById('identita-logo-togli');
  if (tg) tg.disabled = !id.logo;
}
function _identitaTogliLogo() {
  if (!_identitaBozza) _identitaBozza = {};
  _identitaBozza.logo = '';
  _identitaAnteprima();
}
// logo: ridimensionato nel browser (lato lungo max 400 px), PNG se sta nel
// limite, altrimenti JPEG su fondo bianco; oltre il limite viene rifiutato
async function _identitaCaricaLogo(input) {
  const f = input && input.files && input.files[0];
  if (input) input.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) {
    toastErrore('Il logo deve essere un immagine (PNG, JPEG, WebP, GIF o SVG).');
    return;
  }
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('immagine non leggibile'));
      i.src = url;
    });
    URL.revokeObjectURL(url);
    let w = img.naturalWidth || img.width || IDENTITA_LOGO_MAX_LATO;
    let h = img.naturalHeight || img.height || IDENTITA_LOGO_MAX_LATO;
    const s = Math.min(1, IDENTITA_LOGO_MAX_LATO / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const pesoMax = Math.floor((IDENTITA_LOGO_MAX_BYTE * 4) / 3);
    let dati = c.toDataURL('image/png');
    if (dati.length > pesoMax) {
      const cj = document.createElement('canvas');
      cj.width = w;
      cj.height = h;
      const cx = cj.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      dati = cj.toDataURL('image/jpeg', 0.88);
      if (dati.length > pesoMax) dati = cj.toDataURL('image/jpeg', 0.7);
    }
    if (dati.length > pesoMax) {
      toastErrore('Logo troppo pesante anche ridotto: usa un immagine più semplice (massimo 300 KB).');
      return;
    }
    if (!_identitaBozza) _identitaBozza = {};
    _identitaBozza.logo = dati;
    _identitaAnteprima();
    toast('Logo pronto: premi Salva per applicarlo');
  } catch (e) {
    toastErrore('Logo non caricato: ' + (e.message || e));
  }
}
function _identitaPredefiniti() {
  _identitaBozza = {};
  _identitaRiempiModulo();
  const st = document.getElementById('identita-stato');
  if (st) st.textContent = 'Valori predefiniti nel modulo: premi Salva per applicarli.';
}
async function salvaIdentita(btn) {
  if (typeof isAdmin === 'function' && !isAdmin()) {
    toastErrore('Solo l amministratore può cambiare l identità del programma.');
    return;
  }
  _identitaDaModulo();
  const pulita = _identitaPulisci(_identitaBozza);
  const testo = JSON.stringify(pulita);
  const fn = async () => {
    const ok = await salvaImp('identita', testo);
    if (!ok) return;
    identitaImposta(pulita);
    _identitaBozza = Object.assign({}, _identitaCfg);
    _identitaAnteprima();
    const st = document.getElementById('identita-stato');
    if (st)
      st.textContent =
        testo === '{}' ? 'Salvato: valori predefiniti.' : 'Salvato: vale da subito per tutti al prossimo caricamento.';
    toast('Identità del programma salvata');
  };
  if (typeof unaVoltaSola === 'function') return unaVoltaSola('identita', fn, btn);
  return fn();
}

// all'avvio, prima dell'accesso: ultima identita vista su questo dispositivo
(function () {
  let o = {};
  try {
    o = JSON.parse(localStorage.getItem(_IDENTITA_LS) || '{}') || {};
  } catch (e) {
    o = {};
  }
  _identitaCfg = _identitaPulisci(o);
  identitaApplica();
  // la riga in fondo alla pagina viene dopo questo file: si applica di nuovo a pagina letta
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', identitaApplica);
})();
