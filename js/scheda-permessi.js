/**
 * Diario Collaboratori · Casino Lugano SA
 * File: scheda-permessi.js
 *
 * SCHEDA DEI PERMESSI DA COMPILARE (un solo modello per tutto il programma):
 * file HTML gia spuntato con i permessi di oggi, caselle Si/no modificabili, note,
 * firme e "Salva copia compilata". Lo usano il pulsante "Scarica scheda da compilare"
 * (Impostazioni > Visibilita e permessi) e lo strumento strumenti/genera_scheda_permessi.py.
 * Le regole di "concesso" sono quelle del programma (puoModificare / isVis): i permessi di
 * modifica non impostati valgono solo per l amministratore, le azioni automatiche del Piano
 * seguono piano_azioni_auto, pagine, funzioni e schede del Piano non impostate valgono per tutti.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.SchedaPermessi = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TESTA =
    '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Scheda permessi</title><style>\n:root{--ink:#1c1a17;--paper:#fbf8f2;--paper2:#f1ece2;--line:#d7cfbf;--muted:#6c655a;--oro:#b8912f}\n*{box-sizing:border-box}body{font-family:Georgia,serif;color:var(--ink);margin:0;font-size:13px;background:var(--paper2)}header{background:var(--ink);color:var(--paper);padding:18px 26px}header h1{margin:0;font-size:1.3rem;font-weight:600}header p{margin:6px 0 0;color:#d9d0bd;font-size:.9rem;max-width:960px}\n.barra{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line);padding:8px 26px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}.barra button{font:inherit;font-size:.86rem;padding:6px 12px;border:1px solid var(--ink);background:var(--paper);cursor:pointer;border-radius:2px}.barra button.prim{background:var(--ink);color:var(--paper)}.barra .prog{margin-left:auto;color:var(--muted);font-size:.86rem}\nmain{padding:18px 26px 60px}.intest{background:var(--paper);border:1px solid var(--line);padding:12px 16px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.intest label{display:block;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.intest input{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);background:#fff}\nh2{font-size:.95rem;margin:20px 0 6px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid var(--ink);padding-bottom:4px}\ntable{border-collapse:collapse;width:100%;font-size:11.5px;background:#fff}th,td{border:1px solid #bbb;padding:3px 5px;text-align:center;vertical-align:middle}th{background:var(--paper2)}td.l{text-align:left}tr.g td{background:var(--paper2);text-align:left;font-weight:700}\nselect.c{font:inherit;font-size:11px;padding:2px 3px;border:1px solid #ccc;background:#fff;width:52px}select.c.si{background:#e3f0e8;font-weight:700}select.c.mod{outline:2px solid #c0392b;background:#fbe9e7}\ntextarea{font:inherit;font-size:11px;width:100%;min-height:30px;border:1px solid #ccc;padding:3px}\nbody.solo-mod tr[data-r]:not(.ha-mod){display:none}\n.firma{background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--oro);padding:14px 18px 12px;margin:10px 0 14px;display:grid;grid-template-columns:minmax(170px,1fr) minmax(200px,1.2fr) 150px minmax(300px,440px);gap:12px 22px;align-items:end}.firma>div{min-width:0}.firme{margin:10px 0 26px;break-inside:avoid}.firme h4{margin:0 0 6px;font-size:.9rem;letter-spacing:.06em;text-transform:uppercase}.firma-add{font:inherit;font-size:.82rem;padding:5px 10px;border:1px solid var(--line);background:var(--paper2);cursor:pointer;margin-top:6px}.firma select,.firma input{box-sizing:border-box;width:100%;font:inherit;font-size:.9rem;padding:7px 9px;border:1px solid var(--line);background:#fff;color:var(--ink);margin:0}.firma label{display:block;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.firma .pad{position:relative}.firma canvas{box-sizing:border-box;width:100%;height:120px;border:1px solid #888;background:#fff;touch-action:none;cursor:crosshair;display:block}.firma .pad-riga{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}.firma .pad small{color:var(--muted);font-size:.72rem}.firma .pad button{font:inherit;font-size:.72rem;padding:2px 8px;border:1px solid var(--line);background:var(--paper2);cursor:pointer;margin-left:4px}@media(max-width:900px){.firma{grid-template-columns:1fr 1fr}.firma .pad{grid-column:1/-1}}\n@media print{.firma-add,.no-stampa{display:none}.firma{grid-template-columns:1.1fr 1.3fr 90px 240px;gap:6px 14px;border:0;border-top:1px solid #000;padding:8px 0 4px;margin:4px 0 6px;background:#fff;break-inside:avoid}.firma select{border:0;border-bottom:1px solid #444;-webkit-appearance:none;appearance:none;background:#fff;padding:2px 0;font-size:11px}.firma select.vuoto{color:transparent}.firma input{border:0;border-bottom:1px solid #444;background:#fff;padding:2px 0;font-size:11px}.firma label{font-size:9px;color:#333}.firma canvas{height:60px;border:0;border-bottom:1px solid #000}.firma .pad-riga,.firma .pad button,.firma .pad small{display:none}}\n@media print{.barra{display:none}body{background:#fff;font-size:10px}main{padding:0}header{background:#fff;color:#000;border-bottom:2px solid #000;padding:6px 0}header p{color:#333}table{font-size:9.5px}select.c{-webkit-appearance:none;appearance:none;border:0;background:#fff;width:auto;padding:0}select.c.si{background:#ddd}select.c.mod{outline:1px solid #000;background:#eee}textarea{border:1px solid #444;min-height:24px}}\n@page{size:A4 landscape;margin:9mm 9mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tr{break-inside:avoid}h2,h3,h4{break-after:avoid}textarea{resize:none;overflow:hidden}}\n</style></head><body>';
  const SCRIPT =
    "const CH='diario_scheda_permessi';\nfunction init(){document.querySelectorAll('select.c').forEach(s=>{if(s.value===''&&s.dataset.orig!=null)s.value=s.dataset.orig})}\nfunction stato(){const s={meta:{},sel:{},note:{}};document.querySelectorAll('[data-meta]').forEach(i=>s.meta[i.dataset.meta]=i.value);document.querySelectorAll('select.c').forEach(x=>{if(x.value!==x.dataset.orig)s.sel[x.dataset.sel]=x.value});document.querySelectorAll('textarea[data-nota]').forEach(t=>{if(t.value.trim())s.note[t.dataset.nota]=t.value});firmeStato(s);return s}\n// FIRME: per ogni blocco uno o piu firmatari (ruolo, nome, data, firma\n// disegnata con mouse o dito). Le firme finiscono nelle risposte e nella\n// copia compilata; in stampa restano ruolo, nome, data e la firma o la riga.\nconst RUOLI_FIRMA=[\"HR\", \"Direzione\", \"Responsabile FoBoSlot\", \"Sostituto FoBoSlot\", \"Supervisor\", \"Compliance\", \"Altro\"];\nfunction firmaBox(bl,i,dati){dati=dati||{};const id=bl+'-'+i;const opts=RUOLI_FIRMA.map(r=>'<option'+(dati.ruolo===r?' selected':'')+'>'+r+'</option>').join('');return '<div class=\"firma\" data-fid=\"'+id+'\"><div><label>Chi firma</label><select data-fr=\"'+id+'\"><option value=\"\">scegli</option>'+opts+'</select></div><div><label>Nome e cognome</label><input data-fn=\"'+id+'\" value=\"'+(dati.nome||'').replace(/\"/g,'&quot;')+'\"></div><div><label>Data</label><input data-fd=\"'+id+'\" value=\"'+(dati.data||'')+'\" placeholder=\"gg.mm.aaaa\"></div><div class=\"pad\"><label>Firma</label><canvas data-firma=\"'+id+'\"></canvas><div class=\"pad-riga no-stampa\"><small>Firma con il mouse o con il dito; su carta, firma sulla riga.</small><span><button type=\"button\" onclick=\"firmaPulisci(this)\">Cancella firma</button><button type=\"button\" onclick=\"firmaRimuovi(this)\">Togli firmatario</button></span></div></div></div>'}\nfunction firmaAggiungi(bl,dati){const c=document.querySelector('.firme[data-blocco=\"'+bl+'\"] .firme-lista');if(!c)return null;const i=c.children.length;c.insertAdjacentHTML('beforeend',firmaBox(bl,i,dati));const box=c.lastElementChild;firmaInitCanvas(box.querySelector('canvas'));return box}\nfunction firmaRimuovi(id){if(id&&id.closest)id=id.closest('.firma').dataset.fid;const box=document.querySelector('.firma[data-fid=\"'+id+'\"]');if(!box)return;const lista=box.parentNode;if(lista.children.length<=1){firmaPulisci(id);box.querySelector('select').value='';box.querySelectorAll('input').forEach(i=>i.value='');salvaLocale();return}box.remove();salvaLocale()}\nfunction firmaInitCanvas(cv){cv.width=880;cv.height=240;const ctx=cv.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#1c1a17';let giu=false,ux=0,uy=0;const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};cv.addEventListener('pointerdown',e=>{giu=true;[ux,uy]=pos(e);cv.setPointerCapture(e.pointerId);const d=cv.closest('.firma').querySelector('input[data-fd]');if(d&&!d.value)d.value=new Date().toLocaleDateString('it-IT')});cv.addEventListener('pointermove',e=>{if(!giu)return;const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(ux,uy);ctx.lineTo(x,y);ctx.stroke();ux=x;uy=y;cv.dataset.firmata='1'});const fine=()=>{if(giu){giu=false;salvaLocale()}};cv.addEventListener('pointerup',fine);cv.addEventListener('pointerleave',fine)}\nwindow.addEventListener('beforeprint',()=>{document.querySelectorAll('textarea').forEach(t=>{t.dataset.h=t.style.height||'';t.style.height='auto';t.style.height=(t.scrollHeight+6)+'px'});document.querySelectorAll('.firma select').forEach(s=>s.classList.toggle('vuoto',!s.value))});window.addEventListener('afterprint',()=>{document.querySelectorAll('textarea').forEach(t=>{t.style.height=t.dataset.h||''})});\nfunction firmaInit(){document.querySelectorAll('.firme').forEach(b=>{if(!b.querySelector('.firma'))firmaAggiungi(b.dataset.blocco)})}\nfunction firmaPulisci(id){if(id&&id.closest)id=id.closest('.firma').dataset.fid;const cv=document.querySelector('canvas[data-firma=\"'+id+'\"]');if(!cv)return;cv.getContext('2d').clearRect(0,0,cv.width,cv.height);delete cv.dataset.firmata;salvaLocale()}\nfunction firmeStato(s){s.firme={};document.querySelectorAll('.firme').forEach(b=>{s.firme[b.dataset.blocco]=[...b.querySelectorAll('.firma')].map(box=>{const cv=box.querySelector('canvas');return{ruolo:box.querySelector('select').value,nome:box.querySelector('input[data-fn]').value,data:box.querySelector('input[data-fd]').value,img:cv.dataset.firmata?cv.toDataURL('image/png'):''}}).filter(f=>f.ruolo||f.nome||f.data||f.img)})}\nfunction firmeApplica(s){Object.keys((s&&s.firme)||{}).forEach(bl=>{const lista=(s.firme[bl]||[]);if(!lista.length)return;const c=document.querySelector('.firme[data-blocco=\"'+bl+'\"] .firme-lista');if(!c)return;c.innerHTML='';lista.forEach(f=>{const box=firmaAggiungi(bl,f);if(box&&f.img){const cv=box.querySelector('canvas');const im=new Image();im.onload=()=>{cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);cv.dataset.firmata='1'};im.src=f.img}})})}\n\nfunction applica(s){if(!s)return;Object.keys(s.meta||{}).forEach(k=>{const i=document.querySelector('[data-meta=\"'+k+'\"]');if(i)i.value=s.meta[k]});Object.keys(s.sel||{}).forEach(k=>{const x=document.querySelector('select[data-sel=\"'+k+'\"]');if(x)x.value=s.sel[k]});Object.keys(s.note||{}).forEach(k=>{const t=document.querySelector('textarea[data-nota=\"'+k+'\"]');if(t)t.value=s.note[k]});firmeApplica(s)}\nfunction colora(){let n=0;document.querySelectorAll('select.c').forEach(x=>{x.classList.toggle('si',x.value==='si');const m=x.value!==x.dataset.orig;x.classList.toggle('mod',m);if(m)n++});document.querySelectorAll('tr[data-r]').forEach(tr=>tr.classList.toggle('ha-mod',!!tr.querySelector('select.c.mod')||[...tr.querySelectorAll('textarea')].some(t=>t.value.trim())));document.getElementById('prog').textContent=n?'Modifiche: '+n:'Nessuna modifica'}\nfunction salvaLocale(){try{localStorage.setItem(CH,JSON.stringify(stato()))}catch(e){}}\ndocument.addEventListener('change',()=>{colora();salvaLocale()});document.addEventListener('input',salvaLocale);\nfunction soloMod(){document.body.classList.toggle('solo-mod');document.getElementById('btn-mod').textContent=document.body.classList.contains('solo-mod')?'Mostra tutto':'Mostra solo le modifiche'}\nfunction salvaCopia(){const s=stato();s.salvatoIl=new Date().toISOString();const tagS='<'+'script id=\"risposte-incorporate\">';const tagE='<'+'/script>';let html=document.documentElement.outerHTML;const i1=html.indexOf(tagS);if(i1>=0){const i2=html.indexOf(tagE,i1);html=html.slice(0,i1)+html.slice(i2+tagE.length)}const json=JSON.stringify(s).split('</').join('<'+String.fromCharCode(92)+'/');html='<!DOCTYPE html>'+String.fromCharCode(10)+(k=>html.slice(0,k)+tagS+'window.__RISPOSTE='+json+';'+tagE+html.slice(k))(html.lastIndexOf('<'+'/body>'));const b=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='scheda_permessi_controllata_'+(s.meta.nome||'compilata').replace(/[^a-z0-9]+/gi,'_')+'.html';a.click()}\nfunction azzera(){if(!confirm('Togliere tutte le modifiche e tornare allo stato attuale?'))return;localStorage.removeItem(CH);document.querySelectorAll('select.c').forEach(x=>x.value=x.dataset.orig);document.querySelectorAll('textarea').forEach(t=>t.value='');colora()}\ndocument.addEventListener('DOMContentLoaded',()=>{init();firmaInit();if(window.__RISPOSTE){applica(window.__RISPOSTE)}else{try{applica(JSON.parse(localStorage.getItem(CH)||'null'))}catch(e){}}colora()});\n";
  const E = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  // valore impostato di una voce (con i default del programma)
  function valore(vis, key, voci, ereditati) {
    if (vis && vis[key] != null) return vis[key];
    if ((ereditati || []).includes(key)) return (vis && vis.piano_azioni_auto) || 'admin';
    if (key === 'piano' || (voci && voci.permessi && key in voci.permessi)) return 'admin';
    return 'tutti';
  }
  function concesso(vis, key, op, voci, ereditati) {
    const v = valore(vis, key, voci, ereditati);
    if (v === 'nascosto' || v === 'admin') return false;
    if (v && typeof v === 'object' && v.tipo === 'selezionati') return !!(v.operatori && v.operatori.includes(op));
    return true;
  }
  function etichettaValore(v) {
    return v === 'tutti'
      ? 'tutti'
      : v === 'admin'
        ? 'solo admin'
        : v === 'nascosto'
          ? 'nascosta'
          : v && typeof v === 'object'
            ? 'per nome'
            : String(v);
  }
  // d: { ops, nomiProfili {chiave: nome}, profili {op: chiave}, settori {op: testo},
  //      extra {op: {settore: {modifica}}}, vis, voci (VIS_ITEMS), ereditati, oggi 'gg.mm.aaaa' }
  function html(d) {
    const ops = d.ops || [];
    const voci = d.voci || {};
    const gruppi = [
      ['Pagine', voci.pagine],
      ['Funzioni', voci.funzioni],
      ['Permessi', voci.permessi],
      ['Piano: schede visibili', voci.piano_schede],
      ['Piano: schede modificabili', voci.piano_modifica],
    ].filter((g) => g[1]);
    const h = [TESTA];
    h.push(
      '<header><h1>Diario Collaboratori · scheda dei permessi: stato attuale da controllare</h1><p>Ogni casella dice se l operatore <b>puo</b> (Si) vedere quella pagina o scheda, oppure eseguire quella funzione, cosi come e impostato oggi (' +
        E(d.oggi) +
        '). Se qualcosa va cambiato, cambia la casella: resta evidenziata in rosso, e alla fine <b>Salva copia compilata</b> produce il file da rinviare con tutte le modifiche dentro. L amministratore (password master) puo tutto ed e escluso.</p></header>',
    );
    h.push(
      '<div class="barra"><button class="prim" onclick="salvaCopia()">Salva copia compilata (da inviare)</button><button id="btn-mod" onclick="soloMod()">Mostra solo le modifiche</button><button onclick="window.print()">Stampa / PDF</button><button onclick="azzera()">Azzera modifiche</button><span class="prog" id="prog"></span></div><main>',
    );
    h.push(
      '<div class="intest"><div><label>Controllato da</label><input data-meta="nome"></div><div><label>Funzione</label><input data-meta="funzione"></div><div><label>Data</label><input data-meta="data" value="' +
        E(d.oggi) +
        '"></div></div>',
    );
    h.push(
      '<h2>Operatori, profilo e settori</h2><table><tr><th>Operatore</th><th>Profilo oggi</th><th>Profilo corretto</th><th>Settori</th><th>Accessi extra</th><th style="min-width:220px">Nota</th></tr>',
    );
    const nomiProf = d.nomiProfili || {};
    const profOpts = Object.keys(nomiProf)
      .map((k) => '<option value="' + E(k) + '">' + E(nomiProf[k]) + '</option>')
      .join('');
    ops.forEach((o) => {
      const ex = (d.extra || {})[o];
      const ext =
        ex && typeof ex === 'object'
          ? Object.keys(ex)
              .map((k) => k + ': ' + (ex[k] && ex[k].modifica ? 'modifica' : 'sola lettura'))
              .join(', ')
          : '';
      const pr = (d.profili || {})[o] || '';
      h.push(
        '<tr data-r="op-' +
          E(o) +
          '"><td class="l"><b>' +
          E(o) +
          '</b></td><td>' +
          E(nomiProf[pr] || 'nessuno') +
          '</td><td><select class="c" style="width:auto" data-orig="' +
          E(pr) +
          '" data-sel="prof|' +
          E(o) +
          '"><option value="">nessuno</option>' +
          profOpts +
          '</select></td><td>' +
          E((d.settori || {})[o] || '?') +
          '</td><td class="l">' +
          (E(ext) || '-') +
          '</td><td><textarea data-nota="op|' +
          E(o) +
          '" placeholder="Nota"></textarea></td></tr>',
      );
    });
    h.push('</table>');
    h.push(
      '<h2>Cosa puo vedere e fare ognuno (cambia le caselle sbagliate)</h2><table><tr><th style="text-align:left">Voce</th><th>Oggi</th>' +
        ops.map((o) => '<th>' + E(o) + '</th>').join('') +
        '<th style="min-width:160px">Nota</th></tr>',
    );
    gruppi.forEach(([gt, lista]) => {
      h.push('<tr class="g"><td colspan="' + (ops.length + 3) + '">' + E(gt) + '</td></tr>');
      Object.keys(lista).forEach((k) => {
        const vt = etichettaValore(valore(d.vis, k, voci, d.ereditati));
        const celle = ops
          .map(
            (o) =>
              '<td><select class="c" data-orig="' +
              (concesso(d.vis, k, o, voci, d.ereditati) ? 'si' : '') +
              '" data-sel="' +
              E(k) +
              '|' +
              E(o) +
              '"><option value="">no</option><option value="si">Si</option></select></td>',
          )
          .join('');
        h.push(
          '<tr data-r="' +
            E(k) +
            '"><td class="l">' +
            E(lista[k]) +
            ' <span style="color:#888;font-size:9.5px">(' +
            E(k) +
            ')</span></td><td style="font-size:10px;color:#555">' +
            E(vt) +
            '</td>' +
            celle +
            '<td><textarea data-nota="' +
            E(k) +
            '" placeholder="Nota"></textarea></td></tr>',
        );
      });
    });
    h.push('</table>');
    h.push(
      '<h2>Osservazioni</h2><textarea data-nota="gen" style="min-height:90px" placeholder="Figure da aggiungere (es. Compliance), regole generali, casi particolari"></textarea>',
    );
    const firme = (id, titolo) =>
      '<div class="firme" data-blocco="' +
      id +
      '"><h4>Firme · ' +
      titolo +
      '</h4><div class="firme-lista"></div><button type="button" class="firma-add no-stampa" onclick="firmaAggiungi(\'' +
      id +
      '\')">+ Aggiungi un firmatario</button></div>';
    h.push(
      firme('compliance', 'Compliance') +
        firme('hr', 'HR') +
        firme('direzione', 'Direzione / Responsabile') +
        '</main>',
    );
    h.push('<script>\n' + SCRIPT + '</' + 'script></body></html>');
    return h.join('\n');
  }
  return { html: html, concesso: concesso, valore: valore };
});
