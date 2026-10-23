/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: punti-proposte.js
 *
 * PUNTI DA APPROVARE (decisione del titolare, migrazione 20260931_c). Chi non ha «Punti e
 * premi» non assegna punti validi: coperture, cambi turno, rifiuti, competenze e livelli
 * diventano PROPOSTE (tabella punti_proposte). Non contano in totali, livelli, premi e
 * statistiche finche chi ha «Punti e premi» (o l amministratore) non le approva qui, in
 * Formazione. Approva e Rifiuta passano dal database (punti_proposte_decidi: permesso, riga nel
 * Registro); Annulla le riporta «da approvare».
 */
let puntiProposteCache = [];
let _ppSelezione = new Set();

function puntiProposteApprovatore() {
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  return typeof puoModificare === 'function' && puoModificare('gestione_punti');
}
// proposte da approvare (solo per chi approva; per gli altri resta vuoto)
async function puntiProposteCarica() {
  if (!puntiProposteApprovatore() || (typeof incentiviVisibili === 'function' && !incentiviVisibili())) {
    puntiProposteCache = [];
  } else {
    try {
      const r = await _conSessione(
        (t) => _rpcSicura('punti_proposte_leggi', { p_token: t, p_stato: 'da_approvare' }),
        getOpToken(),
      );
      puntiProposteCache = Array.isArray(r) ? r : [];
    } catch (e) {
      // database non ancora aggiornato: nessuna proposta (non un errore per chi usa il programma)
      if (!/punti_proposte_leggi|PGRST202|Could not find the function/i.test((e && e.message) || ''))
        console.warn('proposte di punti non lette', e);
      puntiProposteCache = [];
    }
  }
  const ids = new Set(puntiProposteCache.map((p) => p.id));
  _ppSelezione = new Set([..._ppSelezione].filter((id) => ids.has(id)));
  puntiProposteAvvisi();
  return puntiProposteCache;
}
// avviso in cima alle pagine (segnalazioni) e numero in Home
function puntiProposteAvvisi() {
  const box = document.getElementById('punti-alerts-container');
  if (!box) return;
  const n = puntiProposteCache.length;
  box.innerHTML = n
    ? '<div class="cassa-alert-banner" style="cursor:pointer" onclick="puntiProposteApri()"><i class="icx icx-avviso"></i> <b>' +
      n +
      (n === 1 ? ' proposta di punti da approvare' : ' proposte di punti da approvare') +
      '</b> · apri Formazione</div>'
    : '';
  if (typeof renderAlertCompatti === 'function') renderAlertCompatti();
}
function puntiProposteApri() {
  if (typeof switchPage === 'function') switchPage('formazione');
  setTimeout(() => {
    const c = document.getElementById('pp-card');
    if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 400);
}
const _PP_AZIONI = {
  copertura: 'Copertura',
  cambio_turno: 'Cambio turno',
  disponibilita_negata: 'Rifiuto della disponibilità',
  competenza: 'Competenza',
  sessione_formativa: 'Sessione formativa',
  formatore: 'Formatore',
};
function _ppAzione(a) {
  if (/^livello_\d+$/.test(a || '')) return 'Livello ' + a.substring(8);
  return _PP_AZIONI[a] || a;
}
// riquadro in Formazione (vuoto se non ci sono proposte o non si approva)
function puntiProposteCardHtml() {
  if (!puntiProposteApprovatore() || !puntiProposteCache.length) return '';
  const fmt = (d) => (d ? String(d).substring(0, 10).split('-').reverse().join('.') : '');
  const righe = puntiProposteCache
    .map(
      (p) =>
        '<tr><td><input type="checkbox" aria-label="Seleziona" ' +
        (_ppSelezione.has(p.id) ? 'checked ' : '') +
        'onchange="puntiProposteSeleziona(' +
        p.id +
        ', this.checked)"></td><td>' +
        escP(fmt(p.rif_data || p.created_at)) +
        '</td><td><b>' +
        escP(p.collaboratore) +
        '</b>' +
        (p.rif_assente ? '<br><small>per ' + escP(p.rif_assente) + '</small>' : '') +
        '</td><td>' +
        escP(_ppAzione(p.azione)) +
        '</td><td style="text-align:right;font-weight:700">' +
        (Number(p.punti) > 0 ? '+' : '') +
        escP(String(p.punti)) +
        '</td><td>' +
        escP(p.descrizione || '') +
        (p.verifica
          ? '<div class="pp-verifica" style="color:var(--accent);font-weight:600;margin-top:2px">' +
            escP(p.verifica) +
            '</div>'
          : '') +
        '</td><td>' +
        escP(p.proposto_da || '') +
        '<br><small>' +
        escP(fmt(p.created_at)) +
        '</small></td><td style="white-space:nowrap"><button type="button" class="btn-act" onclick="puntiProposteDecidi([' +
        p.id +
        '],\'approva\')">Approva</button> <button type="button" class="btn-act edit" onclick="puntiProposteDecidi([' +
        p.id +
        "],'rifiuta')\">Rifiuta</button></td></tr>",
    )
    .join('');
  return (
    '<div class="main-card" id="pp-card" style="margin-bottom:16px"><div class="card-header">Punti da approvare <span class="mini-badge" style="background:var(--accent)">' +
    puntiProposteCache.length +
    '</span></div><div style="padding:12px 14px"><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Proposte di chi non gestisce i punti (coperture, cambi turno, rifiuti, competenze). Contano nei totali, nei livelli e nei premi solo dopo l’approvazione. In rosso: il fatto non risulta nel piano.</p>' +
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:760px;font-size:var(--fs-md,.875rem)"><thead><tr><th></th><th>Data</th><th>Persona</th><th>Azione</th><th>Punti</th><th style="text-align:left">Motivo</th><th>Proposta da</th><th></th></tr></thead><tbody>' +
    righe +
    '</tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn-modal-ok" onclick="puntiProposteDecidiSelezionati(\'approva\')">Approva selezionati</button><button type="button" class="btn-secondario" onclick="puntiProposteSelezionaTutte()">Seleziona tutte</button></div></div></div>'
  );
}
function puntiProposteSeleziona(id, si) {
  if (si) _ppSelezione.add(id);
  else _ppSelezione.delete(id);
}
function puntiProposteSelezionaTutte() {
  _ppSelezione = new Set(puntiProposteCache.map((p) => p.id));
  _ppRidisegna();
}
function puntiProposteDecidiSelezionati(dec) {
  const ids = [..._ppSelezione];
  if (!ids.length) {
    toast('Seleziona almeno una proposta');
    return;
  }
  return puntiProposteDecidi(ids, dec);
}
function _ppRidisegna() {
  const c = document.getElementById('pp-card');
  const html = puntiProposteCardHtml();
  if (c) {
    if (html) c.outerHTML = html;
    else c.remove();
  } else if (html) {
    const fz = document.getElementById('formazione-content');
    if (fz && fz.offsetParent) fz.insertAdjacentHTML('afterbegin', html);
  }
  if (typeof renderDashboard === 'function' && localStorage.getItem('pagina_corrente') === 'dashboard')
    renderDashboard();
}
// una decisione alla volta (doppio clic = una sola)
function puntiProposteDecidi(ids, dec) {
  return unaVoltaSola('punti-proposte', () => _puntiProposteDecidiEsegui(ids, dec));
}
async function _puntiProposteDecidiEsegui(ids, dec) {
  if (!puntiProposteApprovatore()) {
    toastErrore('Approvare i punti: serve il permesso Punti e premi');
    return;
  }
  let r;
  try {
    r = await _conSessione(
      (t) => _rpcSicura('punti_proposte_decidi', { p_token: t, p_ids: ids, p_decisione: dec }),
      getOpToken(),
      true,
    );
  } catch (e) {
    toastErrore(
      'Proposte non ' + (dec === 'approva' ? 'approvate' : 'rifiutate') + ': ' + ((e && e.message) || e),
      8000,
    );
    return;
  }
  const fatte = ((r && r.fatte) || []).filter(Boolean);
  const saltate = (r && r.saltate) || [];
  if (fatte.length && typeof _annullaPronto === 'function' && _annullaPronto())
    window.Annulla.azione(
      {
        tipo: 'rpc',
        annulla: { fn: 'punti_proposte_decidi', params: { p_ids: fatte.map((x) => x.id), p_decisione: 'riapri' } },
        ripristina: { fn: 'punti_proposte_decidi', params: { p_ids: fatte.map((x) => x.id), p_decisione: dec } },
      },
      (dec === 'approva' ? 'Punti approvati: ' : 'Punti rifiutati: ') + fatte.map((x) => x.collaboratore).join(', '),
    );
  // i punti approvati entrano nei totali: si rileggono
  if (dec === 'approva' && fatte.length)
    try {
      puntiEventiCache = (await secGet('punti_eventi?order=created_at.desc&limit=50000')) || puntiEventiCache;
    } catch (e) {}
  await puntiProposteCarica();
  _ppRidisegna();
  if (typeof renderFormazione === 'function' && localStorage.getItem('pagina_corrente') === 'formazione')
    renderFormazione();
  if (fatte.length)
    toast(
      (dec === 'approva' ? 'Approvate: ' : 'Rifiutate: ') +
        fatte.map((x) => x.collaboratore + ' ' + (Number(x.punti) > 0 ? '+' : '') + x.punti).join(' · '),
    );
  if (saltate.length) toastErrore('Non fatte: ' + saltate.join(' · '), 8000);
}
