/**
 * Diario Collaboratori — Casino Lugano SA
 * File: app.js
 * App: routing pagine, init, renderPostLogin, tipi
 * Righe: 355
 */

function switchPage(name) {
  flushRapportoSave();
  // Controllo visibilità: blocca accesso a pagine nascoste (dashboard/diario/impostazioni sempre accessibili)
  const _pagesAlwaysVisible = ['dashboard', 'diario', 'impostazioni'];
  const _visKey = name.replace(/-/g, '_');
  if (!_pagesAlwaysVisible.includes(name) && typeof isVis === 'function' && !isVis(_visKey)) {
    name = 'dashboard';
  }
  var _epf = document.getElementById('early-page-fix');
  if (_epf) _epf.remove();
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  const tb = document.querySelector('.nav-tab[data-page="' + name + '"]');
  if (tb) tb.classList.add('active');
  localStorage.setItem('pagina_corrente', name);
  if (typeof aggiornaMenuMobile === 'function') aggiornaMenuMobile();
  if (name === 'diario') {
    aggiornaNomi();
    _restoreFiltri();
    render();
    updateStats();
  }
  if (name === 'statistiche') {
    initStatsFlatpickr();
    renderStatistiche();
  }
  if (name === 'rapporto') {
    if (!rapportoGiornoAperto) {
      const gc = getGiornataCasino();
      const d = new Date(gc + 'T12:00:00');
      rapportoMese = d.getMonth();
      rapportoAnno = d.getFullYear();
      rapportoGiornoAperto = gc;
    }
    renderRapporto();
  }
  if (name === 'note-collega') {
    initNoteFlatpickr();
    renderNoteCollega();
  }
  if (name === 'impostazioni') {
    renderTipiUI();
    renderScadenzeSettings();
    renderOperatoriUI();
    renderCampiRapportoUI();
    const sb = document.getElementById('sicurezza-btns');
    if (sb) {
      sb.innerHTML = isAdmin()
        ? '<button class="btn-settings" onclick="cambiaPassword()">Cambia password master</button>'
        : '<button class="btn-settings" onclick="cambiaPasswordOperatore()">Cambia la mia password</button>';
    }
    renderCollaboratoriUI();
    renderBiometricSettings();
    const ai = document.getElementById('ai-section');
    if (ai) ai.style.display = isAdmin() ? '' : 'none';
    const dbSec = document.getElementById('db-stats-section');
    if (dbSec) dbSec.style.display = isAdmin() ? '' : 'none';
    const cestSec = document.getElementById('cestino-section');
    if (cestSec) cestSec.style.display = isAdmin() ? '' : 'none';
    const visSec = document.getElementById('visibilita-section');
    if (visSec) {
      visSec.style.display = isAdmin() ? '' : 'none';
      if (isAdmin()) renderVisibilitaUI();
    }
    if (isAdmin() && groqKey) {
      const gs = document.getElementById('groq-status');
      if (gs) gs.innerHTML = '<span style="color:#2c6e49">Chiave configurata</span>';
    }
  }
  if (name === 'moduli') {
    if (!document.getElementById('mod-list-results')) _modFiltInit = false;
    renderModuliList();
  }
  if (name === 'registro') renderRegistro();
  if (name === 'maison') {
    renderMaisonDashboard();
    renderMaisonBudgetUI();
    renderMaisonBudgetAlerts();
    initMaisonFlatpickr();
    renderSpeseExtra();
    initSpeseExtraFP();
    renderRegali();
  }
  if (name === 'promemoria') {
    renderPromemoria();
    initPromemoriaUI();
  }
  if (name === 'dashboard') renderDashboard();
  if (name === 'consegna') {
    initConsFlatpickr();
    renderConsegne();
    initConsegnaUI();
  }
  if (name === 'inventario') {
    renderInventario();
    initInventarioFP();
  }
}

// TIPI
async function saveTipiP() {
  await setImp('tipi_personalizzati', JSON.stringify(tipiPersonalizzati));
}
async function saveColoriOverride() {
  await setImp('colori_override', JSON.stringify(coloriOverride));
}
async function saveOperatori() {
  await setImp('operatori_lista', JSON.stringify(operatoriSalvati));
}
async function cambiaColoreTipo(nome, colore) {
  coloriOverride[nome] = colore;
  const tp = tipiPersonalizzati.find((t) => t.nome === nome);
  if (tp) tp.colore = colore;
  await saveColoriOverride();
  if (tp) await saveTipiP();
  renderTipiUI();
}
async function aggiungiTipoPersonalizzato() {
  const n = document.getElementById('new-tipo-nome').value.trim(),
    c = document.getElementById('new-tipo-colore').value;
  if (!n) {
    toast('Inserisci un nome');
    return;
  }
  if (getTuttiTipi().find((t) => t.nome.toLowerCase() === n.toLowerCase())) {
    toast('Già esistente');
    return;
  }
  tipiPersonalizzati.push({ nome: n, colore: c });
  await saveTipiP();
  logAzione('Tipo aggiunto', n);
  document.getElementById('new-tipo-nome').value = '';
  renderTipiUI();
  toast('Tipo aggiunto');
}
async function rimuoviTipo(n) {
  if (!confirm('Rimuovere "' + n + '"?')) return;
  tipiPersonalizzati = tipiPersonalizzati.filter((t) => t.nome !== n);
  delete coloriOverride[n];
  await saveTipiP();
  await saveColoriOverride();
  renderTipiUI();
  toast('Rimosso');
}
async function nascondiTipoDefault(n) {
  if (!confirm('Nascondere il tipo "' + n + '"? Le registrazioni esistenti non verranno eliminate.')) return;
  tipiNascosti.push(n);
  await setImp('tipi_nascosti', JSON.stringify(tipiNascosti));
  renderTipiUI();
  toast('Tipo "' + n + '" nascosto');
}
async function ripristinaTipoDefault(n) {
  tipiNascosti = tipiNascosti.filter((t) => t !== n);
  await setImp('tipi_nascosti', JSON.stringify(tipiNascosti));
  renderTipiUI();
  toast('Tipo "' + n + '" ripristinato');
}
function _renderPostLogin() {
  try {
    renderTipiUI();
    aggiornaNomi();
    render();
    updateStats();
    renderScadenzeBanner();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    aggiornaNoteBadge();
    aggiornaPromemoriaBadge();
    aggiornaConsegnaBadge();
    renderDashboard();
    checkCompleanniBanner();
    _avviaAutoDisconnessione();
  } catch (e) {
    console.error('Render error:', e);
  }
  // Auto-disconnessione dopo 8 ore di sessione aperta (anche con app in primo piano)
  function _avviaAutoDisconnessione() {
    if (window._autoDisconnTimer) clearInterval(window._autoDisconnTimer);
    window._autoDisconnTimer = setInterval(function () {
      var ts = parseInt(localStorage.getItem('diario_auth_ts') || '0');
      if (!ts) return;
      var ore = (Date.now() - ts) / 3600000;
      if (ore >= 8) {
        clearInterval(window._autoDisconnTimer);
        toast('Sessione scaduta dopo 8 ore. Disconnessione automatica.');
        setTimeout(function () {
          esci();
        }, 2000);
      } else if (ore >= 7.5) {
        // Warning 30 minuti prima della scadenza (mostrato una sola volta)
        if (!window._disconnWarningShown) {
          window._disconnWarningShown = true;
          toast("La sessione scadra' tra 30 minuti. Salva il tuo lavoro.");
        }
      }
    }, 60000); // check ogni 60 secondi
  }
  // Fallback: se dopo 600ms i tipi non ci sono, ri-renderizza
  setTimeout(() => {
    const ft = document.getElementById('form-tipo-tags');
    if (ft && !ft.children.length) {
      console.warn('Fallback render tipi+alerts');
      try {
        renderTipiUI();
        render();
        updateStats();
        renderCassaAlerts();
        renderRischioAlerts();
        renderAmmonimentiAlerts();
      } catch (e2) {
        console.error('Fallback error:', e2);
      }
    }
  }, 600);
}
function renderTipiUI() {
  const tutti = getTuttiTipi();
  document.getElementById('form-tipo-tags').innerHTML = tutti
    .map(
      (t) =>
        '<button class="tipo-tag' +
        (tipoSelezionato === t.nome ? ' active' : '') +
        '" data-tipo="' +
        esc(t.nome) +
        '" style="' +
        (tipoSelezionato === t.nome ? 'background:' + t.colore + ';border-color:' + t.colore : '') +
        '">' +
        esc(t.nome) +
        '</button>'
    )
    .join('');
  document
    .getElementById('form-tipo-tags')
    .querySelectorAll('.tipo-tag')
    .forEach((b) => {
      b.onclick = () => {
        tipoSelezionato = b.dataset.tipo;
        renderTipiUI();
      };
    });
  const errRow = document.getElementById('errore-extra-row');
  if (errRow) errRow.style.display = tipoSelezionato === nomeCorrente('Errore') ? 'block' : 'none';
  const malRow = document.getElementById('malattia-extra-row');
  if (malRow) {
    malRow.style.display = tipoSelezionato === nomeCorrente('Malattia') ? 'block' : 'none';
    _initMalFlatpickr();
  }
  const ndRow = document.getElementById('nd-extra-row');
  if (ndRow) {
    const showNd = tipoSelezionato === nomeCorrente('Non Disponibilità');
    ndRow.style.display = showNd ? 'block' : 'none';
    if (showNd) _initNdCal();
  }
  const fs = document.getElementById('filt-tipo');
  if (fs) {
    const cv = fs.value;
    fs.innerHTML =
      '<option value="">Tutti</option>' +
      tutti.map((t) => '<option' + (t.nome === cv ? ' selected' : '') + '>' + esc(t.nome) + '</option>').join('');
  }
  document.getElementById('modal-tipo-tags').innerHTML = tutti
    .map(
      (t) =>
        '<button class="modal-tipo-tag' +
        (modalTipoSel === t.nome ? ' selected' : '') +
        '" data-tipo="' +
        esc(t.nome) +
        '" style="' +
        (modalTipoSel === t.nome ? 'background:' + t.colore + ';border-color:' + t.colore : '') +
        '">' +
        esc(t.nome) +
        '</button>'
    )
    .join('');
  document
    .getElementById('modal-tipo-tags')
    .querySelectorAll('.modal-tipo-tag')
    .forEach((b) => {
      b.onclick = () => {
        modalTipoSel = b.dataset.tipo;
        renderTipiUI();
      };
    });
  const tl = document.getElementById('tipo-list');
  if (tl) {
    const adm = isAdmin();
    let tlHtml = tutti
      .map((t, idx) => {
        const d = t._orig ? TIPI_DEFAULT.find((x) => x.nome === t._orig) : null;
        const ne = t.nome.replace(/'/g, "\\'");
        const origNe = t._orig ? t._orig.replace(/'/g, "\\'") : ne;
        return (
          '<div class="tipo-item">' +
          (adm
            ? '<input type="color" class="tipo-color-picker" value="' +
              t.colore +
              '" onchange="cambiaColoreTipo(\'' +
              (t._orig || ne) +
              '\',this.value)">'
            : '<div class="tipo-color" style="background:' + t.colore + '"></div>') +
          '<div class="tipo-item-name">' +
          esc(t.nome) +
          (d ? ' <span class="tipo-item-default">(predefinito)</span>' : '') +
          '</div>' +
          (adm
            ? '<div style="display:flex;gap:3px;margin-left:auto"><button class="btn-ord" onclick="spostaTipo(\'' +
              ne +
              '\',-1)"' +
              (idx === 0 ? ' disabled' : '') +
              '>&#9650;</button><button class="btn-ord" onclick="spostaTipo(\'' +
              ne +
              '\',1)"' +
              (idx === tutti.length - 1 ? ' disabled' : '') +
              '>&#9660;</button></div><button class="btn-del-tipo" style="margin-left:6px" onclick="rinominaTipo(\'' +
              ne +
              '\')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="' +
              (d ? "nascondiTipoDefault('" + origNe + "')" : "rimuoviTipo('" + ne + "')") +
              '">Rimuovi</button>'
            : '') +
          '</div>'
        );
      })
      .join('');
    if (adm && tipiNascosti.length) {
      tlHtml +=
        '<div style="margin-top:12px;padding:10px;background:var(--paper2);border-radius:3px"><small style="color:var(--muted);display:block;margin-bottom:6px">Tipi nascosti:</small>' +
        tipiNascosti
          .map(
            (n) =>
              '<button style="margin:2px 4px;padding:3px 10px;font-size:.78rem;cursor:pointer;border:1px dashed var(--accent2);color:var(--accent2);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif" onclick="ripristinaTipoDefault(\'' +
              n.replace(/'/g, "\\'") +
              '\')">+ ' +
              escP(n) +
              '</button>'
          )
          .join('') +
        '</div>';
    }
    tl.innerHTML = tlHtml;
    const addTipo = tl.parentElement.querySelector('.add-tipo-row');
    if (addTipo) addTipo.style.display = adm ? '' : 'none';
  }
  let s = document.getElementById('dyn-styles');
  if (!s) {
    s = document.createElement('style');
    s.id = 'dyn-styles';
    document.head.appendChild(s);
  }
  s.textContent = tutti.map((t) => '.badge-' + t.nome.replace(/ /g, '-') + '{background:' + t.colore + '}').join('\n');
}

// CAPITALIZZAZIONE NOMI
