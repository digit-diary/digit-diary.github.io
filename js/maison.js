/**
 * Diario Collaboratori — Casino Lugano SA
 * File: maison.js
 * Righe originali: 2303
 * Estratto automaticamente da index.html
 */
// SEZIONE 13: MAISON (clienti VIP)
// Costi, budget, import Excel, parser nomi, regali, spese extra
// ================================================================
// MAISON MANUALE
async function salvaMaisonManuale(){
  const rawNome=document.getElementById('maison-man-nome').value.trim();
  if(!rawNome){toast('Inserisci il nome');_highlightField('maison-man-nome');return}
  const px=parseInt(document.getElementById('maison-man-px').value)||1;
  const importo=parseFloat(document.getElementById('maison-man-importo').value)||0;
  if(!importo){toast('Inserisci un importo');return}
  const tipo=document.getElementById('maison-man-tipo').value||null;
  let qty=parseInt(document.getElementById('maison-man-qty').value)||1;
  // Auto-calcola qty se l'utente lascia 1 ma il costo suggerisce di più
  if(tipo&&qty===1&&BUONO_VALORI[tipo]){const calcQ=Math.ceil(importo/BUONO_VALORI[tipo]);if(calcQ>=1)qty=calcQ}
  const dataVal=document.getElementById('maison-man-data').value||getGiornataCasino();
  // Gestione nomi multipli con /
  const nomiRaw=rawNome.split(/\s*\/\s*/).map(n=>capitalizzaNome(n.trim())).filter(n=>n);
  const nNomi=nomiRaw.length;
  const gruppoLabel=nNomi>1?capitalizzaNome(rawNome):'';
  // FIX: per nomi multipli (gruppo /), CERCA nomi completi nei budget Maison esistenti
  // Es. "Bonomelli" → "Bonomelli Pierluigi". Disambiguazione modale se ci sono piu' match.
  let nomiFinali;
  if(nNomi>1){
    nomiFinali=[];
    for(const n of nomiRaw){
      const result=_completaNomeDaBudget(n);
      if(result.needDisambiguation){
        // Apri modal di disambiguazione e aspetta scelta utente
        const scelto=await _scegliCandidatoNome(n,result.candidates);
        if(scelto===null){toast('Inserimento annullato');return}
        nomiFinali.push(scelto);
      }else{
        nomiFinali.push(result.nome||n);
      }
    }
  }else{
    // Nome singolo: comportamento legacy (solo correzione cognome typo)
    nomiFinali=nomiRaw.map(n=>{
      const simile=_trovaNomeSimileMaison(n);
      if(simile&&simile.tipo==='simile'){const corretto=_soloCorrezioneCognome(n,simile.nome);return corretto}
      return n});
  }
  // === SPLITTING INTELLIGENTE PER NOMI MULTIPLI (/) ===
  // Auto-detect categoria buono dal budget se l'utente non seleziona tipo manualmente.
  // Es: Aili(BL)/Bertaggia(full), px=2, 360 CHF → Aili 40 (1BL), Bertaggia 320 (resto)
  const _pxBase=Math.floor(px/nNomi)||1;
  const _pxExtra=px-_pxBase*nNomi;
  // Per ogni nome: calcola costo, tipo_buono, px, note
  const _nomiSplit=nomiFinali.map((n,i)=>{
    const pxI=_pxBase+(i<_pxExtra?1:0);
    return{nome:n,px:pxI,tipo_buono:null,costo:0,note:'',autoDetected:false};
  });
  if(tipo&&BUONO_VALORI[tipo]){
    // Utente ha selezionato tipo manualmente
    if(nNomi>1){
      // Primo nome prende il buono, gli altri il resto
      const buonoCosto=Math.min(qty*BUONO_VALORI[tipo],importo);
      const restoCosto=importo-buonoCosto;
      _nomiSplit[0].costo=Math.round(buonoCosto*100)/100;
      _nomiSplit[0].tipo_buono=tipo;
      _nomiSplit[0].note=qty>1?qty+tipo:'';
      for(let i=1;i<nNomi;i++)_nomiSplit[i].costo=Math.round(restoCosto/(nNomi-1)*100)/100;
    }else{
      _nomiSplit[0].costo=importo;_nomiSplit[0].tipo_buono=tipo;
      _nomiSplit[0].note=qty>1?qty+tipo:'';
    }
  }else if(nNomi>1){
    // Nessun tipo selezionato + nomi multipli: AUTO-DETECT dal budget
    const budgetCats=nomiFinali.map(n=>{
      const b=getBudgetReparto().find(b=>b.nome.toLowerCase()===n.toLowerCase());
      return b?b.categoria:null;
    });
    // Mappa categoria budget → tipo buono
    const catToTipo={bu:'BU',bl:'BL'};
    const buonoIdxs=[];const fullIdxs=[];
    budgetCats.forEach((cat,i)=>{
      if(cat&&catToTipo[cat])buonoIdxs.push(i);
      else fullIdxs.push(i);
    });
    if(buonoIdxs.length>0&&fullIdxs.length>0){
      // Mix: chi ha buoni prende quota buono, chi e' full prende il resto
      let totalBuonoCosto=0;
      buonoIdxs.forEach(i=>{
        const tipoBuono=catToTipo[budgetCats[i]];
        const pxI=_nomiSplit[i].px;
        const buonoCosto=pxI*BUONO_VALORI[tipoBuono];
        _nomiSplit[i].tipo_buono=tipoBuono;
        _nomiSplit[i].costo=Math.round(Math.min(buonoCosto,importo)*100)/100;
        _nomiSplit[i].note=pxI>1?pxI+tipoBuono:tipoBuono;
        _nomiSplit[i].autoDetected=true;
        totalBuonoCosto+=_nomiSplit[i].costo;
      });
      const restoCosto=Math.max(0,importo-totalBuonoCosto);
      fullIdxs.forEach(i=>{
        _nomiSplit[i].costo=Math.round(restoCosto/fullIdxs.length*100)/100;
      });
    }else{
      // Tutti dello stesso tipo: dividi equamente
      _nomiSplit.forEach(s=>{s.costo=Math.round(importo/nNomi*100)/100});
    }
  }else{
    // Nome singolo
    _nomiSplit[0].costo=importo;_nomiSplit[0].tipo_buono=tipo||null;
    if(tipo&&qty>1)_nomiSplit[0].note=qty+tipo;
  }
  try{for(let i=0;i<_nomiSplit.length;i++){
    const s=_nomiSplit[i];
    const rec={data_giornata:dataVal,nome:s.nome,px:s.px,
      costo:s.costo,tipo_buono:s.tipo_buono,
      note:(s.note||'')+(gruppoLabel?' '+gruppoLabel:''),
      gruppo:gruppoLabel,operatore:getOperatore(),reparto_dip:currentReparto};
    const r=await secPost('costi_maison',rec);if(r&&r[0])maisonCache.unshift(r[0])}
    document.getElementById('maison-man-nome').value='';document.getElementById('maison-man-importo').value='';
    document.getElementById('maison-man-px').value='1';document.getElementById('maison-man-tipo').value='';document.getElementById('maison-man-qty').value='1';
    const fp=document.getElementById('maison-man-data');if(fp&&fp._flatpickr)fp._flatpickr.clear();
    renderMaisonDashboard();renderMaisonBudgetAlerts();sincronizzaPareggioBuoni();logAzione('Maison manuale',nomiFinali.join('/')+' '+importo+' CHF');toast('Spesa aggiunta per '+nomiFinali.join('/'));nomiFinali.forEach(n=>checkBudgetPushAfterInsert(n))}catch(e){toast('Errore: '+e.message)}}
// REGALI MAISON
function getRegaliReparto(){return regaliCache.filter(function(r){return(r.reparto_dip||'slots')===currentReparto})}
async function salvaRegalo(){
  let nome=capitalizzaNome(document.getElementById('regalo-nome').value.trim());
  if(!nome){toast('Inserisci il nome del cliente');_highlightField('regalo-nome');return}
  const nomeEsistente=getMaisonRepartoExpanded().find(r=>r.nome.toLowerCase()===nome.toLowerCase());
  if(!nomeEsistente){const simile=_trovaNomeSimileMaison(nome);
    if(simile&&simile.tipo==='simile'){if(confirm('Hai scritto "'+nome+'" ma esiste "'+simile.nome+'". Usare "'+simile.nome+'"?'))nome=simile.nome}}
  const desc=document.getElementById('regalo-desc').value.trim();
  if(!desc){toast('Inserisci una descrizione');return}
  const importo=parseFloat(document.getElementById('regalo-importo').value)||null;
  const data=document.getElementById('regalo-data').value||new Date().toISOString().split('T')[0];
  try{const r=await secPost('regali_maison',{nome:nome,descrizione:desc,importo:importo,data_regalo:data,operatore:getOperatore(),reparto_dip:currentReparto});
    regaliCache.unshift(r[0]);document.getElementById('regalo-nome').value='';document.getElementById('regalo-desc').value='';
    document.getElementById('regalo-importo').value='';var fp=document.getElementById('regalo-data');if(fp&&fp._flatpickr)fp._flatpickr.clear();
    renderRegali();logAzione('Regalo aggiunto',nome+' - '+desc);toast('Regalo registrato')}catch(e){toast('Errore aggiunta regalo')}}
async function rinominaRegalo(id){const r=regaliCache.find(x=>x.id===id);if(!r)return;
  const nuovo=prompt('Rinomina cliente regalo:',r.nome);if(!nuovo||!nuovo.trim())return;
  try{await secPatch('regali_maison','id=eq.'+id,{nome:capitalizzaNome(nuovo.trim())});r.nome=capitalizzaNome(nuovo.trim());
    renderRegali();toast('Rinominato')}catch(e){toast('Errore rinomina')}}
async function eliminaRegalo(id){if(!confirm('Eliminare questo regalo?'))return;
  try{await secDel('regali_maison','id=eq.'+id);regaliCache=regaliCache.filter(function(x){return x.id!==id});renderRegali();toast('Eliminato')}catch(e){toast('Errore eliminazione regalo')}}
function renderRegali(){var data=getRegaliReparto();var el=document.getElementById('regali-list');if(!el)return;
  if(!data.length){el.innerHTML='<div class="empty-state"><p>Nessun regalo registrato</p><small>Aggiungi un regalo per un cliente Maison</small></div>';return}
  var totale=data.reduce(function(s,r){return s+parseFloat(r.importo||0)},0);
  var nClienti=new Set(data.map(function(r){return r.nome})).size;
  var html='<div class="mini-stats-bar"><div class="mini-stat"><div class="mini-stat-num gold">'+(totale?fmtCHF(totale):'—')+'</div><div class="mini-stat-label">Totale CHF</div></div><div class="mini-stat"><div class="mini-stat-num blue">'+data.length+'</div><div class="mini-stat-label">Regali</div></div><div class="mini-stat"><div class="mini-stat-num">'+nClienti+'</div><div class="mini-stat-label">Clienti</div></div></div>';
  html+='<table class="collab-table"><thead><tr><th>Data</th><th>Cliente</th><th>Descrizione</th><th class="num">CHF</th><th>Operatore</th><th></th></tr></thead><tbody>';
  data.forEach(function(r){var d=new Date((r.data_regalo||r.created_at)+'T12:00:00');var ne=r.nome.replace(/'/g,"\\'");
    var _regBudget=getBudgetReparto().find(function(b){return b.nome.toLowerCase()===r.nome.toLowerCase()});
    if(!_regBudget){var _rc=r.nome.toLowerCase().split(/\s+/)[0];if(_rc.length>=3)_regBudget=getBudgetReparto().find(function(b){return b.nome.toLowerCase().split(/\s+/)[0]===_rc})}
    var _regCatBadge=_regBudget&&_regBudget.categoria==='full_maison'?' <span class="mini-badge" style="background:#b8860b;font-size:.7rem">Full Maison</span>':_regBudget&&_regBudget.categoria==='maison'?' <span class="mini-badge" style="background:#2980b9;font-size:.7rem">Maison</span>':_regBudget&&_regBudget.categoria==='direzione'?' <span class="mini-badge" style="background:#8e44ad;font-size:.7rem">Direzione</span>':_regBudget&&_regBudget.categoria==='bu'?' <span class="mini-badge" style="background:#e67e22;font-size:.7rem">Buono Unico</span>':_regBudget&&_regBudget.categoria==='bl'?' <span class="mini-badge" style="background:#2c6e49;font-size:.7rem">Buono Lounge</span>':'';
    html+='<tr><td style="font-weight:600">'+d.toLocaleDateString('it-IT')+'</td><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\''+ne+'\')">'+escP(r.nome)+'</span></strong>'+_regCatBadge+'</td><td>'+escP(r.descrizione||'')+'</td><td class="num">'+(r.importo?fmtCHF(r.importo):'—')+'</td><td style="color:var(--muted);font-size:.82rem">'+escP(r.operatore||'')+'</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaRegalo('+r.id+')" style="font-size:.78rem;padding:3px 8px">Rinomina</button> <button class="btn-act del" onclick="eliminaRegalo('+r.id+')">Elimina</button></td></tr>'});
  html+='</tbody></table>';
  el.innerHTML=html}
// NOTE PRIVATE CLIENTI
function getNoteClientiReparto(){return noteClientiCache.filter(function(r){return(r.reparto_dip||'slots')===currentReparto})}
async function salvaNotaCliente(nome){
  var nota=document.getElementById('detail-nota-input').value.trim();
  if(!nota){toast('Scrivi una nota');return}
  try{var r=await secPost('note_clienti',{nome:nome,nota:nota,operatore:getOperatore(),reparto_dip:currentReparto});
    noteClientiCache.unshift(r[0]);document.getElementById('detail-nota-input').value='';
    apriDettaglioMaison(nome);toast('Nota salvata')}catch(e){toast('Errore salvataggio nota')}}
async function eliminaNotaCliente(id,nome){if(!confirm('Eliminare questa nota?'))return;
  try{await secDel('note_clienti','id=eq.'+id);noteClientiCache=noteClientiCache.filter(function(x){return x.id!==id});
    apriDettaglioMaison(nome);toast('Nota eliminata')}catch(e){toast('Errore eliminazione nota')}}
function getMaisonFiltrati(){const fn=(document.getElementById('maison-filt-nome')||{}).value||'';
  const ft=(document.getElementById('maison-filt-tipo')||{}).value||'';
  const fd=(document.getElementById('maison-filt-dal')||{}).value||'';
  const fa=(document.getElementById('maison-filt-al')||{}).value||'';
  return getMaisonRepartoExpanded().filter(r=>{
    if(fn&&!r.nome.toLowerCase().includes(fn.toLowerCase()))return false;
    if(ft==='BU'&&r.tipo_buono!=='BU')return false;
    if(ft==='BL'&&r.tipo_buono!=='BL')return false;
    if(ft==='normale'&&r.tipo_buono)return false;
    if(fd&&r.data_giornata<fd)return false;
    if(fa&&r.data_giornata>fa)return false;
    return true})}
function renderMaisonDashboard(){const data=getMaisonFiltrati();
  // Stats bar
  const totCosto=data.reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const totPx=data.reduce((s,r)=>s+(r.px||0),0);
  const nClienti=new Set(data.map(r=>r.nome)).size;
  const nGiorni=new Set(data.map(r=>r.data_giornata)).size;
  const nBU=_contaBuoni(data,'BU');
  const nBL=_contaBuoni(data,'BL');
  const nCG=_contaBuoni(data,'CG');
  const nWL=_contaBuoni(data,'WL');
  const sb=document.getElementById('maison-stats-bar');
  // Determina periodo visualizzato
  const fd=(document.getElementById('maison-filt-dal')||{}).value,fa=(document.getElementById('maison-filt-al')||{}).value;
  let periodoLabel='';
  if(fd&&fa){periodoLabel=new Date(fd+'T12:00:00').toLocaleDateString('it-IT')+' — '+new Date(fa+'T12:00:00').toLocaleDateString('it-IT')}
  else if(data.length){const _mesiMap={};data.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');const label=MESI_FULL[d.getMonth()]+' '+d.getFullYear();const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');_mesiMap[key]=label});periodoLabel=Object.keys(_mesiMap).sort().map(k=>_mesiMap[k]).join(', ')}
  // Month comparison
  const oggi=new Date();const meseCorr=oggi.getFullYear()+'-'+String(oggi.getMonth()+1).padStart(2,'0');
  const mesePrecDate=new Date(oggi.getFullYear(),oggi.getMonth()-1,1);
  const mesePrec=mesePrecDate.getFullYear()+'-'+String(mesePrecDate.getMonth()+1).padStart(2,'0');
  const costoMeseCorr=getMaisonRepartoExpanded().filter(r=>r.data_giornata.startsWith(meseCorr)).reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const costoMesePrec=getMaisonRepartoExpanded().filter(r=>r.data_giornata.startsWith(mesePrec)).reduce((s,r)=>s+parseFloat(r.costo||0),0);
  let confrontoHtml='';
  if(costoMesePrec>0){const delta=((costoMeseCorr-costoMesePrec)/costoMesePrec*100).toFixed(1);
    const colore=delta>0?'var(--accent)':delta<0?'#2c6e49':'var(--muted)';
    confrontoHtml='<div style="text-align:center;margin-bottom:10px;font-size:.88rem;color:'+colore+';font-weight:600">'+(delta>0?'+':'')+delta+'% vs mese precedente ('+fmtCHF(costoMesePrec)+' CHF &#8594; '+fmtCHF(costoMeseCorr)+' CHF)</div>'}
  sb.innerHTML=(periodoLabel?'<div style="text-align:center;margin-bottom:10px;font-family:Playfair Display,serif;font-size:1.2rem;color:var(--ink)">'+periodoLabel+'</div>':'')+confrontoHtml+'<div class="stats-bar" style="margin:0"><div class="stat"><div class="stat-num gold">'+fmtCHF(totCosto)+'</div><div class="stat-label">Totale CHF</div></div><div class="stat"><div class="stat-num blue">'+nClienti+'</div><div class="stat-label">Clienti</div></div><div class="stat"><div class="stat-num">'+totPx.toLocaleString('de-CH')+'</div><div class="stat-label">Persone</div></div><div class="stat"><div class="stat-num teal">'+nGiorni+'</div><div class="stat-label">Giorni</div></div><div class="stat"><div class="stat-num red">'+nBU+' BU / '+nBL+' BL / '+nCG+' CG / '+nWL+' WL</div><div class="stat-label">Buoni</div></div></div>';
  // Tabella
  const byNome={};data.forEach(r=>{if(!byNome[r.nome])byNome[r.nome]={tot:0,px:0,visite:0,bu:0,bl:0,cg:0,wl:0,condivise:0,condivisiGruppi:[]};const _bn=byNome[r.nome];_bn.tot+=parseFloat(r.costo||0);_bn.px+=(r.px||0);_bn.visite++;const _bq=(()=>{const m=(r.note||'').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);return m?parseInt(m[1]):1})();if(r.tipo_buono==='BU')_bn.bu+=_bq;if(r.tipo_buono==='BL')_bn.bl+=_bq;if(r.tipo_buono==='CG')_bn.cg+=_bq;if(r.tipo_buono==='WL')_bn.wl+=_bq;if(r._costoOriginale){_bn.condivise++;_bn.condivisiGruppi.push(r._gruppoOriginale)}});
  const sorted=Object.entries(byNome).sort((a,b)=>b[1].tot-a[1].tot);
  const tb=document.getElementById('maison-table');
  if(!sorted.length){tb.innerHTML='<p style="color:var(--muted);text-align:center;padding:20px">Nessun dato. Carica un file Excel per iniziare.</p>';
    ['chart-maison-trend','chart-maison-top','chart-maison-tipi'].forEach(function(id){if(charts[id]){charts[id].destroy();delete charts[id]}});renderMaisonGdOggi();return}
  // Gestione giorni per eliminazione
  const giorniDisp=[...new Set(data.map(r=>r.data_giornata))].sort();
  const mesiDisp=[...new Set(data.map(r=>r.data_giornata.substring(0,7)))].sort();
  const MESI_SHORT_M=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  let thtml='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4 style="font-family:Playfair Display,serif;margin:0;color:var(--ink)">Dettaglio per cliente</h4><button class="btn-reset" onclick="toggleSezione(\'maison-table-inner\',this)" style="font-size:.92rem;padding:6px 16px">&#9650; Nascondi</button></div><div id="maison-table-inner"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;flex-wrap:wrap"><select id="maison-del-giorno" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="">Seleziona giorno...</option>'+giorniDisp.map(d=>'<option value="'+d+'">'+new Date(d+'T12:00:00').toLocaleDateString('it-IT')+'</option>').join('')+'</select><button class="btn-act del" onclick="eliminaMaisonGiorno()" style="padding:5px 12px">Elimina giorno</button><select id="maison-del-mese" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="">Seleziona mese...</option>'+mesiDisp.map(m=>'<option value="'+m+'">'+MESI_SHORT_M[parseInt(m.split('-')[1])-1]+' '+m.split('-')[0]+'</option>').join('')+'</select><button class="btn-act del" onclick="eliminaMaisonMese()" style="padding:5px 12px">Elimina mese</button></div>';
  thtml+='<div style="overflow-x:auto"><table class="collab-table"><thead style="position:sticky;top:0;z-index:2"><tr><th style="background:var(--paper)">Cliente</th><th class="num" style="background:var(--paper)">Visite</th><th class="num" style="background:var(--paper)">Persone</th><th class="num" style="background:var(--paper)">BU</th><th class="num" style="background:var(--paper)">BL</th><th class="num" style="background:var(--paper)">CG</th><th class="num" style="background:var(--paper)">WL</th><th class="num" style="background:var(--paper)">Totale CHF</th><th class="num" style="background:var(--paper)">Media CHF</th><th style="background:var(--paper)"></th></tr></thead><tbody>';
  const _brDash=getBudgetReparto();
  sorted.forEach(([nome,d],_idx)=>{
    let budget=_brDash.find(b=>b.nome.toLowerCase()===nome.toLowerCase());
    // Fallback: match per cognome (primo token)
    if(!budget){const _cog=nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=_brDash.find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
    const overBudget=budget&&budget.budget_chf&&d.tot>=budget.budget_chf;
    const nearBudget=budget&&budget.budget_chf&&d.tot>=budget.budget_chf*0.8&&!overBudget;
    const catBg=budget&&budget.categoria==='full_maison'?'background:rgba(184,134,11,0.12)':budget&&budget.categoria==='maison'?'background:rgba(41,128,185,0.12)':budget&&budget.categoria==='direzione'?'background:rgba(142,68,173,0.12)':budget&&budget.categoria==='bu'?'background:rgba(230,126,34,0.12)':budget&&budget.categoria==='bl'?'background:rgba(44,110,73,0.12)':(_idx%2?'background:rgba(0,0,0,0.04)':'background:var(--paper)');
    const rowStyle=overBudget?'background:rgba(192,57,43,0.1)':nearBudget?'background:rgba(230,126,34,0.1)':catBg;
    const ne=nome.replace(/'/g,"\\'");
    const clientInfo=budget;
    const catBadge=clientInfo&&clientInfo.categoria==='full_maison'?'<span class="mini-badge" style="background:#b8860b;margin-left:6px">Full Maison</span>':clientInfo&&clientInfo.categoria==='maison'?'<span class="mini-badge" style="background:#2980b9;margin-left:6px">Maison</span>':clientInfo&&clientInfo.categoria==='direzione'?'<span class="mini-badge" style="background:#8e44ad;margin-left:6px">Direzione</span>':clientInfo&&clientInfo.categoria==='bu'?'<span class="mini-badge" style="background:#e67e22;margin-left:6px">Buono Unico</span>':clientInfo&&clientInfo.categoria==='bl'?'<span class="mini-badge" style="background:#2c6e49;margin-left:6px">Buono Lounge</span>':'';
    const condBadge=d.condivise?' <span title="'+d.condivise+' voci condivise (costo diviso)" style="font-size:.78rem;color:var(--accent2);font-weight:600;cursor:help">÷'+[...new Set(d.condivisiGruppi)].length+'</span>':'';
    thtml+='<tr style="'+rowStyle+'"><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\''+ne+'\')">'+escP(nome)+'</span></strong>'+catBadge+(overBudget?' <span style="color:var(--accent);font-size:.75rem;font-weight:700">BUDGET SUPERATO</span>':nearBudget?' <span style="color:#e67e22;font-size:.75rem;font-weight:700">80% BUDGET</span>':'')+'</td><td class="num">'+d.visite+'</td><td class="num">'+d.px+'</td><td class="num">'+(d.bu||'-')+'</td><td class="num">'+(d.bl||'-')+'</td><td class="num">'+(d.cg||'-')+'</td><td class="num">'+(d.wl||'-')+'</td><td class="num"><strong>'+fmtCHF(d.tot)+'</strong>'+condBadge+'</td><td class="num">'+fmtCHF(d.tot/d.visite)+'</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaMaisonCliente(\''+ne+'\')" title="Rinomina">Rinomina</button> <button class="btn-act del" onclick="eliminaMaisonCliente(\''+ne+'\')" title="Elimina">Elimina</button></td></tr>'});
  thtml+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td class="num"><strong>'+sorted.reduce((s,c)=>s+c[1].visite,0)+'</strong></td><td class="num"><strong>'+totPx+'</strong></td><td class="num"><strong>'+_contaBuoni(data,'BU')+'</strong></td><td class="num"><strong>'+_contaBuoni(data,'BL')+'</strong></td><td class="num"><strong>'+_contaBuoni(data,'CG')+'</strong></td><td class="num"><strong>'+_contaBuoni(data,'WL')+'</strong></td><td class="num"><strong>'+fmtCHF(totCosto)+'</strong></td><td></td><td></td></tr>';
  thtml+='</tbody></table></div></div>';tb.innerHTML=thtml;
  // Grafici
  renderMaisonCharts(data,sorted);renderMaisonGdOggi()}
let _gdSelezionata=null;
function cambiaGdMaison(dir){
  const tutteDate=[...new Set(getMaisonRepartoExpanded().map(r=>r.data_giornata))].sort();
  if(!tutteDate.length)return;
  const attuale=_gdSelezionata||getGiornataCasino();
  const idx=tutteDate.indexOf(attuale);
  if(dir===0){_gdSelezionata=null}// torna a oggi
  else if(dir===-1){_gdSelezionata=idx>0?tutteDate[idx-1]:tutteDate[tutteDate.length-1]}
  else{_gdSelezionata=idx<tutteDate.length-1?tutteDate[idx+1]:tutteDate[0]}
  renderMaisonGdOggi()}
function renderMaisonGdOggi(){
  const container=document.getElementById('maison-gd-oggi');if(!container)return;
  const gdData=_gdSelezionata||getGiornataCasino();
  const righe=getMaisonRepartoExpanded().filter(r=>r.data_giornata===gdData);
  const isOggi=gdData===getGiornataCasino();
  const tutteDate=[...new Set(getMaisonRepartoExpanded().map(r=>r.data_giornata))].sort();
  const haAltriDati=tutteDate.length>0;
  if(!righe.length){
    const dt=new Date(gdData+'T12:00:00');const GIORNI=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const dataFmt=dt.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});
    let emptyH='<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="display:flex;align-items:center;gap:6px">';
    if(haAltriDati)emptyH+='<button onclick="cambiaGdMaison(-1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700">&#9664;</button>';
    emptyH+='<input type="text" id="gd-date-picker" value="'+dataFmt+'" readonly style="cursor:pointer;padding:5px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:130px;text-align:center;font-weight:600">';
    if(haAltriDati)emptyH+='<button onclick="cambiaGdMaison(1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700">&#9654;</button>';
    emptyH+='<span style="font-weight:400;font-size:.85rem;color:var(--muted)">'+GIORNI[dt.getDay()]+'</span>';
    if(!isOggi)emptyH+='<button onclick="cambiaGdMaison(0)" style="background:none;border:1px solid var(--accent2);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--accent2);font-size:.78rem;font-weight:600">Oggi</button>';
    emptyH+='</div></div><div style="padding:16px;text-align:center;color:var(--muted);font-size:.88rem">Nessun costo Maison per questa GD</div>';
    container.innerHTML=emptyH;container.style.display='';
    const _ep=document.getElementById('gd-date-picker');if(_ep&&window.flatpickr){flatpickr(_ep,{locale:'it',dateFormat:'d/m/Y',defaultDate:dt,onChange:function(sel){if(sel[0]){_gdSelezionata=sel[0].getFullYear()+'-'+String(sel[0].getMonth()+1).padStart(2,'0')+'-'+String(sel[0].getDate()).padStart(2,'0');renderMaisonGdOggi()}}})}
    return}
  righe.sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
  const totCHF=righe.reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const totPX=righe.reduce((s,r)=>s+(r.px||0),0);
  const dt=new Date(gdData+'T12:00:00');
  const GIORNI=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const dataFmt=dt.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});
  const _brGd=getBudgetReparto();
  // Conteggio buoni per l'header
  const _gdBU=_contaBuoni(righe,'BU'),_gdBL=_contaBuoni(righe,'BL');
  const _gdCG=_contaBuoni(righe,'CG'),_gdWL=_contaBuoni(righe,'WL');
  let h='<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h+='<div style="display:flex;align-items:center;gap:6px">';
  h+='<button onclick="cambiaGdMaison(-1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700" title="Giorno precedente">&#9664;</button>';
  h+='<input type="text" id="gd-date-picker" value="'+dataFmt+'" readonly style="cursor:pointer;padding:5px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:130px;text-align:center;font-weight:600">';
  h+='<button onclick="cambiaGdMaison(1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700" title="Giorno successivo">&#9654;</button>';
  h+='<span style="font-weight:400;font-size:.85rem;color:var(--muted)">'+GIORNI[dt.getDay()]+'</span>';
  if(!isOggi)h+='<button onclick="cambiaGdMaison(0)" style="background:none;border:1px solid var(--accent2);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--accent2);font-size:.78rem;font-weight:600">Oggi</button>';
  h+='</div>';
  h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-weight:400;font-size:.85rem;color:var(--muted)">CHF '+fmtCHF(totCHF)+' &middot; '+totPX+' PX'+(_gdBU?' &middot; '+_gdBU+' BU':'')+(_gdBL?' &middot; '+_gdBL+' BL':'')+(_gdCG?' &middot; '+_gdCG+' CG':'')+(_gdWL?' &middot; '+_gdWL+' WL':'')+'</span>';
  h+='<button onclick="esportaGdOggiCSV()" style="font-size:.72rem;padding:4px 10px;background:none;border:1px solid white;color:white;border-radius:2px;cursor:pointer;font-family:Source Sans 3,sans-serif;font-weight:600">CSV</button>';
  h+='<button onclick="esportaGdOggiPDF()" style="font-size:.72rem;padding:4px 10px;background:none;border:1px solid #c0392b;color:#c0392b;border-radius:2px;cursor:pointer;font-family:Source Sans 3,sans-serif;font-weight:600">PDF</button></div></div>';
  h+='<div style="padding:0 16px 16px;overflow-x:auto"><table class="collab-table"><thead><tr><th style="background:var(--paper)">Cliente</th><th style="background:var(--paper)">Tipo</th><th class="num" style="background:var(--paper)">PX</th><th class="num" style="background:var(--paper)">Costo CHF</th><th style="background:var(--paper)"></th></tr></thead><tbody>';
  // Raggruppa righe con stesso gruppo (es. Bonomelli/Grignani)
  const _gdVisti=new Set();
  righe.forEach(function(r){
    if(_gdVisti.has(r.id))return;
    var ne=r.nome.replace(/'/g,"\\'");
    // Se ha un gruppo, mostra la riga raggruppata
    if(r.gruppo&&r.gruppo.length>1){
      const gruppoRighe=righe.filter(x=>x.gruppo===r.gruppo);
      gruppoRighe.forEach(x=>_gdVisti.add(x.id));
      const totGruppo=gruppoRighe.reduce((s,x)=>s+parseFloat(x.costo||0),0);
      const totPxGruppo=gruppoRighe.reduce((s,x)=>s+(x.px||0),0);
      const primoNome=gruppoRighe[0].nome;const neP=primoNome.replace(/'/g,"\\'");
      var budget=_brGd.find(function(b){return b.nome.toLowerCase()===primoNome.toLowerCase()});
      if(!budget){var _cog=primoNome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=_brGd.find(function(b){return b.nome.toLowerCase().split(/\s+/)[0]===_cog})}
      var catBadge=budget&&budget.categoria?'<span class="mini-badge" style="background:'+({full_maison:'#b8860b',maison:'#2980b9',direzione:'#8e44ad',bu:'#e67e22',bl:'#2c6e49'}[budget.categoria]||'var(--muted)')+';margin-left:6px">'+({full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'}[budget.categoria]||'')+'</span>':'';
      const altriNomi=gruppoRighe.slice(1).map(x=>{
        let bAltro=_brGd.find(b=>b.nome.toLowerCase()===x.nome.toLowerCase());
        if(!bAltro){const c=x.nome.toLowerCase().split(/\s+/)[0];if(c.length>=3)bAltro=_brGd.find(b=>b.nome.toLowerCase().split(/\s+/)[0]===c)}
        const cBadge=bAltro&&bAltro.categoria?' <span class="mini-badge" style="background:'+({full_maison:'#b8860b',maison:'#2980b9',direzione:'#8e44ad',bu:'#e67e22',bl:'#2c6e49'}[bAltro.categoria]||'var(--muted)')+';font-size:.65rem">'+({full_maison:'FM',maison:'M',direzione:'D',bu:'BU',bl:'BL'}[bAltro.categoria]||'')+'</span>':'';
        return escP(x.nome)+cBadge}).join(' / ');
      var _qtyM=(r.note||'').match(/(\d+)\s*(BU|BL|CG|WL)/i);var _qtyN=_qtyM?parseInt(_qtyM[1]):1;
      var tipoBadge=r.tipo_buono?'<span class="mini-badge" style="background:'+({BU:'#e67e22',BL:'#2c6e49',CG:'#8e44ad',WL:'#2980b9'}[r.tipo_buono]||'var(--muted)')+'">'+_qtyN+' '+r.tipo_buono+'</span>':'<span style="color:var(--muted)">&mdash;</span>';
      const idsGruppo=gruppoRighe.map(x=>x.id).join(',');
      h+='<tr><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\''+neP+'\')">'+escP(primoNome)+'</span></strong>'+catBadge+(altriNomi?' <span style="color:var(--muted);font-size:.82rem"> /'+altriNomi+'</span>':'')+'</td><td>'+tipoBadge+'</td><td class="num">'+totPxGruppo+'</td><td class="num">'+fmtCHF(totGruppo)+'</td><td style="white-space:nowrap"><button class="btn-act del" onclick="eliminaMaisonGruppoGd(\''+idsGruppo+'\')" title="Elimina gruppo">Elimina</button></td></tr>';
    }else{
      _gdVisti.add(r.id);
      var budget=_brGd.find(function(b){return b.nome.toLowerCase()===r.nome.toLowerCase()});
      if(!budget){var _cog=r.nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=_brGd.find(function(b){return b.nome.toLowerCase().split(/\s+/)[0]===_cog})}
      var catBadge=budget&&budget.categoria?'<span class="mini-badge" style="background:'+({full_maison:'#b8860b',maison:'#2980b9',direzione:'#8e44ad',bu:'#e67e22',bl:'#2c6e49'}[budget.categoria]||'var(--muted)')+';margin-left:6px">'+({full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'}[budget.categoria]||'')+'</span>':'';
      var _qtyM=(r.note||'').match(/(\d+)\s*(BU|BL|CG|WL)/i);var _qtyN=_qtyM?parseInt(_qtyM[1]):1;
      var tipoBadge=r.tipo_buono?'<span class="mini-badge" style="background:'+({BU:'#e67e22',BL:'#2c6e49',CG:'#8e44ad',WL:'#2980b9'}[r.tipo_buono]||'var(--muted)')+'">'+_qtyN+' '+r.tipo_buono+'</span>':'<span style="color:var(--muted)">&mdash;</span>';
      h+='<tr><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\''+ne+'\')">'+escP(r.nome)+'</span></strong>'+catBadge+'</td><td>'+tipoBadge+'</td><td class="num">'+r.px+'</td><td class="num">'+fmtCHF(r.costo)+'</td><td style="white-space:nowrap"><button class="btn-act del" onclick="eliminaMaisonRigaGd('+r.id+')" title="Elimina">Elimina</button></td></tr>'}}
  );
  const _totBuoni=[_gdBU?_gdBU+' BU':'',_gdBL?_gdBL+' BL':'',_gdCG?_gdCG+' CG':'',_gdWL?_gdWL+' WL':''].filter(Boolean).join(' · ');
  h+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td style="font-size:.78rem;color:var(--muted)">'+(_totBuoni||'')+'</td><td class="num"><strong>'+totPX+' PX</strong></td><td class="num"><strong>CHF '+fmtCHF(totCHF)+'</strong></td><td></td></tr>';
  h+='</tbody></table></div>';
  container.innerHTML=h;container.style.display='';
  // Init flatpickr sul date picker
  const _gdPicker=document.getElementById('gd-date-picker');
  if(_gdPicker&&window.flatpickr){flatpickr(_gdPicker,{locale:'it',dateFormat:'d/m/Y',defaultDate:dt,onChange:function(sel){if(sel[0]){_gdSelezionata=sel[0].getFullYear()+'-'+String(sel[0].getMonth()+1).padStart(2,'0')+'-'+String(sel[0].getDate()).padStart(2,'0');renderMaisonGdOggi()}}})}}
async function eliminaMaisonRigaGd(id){
  if(!confirm('Eliminare questa riga?'))return;
  try{await secDel('costi_maison','id=eq.'+id);
    maisonCache=maisonCache.filter(function(r){return r.id!==id});
    logAzione('Maison: eliminata riga GD','ID '+id);
    renderMaisonGdOggi();renderMaisonDashboard();toast('Riga eliminata')}catch(e){toast('Errore: '+e.message)}}
async function eliminaMaisonGruppoGd(idsStr){const ids=idsStr.split(',').map(Number);
  if(!confirm('Eliminare questo gruppo ('+ids.length+' righe)?'))return;
  try{for(const id of ids){await secDel('costi_maison','id=eq.'+id);maisonCache=maisonCache.filter(r=>r.id!==id)}
    logAzione('Maison: eliminato gruppo GD',ids.length+' righe');
    renderMaisonGdOggi();renderMaisonDashboard();toast('Gruppo eliminato')}catch(e){toast('Errore: '+e.message)}}
function _raggruppaGdRighe(righe){const result=[];const visti=new Set();
  righe.forEach(r=>{if(visti.has(r.id))return;
    if(r.gruppo&&r.gruppo.length>1){const gr=righe.filter(x=>x.gruppo===r.gruppo);gr.forEach(x=>visti.add(x.id));
      result.push({nome:gr[0].nome,altriNomi:gr.slice(1).map(x=>x.nome),tipo_buono:r.tipo_buono,note:r.note||'',px:gr.reduce((s,x)=>s+(x.px||0),0),costo:gr.reduce((s,x)=>s+parseFloat(x.costo||0),0),ids:gr.map(x=>x.id)});
    }else{visti.add(r.id);result.push({nome:r.nome,altriNomi:[],tipo_buono:r.tipo_buono,note:r.note||'',px:r.px,costo:parseFloat(r.costo||0),ids:[r.id]})}});
  return result}
function esportaGdOggiCSV(){const oggi=_gdSelezionata||getGiornataCasino();const righe=getMaisonRepartoExpanded().filter(r=>r.data_giornata===oggi).sort((a,b)=>a.nome.localeCompare(b.nome));
  if(!righe.length){toast('Nessun dato');return}
  const grouped=_raggruppaGdRighe(righe);
  const dt=new Date(oggi+'T12:00:00');const _catL={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  const rows=[['GD '+dt.toLocaleDateString('it-IT')+' — '+GIORNI[dt.getDay()]],['Cliente','Categoria','Tipo','PX','Costo CHF']];
  const _br=getBudgetReparto();
  grouped.forEach(g=>{let b=_br.find(x=>x.nome.toLowerCase()===g.nome.toLowerCase());if(!b){const c=g.nome.toLowerCase().split(/\s+/)[0];if(c.length>=3)b=_br.find(x=>x.nome.toLowerCase().split(/\s+/)[0]===c)}
    const label=g.nome+(g.altriNomi.length?'/'+g.altriNomi.join('/'):'');
    const _qm=(g.note||'').match(/(\d+)\s*(BU|BL|CG|WL)/i);const _qn=_qm?parseInt(_qm[1]):1;
    rows.push([label,b&&b.categoria?_catL[b.categoria]||'':'',g.tipo_buono?_qn+' '+g.tipo_buono:'—',g.px,fmtCHF(g.costo)])});
  const tot=grouped.reduce((s,g)=>s+g.costo,0);
  rows.push(['TOTALE','','',grouped.reduce((s,g)=>s+g.px,0)+' PX','CHF '+fmtCHF(tot)]);
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'maison_gd_'+oggi+'.csv'}).click();toast('CSV GD esportato!')}
async function esportaGdOggiPDF(){const oggi=_gdSelezionata||getGiornataCasino();const righe=getMaisonRepartoExpanded().filter(r=>r.data_giornata===oggi).sort((a,b)=>a.nome.localeCompare(b.nome));
  if(!righe.length){toast('Nessun dato');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore');return}}
  const dt=new Date(oggi+'T12:00:00');const tot=righe.reduce((s,r)=>s+parseFloat(r.costo||0),0);const totPx=righe.reduce((s,r)=>s+(r.px||0),0);
  const _catL={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  const _catC={full_maison:[184,134,11],maison:[41,128,185],direzione:[142,68,173],bu:[230,126,34],bl:[44,110,73]};
  const _br=getBudgetReparto();
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('portrait','mm','a4');const pw=doc.internal.pageSize.getWidth();let y=14;
    if(_logoB64)try{doc.addImage(_logoB64,'PNG',pw/2-20,y,40,22.5)}catch(e){}
    y+=28;doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Formulario Ristorante',pw/2,y,{align:'center'});y+=7;
    doc.setFontSize(11);doc.setFont('helvetica','normal');doc.setTextColor(100);
    doc.text('GD '+dt.toLocaleDateString('it-IT')+' — '+GIORNI[dt.getDay()]+' — Casino Lugano SA',pw/2,y,{align:'center'});y+=5;
    doc.text(righe.length+' clienti — '+totPx+' persone — CHF '+fmtCHF(tot),pw/2,y,{align:'center'});y+=10;doc.setTextColor(0);
    const grouped=_raggruppaGdRighe(righe);
    doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Cliente','Categoria','Tipo','PX','Costo CHF']],
      body:grouped.map(g=>{let b=_br.find(x=>x.nome.toLowerCase()===g.nome.toLowerCase());if(!b){const c=g.nome.toLowerCase().split(/\s+/)[0];if(c.length>=3)b=_br.find(x=>x.nome.toLowerCase().split(/\s+/)[0]===c)}
        const label=g.nome+(g.altriNomi.length?'/'+g.altriNomi.join('/'):'');
        const _qm=(g.note||'').match(/(\d+)\s*(BU|BL|CG|WL)/i);const _qn=_qm?parseInt(_qm[1]):1;
        return[label,b&&b.categoria?_catL[b.categoria]||'':'',g.tipo_buono?_qn+' '+g.tipo_buono:'—',g.px,fmtCHF(g.costo)]}),
      foot:[['TOTALE','',righe.filter(r=>r.tipo_buono).length?[_contaBuoni(righe,'BU')?_contaBuoni(righe,'BU')+' BU':'',_contaBuoni(righe,'BL')?_contaBuoni(righe,'BL')+' BL':'',_contaBuoni(righe,'CG')?_contaBuoni(righe,'CG')+' CG':'',_contaBuoni(righe,'WL')?_contaBuoni(righe,'WL')+' WL':''].filter(Boolean).join(' · '):'',totPx+' PX','CHF '+fmtCHF(tot)]],
      headStyles:{fillColor:[184,134,11],halign:'center'},footStyles:{fillColor:[245,243,238],textColor:[0,0,0],fontStyle:'bold'},
      styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:9,cellPadding:3},columnStyles:{0:{halign:'left',cellWidth:50},1:{halign:'left',cellWidth:30},2:{halign:'center',cellWidth:22},3:{halign:'center',cellWidth:18},4:{halign:'right',cellWidth:28}},
      didParseCell:function(d){if(d.section==='body'&&d.column.index===1){const c=Object.entries(_catL).find(([k,v])=>v===d.cell.raw);if(c&&_catC[c[0]]){d.cell.styles.textColor=_catC[c[0]];d.cell.styles.fontStyle='bold'}}},
      alternateRowStyles:{fillColor:[250,247,242]}});
    doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA — Formulario Ristorante GD '+dt.toLocaleDateString('it-IT'),16,doc.internal.pageSize.getHeight()-8);
    mostraPdfPreview(doc,'formulario_gd_'+oggi+'.pdf','Formulario GD '+dt.toLocaleDateString('it-IT'))}catch(e){toast('Errore PDF')}}
function renderMaisonCharts(data,sorted){
  // Trend giornaliero
  const byDay={};data.forEach(r=>{byDay[r.data_giornata]=(byDay[r.data_giornata]||0)+parseFloat(r.costo||0)});
  const days=Object.keys(byDay).sort();
  const _giorniAbbr=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  renderChart('chart-maison-trend','line',{labels:days.map(d=>{const dt=new Date(d+'T12:00:00');return _giorniAbbr[dt.getDay()]+' '+dt.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})}),datasets:[{label:'Spesa CHF',data:days.map(d=>byDay[d]),borderColor:'#b8860b',backgroundColor:'rgba(184,134,11,0.15)',fill:true,tension:0.3,pointRadius:4}]},{plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return'Spesa CHF: '+fmtCHF(c.raw)}}}},scales:{y:{beginAtZero:true,ticks:{callback:function(v){return fmtCHF(v)}}}}});
  // Top clienti
  const top15=sorted.slice(0,15);
  renderChart('chart-maison-top','bar',{labels:top15.map(c=>c[0]),datasets:[{label:'CHF',data:top15.map(c=>c[1].tot),backgroundColor:'rgba(184,134,11,0.7)',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return'CHF '+fmtCHF(c.raw)}}}},scales:{x:{beginAtZero:true,ticks:{callback:function(v){return fmtCHF(v)}}},y:{ticks:{autoSkip:false,font:{size:11}}}}});
  // Distribuzione tipo
  const normale=data.filter(r=>!r.tipo_buono).reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const buTot=data.filter(r=>r.tipo_buono==='BU').reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const blTot=data.filter(r=>r.tipo_buono==='BL').reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const cgTot=data.filter(r=>r.tipo_buono==='CG').reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const wlTot=data.filter(r=>r.tipo_buono==='WL').reduce((s,r)=>s+parseFloat(r.costo||0),0);
  renderChart('chart-maison-tipi','doughnut',{labels:['Consumazione ('+fmtCHF(normale)+' CHF)','Buono Unico ('+fmtCHF(buTot)+' CHF)','Buono Lounge ('+fmtCHF(blTot)+' CHF)','C. Gourmet ('+fmtCHF(cgTot)+' CHF)','Welcome L. ('+fmtCHF(wlTot)+' CHF)'],datasets:[{data:[normale,buTot,blTot,cgTot,wlTot],backgroundColor:['#b8860b','#e67e22','#2c6e49','#8e44ad','#2980b9'],borderWidth:2,borderColor:'white'}]},{plugins:{legend:{position:'bottom',labels:{font:{size:12}}}}})}
function resetMaisonFiltri(){document.getElementById('maison-filt-nome').value='';document.getElementById('maison-filt-tipo').value='';
  ['maison-filt-dal','maison-filt-al'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';if(el._flatpickr)el._flatpickr.clear()}});renderMaisonDashboard()}
function _isCompleannoOggi(dataNascita){if(!dataNascita)return false;const oggi=new Date();const dn=new Date(dataNascita+'T12:00:00');return dn.getDate()===oggi.getDate()&&dn.getMonth()===oggi.getMonth()}
function _getCompleanniProssimi(giorni){const now=new Date();const oggi=new Date(now.getFullYear(),now.getMonth(),now.getDate());const result=[];
  getBudgetReparto().forEach(b=>{if(!b.data_nascita)return;const dn=new Date(b.data_nascita+'T12:00:00');
    const quest=new Date(now.getFullYear(),dn.getMonth(),dn.getDate());if(quest<oggi)quest.setFullYear(quest.getFullYear()+1);
    const diff=Math.round((quest-oggi)/(86400000));if(diff>=0&&diff<=giorni)result.push({nome:b.nome,data:quest,giorni:diff})});
  return result.sort((a,b)=>a.giorni-b.giorni)}
function _maisonFilePeriodo(data){if(!data||!data.length)return'';const mesi=[];data.forEach(r=>{const d=new Date((r.data_giornata||'')+'T12:00:00');if(!isNaN(d)){const k=MESI_FULL[d.getMonth()].toLowerCase()+'_'+d.getFullYear();if(!mesi.includes(k))mesi.push(k)}});if(mesi.length<=1)return mesi[0]||'';return'da_'+mesi[0]+'_a_'+mesi[mesi.length-1]}
// Dettaglio cliente: mostra tutte le visite giorno per giorno
function apriDettaglioMaison(nome){const righe=getMaisonFiltrati().filter(r=>r.nome===nome).sort((a,b)=>a.data_giornata.localeCompare(b.data_giornata));
  let budget=getBudgetReparto().find(b=>b.nome.toLowerCase()===nome.toLowerCase());
  if(!budget){const _cog=nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
  const _seCheck=getSpeseReparto().filter(r=>r.beneficiario.toLowerCase()===nome.toLowerCase());
  const _regCheck=getRegaliReparto().filter(function(r){return r.nome.toLowerCase()===nome.toLowerCase()});
  if(!righe.length&&!_seCheck.length&&!_regCheck.length&&!budget){toast('Nessun dato per '+nome);return}
  const tot=righe.reduce((s,r)=>s+parseFloat(r.costo||0),0);const totPx=righe.reduce((s,r)=>s+(r.px||0),0);
  const nBU=_contaBuoni(righe,'BU'),nBL=_contaBuoni(righe,'BL'),nCG_d=_contaBuoni(righe,'CG'),nWL_d=_contaBuoni(righe,'WL');
  const mesiCliente=righe.length?[...new Set(righe.map(r=>{const d=new Date(r.data_giornata+'T12:00:00');return MESI_FULL[d.getMonth()]+' '+d.getFullYear()}))].join(', '):'';
  const catBadgeD=budget&&budget.categoria==='full_maison'?' <span class="mini-badge" style="background:#b8860b;font-size:.78rem">Full Maison</span>':budget&&budget.categoria==='maison'?' <span class="mini-badge" style="background:#2980b9;font-size:.78rem">Maison</span>':budget&&budget.categoria==='direzione'?' <span class="mini-badge" style="background:#8e44ad;font-size:.78rem">Direzione</span>':budget&&budget.categoria==='bu'?' <span class="mini-badge" style="background:#e67e22;font-size:.78rem">Buono Unico</span>':budget&&budget.categoria==='bl'?' <span class="mini-badge" style="background:#2c6e49;font-size:.78rem">Buono Lounge</span>':'';
  const nascitaStr=budget&&budget.data_nascita?new Date(budget.data_nascita+'T12:00:00').toLocaleDateString('it-IT'):'';
  const ne=nome.replace(/'/g,"\\'");
  const _curCat=budget&&budget.categoria||'';
  const catSelect=' <select id="detail-cat-select" onchange="salvaDetailCat(\''+ne+'\')" style="font-size:.78rem;padding:3px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink);vertical-align:middle;cursor:pointer"><option value=""'+(!_curCat?' selected':'')+'>— Categoria —</option><option value="full_maison"'+(_curCat==='full_maison'?' selected':'')+'>Full Maison</option><option value="maison"'+(_curCat==='maison'?' selected':'')+'>Maison</option><option value="direzione"'+(_curCat==='direzione'?' selected':'')+'>Direzione</option><option value="bu"'+(_curCat==='bu'?' selected':'')+'>Buono Unico</option><option value="bl"'+(_curCat==='bl'?' selected':'')+'>Buono Lounge</option></select>';
  let html='<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:4px">'+escP(nome)+catBadgeD+catSelect+'</h3><p style="color:var(--accent2);font-size:.9rem;font-weight:600;margin-bottom:2px">'+mesiCliente+'</p><p style="color:var(--muted);font-size:.82rem">'+righe.length+' visite — '+totPx+' persone — '+fmtCHF(tot)+' CHF'+(nBU?' — '+nBU+' BU':'')+(nBL?' — '+nBL+' BL':'')+'</p>'+(budget&&budget.budget_chf?'<p style="font-size:.82rem;color:'+(tot>=budget.budget_chf?'var(--accent)':tot>=budget.budget_chf*0.8?'#e67e22':'#2c6e49')+';font-weight:600">Budget: '+fmtCHF(tot)+' / '+fmtCHF(parseFloat(budget.budget_chf))+' CHF ('+Math.round(tot/budget.budget_chf*100)+'%)</p>':'')+'<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="font-size:.82rem;color:var(--muted)">Data nascita:</span><input type="text" id="detail-nascita" value="'+(budget&&budget.data_nascita||'')+'" placeholder="Seleziona..." readonly style="cursor:pointer;padding:4px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper2);color:var(--ink);width:120px"><button class="btn-salva" onclick="salvaDetailNascita(\''+ne+'\')" style="font-size:.78rem;padding:5px 14px;background:var(--accent2)">Salva</button>'+(nascitaStr?' <span style="font-size:.82rem;color:var(--muted)">Attuale: '+nascitaStr+'</span>':'')+'</div>'+(budget&&budget.aggiornato_da?'<p style="font-size:.78rem;color:var(--muted);margin-top:4px">Ultimo aggiornamento: '+escP(budget.aggiornato_da)+(budget.aggiornato_at?' — '+new Date(budget.aggiornato_at).toLocaleDateString('it-IT')+' '+new Date(budget.aggiornato_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'')+'</p>':'')+'</div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  // Pre-compute spese extra e regali per KPI (riusa dati gia calcolati sopra)
  const seRighe=_seCheck.sort((a,b)=>a.data_spesa.localeCompare(b.data_spesa));
  const totSE=seRighe.reduce((s,r)=>s+parseFloat(r.importo||0),0);
  var regRighe=_regCheck.sort(function(a,b){return(a.data_regalo||'').localeCompare(b.data_regalo||'')});
  var totReg=regRighe.length?regRighe.reduce(function(s,r){return s+parseFloat(r.importo||0)},0):0;
  // --- KPI Summary Cards ---
  const _mediaVisita=righe.length?tot/righe.length:0;
  const _dateSort=righe.map(r=>r.data_giornata).sort();
  const _ultimoPass=_dateSort.length?new Date(_dateSort[_dateSort.length-1]+'T12:00:00'):null;
  const _ultimoStr=_ultimoPass?_ultimoPass.getDate()+' '+MESI[_ultimoPass.getMonth()]+' '+_ultimoPass.getFullYear():'—';
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#b8860b">CHF '+fmtCHF(tot)+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Ristorante</div></div>';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#2980b9">CHF '+fmtCHF(totSE)+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Extra</div></div>';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#1a7a6d">CHF '+fmtCHF(totReg)+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Regali</div></div>';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">CHF '+fmtCHF(_mediaVisita)+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Media/visita</div></div>';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">'+righe.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Visite totali</div></div>';
  html+='<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">'+_ultimoStr+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Ultimo passaggio</div></div>';
  html+='</div>';
  // --- Frequenza visite + giorno preferito ---
  if(righe.length){
  const _giorniCount=[0,0,0,0,0,0,0];
  righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');_giorniCount[d.getDay()]++});
  const _giornoMaxIdx=_giorniCount.indexOf(Math.max(..._giorniCount));
  const _giornoPreferito=GIORNI[_giornoMaxIdx];
  let _freqStr='—';
  if(_dateSort.length>=2){const _d0=new Date(_dateSort[0]+'T12:00:00');const _d1=new Date(_dateSort[_dateSort.length-1]+'T12:00:00');const _diffWeeks=Math.max(1,(_d1-_d0)/(7*86400000));_freqStr=(_dateSort.length/_diffWeeks).toFixed(1)+' visite/sett.'}
  else if(_dateSort.length===1){_freqStr='1 visita'}
  html+='<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:.85rem;color:var(--muted)">';
  html+='<span>Ultimo passaggio: <strong style="color:var(--ink)">'+_ultimoStr+'</strong></span>';
  html+='<span>Giorno preferito: <strong style="color:var(--ink)">'+_giornoPreferito+'</strong></span>';
  html+='<span>Frequenza: <strong style="color:var(--ink)">'+_freqStr+'</strong></span>';
  html+='</div>';
  }
  // --- Month-over-month comparison ---
  const _byMese={};const _byMeseKeys={};
  righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');const k=MESI[d.getMonth()]+' '+d.getFullYear();const sortKey=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');if(!_byMese[k]){_byMese[k]=0;_byMeseKeys[k]=sortKey}_byMese[k]+=parseFloat(r.costo||0)});
  const _mesiArr=Object.keys(_byMese).sort((a,b)=>_byMeseKeys[a].localeCompare(_byMeseKeys[b])).map(k=>[k,_byMese[k]]);
  if(_mesiArr.length>0){
    html+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">';
    _mesiArr.forEach(function(m,i){
      const val=m[1];const lbl=m[0];
      let deltaHtml='';
      if(i>0){const prev=_mesiArr[i-1][1];if(prev>0){const pct=((val-prev)/prev*100).toFixed(0);const isUp=val>prev;deltaHtml=' <span style="font-size:.7rem;font-weight:700;color:'+(isUp?'#c0392b':'#27ae60')+';background:'+(isUp?'#c0392b1a':'#27ae601a')+';padding:1px 5px;border-radius:2px">'+(isUp?'+':'')+pct+'%</span>'}}
      html+='<div style="background:var(--paper2);border-radius:3px;padding:6px 12px;font-size:.82rem;color:var(--ink);white-space:nowrap"><strong>'+lbl+'</strong>: '+fmtCHF(val)+' CHF'+deltaHtml+'</div>';
      if(i<_mesiArr.length-1)html+='<span style="color:var(--muted);font-size:.7rem">&rarr;</span>'});
    html+='</div>'}
  // --- Mini CSS bar chart ---
  if(_mesiArr.length>1){
    const _maxMese=Math.max(..._mesiArr.map(m=>m[1]));
    html+='<div style="margin-bottom:16px;padding:10px;background:var(--paper2);border-radius:3px"><div style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Trend mensile</div>';
    html+='<div style="display:flex;gap:4px;align-items:flex-end;height:120px">';
    _mesiArr.forEach(function(m){
      const h=_maxMese>0?Math.max(4,Math.round(m[1]/_maxMese*100)):4;
      html+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;justify-content:flex-end;height:100%">';
      html+='<div style="font-size:.78rem;color:var(--muted)">'+m[1].toFixed(0)+'</div>';
      html+='<div style="width:100%;max-width:40px;background:#b8860b;border-radius:2px 2px 0 0;height:'+h+'px"></div>';
      html+='<div style="font-size:.78rem;color:var(--muted);white-space:nowrap">'+m[0].split(' ')[0]+'</div>';
      html+='</div>'});
    html+='</div></div>'}
  // --- Fine nuove sezioni KPI ---
  if(righe.length){
  html+='<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Giorno</th><th class="num">PX</th><th class="num">Costo CHF</th><th>Tipo</th><th>Gruppo</th><th>Note</th><th></th></tr></thead><tbody>';
  righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');
    const costoTip=r._costoOriginale?' title="'+fmtCHF(r._costoOriginale)+'/'+r._nCondiviso+' ('+escP(r._gruppoOriginale)+')" style="cursor:help"':'';
    html+='<tr><td style="font-weight:600">'+d.getDate()+' '+MESI[d.getMonth()]+'</td><td>'+GIORNI[d.getDay()]+'</td><td class="num">'+r.px+'</td><td class="num"><strong'+costoTip+'>'+fmtCHF(r.costo)+(r._costoOriginale?' <span style="font-size:.78rem;color:var(--accent2)">÷'+r._nCondiviso+'</span>':'')+'</strong></td><td>'+(r.tipo_buono?'<span class="mini-badge" style="background:'+(r.tipo_buono==='BU'?'#e67e22':r.tipo_buono==='CG'?'#8e44ad':r.tipo_buono==='WL'?'#2980b9':'#2c6e49')+'">'+r.tipo_buono+'</span>':'—')+'</td><td style="color:var(--muted);font-size:.85rem">'+escP(r._gruppoOriginale||r.gruppo||'')+'</td><td style="color:var(--muted);font-size:.85rem">'+escP(r.note||'')+'</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="modificaMaisonRiga('+r.id+',\''+ne+'\')" style="font-size:.78rem;padding:3px 8px">Modifica</button> <button class="btn-act" onclick="spostaMaisonToExtra('+r.id+',\''+ne+'\')" style="font-size:.78rem;padding:3px 8px;color:#e67e22;border-color:#e67e22" title="Sposta in Spese Extra">&#8594; Extra</button> <button class="btn-act del" onclick="eliminaMaisonRigaDettaglio('+r.id+',\''+ne+'\')" style="font-size:.78rem;padding:3px 8px">Elimina</button></td></tr>'});
  const _detBuoniTot=[nBU?nBU+' BU':'',nBL?nBL+' BL':'',nCG_d?nCG_d+' CG':'',nWL_d?nWL_d+' WL':''].filter(Boolean).join(' · ');
  html+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td colspan="2"><strong>TOTALE RISTORANTE</strong></td><td class="num"><strong>'+totPx+' PX</strong></td><td class="num"><strong>CHF '+fmtCHF(tot)+'</strong></td><td style="font-size:.78rem;color:var(--muted)">'+(_detBuoniTot||'')+'</td><td colspan="2"></td></tr>';
  html+='</tbody></table></div>';
  }else{html+='<p style="color:var(--muted);text-align:center;padding:12px;font-size:.9rem">Nessun costo ristorante (tutte le voci sono in Spese Extra)</p>'}
  // Spese Extra per questo cliente (seRighe/totSE already computed above for KPI)
  if(seRighe.length){
    html+='<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Spese Extra (CHF '+fmtCHF(totSE)+')</h4>';
    html+='<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Tipo</th><th>Luogo</th><th>Descrizione</th><th class="num">CHF</th><th></th></tr></thead><tbody>';
    seRighe.forEach(r=>{const d=new Date(r.data_spesa+'T12:00:00');const tc=SE_TIPI_COLOR[r.tipo]||'var(--muted)';
      html+='<tr><td style="font-weight:600">'+d.getDate()+' '+MESI[d.getMonth()]+'</td><td><span class="mini-badge" style="background:'+tc+'">'+(SE_TIPI_LABEL[r.tipo]||r.tipo)+'</span></td><td style="font-size:.85rem">'+escP(r.luogo||'')+'</td><td style="font-size:.85rem;color:var(--muted)">'+escP(r.descrizione||'')+'</td><td class="num"><strong>'+fmtCHF(r.importo)+'</strong></td><td style="white-space:nowrap"><button class="btn-act edit" onclick="modificaSpeseExtra('+r.id+')" style="font-size:.78rem;padding:3px 8px">Modifica</button> <button class="btn-act del" onclick="eliminaSpeseExtra('+r.id+').then(function(){apriDettaglioMaison(\''+ne+'\')})" style="font-size:.78rem;padding:3px 8px">Elimina</button> <button class="btn-act" onclick="spostaExtraToMaison('+r.id+',\''+ne+'\')" style="font-size:.78rem;padding:3px 8px;color:#2c6e49;border-color:#2c6e49" title="Sposta in Costi Maison">&#8594; Maison</button></td></tr>'});
    html+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td colspan="4"><strong>TOTALE EXTRA</strong></td><td class="num"><strong>CHF '+fmtCHF(totSE)+'</strong></td></tr></tbody></table></div>'}
  // Regali per questo cliente (regRighe/totReg already computed above for KPI)
  if(regRighe.length){
    html+='<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Regali'+(totReg?' (CHF '+fmtCHF(totReg)+')':'')+'</h4>';
    html+='<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Descrizione</th><th class="num">CHF</th><th>Operatore</th></tr></thead><tbody>';
    regRighe.forEach(function(r){var d=new Date((r.data_regalo||r.created_at)+'T12:00:00');
      html+='<tr><td style="font-weight:600">'+d.toLocaleDateString('it-IT')+'</td><td>'+escP(r.descrizione||'')+'</td><td class="num">'+(r.importo?fmtCHF(r.importo):'—')+'</td><td style="color:var(--muted);font-size:.82rem">'+escP(r.operatore||'')+'</td></tr>'});
    html+='</tbody></table></div>'}
  // Note private
  var noteRighe=getNoteClientiReparto().filter(function(r){return r.nome.toLowerCase()===nome.toLowerCase()});
  if(noteRighe.length){
    html+='<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Note Private</h4>';
    noteRighe.forEach(function(r){var ne2=r.nome.replace(/'/g,"\\'");html+='<div style="padding:10px;background:var(--paper2);border-radius:3px;margin-bottom:6px;border-left:3px solid var(--accent2);display:flex;justify-content:space-between;align-items:start"><div><p style="margin-bottom:4px">'+esc(r.nota)+'</p><small style="color:var(--muted)">'+escP(r.operatore||'')+' — '+new Date(r.created_at).toLocaleDateString('it-IT')+'</small></div><button class="btn-act del" onclick="eliminaNotaCliente('+r.id+',\''+ne2+'\')" style="font-size:.78rem;flex-shrink:0">Elimina</button></div>'})}
  // Totale complessivo aggiornato
  var grandTotal=tot+(seRighe.length?seRighe.reduce(function(s,r){return s+parseFloat(r.importo||0)},0):0)+totReg;
  if(grandTotal>tot){html+='<div style="margin-top:10px;padding:10px;background:var(--paper2);border-radius:3px;text-align:center;font-weight:700;font-size:1rem;color:var(--accent2)">TOTALE COMPLESSIVO: CHF '+fmtCHF(grandTotal)+'</div>'}
  // Form aggiungi nota
  html+='<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--line)"><h4 style="font-family:Playfair Display,serif;margin-bottom:8px;color:var(--ink)">Aggiungi nota privata</h4><textarea id="detail-nota-input" rows="2" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem;resize:vertical;background:var(--paper2);color:var(--ink)" placeholder="Scrivi una nota..."></textarea><button class="btn-salva" onclick="salvaNotaCliente(\''+ne+'\')" style="margin-top:6px;font-size:.78rem;padding:8px 16px">Salva nota</button></div>';
  html+='<div style="display:flex;gap:10px;justify-content:center;margin-top:14px"><button class="btn-export" onclick="esportaMaisonClienteCSV(\''+nome.replace(/'/g,"\\'")+'\')">CSV</button><button class="btn-export btn-export-pdf" onclick="apriPdfSchedaMaison(\''+nome.replace(/'/g,"\\'")+'\')">PDF</button><button class="btn-export" onclick="stampaSchedaCliente()" style="border-color:#2c6e49;color:#2c6e49">Stampa</button></div>';
  var _pb=document.getElementById('profilo-content');_pb.className='profilo-box';_pb.innerHTML=html;document.getElementById('profilo-modal').classList.remove('hidden');
  _initNascitaInput('detail-nascita');
  var dnEl=document.getElementById('detail-nascita');if(dnEl&&budget&&budget.data_nascita){dnEl.value=new Date(budget.data_nascita+'T12:00:00').toLocaleDateString('it-IT');dnEl.dataset.isoValue=budget.data_nascita}}
async function salvaDetailNascita(nome){var val=_getNascitaValue('detail-nascita');
  if(!val){toast('Inserisci una data valida');return}
  var b=maisonBudgetCache.find(function(x){return x.nome.toLowerCase()===nome.toLowerCase()&&(x.reparto_dip||'slots')===currentReparto});
  if(b){try{await secPatch('maison_budget','id=eq.'+b.id,{data_nascita:val,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});b.data_nascita=val;b.aggiornato_da=getOperatore();b.aggiornato_at=new Date().toISOString();
    renderMaisonBudgetUI();logAzione('Data nascita maison',nome+' → '+val);toast('Data nascita salvata per '+nome)}catch(e){toast('Errore salvataggio data nascita')}}
  else{try{var r=await secPost('maison_budget',{nome:nome,data_nascita:val,reparto_dip:currentReparto,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
    maisonBudgetCache.push(r[0]);renderMaisonBudgetUI();toast('Data nascita salvata per '+nome)}catch(e){toast('Errore salvataggio data nascita')}}}
async function salvaDetailCat(nome){var cat=document.getElementById('detail-cat-select').value;
  var b=maisonBudgetCache.find(function(x){return x.nome.toLowerCase()===nome.toLowerCase()&&(x.reparto_dip||'slots')===currentReparto});
  if(b){try{await secPatch('maison_budget','id=eq.'+b.id,{categoria:cat,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});b.categoria=cat;b.aggiornato_da=getOperatore();b.aggiornato_at=new Date().toISOString();
    renderMaisonBudgetUI();renderMaisonDashboard();logAzione('Categoria maison',nome+' → '+(cat||'nessuna'));toast(nome+' → '+(cat==='full_maison'?'Full Maison':cat==='maison'?'Maison':cat==='direzione'?'Direzione':cat==='bu'?'Buono Unico':cat==='bl'?'Buono Lounge':'Nessuna categoria'))}catch(e){toast('Errore salvataggio categoria')}}
  else{try{var r=await secPost('maison_budget',{nome:nome,categoria:cat,reparto_dip:currentReparto,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
    maisonBudgetCache.push(r[0]);renderMaisonBudgetUI();renderMaisonDashboard();logAzione('Categoria maison',nome+' → '+cat);toast(nome+' → '+(cat==='full_maison'?'Full Maison':cat==='maison'?'Maison':cat==='direzione'?'Direzione':cat==='bu'?'Buono Unico':cat==='bl'?'Buono Lounge':'Nessuna categoria'))}catch(e){toast('Errore salvataggio categoria')}}}
function stampaSchedaCliente(){
  var content=document.getElementById('profilo-content').innerHTML;
  var win=window.open('','_blank','width=800,height=600');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scheda Cliente</title><style>');
  win.document.write('body{font-family:Source Sans 3,sans-serif;padding:30px;color:#1a1208;max-width:800px;margin:0 auto}');
  win.document.write('h3,h4{font-family:Playfair Display,serif}');
  win.document.write('table{width:100%;border-collapse:collapse;font-size:.85rem;margin:10px 0}');
  win.document.write('th{text-align:left;padding:6px 8px;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#8a7d6b;border-bottom:2px solid #e8dfd0}');
  win.document.write('td{padding:6px 8px;border-bottom:1px solid #e8dfd0}');
  win.document.write('.num{text-align:center;font-weight:600}');
  win.document.write('.mini-badge{display:inline-block;font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:2px;color:white;margin:1px}');
  win.document.write('.budget-bar{height:4px;border-radius:2px;background:#e8dfd0;margin-top:4px;overflow:hidden;min-width:60px}');
  win.document.write('.budget-bar-fill{height:100%;border-radius:2px}');
  win.document.write('button,.btn-act,.btn-del-tipo,.btn-salva,.btn-export,.btn-modal-cancel{display:none!important}');
  win.document.write('textarea,input[type=text]{display:none!important}');
  win.document.write('@media print{body{padding:10px}}</style></head><body>');
  win.document.write('<div style="text-align:center;margin-bottom:20px;font-size:.8rem;color:#8a7d6b">Casino Lugano SA — Scheda Cliente</div>');
  win.document.write(content);
  win.document.write('<div style="text-align:center;margin-top:20px;font-size:.75rem;color:#8a7d6b">Stampato il '+new Date().toLocaleDateString('it-IT')+' alle '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+' — Riservato</div>');
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.print()},300)}
function apriConfrontoClienti(){
  var _mr=getMaisonRepartoExpanded(),_br=getBudgetReparto(),_sr=getSpeseReparto(),_rr=getRegaliReparto();
  var nomi=[...new Set(_mr.map(function(r){return r.nome}))].sort();
  if(nomi.length<2){toast('Servono almeno 2 clienti');return}
  var mc=document.getElementById('profilo-content');
  var html='<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink)">Confronto clienti</h3><p style="color:var(--muted);font-size:.82rem">Seleziona 2 o 3 clienti da confrontare</p></div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  html+='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  html+='<select id="conf-cl-1" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 1 --</option>'+nomi.map(function(n){return'<option value="'+escP(n)+'">'+escP(n)+'</option>'}).join('')+'</select>';
  html+='<select id="conf-cl-2" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 2 --</option>'+nomi.map(function(n){return'<option value="'+escP(n)+'">'+escP(n)+'</option>'}).join('')+'</select>';
  html+='<select id="conf-cl-3" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 3 (opz.) --</option>'+nomi.map(function(n){return'<option value="'+escP(n)+'">'+escP(n)+'</option>'}).join('')+'</select>';
  html+='<button class="btn-salva" onclick="eseguiConfrontoMaison()" style="padding:8px 20px;font-size:.82rem">Confronta</button></div>';
  html+='<div id="conf-risultato"></div>';
  mc.innerHTML=html;document.getElementById('profilo-modal').classList.remove('hidden')}
function eseguiConfrontoMaison(){
  var n1=(document.getElementById('conf-cl-1')||{}).value;
  var n2=(document.getElementById('conf-cl-2')||{}).value;
  var n3=(document.getElementById('conf-cl-3')||{}).value;
  if(!n1||!n2){toast('Seleziona almeno 2 clienti');return}
  if(n1===n2||(n3&&(n3===n1||n3===n2))){toast('Seleziona clienti diversi');return}
  var clienti=[n1,n2];if(n3)clienti.push(n3);
  var _mr=getMaisonRepartoExpanded(),_sr=getSpeseReparto(),_rr=getRegaliReparto(),_br=getBudgetReparto();
  var colors=['#b8860b','#2980b9','#8e44ad'];
  var dati=clienti.map(function(nome,i){
    var righe=_mr.filter(function(r){return r.nome===nome});
    var se=_sr.filter(function(r){return r.beneficiario.toLowerCase()===nome.toLowerCase()});
    var reg=_rr.filter(function(r){return r.nome.toLowerCase()===nome.toLowerCase()});
    var budget=_br.find(function(b){return b.nome.toLowerCase()===nome.toLowerCase()});
    var totRist=righe.reduce(function(s,r){return s+parseFloat(r.costo||0)},0);
    var totExtra=se.reduce(function(s,r){return s+parseFloat(r.importo||0)},0);
    var totRegali=reg.reduce(function(s,r){return s+parseFloat(r.importo||0)},0);
    var visite=righe.length;
    var px=righe.reduce(function(s,r){return s+(r.px||0)},0);
    var nBU=_contaBuoni(righe,'BU');
    var nBL=_contaBuoni(righe,'BL');
    var cat=budget?budget.categoria||'':'';
    var byMese={};righe.forEach(function(r){var d=new Date(r.data_giornata+'T12:00:00');var k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');byMese[k]=(byMese[k]||0)+parseFloat(r.costo||0)});
    return{nome:nome,color:colors[i],totRist:totRist,totExtra:totExtra,totRegali:totRegali,totale:totRist+totExtra+totRegali,visite:visite,px:px,nBU:nBU,nBL:nBL,cat:cat,media:visite?totRist/visite:0,byMese:byMese}});
  var tuttiMesi={};dati.forEach(function(d){Object.keys(d.byMese).forEach(function(k){tuttiMesi[k]=true})});
  var mesiOrd=Object.keys(tuttiMesi).sort();
  var h='<h4 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:12px">Risultato confronto</h4>';
  h+='<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th></th>';
  dati.forEach(function(d){h+='<th style="text-align:center;color:'+d.color+';font-size:.85rem">'+escP(d.nome)+'</th>'});
  h+='</tr></thead><tbody>';
  var righeConf=[
    {label:'Categoria',fn:function(d){var c=d.cat;return c==='full_maison'?'Full Maison':c==='maison'?'Maison':c==='direzione'?'Direzione':c==='bu'?'Buono Unico':c==='bl'?'Buono Lounge':'—'}},
    {label:'Totale ristorante',fn:function(d){return fmtCHF(d.totRist)+' CHF'}},
    {label:'Totale extra',fn:function(d){return fmtCHF(d.totExtra)+' CHF'}},
    {label:'Totale regali',fn:function(d){return fmtCHF(d.totRegali)+' CHF'}},
    {label:'TOTALE COMPLESSIVO',fn:function(d){return'<strong>'+fmtCHF(d.totale)+' CHF</strong>'},bold:true},
    {label:'Visite',fn:function(d){return d.visite}},
    {label:'Persone (PX)',fn:function(d){return d.px}},
    {label:'Media/visita',fn:function(d){return fmtCHF(d.media)+' CHF'}},
    {label:'Buoni BU',fn:function(d){return d.nBU||'—'}},
    {label:'Buoni BL',fn:function(d){return d.nBL||'—'}}
  ];
  righeConf.forEach(function(rc,ri){
    h+='<tr'+(rc.bold?' style="background:var(--paper2);font-weight:700"':'')+'><td style="font-weight:600;font-size:.82rem;white-space:nowrap">'+rc.label+'</td>';
    var vals=dati.map(function(d){return parseFloat(rc.fn(d))||0});
    var maxVal=Math.max.apply(null,vals);
    dati.forEach(function(d,di){
      var val=rc.fn(d);var numVal=parseFloat(val)||0;
      var isMax=maxVal>0&&numVal===maxVal&&!rc.bold;
      h+='<td class="num" style="'+(isMax?'color:'+d.color+';font-weight:700':'')+'">'+val+'</td>'});
    h+='</tr>'});
  h+='</tbody></table></div>';
  if(mesiOrd.length>1){
    h+='<h4 style="font-family:Playfair Display,serif;color:var(--ink);margin:20px 0 12px">Trend mensile</h4>';
    var maxM=0;dati.forEach(function(d){mesiOrd.forEach(function(m){if((d.byMese[m]||0)>maxM)maxM=d.byMese[m]||0})});
    h+='<div style="display:flex;gap:4px;align-items:flex-end;height:140px;border-bottom:1px solid var(--line);margin-bottom:4px">';
    mesiOrd.forEach(function(m){
      h+='<div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:100%">';
      dati.forEach(function(d){
        var v=d.byMese[m]||0;var pct=maxM?Math.round(v/maxM*120):0;
        h+='<div style="flex:1;background:'+d.color+';border-radius:2px 2px 0 0;height:'+Math.max(pct,2)+'px;opacity:0.7" title="'+d.nome+': '+fmtCHF(v)+' CHF"></div>'});
      h+='</div>'});
    h+='</div>';
    h+='<div style="display:flex;gap:4px">';
    mesiOrd.forEach(function(m){var parts=m.split('-');h+='<div style="flex:1;text-align:center;font-size:.78rem;color:var(--muted)">'+MESI[parseInt(parts[1])-1]+'</div>'});
    h+='</div>';
    h+='<div style="display:flex;gap:14px;justify-content:center;margin-top:8px">';
    dati.forEach(function(d){h+='<span style="font-size:.78rem;color:'+d.color+';font-weight:600">&#9632; '+escP(d.nome)+'</span>'});
    h+='</div>'}
  document.getElementById('conf-risultato').innerHTML=h}
function esportaMaisonClienteCSV(nome){const righe=getMaisonFiltrati().filter(r=>r.nome===nome).sort((a,b)=>a.data_giornata.localeCompare(b.data_giornata));
  const seRighe=getSpeseReparto().filter(r=>r.beneficiario.toLowerCase()===nome.toLowerCase()).sort((a,b)=>(a.data_spesa||'').localeCompare(b.data_spesa||''));
  const regRighe=getRegaliReparto().filter(r=>r.nome&&r.nome.toLowerCase()===nome.toLowerCase());
  if(!righe.length&&!seRighe.length&&!regRighe.length){toast('Nessun dato');return}
  const _csvCatLabels={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  let _csvBudget=getBudgetReparto().find(b=>b.nome.toLowerCase()===nome.toLowerCase());
  if(!_csvBudget){const _cog=nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)_csvBudget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
  const _csvCat=_csvBudget&&_csvBudget.categoria?_csvCatLabels[_csvBudget.categoria]:'';
  const rows=[[nome+(_csvCat?' — '+_csvCat:'')],['Data','Giorno','PX','Costo CHF','Tipo','Gruppo','Note']];
  righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');rows.push([d.toLocaleDateString('it-IT'),GIORNI[d.getDay()],r.px,r.costo,r.tipo_buono||'',r.gruppo||'',r.note||''])});
  const tot=righe.reduce((s,r)=>s+parseFloat(r.costo||0),0);
  const _nBU=_contaBuoni(righe,'BU'),_nBL=_contaBuoni(righe,'BL'),_nCG=_contaBuoni(righe,'CG'),_nWL=_contaBuoni(righe,'WL');
  rows.push(['TOTALE','',righe.reduce((s,r)=>s+(r.px||0),0),fmtCHF(tot),'BU:'+_nBU+' BL:'+_nBL+' CG:'+_nCG+' WL:'+_nWL,'','']);
  // Spese Extra
  if(seRighe.length){rows.push([]);rows.push(['SPESE EXTRA']);rows.push(['Data','Tipo','Luogo','Descrizione','Importo CHF']);
    seRighe.forEach(r=>{rows.push([new Date(r.data_spesa+'T12:00:00').toLocaleDateString('it-IT'),SE_TIPI_LABEL[r.tipo]||r.tipo,r.luogo||'',r.descrizione||'',fmtCHF(r.importo)])});
    rows.push(['TOTALE EXTRA','','','',fmtCHF(seRighe.reduce((s,r)=>s+parseFloat(r.importo||0),0))])}
  // Regali
  if(regRighe.length){rows.push([]);rows.push(['REGALI']);rows.push(['Data','Descrizione','Importo CHF']);
    regRighe.forEach(r=>{rows.push([r.data_regalo?new Date(r.data_regalo+'T12:00:00').toLocaleDateString('it-IT'):'',r.descrizione||'',fmtCHF(r.importo||0)])});
    rows.push(['TOTALE REGALI','',fmtCHF(regRighe.reduce((s,r)=>s+parseFloat(r.importo||0),0))])}
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'maison_'+nome.replace(/\s+/g,'_')+'_'+_maisonFilePeriodo(righe)+'.csv'}).click();toast('CSV esportato!')}
function apriPdfSchedaMaison(nome){const mc=document.getElementById('pwd-modal-content');
  mc.innerHTML='<h3>PDF Scheda Cliente</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:14px">Seleziona le sezioni da includere nel PDF di <strong>'+escP(nome)+'</strong>:</p><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">'+
    ['<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-kpi" checked> KPI (visite, persone, media, totale)</label>',
     '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-visite" checked> Dettaglio visite</label>',
     '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-trend" checked> Trend mensile</label>',
     '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-extra"> Spese extra</label>',
     '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-regali"> Regali</label>'].join('')+
    '</div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="esportaMaisonClientePDF(\''+nome.replace(/'/g,"\\'")+'\')">Genera PDF</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden')}
async function esportaMaisonClientePDF(nome){
  const sez={kpi:document.getElementById('pdf-mc-kpi')?.checked!==false,visite:document.getElementById('pdf-mc-visite')?.checked!==false,trend:document.getElementById('pdf-mc-trend')?.checked,extra:document.getElementById('pdf-mc-extra')?.checked,regali:document.getElementById('pdf-mc-regali')?.checked};
  document.getElementById('pwd-modal').classList.add('hidden');
  const righe=getMaisonFiltrati().filter(r=>r.nome===nome).sort((a,b)=>a.data_giornata.localeCompare(b.data_giornata));
  const _seRighePdf=getSpeseReparto().filter(r=>r.beneficiario.toLowerCase()===nome.toLowerCase());
  const _regRighePdf=getRegaliReparto().filter(r=>r.nome&&r.nome.toLowerCase()===nome.toLowerCase());
  if(!righe.length&&!_seRighePdf.length&&!_regRighePdf.length){toast('Nessun dato');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore caricamento libreria PDF');return}}
  const tot=righe.reduce((s,r)=>s+parseFloat(r.costo||0),0);const totPx=righe.reduce((s,r)=>s+(r.px||0),0);
  const nBU=_contaBuoni(righe,'BU'),nBL=_contaBuoni(righe,'BL');
  const _mesiMap={};righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');const label=MESI_FULL[d.getMonth()]+' '+d.getFullYear();const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');_mesiMap[key]=label});
  const mesi=Object.keys(_mesiMap).sort().map(k=>_mesiMap[k]).join(', ');
  const budget=getBudgetReparto().find(b=>b.nome.toLowerCase()===nome.toLowerCase());
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('portrait','mm','a4');const pw=doc.internal.pageSize.getWidth();let y=14;
    if(_logoB64)try{doc.addImage(_logoB64,'PNG',pw/2-20,y,40,22.5)}catch(e){}
    y+=28;doc.setFont('helvetica','bold');doc.setFontSize(14);
    const _clCatLabels={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
    const _clCatColors={full_maison:[184,134,11],maison:[41,128,185],direzione:[142,68,173],bu:[230,126,34],bl:[44,110,73]};
    let _clBudget=budget;if(!_clBudget){const _cog=nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)_clBudget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
    const _clCat=_clBudget&&_clBudget.categoria?_clCatLabels[_clBudget.categoria]:'';
    doc.text('Scheda Cliente — '+nome,pw/2,y,{align:'center'});y+=7;
    if(_clCat){doc.setFontSize(11);const _cc=_clCatColors[_clBudget.categoria]||[100,100,100];doc.setTextColor(_cc[0],_cc[1],_cc[2]);doc.text(_clCat,pw/2,y,{align:'center'});y+=6;doc.setTextColor(0)}
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);
    doc.text(mesi+' — Casino Lugano SA',pw/2,y,{align:'center'});y+=8;doc.setTextColor(0);
    // KPI
    const nCG=_contaBuoni(righe,'CG'),nWL=_contaBuoni(righe,'WL');
    if(sez.kpi){const media=righe.length?fmtCHF(tot/righe.length):'0';
      doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Visite','Persone','BU','BL','CG','WL','Totale CHF','Media/visita']],
        body:[[righe.length,totPx,nBU||'-',nBL||'-',nCG||'-',nWL||'-','CHF '+fmtCHF(tot),media]],
        headStyles:{fillColor:[184,134,11]},styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:9,cellPadding:4,halign:'center'},
        columnStyles:{6:{fontStyle:'bold'}}});y=doc.lastAutoTable.finalY+8}
    // Trend mensile
    if(sez.trend){const byMese={};righe.forEach(r=>{const d=new Date(r.data_giornata+'T12:00:00');const k=MESI[d.getMonth()]+' '+d.getFullYear();byMese[k]=(byMese[k]||0)+parseFloat(r.costo||0)});
      const mesiArr=Object.entries(byMese);if(mesiArr.length>1){
        doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Mese','Totale CHF','Variazione']],
          body:mesiArr.map(([m,v],i)=>{const delta=i>0?((v-mesiArr[i-1][1])/mesiArr[i-1][1]*100).toFixed(1)+'%':'—';return[m,fmtCHF(v),delta]}),
          headStyles:{fillColor:[26,74,122]},styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:9,cellPadding:3},alternateRowStyles:{fillColor:[250,247,242]}});
        y=doc.lastAutoTable.finalY+8}}
    // Dettaglio visite
    if(sez.visite){doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},
      head:[['Data','Giorno','PX','Costo CHF','Tipo','Gruppo','Note']],
      body:righe.map(r=>{const d=new Date(r.data_giornata+'T12:00:00');return[d.getDate()+' '+MESI[d.getMonth()],GIORNI[d.getDay()],r.px,fmtCHF(r.costo),r.tipo_buono||'',r.gruppo||'',r.note||'']}),
      foot:[['TOTALE','',totPx,'CHF '+fmtCHF(tot),'','','']],
      headStyles:{fillColor:[26,18,8]},footStyles:{fillColor:[245,243,238],textColor:[0,0,0],fontStyle:'bold'},
      styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:8,cellPadding:3},columnStyles:{2:{halign:'center'},3:{halign:'right'}},
      alternateRowStyles:{fillColor:[250,247,242]}});y=doc.lastAutoTable.finalY+8}
    // Spese extra
    if(sez.extra){const seR=getSpeseReparto().filter(r=>r.beneficiario.toLowerCase()===nome.toLowerCase());
      if(seR.length){const totSE=seR.reduce((s,r)=>s+parseFloat(r.importo||0),0);
        doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Data','Tipo','Luogo','Descrizione','CHF']],
          body:seR.map(r=>{const d=new Date(r.data_spesa+'T12:00:00');return[d.toLocaleDateString('it-IT'),SE_TIPI_LABEL[r.tipo]||r.tipo,r.luogo||'',r.descrizione||'',fmtCHF(r.importo)]}),
          foot:[['TOTALE EXTRA','','','','CHF '+fmtCHF(totSE)]],
          headStyles:{fillColor:[142,68,173]},footStyles:{fillColor:[245,243,238],textColor:[0,0,0],fontStyle:'bold'},
          styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:8,cellPadding:3},alternateRowStyles:{fillColor:[250,247,242]}});y=doc.lastAutoTable.finalY+8}}
    // Regali
    if(sez.regali){const regR=getRegaliReparto().filter(r=>r.nome.toLowerCase()===nome.toLowerCase());
      if(regR.length){doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Data','Descrizione','CHF','Operatore']],
          body:regR.map(r=>[new Date((r.data_regalo||r.created_at)+'T12:00:00').toLocaleDateString('it-IT'),r.descrizione||'',r.importo?fmtCHF(r.importo):'—',r.operatore||'']),
          headStyles:{fillColor:[184,134,11]},styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:8,cellPadding:3},alternateRowStyles:{fillColor:[250,247,242]}});y=doc.lastAutoTable.finalY+8}}
    const tp=doc.internal.getNumberOfPages();for(let i=1;i<=tp;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA — '+nome+' — Pag. '+i+'/'+tp,16,doc.internal.pageSize.getHeight()-8)}
    mostraPdfPreview(doc,'scheda_'+nome.replace(/\s+/g,'_')+'_'+_maisonFilePeriodo(righe)+'.pdf','Scheda — '+nome)}catch(e){console.error(e);toast('Errore PDF')}}

// Controlla se un nome esiste solo come parte di nomi condivisi (es. "Bertaggia" da "Bertaggia/Pegoraro")
function _isSoloCondiviso(nome){return!getMaisonReparto().some(r=>r.nome===nome)&&getMaisonReparto().some(r=>r.nome.includes('/')&&r.nome.split(/\s*\/\s*/).some(n=>capitalizzaNome(n.trim())===nome))}
function _getNomiCondivisiOriginali(nome){return[...new Set(getMaisonReparto().filter(r=>r.nome.includes('/')&&r.nome.split(/\s*\/\s*/).some(n=>capitalizzaNome(n.trim())===nome)).map(r=>r.nome))]}
// Elimina singolo cliente (tutte le righe)
async function eliminaMaisonCliente(nome){
  if(_isSoloCondiviso(nome)){_eliminaCondivisoModal(nome);return}
  const count=getMaisonReparto().filter(r=>r.nome===nome).length;
  if(!count){toast('Nessun record trovato per '+nome);return}
  if(!confirm('Eliminare tutte le '+count+' registrazioni di "'+nome+'" ('+currentReparto+')?'))return;
  try{await secDel('costi_maison','nome=eq.'+encodeURIComponent(nome)+'&reparto_dip=eq.'+currentReparto);maisonCache=maisonCache.filter(r=>!(r.nome===nome&&(r.reparto_dip||'slots')===currentReparto));
    logAzione('Maison: eliminato cliente',nome+' ('+count+' righe, '+currentReparto+')');renderMaisonDashboard();renderMaisonBudgetAlerts();toast(nome+' eliminato ('+count+' righe)')}catch(e){toast('Errore eliminazione cliente')}}
function _eliminaCondivisoModal(nome){const orig=_getNomiCondivisiOriginali(nome);
  const altri=orig.map(o=>o.split(/\s*\/\s*/).filter(n=>capitalizzaNome(n.trim())!==nome).map(n=>capitalizzaNome(n.trim())).join(', '));
  const count=getMaisonReparto().filter(r=>orig.includes(r.nome)).length;
  const ne=nome.replace(/'/g,"\\'");
  const b=document.getElementById('pwd-modal-content');
  b.innerHTML='<h3>Eliminare '+escP(nome)+'?</h3><p style="margin-bottom:12px">'+escP(nome)+' ha <strong>'+count+' registrazioni condivise</strong> con: <strong>'+escP(altri.join(', '))+'</strong></p><p style="font-size:.88rem;color:var(--muted);margin-bottom:16px">Il costo era diviso tra i due. Cosa vuoi fare?</p><div class="pwd-modal-btns" style="flex-wrap:wrap;gap:8px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" style="background:var(--accent)" onclick="_eseguiEliminaCondiviso(\''+ne+'\',true)">Elimina entrambi ('+count+' righe)</button><button class="btn-modal-ok" style="background:var(--accent2)" onclick="_eseguiEliminaCondiviso(\''+ne+'\',false)">Solo '+escP(nome)+' (mantieni '+escP(altri[0])+')</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden')}
async function _eseguiEliminaCondiviso(nome,entrambi){document.getElementById('pwd-modal').classList.add('hidden');
  const orig=_getNomiCondivisiOriginali(nome);
  const ids=getMaisonReparto().filter(r=>orig.includes(r.nome)).map(r=>r.id);
  try{if(entrambi){for(const id of ids){await secDel('costi_maison','id=eq.'+id)}maisonCache=maisonCache.filter(r=>!ids.includes(r.id));
    logAzione('Maison: eliminato condiviso',orig.join(', ')+' ('+ids.length+' righe)');toast(orig.join(', ')+' eliminati ('+ids.length+' righe)')
  }else{for(const id of ids){const rec=maisonCache.find(r=>r.id===id);if(!rec)continue;
    const nuovoNome=rec.nome.split(/\s*\/\s*/).filter(n=>capitalizzaNome(n.trim())!==nome).map(n=>capitalizzaNome(n.trim())).join(' / ');
    await secPatch('costi_maison','id=eq.'+id,{nome:nuovoNome});rec.nome=nuovoNome}
    logAzione('Maison: rimosso da condiviso',nome+' rimosso da '+orig.join(', '));toast(nome+' rimosso, costo intero assegnato a '+orig[0].split(/\s*\/\s*/).filter(n=>capitalizzaNome(n.trim())!==nome).join(', '))}
  renderMaisonDashboard();renderMaisonBudgetAlerts()}catch(e){toast('Errore: '+e.message)}}
// Rinomina cliente (tutte le occorrenze)
function rinominaMaisonCliente(nome){const b=document.getElementById('pwd-modal-content');
  if(_isSoloCondiviso(nome)){const orig=_getNomiCondivisiOriginali(nome);const ne=nome.replace(/'/g,"\\'");
    b.innerHTML='<h3>Rinomina cliente Maison</h3><p style="margin-bottom:8px;font-size:.88rem;color:var(--accent2)">'+escP(nome)+' è registrato insieme a: <strong>'+escP(orig.join(', '))+'</strong></p><div class="pwd-field"><label>Nuovo nome per '+escP(nome)+'</label><input type="text" id="rin-maison-nuovo" value="'+escP(nome)+'"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_eseguiRinominaCondiviso(\''+ne+'\')">Salva</button></div>';
    document.getElementById('pwd-modal').classList.remove('hidden');setTimeout(()=>{const i=document.getElementById('rin-maison-nuovo');i.focus();i.select()},100);return}
  b.innerHTML='<h3>Rinomina cliente Maison</h3><div class="pwd-field"><label>Nome attuale</label><input type="text" value="'+escP(nome)+'" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="rin-maison-nuovo" value="'+escP(nome)+'"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaMaison(\''+nome.replace(/'/g,"\\'")+'\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');setTimeout(()=>{const i=document.getElementById('rin-maison-nuovo');i.focus();i.select()},100)}
async function eseguiRinominaMaison(vecchio){const nuovo=capitalizzaNome(document.getElementById('rin-maison-nuovo').value.trim());
  if(!nuovo){toast('Inserisci un nome');return}if(nuovo===vecchio){document.getElementById('pwd-modal').classList.add('hidden');return}
  try{await secPatch('costi_maison','nome=eq.'+encodeURIComponent(vecchio)+'&reparto_dip=eq.'+currentReparto,{nome:nuovo});
    maisonCache.forEach(r=>{if(r.nome===vecchio&&(r.reparto_dip||'slots')===currentReparto)r.nome=nuovo});
    // Aggiorna anche budget se presente (solo reparto corrente)
    const bIdx=maisonBudgetCache.findIndex(b=>b.nome.toLowerCase()===vecchio.toLowerCase()&&(b.reparto_dip||'slots')===currentReparto);
    if(bIdx!==-1){await secPatch('maison_budget','id=eq.'+maisonBudgetCache[bIdx].id,{nome:nuovo});maisonBudgetCache[bIdx].nome=nuovo}
    logAzione('Maison: rinominato',vecchio+' → '+nuovo);document.getElementById('pwd-modal').classList.add('hidden');
    renderMaisonDashboard();renderMaisonBudgetUI();renderMaisonBudgetAlerts();toast(vecchio+' → '+nuovo)}catch(e){toast('Errore rinomina')}}
async function _eseguiRinominaCondiviso(vecchio){const nuovo=capitalizzaNome(document.getElementById('rin-maison-nuovo').value.trim());
  if(!nuovo){toast('Inserisci un nome');return}if(nuovo===vecchio){document.getElementById('pwd-modal').classList.add('hidden');return}
  const orig=_getNomiCondivisiOriginali(vecchio);
  const ids=getMaisonReparto().filter(r=>orig.includes(r.nome)).map(r=>r.id);
  try{for(const id of ids){const rec=maisonCache.find(r=>r.id===id);if(!rec)continue;
    const nuovoNome=rec.nome.split(/\s*\/\s*/).map(n=>capitalizzaNome(n.trim())===vecchio?nuovo:capitalizzaNome(n.trim())).join(' / ');
    await secPatch('costi_maison','id=eq.'+id,{nome:nuovoNome});rec.nome=nuovoNome}
  logAzione('Maison: rinominato condiviso',vecchio+' → '+nuovo);document.getElementById('pwd-modal').classList.add('hidden');
  renderMaisonDashboard();renderMaisonBudgetUI();renderMaisonBudgetAlerts();toast(vecchio+' → '+nuovo)}catch(e){toast('Errore rinomina')}}
// Modifica singola riga maison (PX, tipo, costo, note)
function modificaMaisonRiga(id,nome){const r=maisonCache.find(x=>x.id===id);if(!r)return;
  const ne=nome.replace(/'/g,"\\'");
  const mc=document.getElementById('pwd-modal-content');
  mc.innerHTML='<h3>Modifica riga</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">'+escP(r.nome)+' — '+new Date(r.data_giornata+'T12:00:00').toLocaleDateString('it-IT')+'</p><div style="display:flex;gap:10px;flex-wrap:wrap"><div class="pwd-field" style="flex:1;min-width:80px"><label>PX</label><input type="number" id="edit-mr-px" value="'+(r.px||1)+'" min="1"></div><div class="pwd-field" style="flex:1;min-width:100px"><label>Costo CHF</label><input type="number" id="edit-mr-costo" value="'+parseFloat(r.costo).toFixed(2)+'" step="0.01"></div><div class="pwd-field" style="flex:1;min-width:100px"><label>Tipo</label><select id="edit-mr-tipo" style="width:100%;padding:8px"><option value=""'+((!r.tipo_buono)?' selected':'')+'>Normale</option><option value="BU"'+(r.tipo_buono==='BU'?' selected':'')+'>Buono Unico</option><option value="BL"'+(r.tipo_buono==='BL'?' selected':'')+'>Buono Lounge</option><option value="CG"'+(r.tipo_buono==='CG'?' selected':'')+'>C. Gourmet</option><option value="WL"'+(r.tipo_buono==='WL'?' selected':'')+'>Welcome Lounge</option></select></div></div><div class="pwd-field"><label>Note</label><input type="text" id="edit-mr-note" value="'+escP(r.note||'')+'"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaMaisonRiga('+id+',\''+ne+'\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden')}
async function salvaModificaMaisonRiga(id,nome){
  const px=parseInt(document.getElementById('edit-mr-px').value)||1;
  const costo=parseFloat(document.getElementById('edit-mr-costo').value)||0;
  const tipo=document.getElementById('edit-mr-tipo').value||null;
  const note=document.getElementById('edit-mr-note').value.trim();
  try{await secPatch('costi_maison','id=eq.'+id,{px,costo,tipo_buono:tipo,note});
    const r=maisonCache.find(x=>x.id===id);if(r){r.px=px;r.costo=costo;r.tipo_buono=tipo;r.note=note}
    logAzione('Modifica riga maison',nome+' PX:'+px+' CHF:'+costo+(tipo?' '+tipo:''));
    document.getElementById('pwd-modal').classList.add('hidden');
    apriDettaglioMaison(nome);renderMaisonDashboard();toast('Riga modificata')}catch(e){toast('Errore modifica')}}
// Sposta da costi_maison a spese_extra
async function eliminaMaisonRigaDettaglio(id,nome){const r=maisonCache.find(x=>x.id===id);if(!r)return;
  if(!confirm('Eliminare la spesa di '+r.nome+' del '+new Date(r.data_giornata+'T12:00:00').toLocaleDateString('it-IT')+' ('+parseFloat(r.costo).toFixed(2)+' CHF)?'))return;
  try{await secDel('costi_maison','id=eq.'+id);maisonCache=maisonCache.filter(x=>x.id!==id);
    logAzione('Eliminata spesa Maison',r.nome+' '+parseFloat(r.costo).toFixed(2)+' CHF del '+r.data_giornata);
    toast('Spesa eliminata');apriDettaglioMaison(nome);renderMaisonDashboard()}catch(e){toast('Errore eliminazione')}}
async function spostaMaisonToExtra(id,nome){const r=maisonCache.find(x=>x.id===id);if(!r)return;
  if(!confirm('Spostare '+r.nome+' ('+parseFloat(r.costo).toFixed(2)+' CHF, '+r.data_giornata+') in Spese Extra?'))return;
  try{await secPost('spese_extra',{beneficiario:r.nome,tipo:'cena_esterna',importo:r.costo,data_spesa:r.data_giornata,luogo:r.note||'',descrizione:'Spostato da Costi Maison',operatore:getOperatore(),reparto_dip:currentReparto});
    await secDel('costi_maison','id=eq.'+id);maisonCache=maisonCache.filter(x=>x.id!==id);speseExtraCache=await secGet('spese_extra?order=data_spesa.desc');
    logAzione('Maison → Extra',r.nome+' '+parseFloat(r.costo).toFixed(2)+' CHF');toast('Spostato in Spese Extra');apriDettaglioMaison(nome);renderMaisonDashboard()}catch(e){toast('Errore spostamento')}}
// Sposta da spese_extra a costi_maison
async function spostaExtraToMaison(id,nome){const r=speseExtraCache.find(x=>x.id===id);if(!r)return;
  if(!confirm('Spostare '+r.beneficiario+' ('+parseFloat(r.importo).toFixed(2)+' CHF, '+r.data_spesa+') in Costi Maison?'))return;
  try{await secPost('costi_maison',{nome:r.beneficiario,costo:r.importo,data_giornata:r.data_spesa,px:1,tipo_buono:'',note:r.luogo||r.descrizione||'',gruppo:'',operatore:getOperatore(),reparto_dip:currentReparto});
    await secDel('spese_extra','id=eq.'+id);speseExtraCache=speseExtraCache.filter(x=>x.id!==id);maisonCache=await secGet('costi_maison?order=data_giornata.desc');
    logAzione('Extra → Maison',r.beneficiario+' '+parseFloat(r.importo).toFixed(2)+' CHF');toast('Spostato in Costi Maison');apriDettaglioMaison(nome);renderMaisonDashboard()}catch(e){toast('Errore spostamento')}}
// Elimina tutti i dati di un giorno
async function eliminaMaisonGiorno(){const sel=document.getElementById('maison-del-giorno');if(!sel||!sel.value){toast('Seleziona un giorno');return}
  const giorno=sel.value;const label=new Date(giorno+'T12:00:00').toLocaleDateString('it-IT');
  const count=getMaisonReparto().filter(r=>r.data_giornata===giorno).length;
  if(!confirm('Eliminare tutte le '+count+' registrazioni del '+label+' ('+currentReparto+')?'))return;
  try{await secDel('costi_maison','data_giornata=eq.'+giorno+'&reparto_dip=eq.'+currentReparto);maisonCache=maisonCache.filter(r=>!(r.data_giornata===giorno&&(r.reparto_dip||'slots')===currentReparto));
    logAzione('Maison: eliminato giorno',label+' ('+count+' righe, '+currentReparto+')');renderMaisonDashboard();renderMaisonBudgetAlerts();toast('Giorno '+label+' eliminato')}catch(e){toast('Errore eliminazione giorno')}}
async function eliminaMaisonMese(){const sel=document.getElementById('maison-del-mese');if(!sel||!sel.value){toast('Seleziona un mese');return}
  const mese=sel.value;const meseStart=mese+'-01';const meseEnd=mese+'-31';
  const label=MESI_FULL[parseInt(mese.split('-')[1])-1]+' '+mese.split('-')[0];
  const count=getMaisonReparto().filter(r=>r.data_giornata>=meseStart&&r.data_giornata<=meseEnd).length;
  if(!count){toast('Nessun dato per '+label);return}
  if(!confirm('Eliminare tutte le '+count+' registrazioni di '+label+' ('+currentReparto+')?'))return;
  try{await secDel('costi_maison','data_giornata=gte.'+meseStart+'&data_giornata=lte.'+meseEnd+'&reparto_dip=eq.'+currentReparto);
    maisonCache=maisonCache.filter(r=>!(r.data_giornata>=meseStart&&r.data_giornata<=meseEnd&&(r.reparto_dip||'slots')===currentReparto));
    logAzione('Maison: eliminato mese',label+' ('+count+' righe, '+currentReparto+')');renderMaisonDashboard();renderMaisonBudgetAlerts();toast(label+' eliminato ('+count+' righe)')}catch(e){toast('Errore eliminazione mese')}}

// Budget
function renderMaisonBudgetUI(){const el=document.getElementById('maison-budget-list');if(!el)return;
  const _br=getBudgetReparto(),_mr=getMaisonRepartoExpanded();
  // Solo clienti con categoria assegnata (+ opzione per vedere tutti)
  const clientiCat=_br.filter(b=>b.categoria);
  const tuttiNomi=[...new Set(clientiCat.map(b=>b.nome))].sort();
  const nTotali=[...new Set([..._br.map(b=>b.nome),..._mr.map(r=>r.nome)])].length;
  if(!tuttiNomi.length&&!_mr.length){el.innerHTML='<div class="empty-state"><p>Nessun cliente categorizzato</p><small>Clicca sul nome di un cliente nella tabella sopra per assegnare una categoria</small></div>';return}
  let filtCat=(document.getElementById('maison-filt-cat-lista')||{}).value||'';
  const nFM=clientiCat.filter(b=>b.categoria==='full_maison').length;
  const nM=clientiCat.filter(b=>b.categoria==='maison').length;
  const nD=clientiCat.filter(b=>b.categoria==='direzione').length;
  const nBU=clientiCat.filter(b=>b.categoria==='bu').length;
  const nBL=clientiCat.filter(b=>b.categoria==='bl').length;
  const _filtNomeBudget=(document.getElementById('maison-filt-nome-budget')||{}).value||'';
  let html='<div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap"><select id="maison-filt-cat-lista" onchange="renderMaisonBudgetUI()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.85rem;background:var(--paper);color:var(--ink)"><option value="">Tutti categorizzati ('+tuttiNomi.length+')</option><option value="full_maison"'+(filtCat==='full_maison'?' selected':'')+'>Full Maison ('+nFM+')</option><option value="maison"'+(filtCat==='maison'?' selected':'')+'>Maison ('+nM+')</option><option value="direzione"'+(filtCat==='direzione'?' selected':'')+'>Direzione ('+nD+')</option><option value="bu"'+(filtCat==='bu'?' selected':'')+'>Buono Unico ('+nBU+')</option><option value="bl"'+(filtCat==='bl'?' selected':'')+'>Buono Lounge ('+nBL+')</option></select><input type="text" id="maison-filt-nome-budget" placeholder="Cerca cliente..." value="'+escP(_filtNomeBudget)+'" oninput="renderMaisonBudgetUI()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.85rem;background:var(--paper);color:var(--ink);width:180px"></div>';
  // Build client data
  const clients=tuttiNomi.map(nome=>{
    const b=_br.find(x=>x.nome.toLowerCase()===nome.toLowerCase());
    const spent=_mr.filter(r=>r.nome.toLowerCase()===nome.toLowerCase()).reduce((s,r)=>s+parseFloat(r.costo||0),0);
    const cat=b?b.categoria||'':'';
    return{nome,b,spent,cat}});
  // Filter
  let filtered=clients;
  if(filtCat){filtered=clients.filter(c=>c.cat===filtCat)}
  if(_filtNomeBudget){const _fnl=_filtNomeBudget.toLowerCase();filtered=filtered.filter(c=>c.nome.toLowerCase().includes(_fnl))}
  // Group by category
  const catDefs=[{key:'full_maison',label:'Full Maison',color:'#b8860b'},{key:'maison',label:'Maison',color:'#2980b9'},{key:'direzione',label:'Direzione',color:'#8e44ad'},{key:'bu',label:'Buono Unico',color:'#e67e22'},{key:'bl',label:'Buono Lounge',color:'#2c6e49'}];
  function renderClientRow(c,idx){
    const pct=c.b&&c.b.budget_chf?Math.round(c.spent/c.b.budget_chf*100):0;
    const pctColor=pct>=100?'var(--accent)':pct>=80?'#e67e22':'#2c6e49';
    const borderColor=c.cat==='full_maison'?'#b8860b':c.cat==='maison'?'#2980b9':c.cat==='direzione'?'#8e44ad':c.cat==='bu'?'#e67e22':c.cat==='bl'?'#2c6e49':'var(--muted)';
    const nascitaLabel=c.b&&c.b.data_nascita?new Date(c.b.data_nascita+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}):'';
    const isBday=c.b?_isCompleannoOggi(c.b.data_nascita):false;
    const ne=c.nome.replace(/'/g,"\\'");
    const budgetBar=c.b&&c.b.budget_chf?'<div class="budget-bar"><div class="budget-bar-fill" style="width:'+Math.min(pct,100)+'%;background:'+pctColor+'"></div></div>':'';
    const bgColor=c.cat==='full_maison'?'rgba(184,134,11,0.15)':c.cat==='maison'?'rgba(41,128,185,0.15)':c.cat==='direzione'?'rgba(142,68,173,0.15)':c.cat==='bu'?'rgba(230,126,34,0.15)':c.cat==='bl'?'rgba(44,110,73,0.15)':(idx%2?'rgba(0,0,0,0.03)':'var(--paper)');
    const _catBadgeRow=c.cat?'<span class="mini-badge" style="background:'+borderColor+';font-size:.7rem;margin-left:6px">'+({full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'BU',bl:'BL'}[c.cat]||'')+'</span>':'';
    return'<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:'+bgColor+';border-radius:3px;margin-bottom:4px;border-left:3px solid '+borderColor+';flex-wrap:wrap"><span style="font-weight:600;min-width:150px;cursor:pointer" class="entry-name" onclick="apriDettaglioMaison(\''+ne+'\')">'+escP(c.nome)+_catBadgeRow+(isBday?' <span style="font-size:1.1rem">&#127874;</span>':'')+'</span>'+(c.spent?'<span style="font-size:.82rem;color:var(--muted)">'+fmtCHF(c.spent)+' CHF</span>':'')+(c.b&&c.b.budget_chf?'<span style="font-size:.82rem;color:'+pctColor+';font-weight:600">'+pct+'%</span>'+budgetBar:'')+(nascitaLabel?'<span style="font-size:.82rem;color:var(--muted)">&#127874; '+nascitaLabel+'</span>':'')+(c.b?'<button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2);font-size:.72rem" onclick="modificaMaisonInfo('+c.b.id+')">Modifica</button>':'<button class="btn-del-tipo" style="color:#2980b9;border-color:#2980b9;font-size:.72rem" onclick="assegnaCatRapida(\''+ne+'\')">Assegna</button>')+(c.b?'<button class="btn-del-tipo" style="font-size:.72rem" onclick="rimuoviMaisonBudget('+c.b.id+')">Rimuovi</button>':'')+'</div>'}
  if(filtCat){html+=filtered.map(renderClientRow).join('')}
  else{catDefs.forEach(cd=>{
    const group=filtered.filter(c=>c.cat===cd.key);if(!group.length)return;
    html+='<div class="cat-group-header" style="color:'+cd.color+';border-bottom-color:'+cd.color+'">'+cd.label+' <span class="cat-count" style="background:'+cd.color+'">'+group.length+'</span></div>';
    html+=group.map(renderClientRow).join('')})}
  el.innerHTML=html;
  // Ripristina focus sul campo ricerca se era attivo
  if(_filtNomeBudget){const _ri=document.getElementById('maison-filt-nome-budget');if(_ri){_ri.focus();_ri.setSelectionRange(_ri.value.length,_ri.value.length)}}}
async function salvaMaisonBudget(){const nome=capitalizzaNome(document.getElementById('maison-budget-nome').value.trim());
  const chf=parseFloat(document.getElementById('maison-budget-chf').value)||null;
  const bu=parseInt(document.getElementById('maison-budget-bu').value)||null;
  const bl=parseInt(document.getElementById('maison-budget-bl').value)||null;
  const nascita=_getNascitaValue('maison-budget-nascita')||null;
  const cat=document.getElementById('maison-budget-cat').value||'';
  if(!nome){toast('Inserisci il nome del cliente');return}
  if(!chf&&!bu&&!bl&&!nascita&&!cat){toast('Imposta almeno un campo');return}
  if(getBudgetReparto().find(b=>b.nome.toLowerCase()===nome.toLowerCase())){toast('Già esistente per '+nome+'. Rimuovi prima il vecchio.');return}
  try{const r=await secPost('maison_budget',{nome,budget_chf:chf,budget_bu:bu,budget_bl:bl,data_nascita:nascita,categoria:cat,reparto_dip:currentReparto,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
    maisonBudgetCache.push(r[0]);document.getElementById('maison-budget-nome').value='';
    document.getElementById('maison-budget-chf').value='';document.getElementById('maison-budget-bu').value='';document.getElementById('maison-budget-bl').value='';const nbFp=document.getElementById('maison-budget-nascita');if(nbFp&&nbFp._flatpickr)nbFp._flatpickr.clear();else if(nbFp)nbFp.value='';
    renderMaisonBudgetUI();renderMaisonDashboard();renderMaisonBudgetAlerts();toast('Budget impostato per '+nome)}catch(e){toast('Errore salvataggio budget')}}
function assegnaCatRapida(nome){const mc=document.getElementById('pwd-modal-content');
  mc.innerHTML='<h3>Assegna categoria</h3><p style="color:var(--muted);margin-bottom:16px">'+escP(nome)+'</p><div style="display:flex;flex-direction:column;gap:10px"><button class="btn-salva" style="background:#b8860b" onclick="salvaAssegnaCat(\''+nome.replace(/'/g,"\\'")+'\',\'full_maison\')">Full Maison</button><button class="btn-salva" style="background:#2980b9" onclick="salvaAssegnaCat(\''+nome.replace(/'/g,"\\'")+'\',\'maison\')">Maison</button><button class="btn-salva" style="background:#8e44ad" onclick="salvaAssegnaCat(\''+nome.replace(/'/g,"\\'")+'\',\'direzione\')">Direzione</button><button class="btn-salva" style="background:#e67e22" onclick="salvaAssegnaCat(\''+nome.replace(/'/g,"\\'")+'\',\'bu\')">Buono Unico</button><button class="btn-salva" style="background:#2c6e49" onclick="salvaAssegnaCat(\''+nome.replace(/'/g,"\\'")+'\',\'bl\')">Buono Lounge</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden')}
async function salvaAssegnaCat(nome,cat){
  try{const r=await secPost('maison_budget',{nome,categoria:cat,reparto_dip:currentReparto,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});maisonBudgetCache.push(r[0]);
    document.getElementById('pwd-modal').classList.add('hidden');renderMaisonBudgetUI();renderMaisonDashboard();logAzione('Categoria maison',nome+' → '+cat);toast(nome+' → '+(cat==='full_maison'?'Full Maison':cat==='maison'?'Maison':cat==='direzione'?'Direzione':cat==='bu'?'Buono Unico':cat==='bl'?'Buono Lounge':cat))}catch(e){toast('Errore assegnazione categoria')}}
function modificaMaisonInfo(id){const b=maisonBudgetCache.find(x=>x.id===id);if(!b)return;
  const mc=document.getElementById('pwd-modal-content');
  const nascitaDisplay=b.data_nascita?new Date(b.data_nascita+'T12:00:00').toLocaleDateString('it-IT'):'';
  mc.innerHTML='<h3>Modifica info cliente</h3><div class="pwd-field"><label>Cliente</label><input type="text" value="'+escP(b.nome)+'" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Categoria</label><select id="edit-mb-cat" style="width:100%;padding:8px"><option value=""'+(b.categoria===''||!b.categoria?' selected':'')+'>—</option><option value="maison"'+(b.categoria==='maison'?' selected':'')+'>Maison</option><option value="full_maison"'+(b.categoria==='full_maison'?' selected':'')+'>Full Maison</option><option value="direzione"'+(b.categoria==='direzione'?' selected':'')+'>Direzione</option><option value="bu"'+(b.categoria==='bu'?' selected':'')+'>Buono Unico</option><option value="bl"'+(b.categoria==='bl'?' selected':'')+'>Buono Lounge</option></select></div><div style="display:flex;gap:10px"><div class="pwd-field" style="flex:1"><label>Budget CHF/mese</label><input type="number" id="edit-mb-chf" value="'+(b.budget_chf||'')+'" step="0.01"></div><div class="pwd-field" style="flex:1"><label>Max BU/mese</label><input type="number" id="edit-mb-bu" value="'+(b.budget_bu||'')+'"></div><div class="pwd-field" style="flex:1"><label>Max BL/mese</label><input type="number" id="edit-mb-bl" value="'+(b.budget_bl||'')+'"></div></div><p style="font-size:.78rem;color:var(--muted);margin:4px 0 8px">I valori sono mensili. Per il controllo annuale il sistema moltiplica &times;12.</p><div class="pwd-field"><label>Data nascita</label><input type="text" id="edit-mb-nascita" value="'+nascitaDisplay+'" placeholder="es: 12.01.1997"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaMaisonInfo('+id+')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  _initNascitaInput('edit-mb-nascita');
  if(b.data_nascita){const el=document.getElementById('edit-mb-nascita');if(el)el.dataset.isoValue=b.data_nascita}}
async function salvaModificaMaisonInfo(id){
  const cat=document.getElementById('edit-mb-cat').value||'';
  const chf=parseFloat(document.getElementById('edit-mb-chf').value)||null;
  const bu=parseInt(document.getElementById('edit-mb-bu').value)||null;
  const bl=parseInt(document.getElementById('edit-mb-bl').value)||null;
  const nascita=_getNascitaValue('edit-mb-nascita')||null;
  try{await secPatch('maison_budget','id=eq.'+id,{categoria:cat,budget_chf:chf,budget_bu:bu,budget_bl:bl,data_nascita:nascita,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
    const b=maisonBudgetCache.find(x=>x.id===id);if(b){b.categoria=cat;b.budget_chf=chf;b.budget_bu=bu;b.budget_bl=bl;b.data_nascita=nascita}
    document.getElementById('pwd-modal').classList.add('hidden');renderMaisonBudgetUI();renderMaisonDashboard();logAzione('Modifica info maison','ID '+id);toast('Info aggiornate')}catch(e){toast('Errore aggiornamento info')}}
function apriListaClientiMaison(){
  const _br=getBudgetReparto();
  const fullM=_br.filter(b=>b.categoria==='full_maison').sort((a,b)=>a.nome.localeCompare(b.nome));
  const maison=_br.filter(b=>b.categoria==='maison').sort((a,b)=>a.nome.localeCompare(b.nome));
  const direz=_br.filter(b=>b.categoria==='direzione').sort((a,b)=>a.nome.localeCompare(b.nome));
  const buCat=_br.filter(b=>b.categoria==='bu').sort((a,b)=>a.nome.localeCompare(b.nome));
  const blCat=_br.filter(b=>b.categoria==='bl').sort((a,b)=>a.nome.localeCompare(b.nome));
  const tot=fullM.length+maison.length+direz.length+buCat.length+blCat.length;
  let html='<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:4px">Clienti Categorizzati</h3><p style="color:var(--muted);font-size:.82rem">'+tot+' clienti — '+fullM.length+' Full Maison — '+maison.length+' Maison — '+direz.length+' Direzione — '+buCat.length+' BU — '+blCat.length+' BL</p></div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  html+='<div style="display:flex;gap:10px;margin-bottom:16px"><button class="btn-export" onclick="esportaListaMaisonCSV()" style="font-size:.78rem;padding:5px 14px">CSV</button><button class="btn-export btn-export-pdf" onclick="esportaListaMaisonPDF()" style="font-size:.78rem;padding:5px 14px">PDF</button></div>';
  function renderCatBlock(items,label,color){if(!items.length)return'';
    let h='<div style="margin-bottom:16px"><div style="font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:'+color+';font-weight:700;margin-bottom:8px;border-bottom:2px solid '+color+';padding-bottom:4px">'+label+' ('+items.length+')</div>';
    items.forEach(function(b){var nascita=b.data_nascita?'  —  &#127874; '+new Date(b.data_nascita+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}):'';
      h+='<div style="padding:8px 12px;margin-bottom:4px;border-radius:3px;border-left:3px solid '+color+';background:'+color+'0F;display:flex;align-items:center;gap:10px"><strong>'+escP(b.nome)+'</strong>'+nascita+'</div>'});return h+'</div>'}
  html+=renderCatBlock(fullM,'Full Maison','#b8860b');
  html+=renderCatBlock(maison,'Maison','#2980b9');
  html+=renderCatBlock(direz,'Direzione','#8e44ad');
  html+=renderCatBlock(buCat,'Buono Unico','#e67e22');
  html+=renderCatBlock(blCat,'Buono Lounge','#2c6e49');
  if(!tot)html+='<p style="color:var(--muted);text-align:center;padding:20px">Nessun cliente categorizzato. Assegna le categorie dalla scheda clienti.</p>';
  document.getElementById('profilo-content').innerHTML=html;document.getElementById('profilo-modal').classList.remove('hidden')}
function esportaListaMaisonCSV(){const _br=getBudgetReparto();if(!_br.length){toast('Nessun cliente');return}
  const rows=[['Cliente','Categoria','Budget CHF','Max BU','Max BL','Data nascita']];
  _br.forEach(b=>{rows.push([b.nome,b.categoria==='full_maison'?'Full Maison':b.categoria==='maison'?'Maison':'',b.budget_chf||'',b.budget_bu||'',b.budget_bl||'',b.data_nascita?new Date(b.data_nascita+'T12:00:00').toLocaleDateString('it-IT'):''])});
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'clienti_maison.csv'}).click();toast('Lista CSV esportata!')}
async function esportaListaMaisonPDF(){const _br=getBudgetReparto();if(!_br.length){toast('Nessun cliente');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore caricamento libreria PDF');return}}
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('portrait','mm','a4');const pw=doc.internal.pageSize.getWidth();let y=14;
    if(_logoB64)try{doc.addImage(_logoB64,'PNG',pw/2-20,y,40,22.5)}catch(e){}
    y+=28;doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Clienti Maison',pw/2,y,{align:'center'});y+=7;
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);doc.text('Casino Lugano SA — '+_br.length+' clienti',pw/2,y,{align:'center'});y+=10;doc.setTextColor(0);
    const catOrder=['full_maison','maison','direzione','bu','bl'];
    const sorted=_br.filter(b=>b.categoria).sort((a,b)=>catOrder.indexOf(a.categoria)-catOrder.indexOf(b.categoria)||a.nome.localeCompare(b.nome));
    const body=sorted.map(b=>[b.nome,b.categoria==='full_maison'?'Full Maison':b.categoria==='maison'?'Maison':b.categoria==='direzione'?'Direzione':b.categoria==='bu'?'Buono Unico':b.categoria==='bl'?'Buono Lounge':'—',b.budget_chf?parseFloat(b.budget_chf).toFixed(0):'—',b.data_nascita?new Date(b.data_nascita+'T12:00:00').toLocaleDateString('it-IT'):'']);
    doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Cliente','Categoria','Budget CHF','Nascita']],body,
      headStyles:{fillColor:[26,18,8]},styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:10,cellPadding:4},
      didParseCell:function(d){if(d.section==='body'&&d.column.index===1){if(d.cell.raw==='Full Maison'){d.cell.styles.textColor=[184,134,11];d.cell.styles.fontStyle='bold'}else if(d.cell.raw==='Maison'){d.cell.styles.textColor=[41,128,185];d.cell.styles.fontStyle='bold'}else if(d.cell.raw==='Direzione'){d.cell.styles.textColor=[142,68,173];d.cell.styles.fontStyle='bold'}else if(d.cell.raw==='Buono Unico'){d.cell.styles.textColor=[230,126,34];d.cell.styles.fontStyle='bold'}else if(d.cell.raw==='Buono Lounge'){d.cell.styles.textColor=[44,110,73];d.cell.styles.fontStyle='bold'}}},
      alternateRowStyles:{fillColor:[250,247,242]}});
    const tp=doc.internal.getNumberOfPages();for(let i=1;i<=tp;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA — Clienti Maison — Pag. '+i+'/'+tp,16,doc.internal.pageSize.getHeight()-8)}
    mostraPdfPreview(doc,'clienti_maison.pdf','Lista Clienti Maison')}catch(e){toast('Errore PDF')}}
// IMPORTA CATEGORIE DA FILE EXCEL (Maison slots)
async function importaCategorieMaison(input){const file=input.files[0];if(!file)return;input.value='';
  const XLSX=window.XLSX;if(!XLSX){toast('Libreria XLSX non caricata');return}
  try{const buf=await file.arrayBuffer();const wb=XLSX.read(buf);
  const catMap={};// {nome: categoria}
  // Cerca in tutti i fogli
  for(const sn of wb.SheetNames){
    const data=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
    if(!data.length)continue;
    // Trova riga intestazione con le categorie
    let catCols={};// {colIdx: categoria}
    for(let i=0;i<Math.min(data.length,5);i++){
      const row=data[i];
      for(let j=0;j<row.length;j++){
        const v=String(row[j]).trim().toUpperCase();
        if(v.includes('FULL MAISON'))catCols[j]='full_maison';
        else if(v==='MAISON'||v.includes('MAISON')&&!v.includes('FULL')&&!v.includes('BUON'))catCols[j]='maison';
        else if(v.includes('BUONI LOUNGE')||v.includes('BUONO LOUNGE')||v==='BL')catCols[j]='bl';
        else if(v.includes('BUONO UNICO')||v.includes('BUONI UNICI')||v==='BU')catCols[j]='bu';
        else if(v.includes('DIREZIONE'))catCols[j]='direzione';
      }
    }
    if(!Object.keys(catCols).length)continue;
    // Parole da escludere (non sono nomi cliente)
    const _escludiNomi=/^(consumazion|mangia|slot[is]?|buoni|full|maison|direzione|buono|lounge|unic[oi]|unici|tavol[oi]|bar|ristorante|totale|note|data|nome|cognome|px|costo|gruppo)$/i;
    // Per ogni colonna con nomi, traccia la categoria corrente (può cambiare con sub-header)
    const catGroups={};
    // Identifica le colonne nomi (colonna adiacente a quella con intestazione categoria)
    const colToCat={};// {colIdx: catIniziale}
    for(const[ci,cat]of Object.entries(catCols)){
      const colIdx=parseInt(ci);
      // La colonna nomi è tipicamente quella dopo l'intestazione, o la stessa
      if(!catCols[colIdx+1])colToCat[colIdx+1]=cat;
      colToCat[colIdx]=cat;
    }
    // Leggi riga per riga, aggiorna la categoria se trovi un sub-header
    const activeCat={};// {colIdx: categoriaCorrente}
    for(const[ci,cat]of Object.entries(colToCat))activeCat[ci]=cat;
    for(let i=1;i<data.length;i++){
      for(const ci of Object.keys(colToCat)){
        const cc=parseInt(ci);
        const v=String(data[i][cc]||'').trim();
        if(!v)continue;
        const vUp=v.toUpperCase().replace(/\*+/g,'').trim();
        // Sub-header? Cambia la categoria per questa colonna
        if(vUp.includes('BUONO UNICO')||vUp.includes('BUONI UNICI')||vUp==='BU'){activeCat[cc]='bu';continue}
        if(vUp.includes('BUONI LOUNGE')||vUp.includes('BUONO LOUNGE')){activeCat[cc]='bl';continue}
        if(vUp.includes('FULL MAISON')){activeCat[cc]='full_maison';continue}
        if(vUp==='MAISON'){activeCat[cc]='maison';continue}
        if(vUp==='DIREZIONE'){activeCat[cc]='direzione';continue}
        // CONSUMAZIONI/MANGIA AL BAR = non è una categoria, disattiva
        if(vUp.includes('CONSUMAZION')||vUp.includes('MANGIA AL BAR')){activeCat[cc]=null;continue}
        // Salta marcatori tipo BL/BU isolati e parole non-nome
        if(/^(BL|BU|CG|WL)$/i.test(vUp))continue;
        if(_escludiNomi.test(vUp))continue;
        // Pulisci e aggiungi
        let nome=v.replace(/\*+/g,'').replace(/\(.*?\)/g,'').trim();
        if(!nome||nome.length<2)continue;
        const cat=activeCat[cc];
        if(!cat)continue;
        if(!catGroups[cat])catGroups[cat]=new Set();
        if(nome.includes('/')){
          nome.split('/').forEach(n=>{n=n.trim();if(n&&n.length>=3&&!_escludiNomi.test(n))catGroups[cat].add(capitalizzaNome(n))});
        }else if(nome.length>=3){catGroups[cat].add(capitalizzaNome(nome))}
      }
    }
    for(const[cat,nomi]of Object.entries(catGroups)){
      for(const nome of nomi){if(nome.length>=3)catMap[nome]=cat}
    }
  }
  const nomi=Object.keys(catMap);
  if(!nomi.length){toast('Nessun cliente trovato nel file');return}
  // Mostra anteprima professionale
  const mc=document.getElementById('pwd-modal-content');
  const byCat={};nomi.forEach(n=>{const c=catMap[n];if(!byCat[c])byCat[c]=[];byCat[c].push(n.trim())});
  const catLabels={full_maison:'Full Maison',maison:'Maison',bl:'Buono Lounge',bu:'Buono Unico',direzione:'Direzione'};
  const catColors={full_maison:'#b8860b',maison:'#2980b9',bl:'#2c6e49',bu:'#e67e22',direzione:'#8e44ad'};
  const esist=nomi.filter(n=>maisonBudgetCache.find(b=>b.nome.toLowerCase()===n.toLowerCase()&&(b.reparto_dip||'slots')===currentReparto));
  const nNuovi=nomi.length-esist.length;
  let prev='<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Categorie Clienti</h3><p style="color:var(--muted);font-size:.84rem">File: '+escP(file.name)+'</p></div>';
  // KPI cards
  prev+='<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">'+nomi.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Totale</div></div>';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2c6e49">'+nNuovi+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Nuovi</div></div>';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--accent2)">'+esist.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Aggiornati</div></div>';
  prev+='</div>';
  // Categorie con lista espandibile
  prev+='<div style="max-height:350px;overflow-y:auto">';
  for(const[cat,lista]of Object.entries(byCat)){
    lista.sort();
    prev+='<div style="margin-bottom:12px;border-left:3px solid '+catColors[cat]+';padding-left:12px">';
    prev+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="mini-badge" style="background:'+catColors[cat]+';font-size:.82rem;padding:3px 10px">'+catLabels[cat]+'</span><span style="font-size:.82rem;color:var(--muted)">'+lista.length+' clienti</span></div>';
    prev+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
    lista.forEach(n=>{
      const isExist=esist.includes(n);
      prev+='<span style="font-size:.78rem;padding:2px 8px;border-radius:2px;background:'+(isExist?catColors[cat]+'15':'var(--paper2)')+';color:'+(isExist?catColors[cat]:'var(--ink)')+';border:1px solid '+(isExist?catColors[cat]+'40':'var(--line)')+'">'+escP(n)+(isExist?' &#8635;':'')+'</span>';
    });
    prev+='</div></div>';
  }
  prev+='</div>';
  // Barra progresso (nascosta)
  prev+='<div id="import-cat-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-cat-bar" style="height:100%;width:0%;background:#b8860b;border-radius:3px;transition:width .2s"></div></div><p id="import-cat-status" style="text-align:center;font-size:.82rem;color:var(--muted);margin-top:4px"></p></div>';
  prev+='<div id="import-cat-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-cat">Importa '+nomi.length+' clienti</button></div>';
  mc.innerHTML=prev;document.getElementById('pwd-modal').classList.remove('hidden');
  document.getElementById('btn-conf-import-cat').onclick=async function(){
    document.getElementById('import-cat-btns').style.display='none';
    document.getElementById('import-cat-progress').style.display='block';
    const bar=document.getElementById('import-cat-bar');const status=document.getElementById('import-cat-status');
    // Refresh cache dal server per evitare duplicati
    status.textContent='Caricamento dati...';
    try{maisonBudgetCache=await secGet('maison_budget?order=nome.asc')}catch(e){}
    let nuovi=0,aggiornati=0,errori=0,done=0;
    for(const nome of nomi){
      const cat=catMap[nome];
      const existing=maisonBudgetCache.find(b=>b.nome.toLowerCase()===nome.toLowerCase()&&(b.reparto_dip||'slots')===currentReparto);
      if(existing){
        if(existing.categoria!==cat){
          try{await secPatch('maison_budget','id=eq.'+existing.id,{categoria:cat,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
          existing.categoria=cat;aggiornati++}catch(e){errori++}
        }
      }else{
        try{const postData={nome:nome,categoria:cat,reparto_dip:currentReparto};
        try{postData.aggiornato_da=getOperatore();postData.aggiornato_at=new Date().toISOString()}catch(e2){}
        const r=await secPost('maison_budget',postData);
        if(r&&r.length&&r[0]&&r[0].id){maisonBudgetCache.push(r[0]);nuovi++}
        else{// secPost ritornò dati vuoti, riprova senza campi extra
          const r2=await secPost('maison_budget',{nome:nome,categoria:cat,reparto_dip:currentReparto});
          if(r2&&r2.length&&r2[0]&&r2[0].id){maisonBudgetCache.push(r2[0]);nuovi++}else{errori++}}
        }catch(e){console.error('Import cat errore:',nome,e.message);errori++}
      }
      done++;bar.style.width=Math.round(done/nomi.length*100)+'%';status.textContent=done+'/'+nomi.length+' — '+escP(nome);
      if(done%5===0)await new Promise(r=>setTimeout(r,50));
    }
    // Riepilogo finale
    mc.innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">'+(errori?'&#9888;':'&#9989;')+'</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Importazione completata</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">'+nuovi+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Nuovi</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent2)">'+aggiornati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Aggiornati</div></div>'+(errori?'<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent)">'+errori+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Errori</div></div>':'')+'</div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
    renderMaisonBudgetUI();renderMaisonDashboard();
    logAzione('Importa categorie',nomi.length+' clienti ('+nuovi+' nuovi, '+aggiornati+' aggiornati)');};
  }catch(e){toast('Errore lettura file: '+e.message)}}
// IMPORTA COMPLEANNI DA FILE EXCEL
async function importaCompleanniMaison(input){const file=input.files[0];if(!file)return;input.value='';
  const XLSX=window.XLSX;if(!XLSX){toast('Libreria XLSX non caricata');return}
  try{const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{cellDates:true});
  const compleanni=[];// [{nome, data}]
  const mesiIt=['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
  for(const sn of wb.SheetNames){
    const data=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:false});
    if(!data.length)continue;
    // Formato: coppie colonne (nome, data) per ogni mese
    for(let i=0;i<data.length;i++){
      const row=data[i];
      for(let j=0;j<row.length;j+=2){
        const nomeRaw=String(row[j]||'').trim();
        const cellVal=row[j+1];
        // Salta intestazioni mese
        if(!nomeRaw||mesiIt.includes(nomeRaw.toUpperCase())||nomeRaw.toUpperCase()==='COMPLEANNI')continue;
        if(cellVal===undefined||cellVal===null||cellVal==='')continue;
        // Parsa la data in vari formati
        let isoDate=null;
        // Se è un oggetto Date (cellDates:true) — usa getFullYear/Month/Date locali per evitare shift UTC
        if(cellVal instanceof Date&&!isNaN(cellVal)){isoDate=cellVal.getFullYear()+'-'+String(cellVal.getMonth()+1).padStart(2,'0')+'-'+String(cellVal.getDate()).padStart(2,'0')}
        // Se è un numero seriale Excel
        if(!isoDate&&typeof cellVal==='number'&&cellVal>1000&&cellVal<100000){const d=new Date((cellVal-25569)*86400000+43200000);if(!isNaN(d))isoDate=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
        // Se è stringa
        if(!isoDate&&typeof cellVal==='string'){
          const dataRaw=cellVal.trim();
          // YYYY-MM-DD HH:MM:SS o YYYY-MM-DD
          const dm=dataRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
          if(dm)isoDate=dm[1]+'-'+dm[2]+'-'+dm[3];
          // DD.MM.YYYY o DD/MM/YYYY
          if(!isoDate){const dm2=dataRaw.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);if(dm2)isoDate=dm2[3]+'-'+dm2[2].padStart(2,'0')+'-'+dm2[1].padStart(2,'0')}
          // MM-DD-YY o MM/DD/YY (formato mm-dd-yy di Excel)
          if(!isoDate){const dm3=dataRaw.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);if(dm3){let y=parseInt(dm3[3]);if(y<100)y+=y>50?1900:2000;isoDate=y+'-'+dm3[1].padStart(2,'0')+'-'+dm3[2].padStart(2,'0')}}
        }
        if(!isoDate)continue;
        // Pulisci nome
        let nome=capitalizzaNome(nomeRaw.replace(/\*+/g,'').trim());
        if(nome.length<2)continue;
        compleanni.push({nome,data:isoDate});
      }
    }
  }
  if(!compleanni.length){toast('Nessun compleanno trovato nel file');return}
  // Fuzzy match con nomi esistenti in maison_budget
  const matched=[];const nonTrovati=[];
  compleanni.forEach(c=>{
    // Match esatto
    let found=maisonBudgetCache.find(b=>b.nome.toLowerCase()===c.nome.toLowerCase()&&(b.reparto_dip||'slots')===currentReparto);
    if(!found){
      // Fuzzy match con Levenshtein
      const sim=_trovaNomeSimileMaison(c.nome);
      if(sim)found=maisonBudgetCache.find(b=>b.nome.toLowerCase()===(sim.nome||sim).toLowerCase()&&(b.reparto_dip||'slots')===currentReparto);
    }
    if(found)matched.push({...c,budgetId:found.id,nomeDB:found.nome,isNew:false});
    else matched.push({...c,budgetId:null,nomeDB:null,isNew:true});
  });
  const nuovi=matched.filter(m=>m.isNew);
  const esistenti=matched.filter(m=>!m.isNew);
  // Mostra anteprima professionale
  const mc=document.getElementById('pwd-modal-content');
  const mesiNomi=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  let prev='<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Compleanni</h3><p style="color:var(--muted);font-size:.84rem">File: '+escP(file.name)+'</p></div>';
  // KPI cards
  prev+='<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">'+compleanni.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Compleanni</div></div>';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2c6e49">'+esistenti.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Clienti esistenti</div></div>';
  prev+='<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2980b9">'+nuovi.length+'</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Familiari / Nuovi</div></div>';
  prev+='</div>';
  // Raggruppa per mese
  const byMese={};matched.forEach(m=>{const d=new Date(m.data+'T12:00:00');const k=d.getMonth();if(!byMese[k])byMese[k]=[];byMese[k].push(m)});
  prev+='<div style="max-height:350px;overflow-y:auto">';
  for(let mi=0;mi<12;mi++){
    if(!byMese[mi]||!byMese[mi].length)continue;
    const lista=byMese[mi].sort((a,b)=>{const da=new Date(a.data+'T12:00:00').getDate();const db=new Date(b.data+'T12:00:00').getDate();return da-db});
    prev+='<div style="margin-bottom:12px"><div style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:#b8860b;font-weight:700;margin-bottom:6px;border-bottom:1px solid var(--line);padding-bottom:4px">'+mesiNomi[mi]+' ('+lista.length+')</div>';
    prev+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
    lista.forEach(m=>{
      const d=new Date(m.data+'T12:00:00');const giorno=d.getDate();
      const bg=m.isNew?'rgba(41,128,185,0.1)':'rgba(44,110,73,0.1)';
      const border=m.isNew?'#2980b9':'#2c6e49';
      const isRename=!m.isNew&&m.nomeDB&&m.nome.length>m.nomeDB.length&&m.nome.toLowerCase().startsWith(m.nomeDB.split(/\s+/)[0].toLowerCase());
      const fuzzyNote=!m.isNew&&m.nome!==m.nomeDB?' title="DB: '+escP(m.nomeDB)+(isRename?' → '+escP(m.nome):'')+'" style="cursor:help"':'';
      prev+='<span style="font-size:.78rem;padding:3px 8px;border-radius:2px;background:'+bg+';border:1px solid '+border+'30;display:inline-flex;align-items:center;gap:4px"'+fuzzyNote+'><strong style="color:'+border+'">'+giorno+'</strong> '+escP(m.nome)+(m.isNew?' <span style="font-size:.65rem;color:#2980b9;font-weight:700">NEW</span>':'')+(isRename?' <span style="font-size:.65rem;color:#e67e22;font-weight:700">&#8593;</span>':'')+'</span>';
    });
    prev+='</div></div>';
  }
  prev+='</div>';
  // Barra progresso
  prev+='<div id="import-compl-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-compl-bar" style="height:100%;width:0%;background:#8e44ad;border-radius:3px;transition:width .2s"></div></div><p id="import-compl-status" style="text-align:center;font-size:.82rem;color:var(--muted);margin-top:4px"></p></div>';
  prev+='<div id="import-compl-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-compl">Importa '+compleanni.length+' compleanni</button></div>';
  mc.innerHTML=prev;document.getElementById('pwd-modal').classList.remove('hidden');
  document.getElementById('btn-conf-import-compl').onclick=async function(){
    document.getElementById('import-compl-btns').style.display='none';
    document.getElementById('import-compl-progress').style.display='block';
    const bar=document.getElementById('import-compl-bar');const status=document.getElementById('import-compl-status');
    let nAggiornati=0,nNuovi=0,nErrori=0,done=0;
    for(const m of matched){
      if(m.budgetId){
        try{const updateData={data_nascita:m.data,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()};
        // Arricchisci nome: se il file ha cognome+nome e il DB ha solo cognome, aggiorna
        const b=maisonBudgetCache.find(x=>x.id===m.budgetId);
        if(b&&m.nome.length>b.nome.length&&m.nome.toLowerCase().startsWith(b.nome.split(/\s+/)[0].toLowerCase()))updateData.nome=m.nome;
        await secPatch('maison_budget','id=eq.'+m.budgetId,updateData);
        if(b){b.data_nascita=m.data;if(updateData.nome)b.nome=updateData.nome}nAggiornati++}catch(e){nErrori++}
      }else{
        try{const r=await secPost('maison_budget',{nome:m.nome,data_nascita:m.data,reparto_dip:currentReparto,aggiornato_da:getOperatore(),aggiornato_at:new Date().toISOString()});
        if(r&&r.length&&r[0]&&r[0].id)maisonBudgetCache.push(r[0]);nNuovi++}catch(e){nErrori++}
      }
      done++;bar.style.width=Math.round(done/matched.length*100)+'%';status.textContent=done+'/'+matched.length+' — '+escP(m.nome);
      if(done%5===0)await new Promise(r=>setTimeout(r,50));
    }
    // Riepilogo finale
    mc.innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">'+(nErrori?'&#9888;':'&#127874;')+'</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Compleanni importati</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">'+nAggiornati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Aggiornati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2980b9">'+nNuovi+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Nuovi / Familiari</div></div>'+(nErrori?'<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent)">'+nErrori+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Errori</div></div>':'')+'</div><p style="font-size:.84rem;color:var(--muted)">I compleanni appariranno nella dashboard e nelle notifiche.</p><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')" style="margin-top:12px">Chiudi</button></div>';
    renderMaisonBudgetUI();renderMaisonDashboard();
    logAzione('Importa compleanni',compleanni.length+' ('+nAggiornati+' aggiornati, '+nNuovi+' nuovi)');};
  }catch(e){toast('Errore lettura file: '+e.message)}}
// RIALLINEA NOMI: corregge nomi vecchi in costi_maison e spese_extra usando maison_budget come riferimento
// Correggi solo il cognome, non aggiungere nome di battesimo
function _soloCorrezioneCognome(nomeVecchio,matchBudget){
  const tokensVecchio=nomeVecchio.trim().split(/\s+/);
  const tokensBudget=matchBudget.trim().split(/\s+/);
  // Se il vecchio è solo cognome e il budget ha cognome+nome, usa il cognome corretto (non aggiungere nome)
  // MA se il cognome è identico, ritorna il cognome (nessuna correzione ortografica necessaria)
  if(tokensVecchio.length===1){
    const cogCorretto=capitalizzaNome(tokensBudget[0]);
    if(cogCorretto.toLowerCase()===nomeVecchio.toLowerCase())return nomeVecchio;// stesso cognome, nessun fix ortografico
    return cogCorretto}
  return tokensVecchio.map(tv=>{
    const best=tokensBudget.find(tb=>tb.toLowerCase()===tv.toLowerCase())||
      tokensBudget.find(tb=>_levenshtein(tv.toLowerCase(),tb.toLowerCase())<=1)||
      tokensBudget.find(tb=>tb.toLowerCase().replace(/\s/g,'')===tv.toLowerCase().replace(/\s/g,''));
    return best?capitalizzaNome(best):capitalizzaNome(tv);
  }).join(' ')}
// === COMPLETA NOME DA BUDGET (per nomi multipli con /) ===
// Usata quando l'utente scrive "Bonomelli/Grignani" → cerca i nomi completi "Bonomelli Pierluigi" e "Grignani [nome]"
// Ritorna: { nome: 'Cognome Nome' (esatto match unico), candidates: [...], needDisambiguation: boolean }
function _completaNomeDaBudget(input){
  const inp=(input||'').trim();
  if(!inp)return{nome:'',candidates:[],needDisambiguation:false};
  // Se l'input ha gia' piu' parole (cognome + nome), non serve completarlo
  if(inp.split(/\s+/).length>=2){
    return{nome:capitalizzaNome(inp),candidates:[],needDisambiguation:false};
  }
  // Cerca tutti i clienti che iniziano col cognome scritto (sia in costi_maison sia in budget categorizzato)
  const inpLower=inp.toLowerCase();
  const tuttiNomi=[...new Set([
    ...getMaisonReparto().map(r=>r.nome),
    ...getBudgetReparto().map(b=>b.nome)
  ])].filter(n=>n&&!n.includes('/'));// escludi gia' gruppi
  // Match esatto cognome (primo token uguale)
  const matches=tuttiNomi.filter(n=>{
    const tokens=n.toLowerCase().split(/\s+/);
    return tokens[0]===inpLower;
  });
  if(matches.length===1)return{nome:matches[0],candidates:[],needDisambiguation:false};
  if(matches.length>1)return{nome:'',candidates:matches,needDisambiguation:true};
  // Nessun match esatto: prova match senza spazi (es. "delledonne" → "Delle Donne Mario")
  const matchesNoSpace=tuttiNomi.filter(n=>n.toLowerCase().replace(/\s/g,'').startsWith(inpLower));
  if(matchesNoSpace.length===1)return{nome:matchesNoSpace[0],candidates:[],needDisambiguation:false};
  if(matchesNoSpace.length>1)return{nome:'',candidates:matchesNoSpace,needDisambiguation:true};
  // Nessun match: ritorna l'input cosi' com'e' (sara' creato come nuovo cliente)
  return{nome:capitalizzaNome(inp),candidates:[],needDisambiguation:false};
}
// Helper: controlla se un operatore e' incluso in un campo destinatario CSV (es. "Mario,Anna,Luca" o "tutti")
function _includeOpInCsv(field,op){
  if(!field)return false;
  if(field==='tutti')return true;
  if(field===op)return true;
  return field.split(',').map(s=>s.trim()).includes(op);
}
// === MULTI-SELECT OPERATORI (per consegne, promemoria, ecc.) ===
// Apre un modal con checkbox per selezionare uno o piu' operatori del reparto corrente,
// + opzioni "Tutti" / "Tutti Slots" / "Tutti Tavoli". Salva il risultato come CSV nel hidden input.
// hiddenInputId = id del input nascosto che memorizza il valore (es. "cons-destinatario")
// btnId = id del bottone che mostra la label (es. "cons-destinatario-btn")
// title = titolo del modal
function apriMultiSelectOperatori(hiddenInputId,btnId,title){
  const op=getOperatore();
  const ops=operatoriAuthCache.map(o=>o.nome).filter(n=>{const rep=operatoriRepartoMap[n]||'entrambi';return rep===currentReparto||rep==='entrambi'}).sort();
  const cur=(document.getElementById(hiddenInputId)||{}).value||'tutti';
  // Parse current selection (CSV o single value)
  const selected=new Set();
  if(cur==='tutti')selected.add('__tutti');
  else cur.split(',').map(s=>s.trim()).filter(s=>s).forEach(s=>selected.add(s));
  const mc=document.getElementById('pwd-modal-content');
  let html='<h3>'+escP(title||'Seleziona operatori')+'</h3>';
  html+='<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Seleziona uno o piu\' destinatari, oppure "Tutti" per inviare a tutto il reparto.</p>';
  // Opzione "Tutti"
  html+='<div style="padding:10px 12px;background:var(--paper2);border-radius:3px;margin-bottom:10px"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600"><input type="checkbox" id="msop-tutti"'+(selected.has('__tutti')?' checked':'')+' onclick="_msopToggleTutti()" style="width:18px;height:18px"><span>Tutti gli operatori del reparto ('+ops.length+')</span></label></div>';
  // Lista operatori individuali
  html+='<div style="max-height:280px;overflow-y:auto;border:1px solid var(--line);border-radius:3px;padding:8px">';
  ops.forEach(n=>{
    const rep=operatoriRepartoMap[n]||'entrambi';
    const badge=rep==='slots'?' <span style="font-size:.65rem;color:#1a4a7a;font-weight:700">S</span>':rep==='tavoli'?' <span style="font-size:.65rem;color:#8e44ad;font-weight:700">T</span>':'';
    const isMe=n===op?' (Tu)':'';
    html+='<div style="padding:5px 0"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.92rem"><input type="checkbox" class="msop-cb" value="'+escP(n).replace(/"/g,'&quot;')+'"'+(selected.has(n)?' checked':'')+' onclick="_msopToggleSingolo()" style="width:16px;height:16px"><span>'+escP(n)+badge+isMe+'</span></label></div>';
  });
  html+='</div>';
  html+='<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_msopConferma(\''+hiddenInputId+'\',\''+btnId+'\')">Conferma</button></div>';
  mc.innerHTML=html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
// Toggle "Tutti": deseleziona tutti gli individuali
function _msopToggleTutti(){
  const tutti=document.getElementById('msop-tutti');
  if(tutti&&tutti.checked){
    document.querySelectorAll('.msop-cb').forEach(cb=>cb.checked=false);
  }
}
// Toggle individuale: deseleziona "Tutti"
function _msopToggleSingolo(){
  const tutti=document.getElementById('msop-tutti');
  if(tutti)tutti.checked=false;
}
// Conferma selezione: salva nel hidden input + aggiorna label del bottone
function _msopConferma(hiddenInputId,btnId){
  const tutti=document.getElementById('msop-tutti');
  const selected=[...document.querySelectorAll('.msop-cb:checked')].map(cb=>cb.value);
  let valore,label;
  if(tutti&&tutti.checked){valore='tutti';label='Tutti gli operatori'}
  else if(selected.length===0){toast('Seleziona almeno un destinatario');return}
  else if(selected.length===1){valore=selected[0];label=selected[0]}
  else{valore=selected.join(',');label=selected.length+' operatori ('+selected.slice(0,2).join(', ')+(selected.length>2?'...':'')+')'}
  document.getElementById(hiddenInputId).value=valore;
  const btn=document.getElementById(btnId);if(btn)btn.textContent=label;
  document.getElementById('pwd-modal').classList.add('hidden');
}
// Modal di disambiguazione: mostra una scelta tra piu' candidati e ritorna una Promise
function _scegliCandidatoNome(input,candidates){
  return new Promise(resolve=>{
    const mc=document.getElementById('pwd-modal-content');
    let html='<h3>Quale "'+escP(input)+'"?</h3>';
    html+='<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Esistono piu\' clienti con questo cognome. Seleziona quello giusto:</p>';
    html+='<div style="max-height:280px;overflow-y:auto">';
    candidates.forEach((c,i)=>{
      html+='<div style="padding:8px 0;display:flex;align-items:center;gap:10px"><input type="radio" name="dis-nome-radio" value="'+i+'" id="dis-nome-'+i+'"'+(i===0?' checked':'')+' style="width:18px;height:18px"><label for="dis-nome-'+i+'" style="cursor:pointer;font-size:.95rem">'+escP(c)+'</label></div>';
    });
    html+='<div style="padding:8px 0;display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);margin-top:6px"><input type="radio" name="dis-nome-radio" value="-1" id="dis-nome-new" style="width:18px;height:18px"><label for="dis-nome-new" style="cursor:pointer;font-size:.92rem;color:var(--muted)">Crea come nuovo cliente "'+escP(input)+'"</label></div>';
    html+='</div>';
    html+='<div class="pwd-modal-btns"><button class="btn-modal-cancel" id="dis-cancel">Annulla</button><button class="btn-modal-ok" id="dis-ok">Conferma</button></div>';
    mc.innerHTML=html;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('dis-cancel').onclick=()=>{document.getElementById('pwd-modal').classList.add('hidden');resolve(null)};
    document.getElementById('dis-ok').onclick=()=>{
      const sel=document.querySelector('input[name="dis-nome-radio"]:checked');
      const idx=sel?parseInt(sel.value):0;
      document.getElementById('pwd-modal').classList.add('hidden');
      resolve(idx===-1?capitalizzaNome(input):candidates[idx]);
    };
  });
}
async function riallineaNomiMaison(){
  const budget=getBudgetReparto();
  if(!budget.length){toast('Nessun cliente categorizzato. Importa prima le categorie.');return}
  // Trova nomi in costi_maison che non matchano esattamente nessun budget
  const costiNomi=[...new Set(getMaisonReparto().map(r=>r.nome))];
  const extraNomi=[...new Set(getSpeseReparto().map(r=>r.beneficiario))];
  const budgetNomi=budget.map(b=>b.nome);
  const correzioni=[];// {vecchio, nuovo, costiCount, extraCount}
  // Controlla costi maison
  costiNomi.forEach(nome=>{
    if(budgetNomi.find(b=>b.toLowerCase()===nome.toLowerCase()))return;// match esatto, ok
    // Cerca match fuzzy
    const nl=nome.toLowerCase();const nlNoSp=nl.replace(/\s/g,'');
    let matchBudget=null;
    // Cognome singolo → trova nome completo nel budget (Frigerio → Frigerio Luciano)
    if(nome.split(/\s+/).length<=1){const cogMatch=budgetNomi.filter(b=>b.toLowerCase().split(/\s+/)[0]===nl);
      if(cogMatch.length===1)matchBudget=cogMatch[0]}
    // Senza spazi (Dalozzo → Da Lozzo)
    matchBudget=budgetNomi.find(b=>b.toLowerCase().replace(/\s/g,'')===nlNoSp);
    // Levenshtein (Armelin → Armellin)
    if(!matchBudget&&nl.length>3)matchBudget=budgetNomi.find(b=>_levenshtein(nl,b.toLowerCase().split(/\s+/)[0])<=2&&nl.length<=b.split(/\s+/)[0].length+2);
    if(!matchBudget&&nl.length>3)matchBudget=budgetNomi.find(b=>_levenshtein(nl,b.toLowerCase())<=2);
    if(matchBudget&&matchBudget.toLowerCase()!==nome.toLowerCase()){
      const nuovoNome=_soloCorrezioneCognome(nome,matchBudget);
      if(nuovoNome.toLowerCase()===nome.toLowerCase())return;// nessuna correzione necessaria
      const existing=correzioni.find(c=>c.vecchio===nome&&c.nuovo===nuovoNome);
      if(!existing){
        const cc=getMaisonReparto().filter(r=>r.nome===nome).length;
        const ec=getSpeseReparto().filter(r=>r.beneficiario===nome).length;
        correzioni.push({vecchio:nome,nuovo:nuovoNome,costiCount:cc,extraCount:ec});
      }
    }
  });
  // Controlla spese extra
  extraNomi.forEach(nome=>{
    if(budgetNomi.find(b=>b.toLowerCase()===nome.toLowerCase()))return;
    if(correzioni.find(c=>c.vecchio===nome))return;// già trovato sopra
    const nl=nome.toLowerCase();const nlNoSp=nl.replace(/\s/g,'');
    let matchBudget=null;
    // Cognome singolo → trova nome completo nel budget
    if(nome.split(/\s+/).length<=1){const cogMatch=budgetNomi.filter(b=>b.toLowerCase().split(/\s+/)[0]===nl);
      if(cogMatch.length===1)matchBudget=cogMatch[0]}
    matchBudget=budgetNomi.find(b=>b.toLowerCase().replace(/\s/g,'')===nlNoSp);
    if(!matchBudget&&nl.length>3)matchBudget=budgetNomi.find(b=>_levenshtein(nl,b.toLowerCase().split(/\s+/)[0])<=2&&nl.length<=b.split(/\s+/)[0].length+2);
    if(!matchBudget&&nl.length>3)matchBudget=budgetNomi.find(b=>_levenshtein(nl,b.toLowerCase())<=2);
    if(matchBudget&&matchBudget.toLowerCase()!==nome.toLowerCase()){
      const nuovoNome=_soloCorrezioneCognome(nome,matchBudget);
      if(nuovoNome.toLowerCase()===nome.toLowerCase())return;
      const ec=getSpeseReparto().filter(r=>r.beneficiario===nome).length;
      correzioni.push({vecchio:nome,nuovo:nuovoNome,costiCount:0,extraCount:ec});
    }
  });
  if(!correzioni.length){toast('Tutti i nomi sono già allineati!');return}
  correzioni.sort((a,b)=>(b.costiCount+b.extraCount)-(a.costiCount+a.extraCount));
  // Stato globale per il riallineamento interattivo
  window._riallineaState={correzioni,confermati:0,saltati:0,errori:0,vociCorr:0};
  _renderRiallineaUI();}
function _renderRiallineaUI(){
  const st=window._riallineaState;const mc=document.getElementById('pwd-modal-content');
  const rimaste=st.correzioni.filter(c=>!c._done);
  if(!rimaste.length){
    // Riepilogo finale
    mc.innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">&#9989;</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Riallineamento completato</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">'+st.confermati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Confermati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--muted)">'+st.saltati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Saltati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--ink)">'+st.vociCorr+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Voci corrette</div></div></div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
    renderMaisonDashboard();renderSpeseExtra();
    logAzione('Riallinea nomi',st.confermati+' confermati, '+st.saltati+' saltati, '+st.vociCorr+' voci');
    return}
  const totOrig=st.correzioni.length;
  let html='<div style="text-align:center;margin-bottom:12px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Riallinea Nomi</h3><p style="color:var(--muted);font-size:.84rem">'+rimaste.length+' di '+totOrig+' rimaste</p></div>';
  // Contatori
  html+='<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:center">';
  html+='<span style="font-size:.82rem;color:#2c6e49;font-weight:600">'+st.confermati+' confermati</span>';
  html+='<span style="font-size:.82rem;color:var(--muted)">'+st.saltati+' saltati</span>';
  html+='</div>';
  // Lista con bottoni per ogni voce
  html+='<div id="riallinea-lista" style="max-height:400px;overflow-y:auto">';
  rimaste.forEach((c,i)=>{
    const idx=st.correzioni.indexOf(c);
    html+='<div id="riallinea-row-'+idx+'" style="padding:10px 12px;margin-bottom:6px;border-radius:3px;background:var(--paper2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;transition:all .3s">';
    html+='<span style="font-size:.85rem;color:var(--accent);text-decoration:line-through">'+escP(c.vecchio)+'</span>';
    html+='<span style="color:var(--muted)">&#8594;</span>';
    html+='<strong style="font-size:.85rem;color:#2c6e49">'+escP(c.nuovo)+'</strong>';
    html+='<span style="font-size:.75rem;color:var(--muted)">';
    if(c.costiCount)html+=c.costiCount+' costi';
    if(c.costiCount&&c.extraCount)html+=' + ';
    if(c.extraCount)html+=c.extraCount+' extra';
    html+='</span>';
    html+='<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">';
    html+='<button class="btn-salva" style="font-size:.75rem;padding:5px 12px;background:#2c6e49" onclick="confermaRiallinea('+idx+')">Conferma</button>';
    html+='<button class="btn-modal-cancel" style="font-size:.75rem;padding:5px 12px" onclick="saltaRiallinea('+idx+')">Salta</button>';
    html+='</div></div>';
  });
  html+='</div>';
  html+='<div class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  mc.innerHTML=html;document.getElementById('pwd-modal').classList.remove('hidden')}
async function confermaRiallinea(idx){
  const st=window._riallineaState;const c=st.correzioni[idx];
  const row=document.getElementById('riallinea-row-'+idx);
  if(row)row.style.opacity='0.5';
  // Aggiorna costi_maison
  const costiIds=maisonCache.filter(r=>r.nome===c.vecchio&&(r.reparto_dip||'slots')===currentReparto);
  for(const r of costiIds){
    try{await secPatch('costi_maison','id=eq.'+r.id,{nome:c.nuovo});r.nome=c.nuovo;st.vociCorr++}catch(e){st.errori++}
  }
  // Aggiorna spese_extra
  const extraIds=speseExtraCache.filter(r=>r.beneficiario===c.vecchio&&(r.reparto_dip||'slots')===currentReparto);
  for(const r of extraIds){
    try{await secPatch('spese_extra','id=eq.'+r.id,{beneficiario:c.nuovo});r.beneficiario=c.nuovo;st.vociCorr++}catch(e){st.errori++}
  }
  c._done=true;st.confermati++;
  if(row){row.style.background='rgba(44,110,73,0.1)';row.innerHTML='<span style="color:#2c6e49;font-size:.85rem">&#9989; '+escP(c.vecchio)+' → <strong>'+escP(c.nuovo)+'</strong></span>';
    setTimeout(()=>{row.style.maxHeight='0';row.style.padding='0';row.style.margin='0';row.style.overflow='hidden';setTimeout(()=>_checkRiallineaDone(),300)},800)}
  else _checkRiallineaDone()}
function saltaRiallinea(idx){
  const st=window._riallineaState;const c=st.correzioni[idx];
  c._done=true;st.saltati++;
  const row=document.getElementById('riallinea-row-'+idx);
  if(row){row.style.opacity='0.3';row.innerHTML='<span style="color:var(--muted);font-size:.85rem">&#10060; '+escP(c.vecchio)+' — saltato</span>';
    setTimeout(()=>{row.style.maxHeight='0';row.style.padding='0';row.style.margin='0';row.style.overflow='hidden';setTimeout(()=>_checkRiallineaDone(),300)},500)}
  else _checkRiallineaDone()}
function _checkRiallineaDone(){
  const st=window._riallineaState;
  const rimaste=st.correzioni.filter(c=>!c._done);
  // Aggiorna contatori
  const cntEl=document.querySelector('#riallinea-lista');
  if(cntEl&&cntEl.parentElement){const p=cntEl.parentElement.querySelector('p');if(p)p.textContent=rimaste.length+' di '+st.correzioni.length+' rimaste'}
  if(!rimaste.length)_renderRiallineaUI();}
async function unisciDuplicatiMaison(){
  const budget=getBudgetReparto();
  if(!budget.length){toast('Nessun cliente nel budget.');return}
  // Raggruppa per cognome (primo token)
  const byCognome={};
  budget.forEach(b=>{const cogn=b.nome.trim().split(/\s+/)[0].toLowerCase();if(!byCognome[cogn])byCognome[cogn]=[];byCognome[cogn].push(b)});
  const coppie=[];
  Object.keys(byCognome).forEach(cogn=>{
    const gruppo=byCognome[cogn];
    if(gruppo.length<2)return;
    // Trova coppie dove i nomi NON sono identici (case-insensitive)
    for(let i=0;i<gruppo.length;i++){
      for(let j=i+1;j<gruppo.length;j++){
        if(gruppo[i].nome.toLowerCase()===gruppo[j].nome.toLowerCase())continue;
        // Determina quale ha il nome piu lungo (nome+cognome)
        let longer=gruppo[i],shorter=gruppo[j];
        if(gruppo[j].nome.trim().split(/\s+/).length>gruppo[i].nome.trim().split(/\s+/).length||(gruppo[j].nome.trim().split(/\s+/).length===gruppo[i].nome.trim().split(/\s+/).length&&gruppo[j].nome.length>gruppo[i].nome.length)){
          longer=gruppo[j];shorter=gruppo[i]}
        // Merge: nome dal piu lungo, dati dal piu ricco
        const merged={
          nome:longer.nome,
          categoria:longer.categoria||shorter.categoria||null,
          data_nascita:longer.data_nascita||shorter.data_nascita||null,
          budget_chf:longer.budget_chf||shorter.budget_chf||null,
          budget_bu:longer.budget_bu||shorter.budget_bu||null,
          budget_bl:longer.budget_bl||shorter.budget_bl||null
        };
        // Se il corto ha costi e il lungo no, prendi budget dal corto
        if(!longer.budget_chf&&shorter.budget_chf)merged.budget_chf=shorter.budget_chf;
        if(!longer.budget_bu&&shorter.budget_bu)merged.budget_bu=shorter.budget_bu;
        if(!longer.budget_bl&&shorter.budget_bl)merged.budget_bl=shorter.budget_bl;
        if(!longer.categoria&&shorter.categoria)merged.categoria=shorter.categoria;
        // data_nascita: preferisci dal nome lungo (import compleanni piu accurato)
        if(longer.data_nascita)merged.data_nascita=longer.data_nascita;
        else if(shorter.data_nascita)merged.data_nascita=shorter.data_nascita;
        coppie.push({keep:longer,remove:shorter,merged});
      }
    }
  });
  if(!coppie.length){toast('Nessun duplicato trovato!');return}
  window._unisciState={coppie,confermati:0,saltati:0,errori:0,vociCorr:0};
  _renderUnisciUI()}
function _renderUnisciUI(){
  const st=window._unisciState;const mc=document.getElementById('pwd-modal-content');
  const rimaste=st.coppie.filter(c=>!c._done);
  if(!rimaste.length){
    mc.innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">&#9989;</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Unione duplicati completata</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">'+st.confermati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Uniti</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--muted)">'+st.saltati+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Saltati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--ink)">'+st.vociCorr+'</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Voci aggiornate</div></div></div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
    renderMaisonBudgetUI();renderMaisonDashboard();renderSpeseExtra();
    logAzione('Unisci duplicati maison',st.confermati+' uniti, '+st.saltati+' saltati, '+st.vociCorr+' voci');
    return}
  const totOrig=st.coppie.length;
  const _catLabel=function(c){return c==='full_maison'?'Full Maison':c==='maison'?'Maison':c==='direzione'?'Direzione':c==='bu'?'Buono Unico':c==='bl'?'Buono Lounge':''};
  const _fmtDn=function(d){if(!d)return'';const p=d.split('-');return p[2]+'/'+p[1]};
  let html='<div style="text-align:center;margin-bottom:12px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Unisci Duplicati</h3><p style="color:var(--muted);font-size:.84rem">'+rimaste.length+' di '+totOrig+' coppie</p></div>';
  html+='<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:center">';
  html+='<span style="font-size:.82rem;color:#2c6e49;font-weight:600">'+st.confermati+' uniti</span>';
  html+='<span style="font-size:.82rem;color:var(--muted)">'+st.saltati+' saltati</span>';
  html+='</div>';
  html+='<div id="unisci-lista" style="max-height:400px;overflow-y:auto">';
  rimaste.forEach(function(c){
    const idx=st.coppie.indexOf(c);
    const kInfo=[];const rInfo=[];
    if(c.keep.budget_chf)kInfo.push(fmtCHF(parseFloat(c.keep.budget_chf))+' CHF');
    if(c.keep.categoria)kInfo.push(_catLabel(c.keep.categoria));
    if(c.keep.data_nascita)kInfo.push('&#127874; '+_fmtDn(c.keep.data_nascita));
    if(c.remove.budget_chf)rInfo.push(fmtCHF(parseFloat(c.remove.budget_chf))+' CHF');
    if(c.remove.categoria)rInfo.push(_catLabel(c.remove.categoria));
    if(c.remove.data_nascita)rInfo.push('&#127874; '+_fmtDn(c.remove.data_nascita));
    const mInfo=[];
    if(c.merged.categoria)mInfo.push(_catLabel(c.merged.categoria));
    if(c.merged.budget_chf)mInfo.push(fmtCHF(parseFloat(c.merged.budget_chf))+' CHF');
    if(c.merged.data_nascita)mInfo.push('&#127874; '+_fmtDn(c.merged.data_nascita));
    html+='<div id="unisci-row-'+idx+'" style="padding:10px 12px;margin-bottom:8px;border-radius:3px;background:var(--paper2);transition:all .3s">';
    html+='<div style="font-size:.85rem;margin-bottom:4px"><strong>'+escP(c.remove.nome)+'</strong>'+(rInfo.length?' <span style="color:var(--muted);font-size:.78rem">('+rInfo.join(', ')+')</span>':'')+' <span style="color:var(--muted)">+</span> <strong>'+escP(c.keep.nome)+'</strong>'+(kInfo.length?' <span style="color:var(--muted);font-size:.78rem">('+kInfo.join(', ')+')</span>':'')+'</div>';
    html+='<div style="font-size:.82rem;color:#1a4a7a;margin-bottom:8px">&#8594; Unisci in: <strong>'+escP(c.merged.nome)+'</strong>'+(mInfo.length?' ('+mInfo.join(', ')+')':'')+'</div>';
    html+='<div style="display:flex;gap:6px;justify-content:flex-end">';
    html+='<button class="btn-salva" style="font-size:.75rem;padding:5px 12px;background:#2c6e49" onclick="confermaUnisci('+idx+')">Conferma</button>';
    html+='<button class="btn-modal-cancel" style="font-size:.75rem;padding:5px 12px" onclick="saltaUnisci('+idx+')">Salta</button>';
    html+='</div></div>';
  });
  html+='</div>';
  html+='<div class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  mc.innerHTML=html;document.getElementById('pwd-modal').classList.remove('hidden')}
async function confermaUnisci(idx){
  const st=window._unisciState;const c=st.coppie[idx];
  const row=document.getElementById('unisci-row-'+idx);
  if(row)row.style.opacity='0.5';
  try{
    // 1) Aggiorna il record KEEP con i dati merged
    const patchData={nome:c.merged.nome};
    if(c.merged.categoria)patchData.categoria=c.merged.categoria;
    if(c.merged.data_nascita)patchData.data_nascita=c.merged.data_nascita;
    if(c.merged.budget_chf)patchData.budget_chf=c.merged.budget_chf;
    if(c.merged.budget_bu)patchData.budget_bu=c.merged.budget_bu;
    if(c.merged.budget_bl)patchData.budget_bl=c.merged.budget_bl;
    await secPatch('maison_budget','id=eq.'+c.keep.id,patchData);
    // Aggiorna cache locale
    const kIdx=maisonBudgetCache.findIndex(b=>b.id===c.keep.id);
    if(kIdx!==-1)Object.assign(maisonBudgetCache[kIdx],patchData);
    // 2) Aggiorna costi_maison: rinomina dal nome corto al nome lungo
    const costiShort=maisonCache.filter(r=>r.nome===c.remove.nome&&(r.reparto_dip||'slots')===currentReparto);
    for(const r of costiShort){
      try{await secPatch('costi_maison','id=eq.'+r.id,{nome:c.merged.nome});r.nome=c.merged.nome;st.vociCorr++}catch(e){st.errori++}
    }
    // 3) Aggiorna spese_extra: rinomina beneficiario dal nome corto
    const extraShort=speseExtraCache.filter(r=>r.beneficiario===c.remove.nome&&(r.reparto_dip||'slots')===currentReparto);
    for(const r of extraShort){
      try{await secPatch('spese_extra','id=eq.'+r.id,{beneficiario:c.merged.nome});r.beneficiario=c.merged.nome;st.vociCorr++}catch(e){st.errori++}
    }
    // 4) Elimina il record REMOVE
    await secDel('maison_budget','id=eq.'+c.remove.id);
    maisonBudgetCache=maisonBudgetCache.filter(b=>b.id!==c.remove.id);
    c._done=true;st.confermati++;
    if(row){row.style.background='rgba(44,110,73,0.1)';row.innerHTML='<span style="color:#2c6e49;font-size:.85rem">&#9989; '+escP(c.remove.nome)+' unito in <strong>'+escP(c.merged.nome)+'</strong></span>';
      setTimeout(function(){row.style.maxHeight='0';row.style.padding='0';row.style.margin='0';row.style.overflow='hidden';setTimeout(function(){_checkUnisciDone()},300)},800)}
    else _checkUnisciDone();
  }catch(e){st.errori++;toast('Errore unione: '+e.message);if(row)row.style.opacity='1';c._done=true;_checkUnisciDone()}}
function saltaUnisci(idx){
  const st=window._unisciState;const c=st.coppie[idx];
  c._done=true;st.saltati++;
  const row=document.getElementById('unisci-row-'+idx);
  if(row){row.style.opacity='0.3';row.innerHTML='<span style="color:var(--muted);font-size:.85rem">&#10060; '+escP(c.remove.nome)+' / '+escP(c.keep.nome)+' — saltato</span>';
    setTimeout(function(){row.style.maxHeight='0';row.style.padding='0';row.style.margin='0';row.style.overflow='hidden';setTimeout(function(){_checkUnisciDone()},300)},500)}
  else _checkUnisciDone()}
function _checkUnisciDone(){
  const st=window._unisciState;
  const rimaste=st.coppie.filter(c=>!c._done);
  const cntEl=document.querySelector('#unisci-lista');
  if(cntEl&&cntEl.parentElement){const p=cntEl.parentElement.querySelector('p');if(p)p.textContent=rimaste.length+' di '+st.coppie.length+' coppie'}
  if(!rimaste.length)_renderUnisciUI()}
async function rimuoviMaisonBudget(id){if(!confirm('Rimuovere questo budget?'))return;
  try{await secDel('maison_budget','id=eq.'+id);maisonBudgetCache=maisonBudgetCache.filter(b=>b.id!==id);logAzione('Budget maison rimosso','ID '+id);renderMaisonBudgetUI();renderMaisonDashboard();renderMaisonBudgetAlerts();toast('Budget rimosso')}catch(e){toast('Errore rimozione budget')}}
function renderMaisonBudgetAlerts(){const container=document.getElementById('maison-alerts-container');if(!container)return;
  const now=new Date(),mese=now.getMonth(),anno=now.getFullYear();
  const periodo=(document.getElementById('maison-budget-periodo')||{}).value||'mese';
  let dataStart;
  if(periodo==='anno')dataStart=anno+'-01-01';
  else dataStart=anno+'-'+String(mese+1).padStart(2,'0')+'-01';
  const periodoLabel=periodo==='anno'?'anno '+anno:['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][mese]+' '+anno;
  const alerts=[];const _mrAlerts=getMaisonRepartoExpanded();
  getBudgetReparto().forEach(b=>{
    const periodoData=_mrAlerts.filter(r=>r.nome.toLowerCase()===b.nome.toLowerCase()&&r.data_giornata>=dataStart);
    const spent=periodoData.reduce((s,r)=>s+parseFloat(r.costo||0),0);
    const nBU=_contaBuoni(periodoData,'BU');
    const nBL=_contaBuoni(periodoData,'BL');
    const budgetChf=periodo==='anno'&&b.budget_chf?(b.budget_chf*12):b.budget_chf;
    const budgetBu=periodo==='anno'&&b.budget_bu?(b.budget_bu*12):b.budget_bu;
    const budgetBl=periodo==='anno'&&b.budget_bl?(b.budget_bl*12):b.budget_bl;
    if(budgetChf&&spent>=budgetChf)alerts.push({nome:b.nome,tipo:'chf_over',spent,budget:budgetChf});
    else if(budgetChf&&spent>=budgetChf*0.8)alerts.push({nome:b.nome,tipo:'chf_near',spent,budget:budgetChf});
    if(budgetBu&&nBU>=budgetBu)alerts.push({nome:b.nome,tipo:'bu_over',count:nBU,max:budgetBu});
    if(budgetBl&&nBL>=budgetBl)alerts.push({nome:b.nome,tipo:'bl_over',count:nBL,max:budgetBl})});
  let html='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:.82rem;color:var(--muted)">Periodo budget:</span><select id="maison-budget-periodo" onchange="renderMaisonBudgetAlerts()" style="padding:4px 8px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="mese"'+(periodo==='mese'?' selected':'')+'>Mese corrente</option><option value="anno"'+(periodo==='anno'?' selected':'')+'>Anno corrente</option></select><span style="font-size:.82rem;color:var(--muted)">('+periodoLabel+')</span></div>';
  if(!alerts.length){container.innerHTML=html;return}
  const overAlerts=alerts.filter(a=>a.tipo.includes('over'));
  const nearAlerts=alerts.filter(a=>a.tipo.includes('near'));
  if(overAlerts.length){html+='<div class="cassa-alert-banner rdi" style="margin-bottom:8px;cursor:default">&#9888; Budget superato: '+overAlerts.map(a=>escP(a.nome)+(a.spent?' ('+fmtCHF(a.spent)+'/'+fmtCHF(a.budget)+' CHF)':a.count?(' ('+a.count+'/'+a.max+' buoni)'):'')).join(' — ')+'</div>'}
  if(nearAlerts.length){html+='<div class="cassa-alert-banner allin" style="margin-bottom:8px;cursor:default">&#9888; Quasi al budget (80%+): '+nearAlerts.map(a=>escP(a.nome)+' ('+fmtCHF(a.spent)+'/'+fmtCHF(a.budget)+' CHF)').join(' — ')+'</div>'}
  container.innerHTML=html}
function acFiltraMaison(inputId,dropId){const inp=document.getElementById(inputId),drop=document.getElementById(dropId);if(!inp||!drop)return;
  const v=inp.value.toLowerCase();
  const _catLabelsAc={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  const _catColorsAc={full_maison:'#b8860b',maison:'#2980b9',direzione:'#8e44ad',bu:'#e67e22',bl:'#2c6e49'};
  // Budget names con categoria (prioritari)
  const budgetNomi=getBudgetReparto().map(b=>({nome:b.nome,cat:b.categoria||null}));
  const budgetSet=new Set(budgetNomi.map(b=>b.nome.toLowerCase()));
  // Nomi da costi esistenti non in budget
  const costiNomi=[...new Set(getMaisonRepartoExpanded().map(r=>r.nome))].filter(n=>!budgetSet.has(n.toLowerCase())).map(n=>({nome:n,cat:null}));
  // Unisci: budget prima, poi extra
  const tutti=budgetNomi.concat(costiNomi);
  // Filtra: match su qualsiasi parte del nome (cognome, nome)
  const filtrati=v?tutti.filter(item=>item.nome.toLowerCase().includes(v)):tutti;
  // Ordina: budget first, poi alfa
  filtrati.sort((a,b)=>{if(a.cat&&!b.cat)return -1;if(!a.cat&&b.cat)return 1;return a.nome.localeCompare(b.nome)});
  if(!filtrati.length){drop.classList.remove('show');return}
  drop.innerHTML=filtrati.slice(0,50).map(item=>{
    const badge=item.cat?'<span class="mini-badge" style="background:'+(_catColorsAc[item.cat]||'var(--muted)')+';margin-left:6px;font-size:.6rem;vertical-align:middle">'+escP(_catLabelsAc[item.cat]||'')+'</span>':'';
    const catTipo=item.cat==='bu'?'BU':item.cat==='bl'?'BL':'';
    return'<div onmousedown="document.getElementById(\''+inputId+'\').value=\''+item.nome.replace(/'/g,"\\'")+'\';document.getElementById(\''+dropId+'\').classList.remove(\'show\');_preimpostaTipoMaison(\''+escP(item.cat||'')+'\')" style="display:flex;align-items:center;justify-content:space-between">'+escP(item.nome)+badge+'</div>'}).join('');
  drop.classList.add('show')}
function _preimpostaTipoMaison(cat){
  const catToTipo={bu:'BU',bl:'BL',cg:'CG',wl:'WL'};
  // Sezione Maison
  const tipoSel=document.getElementById('maison-man-tipo');
  if(tipoSel&&catToTipo[cat]){tipoSel.value=catToTipo[cat];tipoSel.dispatchEvent(new Event('change'))}
  // Sezione Inventario - Buono a Cliente
  const invTipoSel=document.getElementById('inv-usc-tipo');
  if(invTipoSel&&catToTipo[cat]){invTipoSel.value=catToTipo[cat]}
  // Ricalcola qty se c'è già un importo
  _autoCalcolaBuoniManuale()}
function _autoCalcolaBuoniManuale(){
  const tipo=(document.getElementById('maison-man-tipo')||{}).value;
  const importo=parseFloat((document.getElementById('maison-man-importo')||{}).value)||0;
  const qtyEl=document.getElementById('maison-man-qty');
  if(!tipo||!importo||!BUONO_VALORI[tipo]||!qtyEl)return;
  const calcQ=Math.ceil(importo/BUONO_VALORI[tipo]);
  if(calcQ>=1)qtyEl.value=calcQ}
// Export
function esportaMaisonCSV(){const data=getMaisonFiltrati();if(!data.length){toast('Nessun dato');return}
  // Raggruppato per cliente con buoni e categoria
  const _catLabels={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  const byNome={};data.forEach(r=>{if(!byNome[r.nome])byNome[r.nome]={tot:0,px:0,visite:0,bu:0,bl:0,cg:0,wl:0};const d=byNome[r.nome];d.tot+=parseFloat(r.costo||0);d.px+=(r.px||0);d.visite++;const _bq=(()=>{const m=(r.note||'').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);return m?parseInt(m[1]):1})();if(r.tipo_buono==='BU')d.bu+=_bq;if(r.tipo_buono==='BL')d.bl+=_bq;if(r.tipo_buono==='CG')d.cg+=_bq;if(r.tipo_buono==='WL')d.wl+=_bq});
  const sorted=Object.entries(byNome).sort((a,b)=>b[1].tot-a[1].tot);
  const rows=[['Cliente','Categoria','Visite','PX','BU','BL','CG','WL','Totale CHF','Media CHF']];
  sorted.forEach(([n,d])=>{let budget=getBudgetReparto().find(b=>b.nome.toLowerCase()===n.toLowerCase());
    if(!budget){const _cog=n.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
    const cat=budget&&budget.categoria?_catLabels[budget.categoria]||'':'';
    rows.push([n,cat,d.visite,d.px,d.bu||'',d.bl||'',d.cg||'',d.wl||'',fmtCHF(d.tot),fmtCHF(d.tot/d.visite)])});
  rows.push(['TOTALE','',sorted.reduce((s,c)=>s+c[1].visite,0),sorted.reduce((s,c)=>s+c[1].px,0)+' PX',sorted.reduce((s,c)=>s+c[1].bu,0)?sorted.reduce((s,c)=>s+c[1].bu,0)+' BU':'',sorted.reduce((s,c)=>s+c[1].bl,0)?sorted.reduce((s,c)=>s+c[1].bl,0)+' BL':'',sorted.reduce((s,c)=>s+c[1].cg,0)?sorted.reduce((s,c)=>s+c[1].cg,0)+' CG':'',sorted.reduce((s,c)=>s+c[1].wl,0)?sorted.reduce((s,c)=>s+c[1].wl,0)+' WL':'','CHF '+fmtCHF(sorted.reduce((s,c)=>s+c[1].tot,0)),'']);
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'costi_maison_'+_maisonFilePeriodo(data)+'.csv'}).click();toast('CSV esportato!')}
async function esportaMaisonPDF(){const data=getMaisonFiltrati();if(!data.length){toast('Nessun dato');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore caricamento libreria PDF');return}}
  const _catLabels={full_maison:'Full Maison',maison:'Maison',direzione:'Direzione',bu:'Buono Unico',bl:'Buono Lounge'};
  const _catColors={full_maison:[184,134,11],maison:[41,128,185],direzione:[142,68,173],bu:[230,126,34],bl:[44,110,73]};
  const byNome={};data.forEach(r=>{if(!byNome[r.nome])byNome[r.nome]={tot:0,px:0,visite:0,bu:0,bl:0,cg:0,wl:0};const d=byNome[r.nome];d.tot+=parseFloat(r.costo||0);d.px+=(r.px||0);d.visite++;const _bq=(()=>{const m=(r.note||'').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);return m?parseInt(m[1]):1})();if(r.tipo_buono==='BU')d.bu+=_bq;if(r.tipo_buono==='BL')d.bl+=_bq;if(r.tipo_buono==='CG')d.cg+=_bq;if(r.tipo_buono==='WL')d.wl+=_bq});
  const sorted=Object.entries(byNome).sort((a,b)=>b[1].tot-a[1].tot);
  const totale=sorted.reduce((s,c)=>s+c[1].tot,0);
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('portrait','mm','a4');const pw=doc.internal.pageSize.getWidth();let y=14;
    if(_logoB64)try{doc.addImage(_logoB64,'PNG',pw/2-20,y,40,22.5)}catch(e){}
    y+=28;doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Costi Maison',pw/2,y,{align:'center'});y+=7;
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);
    const fd=(document.getElementById('maison-filt-dal')||{}).value,fa=(document.getElementById('maison-filt-al')||{}).value;
    let _periodoLabel='';
    if(fd&&fa){_periodoLabel=new Date(fd+'T12:00:00').toLocaleDateString('it-IT')+' — '+new Date(fa+'T12:00:00').toLocaleDateString('it-IT')}
    else if(data.length){const _dates=data.map(r=>r.data_giornata).sort();const _d1=new Date(_dates[0]+'T12:00:00');const _d2=new Date(_dates[_dates.length-1]+'T12:00:00');
      if(_d1.getMonth()===_d2.getMonth()&&_d1.getFullYear()===_d2.getFullYear())_periodoLabel=MESI_FULL[_d1.getMonth()]+' '+_d1.getFullYear();
      else _periodoLabel=MESI_FULL[_d1.getMonth()]+' '+_d1.getFullYear()+' — '+MESI_FULL[_d2.getMonth()]+' '+_d2.getFullYear()}
    else{_periodoLabel='Tutti i dati'}
    doc.text(_periodoLabel+' — Casino Lugano SA',pw/2,y,{align:'center'});y+=10;
    doc.setTextColor(0);
    doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Cliente','Categoria','Visite','PX','BU','BL','CG','WL','Totale CHF','Media CHF']],
      body:sorted.map(([n,d])=>{let budget=getBudgetReparto().find(b=>b.nome.toLowerCase()===n.toLowerCase());
        if(!budget){const _cog=n.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)budget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
        const cat=budget&&budget.categoria?_catLabels[budget.categoria]||'':'';
        return[n,cat,d.visite,d.px,d.bu||'',d.bl||'',d.cg||'',d.wl||'',fmtCHF(d.tot),fmtCHF(d.tot/d.visite)]}),
      foot:[['TOTALE','',sorted.reduce((s,c)=>s+c[1].visite,0),sorted.reduce((s,c)=>s+c[1].px,0)+' PX',sorted.reduce((s,c)=>s+c[1].bu,0)?sorted.reduce((s,c)=>s+c[1].bu,0)+' BU':'',sorted.reduce((s,c)=>s+c[1].bl,0)?sorted.reduce((s,c)=>s+c[1].bl,0)+' BL':'',sorted.reduce((s,c)=>s+c[1].cg,0)?sorted.reduce((s,c)=>s+c[1].cg,0)+' CG':'',sorted.reduce((s,c)=>s+c[1].wl,0)?sorted.reduce((s,c)=>s+c[1].wl,0)+' WL':'','CHF '+fmtCHF(totale),'']],
      headStyles:{fillColor:[26,18,8],halign:'center'},footStyles:{fillColor:[245,243,238],textColor:[0,0,0],fontStyle:'bold'},
      styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:7.5,cellPadding:2.5,lineColor:[220,215,205],lineWidth:0.15},columnStyles:{0:{cellWidth:38,halign:'left'},1:{cellWidth:28,halign:'left'},2:{halign:'center',cellWidth:14},3:{halign:'center',cellWidth:12},4:{halign:'center',cellWidth:10},5:{halign:'center',cellWidth:10},6:{halign:'center',cellWidth:10},7:{halign:'center',cellWidth:10},8:{halign:'right',cellWidth:22},9:{halign:'right',cellWidth:18}},
      didParseCell:function(d){if(d.section==='body'&&d.column.index===1){const c=Object.entries(_catLabels).find(([k,v])=>v===d.cell.raw);if(c&&_catColors[c[0]]){d.cell.styles.textColor=_catColors[c[0]];d.cell.styles.fontStyle='bold'}}},
      alternateRowStyles:{fillColor:[250,247,242]}});
    y=doc.lastAutoTable.finalY+6;
    const tp=doc.internal.getNumberOfPages();for(let i=1;i<=tp;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA — Costi Maison — Pag. '+i+'/'+tp,16,doc.internal.pageSize.getHeight()-8)}
    mostraPdfPreview(doc,'costi_maison_'+_maisonFilePeriodo(data)+'.pdf','Costi Maison')}catch(e){console.error(e);toast('Errore PDF: '+e.message)}}

// ========================
// SPESE EXTRA
// ========================
const SE_TIPI_LABEL={cena_esterna:'Cena esterna',pranzo_esterno:'Pranzo esterno',rimborso:'Rimborso spese',viaggio:'Viaggio',biglietti:'Biglietti',regalo:'Regalo',hotel:'Hotel/Alloggio',altro:'Altro'};
const SE_TIPI_COLOR={cena_esterna:'#c0392b',pranzo_esterno:'#e67e22',rimborso:'#2980b9',viaggio:'#8e44ad',biglietti:'#2c6e49',regalo:'#b8860b',hotel:'#1a4a7a',altro:'#8a7d6b'};
let _seFpInit=false;
function initSpeseExtraFP(){if(_seFpInit||!window.flatpickr)return;_seFpInit=true;
  flatpickr('#se-data',{locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false});
  const o={locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false,onChange:()=>renderSpeseExtra()};
  flatpickr('#se-filt-dal',o);flatpickr('#se-filt-al',o)}
function acFiltraSpeseExtra(){const inp=document.getElementById('se-beneficiario'),drop=document.getElementById('ac-se-benef');if(!inp||!drop)return;
  const v=inp.value.toLowerCase();const nomi=[...new Set([...getSpeseReparto().map(r=>r.beneficiario),...getMaisonRepartoExpanded().map(r=>r.nome)])].sort();
  const f=v?nomi.filter(n=>n.toLowerCase().includes(v)):nomi;
  if(!f.length){drop.classList.remove('show');return}
  drop.innerHTML=f.slice(0,12).map(n=>'<div onmousedown="document.getElementById(\'se-beneficiario\').value=\''+n.replace(/'/g,"\\'")+'\';document.getElementById(\'ac-se-benef\').classList.remove(\'show\')">'+escP(n)+'</div>').join('');drop.classList.add('show')}
async function salvaSpeseExtra(){let benef=capitalizzaNome(document.getElementById('se-beneficiario').value.trim());
  const tipo=document.getElementById('se-tipo').value;const data=document.getElementById('se-data').value;
  const luogo=document.getElementById('se-luogo').value.trim();const importo=parseFloat(document.getElementById('se-importo').value)||0;
  const desc=document.getElementById('se-descrizione').value.trim();
  if(!benef){toast('Inserisci il beneficiario');_highlightField('se-beneficiario');return}
  const nomeEsistente=getMaisonRepartoExpanded().find(r=>r.nome.toLowerCase()===benef.toLowerCase())||getSpeseReparto().find(r=>r.beneficiario.toLowerCase()===benef.toLowerCase());
  if(!nomeEsistente){const simile=_trovaNomeSimileMaison(benef);
    if(simile&&simile.tipo==='simile'){if(confirm('Hai scritto "'+benef+'" ma esiste "'+simile.nome+'". Usare "'+simile.nome+'"?'))benef=simile.nome}}if(!data){toast('Seleziona la data');return}if(!importo){toast('Inserisci l\'importo');return}
  // Controllo duplicati: stesso beneficiario + stessa data + stesso importo
  const seDup=getSpeseReparto().find(r=>r.beneficiario.toLowerCase()===benef.toLowerCase()&&r.data_spesa===data&&parseFloat(r.importo)===importo);
  if(seDup){if(!confirm(benef+' ha già una spesa di '+importo.toFixed(2)+' CHF il '+new Date(data+'T12:00:00').toLocaleDateString('it-IT')+'.\n\nVuoi aggiungere comunque?'))return}
  const px=parseInt(document.getElementById('se-px').value)||1;
  try{const rec={beneficiario:benef,tipo,descrizione:desc+(px>1?' ('+px+' px)':''),importo,data_spesa:data,luogo,operatore:getOperatore(),reparto_dip:currentReparto};
    const r=await secPost('spese_extra',rec);speseExtraCache.unshift(r[0]);
    document.getElementById('se-beneficiario').value='';document.getElementById('se-luogo').value='';
    document.getElementById('se-importo').value='';document.getElementById('se-descrizione').value='';document.getElementById('se-px').value='1';
    const fp=document.getElementById('se-data');if(fp&&fp._flatpickr)fp._flatpickr.clear();
    logAzione('Spesa extra',benef+' — '+SE_TIPI_LABEL[tipo]+' — '+importo.toFixed(2)+' CHF');
    renderSpeseExtra();renderMaisonDashboard();toast('Spesa aggiunta')}catch(e){toast('Errore aggiunta spesa')}}
async function eliminaSpeseExtra(id){if(!confirm('Eliminare questa spesa?'))return;
  try{await secDel('spese_extra','id=eq.'+id);speseExtraCache=speseExtraCache.filter(x=>x.id!==id);
    renderSpeseExtra();renderMaisonDashboard();logAzione('Eliminata spesa extra','ID '+id);toast('Eliminata')}catch(e){toast('Errore eliminazione spesa')}}
function modificaSpeseExtra(id){const s=speseExtraCache.find(x=>x.id===id);if(!s)return;
  const b=document.getElementById('pwd-modal-content');
  b.innerHTML='<h3>Modifica spesa extra</h3><div class="pwd-field"><label>Beneficiario</label><input type="text" id="edit-se-benef" value="'+escP(s.beneficiario)+'"></div><div class="pwd-field"><label>Tipo</label><select id="edit-se-tipo" style="padding:10px;width:100%"><option value="cena_esterna"'+(s.tipo==='cena_esterna'?' selected':'')+'>Cena esterna</option><option value="pranzo_esterno"'+(s.tipo==='pranzo_esterno'?' selected':'')+'>Pranzo esterno</option><option value="rimborso"'+(s.tipo==='rimborso'?' selected':'')+'>Rimborso spese</option><option value="viaggio"'+(s.tipo==='viaggio'?' selected':'')+'>Viaggio</option><option value="biglietti"'+(s.tipo==='biglietti'?' selected':'')+'>Biglietti</option><option value="regalo"'+(s.tipo==='regalo'?' selected':'')+'>Regalo</option><option value="hotel"'+(s.tipo==='hotel'?' selected':'')+'>Hotel / Alloggio</option><option value="altro"'+(s.tipo==='altro'?' selected':'')+'>Altro</option></select></div><div class="pwd-field"><label>Luogo</label><input type="text" id="edit-se-luogo" value="'+escP(s.luogo||'')+'"></div><div class="pwd-field"><label>Importo CHF</label><input type="number" id="edit-se-importo" value="'+s.importo+'" step="0.01"></div><div class="pwd-field"><label>Descrizione</label><input type="text" id="edit-se-desc" value="'+escP(s.descrizione||'')+'"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaSE('+id+')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden')}
async function salvaModificaSE(id){const benef=capitalizzaNome(document.getElementById('edit-se-benef').value.trim());
  const tipo=document.getElementById('edit-se-tipo').value;
  const luogo=document.getElementById('edit-se-luogo').value.trim();const importo=parseFloat(document.getElementById('edit-se-importo').value)||0;
  const desc=document.getElementById('edit-se-desc').value.trim();
  if(!benef||!importo){toast('Compila beneficiario e importo');return}
  try{await secPatch('spese_extra','id=eq.'+id,{beneficiario:benef,tipo,luogo,importo,descrizione:desc});
    const s=speseExtraCache.find(x=>x.id===id);if(s){s.beneficiario=benef;s.tipo=tipo;s.luogo=luogo;s.importo=importo;s.descrizione=desc}
    document.getElementById('pwd-modal').classList.add('hidden');renderSpeseExtra();renderMaisonDashboard();logAzione('Modifica spesa extra',benef+' '+importo+' CHF');toast('Modificata');
    // Riapri scheda cliente se era aperta
    if(document.getElementById('profilo-modal')&&!document.getElementById('profilo-modal').classList.contains('hidden'))apriDettaglioMaison(benef)}catch(e){toast('Errore modifica spesa')}}
function getSpeseExtraFiltrate(){const fn=(document.getElementById('se-filt-nome')||{}).value||'';
  const ft=(document.getElementById('se-filt-tipo')||{}).value||'';
  const fd=(document.getElementById('se-filt-dal')||{}).value||'';const fa=(document.getElementById('se-filt-al')||{}).value||'';
  return getSpeseReparto().filter(r=>{if(fn&&!r.beneficiario.toLowerCase().includes(fn.toLowerCase()))return false;
    if(ft&&r.tipo!==ft)return false;if(fd&&r.data_spesa<fd)return false;if(fa&&r.data_spesa>fa)return false;return true})}
function renderSpeseExtra(){const data=getSpeseExtraFiltrate();const el=document.getElementById('spese-extra-list');if(!el)return;
  const tot=data.reduce((s,r)=>s+parseFloat(r.importo||0),0);
  if(!data.length){el.innerHTML='<div class="empty-state"><p>Nessuna spesa extra</p><small>Aggiungi una spesa compilando il form sopra</small></div>';return}
  const nBenef=new Set(data.map(r=>r.beneficiario)).size;
  const topTipo=data.reduce((m,r)=>{m[r.tipo]=(m[r.tipo]||0)+1;return m},{});
  const topTipoLabel=Object.entries(topTipo).sort((a,b)=>b[1]-a[1]).slice(0,1).map(t=>SE_TIPI_LABEL[t[0]]||t[0])[0]||'';
  let h='<div class="mini-stats-bar"><div class="mini-stat"><div class="mini-stat-num gold">'+fmtCHF(tot)+'</div><div class="mini-stat-label">Totale CHF</div></div><div class="mini-stat"><div class="mini-stat-num blue">'+data.length+'</div><div class="mini-stat-label">Spese</div></div><div class="mini-stat"><div class="mini-stat-num">'+nBenef+'</div><div class="mini-stat-label">Beneficiari</div></div>'+(topTipoLabel?'<div class="mini-stat"><div class="mini-stat-num" style="font-size:1rem">'+topTipoLabel+'</div><div class="mini-stat-label">Tipo frequente</div></div>':'')+'</div>';
  // Raggruppato per beneficiario con dettaglio tipi
  const byBenef={};data.forEach(r=>{const k=r.beneficiario;if(!byBenef[k])byBenef[k]={tot:0,visite:0,tipi:{}};byBenef[k].tot+=parseFloat(r.importo||0);byBenef[k].visite++;byBenef[k].tipi[r.tipo]=(byBenef[k].tipi[r.tipo]||0)+1});
  const sorted=Object.entries(byBenef).sort((a,b)=>b[1].tot-a[1].tot);
  h+='<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Beneficiario</th><th class="num">Visite</th><th>Tipi</th><th class="num">Totale CHF</th><th class="num">Media CHF</th><th></th></tr></thead><tbody>';
  sorted.forEach(([nome,d],idx)=>{const ne=nome.replace(/'/g,"\\'");
    let _seBudget=getBudgetReparto().find(b=>b.nome.toLowerCase()===nome.toLowerCase());
    if(!_seBudget){const _cog=nome.toLowerCase().split(/\s+/)[0];if(_cog.length>=3)_seBudget=getBudgetReparto().find(b=>b.nome.toLowerCase().split(/\s+/)[0]===_cog)}
    const _seCatBadge=_seBudget&&_seBudget.categoria==='full_maison'?' <span class="mini-badge" style="background:#b8860b;font-size:.7rem">Full Maison</span>':_seBudget&&_seBudget.categoria==='maison'?' <span class="mini-badge" style="background:#2980b9;font-size:.7rem">Maison</span>':_seBudget&&_seBudget.categoria==='direzione'?' <span class="mini-badge" style="background:#8e44ad;font-size:.7rem">Direzione</span>':_seBudget&&_seBudget.categoria==='bu'?' <span class="mini-badge" style="background:#e67e22;font-size:.7rem">Buono Unico</span>':_seBudget&&_seBudget.categoria==='bl'?' <span class="mini-badge" style="background:#2c6e49;font-size:.7rem">Buono Lounge</span>':'';
    const tipiBadges=Object.entries(d.tipi).map(([t,n])=>'<span class="mini-badge" style="background:'+(SE_TIPI_COLOR[t]||'var(--muted)')+';font-size:.7rem">'+n+' '+(SE_TIPI_LABEL[t]||t)+'</span>').join(' ');
    h+='<tr style="'+(idx%2?'background:rgba(0,0,0,0.03)':'')+'"><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\''+ne+'\')">'+escP(nome)+'</span></strong>'+_seCatBadge+'</td><td class="num">'+d.visite+'</td><td>'+tipiBadges+'</td><td class="num"><strong>'+fmtCHF(d.tot)+'</strong></td><td class="num">'+fmtCHF(d.tot/d.visite)+'</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaSpeseExtraBenef(\''+ne+'\')" style="font-size:.78rem;padding:3px 8px">Rinomina</button> <button class="btn-act del" onclick="eliminaSpeseExtraBenef(\''+ne+'\')" style="font-size:.78rem;padding:3px 8px">Elimina</button></td></tr>'});
  h+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td class="num"><strong>'+data.length+'</strong></td><td></td><td class="num"><strong>CHF '+fmtCHF(tot)+'</strong></td><td></td><td></td></tr></tbody></table></div>';
  el.innerHTML=h}
async function eliminaSpeseExtraBenef(nome){const ids=speseExtraCache.filter(r=>r.beneficiario===nome&&(r.reparto_dip||'slots')===currentReparto);
  if(!ids.length){toast('Nessuna spesa');return}
  if(!confirm('Eliminare tutte le '+ids.length+' spese extra di "'+nome+'"?'))return;
  try{for(const r of ids){await secDel('spese_extra','id=eq.'+r.id)}
    speseExtraCache=speseExtraCache.filter(r=>!(r.beneficiario===nome&&(r.reparto_dip||'slots')===currentReparto));
    logAzione('Eliminato spese extra',nome+' ('+ids.length+' righe)');renderSpeseExtra();renderMaisonDashboard();toast(nome+' eliminato ('+ids.length+' spese)')}catch(e){toast('Errore eliminazione')}}
function rinominaSpeseExtraBenef(vecchio){const mc=document.getElementById('pwd-modal-content');
  mc.innerHTML='<h3>Rinomina beneficiario</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">Rinomina tutte le spese extra di <strong>'+escP(vecchio)+'</strong></p><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="se-rename-nuovo" value="'+escP(vecchio)+'"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaSE(\''+vecchio.replace(/'/g,"\\'")+'\')">Rinomina tutti</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');setTimeout(()=>{const i=document.getElementById('se-rename-nuovo');if(i){i.focus();i.select()}},100)}
async function eseguiRinominaSE(vecchio){const nuovo=capitalizzaNome(document.getElementById('se-rename-nuovo').value.trim());
  if(!nuovo){toast('Inserisci un nome');return}if(nuovo===vecchio){document.getElementById('pwd-modal').classList.add('hidden');return}
  const ids=speseExtraCache.filter(r=>r.beneficiario===vecchio&&(r.reparto_dip||'slots')===currentReparto).map(r=>r.id);
  try{for(const id of ids){await secPatch('spese_extra','id=eq.'+id,{beneficiario:nuovo})}
    speseExtraCache.forEach(r=>{if(r.beneficiario===vecchio&&(r.reparto_dip||'slots')===currentReparto)r.beneficiario=nuovo});
    logAzione('Rinomina spese extra',vecchio+' → '+nuovo+' ('+ids.length+' righe)');
    document.getElementById('pwd-modal').classList.add('hidden');renderSpeseExtra();toast(vecchio+' → '+nuovo+' ('+ids.length+' righe)')}catch(e){toast('Errore rinomina')}}
function resetSpeseExtraFiltri(){document.getElementById('se-filt-nome').value='';document.getElementById('se-filt-tipo').value='';
  ['se-filt-dal','se-filt-al'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';if(el._flatpickr)el._flatpickr.clear()}});renderSpeseExtra()}
function esportaSpeseExtraCSV(){const data=getSpeseExtraFiltrate();if(!data.length){toast('Nessun dato');return}
  const rows=[['Data','Beneficiario','Tipo','Luogo','Descrizione','Importo CHF','Operatore']];
  data.forEach(r=>{rows.push([new Date(r.data_spesa+'T12:00:00').toLocaleDateString('it-IT'),r.beneficiario,SE_TIPI_LABEL[r.tipo]||r.tipo,r.luogo||'',r.descrizione||'',fmtCHF(r.importo),r.operatore||''])});
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(c=>'\"'+String(c).replace(/\"/g,'\"\"')+'\"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'spese_extra_'+new Date().toLocaleDateString('it-IT').replace(/\//g,'-')+'.csv'}).click();toast('CSV esportato!')}
async function esportaSpeseExtraPDF(){const data=getSpeseExtraFiltrate();if(!data.length){toast('Nessun dato');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore caricamento libreria PDF');return}}
  const tot=data.reduce((s,r)=>s+parseFloat(r.importo||0),0);
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('portrait','mm','a4');const pw=doc.internal.pageSize.getWidth();let y=14;
    if(_logoB64)try{doc.addImage(_logoB64,'PNG',pw/2-20,y,40,22.5)}catch(e){}
    y+=28;doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Spese Extra',pw/2,y,{align:'center'});y+=7;
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);doc.text('Casino Lugano SA — '+data.length+' spese — CHF '+fmtCHF(tot),pw/2,y,{align:'center'});y+=10;doc.setTextColor(0);
    doc.autoTable({theme:'grid',startY:y,margin:{left:16,right:16},head:[['Data','Beneficiario','Tipo','Luogo','Descrizione','CHF']],
      body:data.map(r=>[new Date(r.data_spesa+'T12:00:00').toLocaleDateString('it-IT'),r.beneficiario,SE_TIPI_LABEL[r.tipo]||r.tipo,r.luogo||'',r.descrizione||'',fmtCHF(r.importo)]),
      foot:[['','','','','TOTALE','CHF '+fmtCHF(tot)]],headStyles:{fillColor:[26,18,8]},footStyles:{fillColor:[245,243,238],textColor:[0,0,0],fontStyle:'bold'},
      styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:8,cellPadding:3},columnStyles:{5:{halign:'right'}},alternateRowStyles:{fillColor:[250,247,242]}});
    const tp=doc.internal.getNumberOfPages();for(let i=1;i<=tp;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA — Spese Extra — Pag. '+i+'/'+tp,16,doc.internal.pageSize.getHeight()-8)}
    mostraPdfPreview(doc,'spese_extra.pdf','Spese Extra')}catch(e){toast('Errore PDF')}}

// REPARTO SWITCH
function aggiornaLoginOperatori(){var settore=document.getElementById('login-settore').value;
  var loginNome=document.getElementById('login-nome');
  if(!settore){loginNome.innerHTML='<option value="">-- Seleziona operatore --</option>';return}
  var ops=operatoriAuthCache.map(function(o){return o.nome}).filter(function(n){var rep=operatoriRepartoMap[n]||'entrambi';return rep===settore||rep==='entrambi'}).sort();
  loginNome.innerHTML='<option value="">-- Admin (password master) --</option>'+ops.map(function(n){return'<option value="'+escP(n)+'">'+escP(n)+'</option>'}).join('')}
function setReparto(rep){currentReparto=rep;
  document.getElementById('btn-rep-slots').className='reparto-btn'+(rep==='slots'?' active-slots':'');
  document.getElementById('btn-rep-tavoli').className='reparto-btn'+(rep==='tavoli'?' active-tavoli':'');
  registraPushSubscription();
  // Re-render TUTTE le pagine (dati devono essere sempre freschi per il reparto)
  aggiornaNomi();render();updateStats();
  renderDashboard();renderStatistiche();
  renderMaisonDashboard();renderMaisonBudgetUI();renderSpeseExtra();renderRegali();
  if(typeof renderModuliList==='function')renderModuliList();
  if(typeof renderRapporto==='function')renderRapporto();
  renderConsegne();aggiornaConsegnaBadge();
  renderCassaAlerts();renderRischioAlerts();renderAmmonimentiAlerts();
  renderScadenzeBanner()}
function applicaRepartoVisibilita(){
  var sw=document.getElementById('reparto-switch');if(!sw)return;
  var op=getOperatore();var opRep=operatoriRepartoMap[op]||'entrambi';
  if(isAdmin())opRep='entrambi';
  var vSlots=opRep==='slots'||opRep==='entrambi';
  var vTavoli=opRep==='tavoli'||opRep==='entrambi';
  if(vSlots&&vTavoli){sw.style.display='flex';sw.classList.remove('hidden')}
  else{sw.style.display='none';sw.classList.add('hidden');
    if(vSlots)currentReparto='slots';
    else if(vTavoli)currentReparto='tavoli';
    else currentReparto='slots'}
  document.getElementById('btn-rep-slots').className='reparto-btn'+(currentReparto==='slots'?' active-slots':'');
  document.getElementById('btn-rep-tavoli').className='reparto-btn'+(currentReparto==='tavoli'?' active-tavoli':'')}
function getDatiReparto(){return datiCache.filter(function(e){return(e.reparto_dip||'slots')===currentReparto})}
function getMaisonReparto(){return maisonCache.filter(function(r){return(r.reparto_dip||'slots')===currentReparto})}
function getMaisonRepartoExpanded(){return getMaisonReparto().flatMap(function(r){
  if(!r.nome||!r.nome.includes('/'))return[r];
  var nomi=r.nome.split(/\s*\/\s*/).map(function(n){return n.trim()}).filter(Boolean);
  if(nomi.length<2)return[r];
  return nomi.map(function(n){return Object.assign({},r,{nome:capitalizzaNome(n),costo:Math.round(parseFloat(r.costo||0)/nomi.length*100)/100,px:Math.round((r.px||0)/nomi.length)||1,_costoOriginale:parseFloat(r.costo||0),_nCondiviso:nomi.length,_gruppoOriginale:r.nome})})})}
function getBudgetReparto(){return maisonBudgetCache.filter(function(b){return(b.reparto_dip||'slots')===currentReparto})}
function getSpeseReparto(){return speseExtraCache.filter(function(r){return(r.reparto_dip||'slots')===currentReparto})}
function getModuliReparto(){return moduliCache.filter(function(m){return(m.reparto_dip||'slots')===currentReparto})}
function getConsegneReparto(){return consegneCache.filter(function(c){return(c.reparto_dip||'slots')===currentReparto})}

// === INVENTARIO ===
let _invTab='buoni';
function getInventarioReparto(){return inventarioCache.filter(r=>(r.reparto_dip||'slots')===currentReparto)}
function calcolaGiacenzaBuoni(){
  const inv=getInventarioReparto().filter(r=>r.categoria==='buono');
  const giacenze={BU:0,BL:0,CG:0,WL:0};
  ['BU','BL','CG','WL'].forEach(t=>{
    const recs=inv.filter(r=>r.tipo===t);
    const entrate=recs.filter(r=>r.movimento==='entrata').reduce((s,r)=>s+r.quantita,0);
    const uscite=recs.filter(r=>r.movimento==='uscita').reduce((s,r)=>s+r.quantita,0);
    const preAss=recs.filter(r=>r.movimento==='preassegno'&&!r.pareggiato).reduce((s,r)=>s+r.quantita,0);
    giacenze[t]=entrate-uscite-preAss;
  });
  const maisonBuoni=getMaisonReparto().filter(r=>r.tipo_buono);
  const linkedIds=new Set(inv.filter(r=>r.maison_id).map(r=>r.maison_id));
  maisonBuoni.forEach(r=>{
    if(linkedIds.has(r.id))return;
    const preMatch=inv.find(p=>p.movimento==='preassegno'&&!p.pareggiato&&p.tipo===r.tipo_buono&&p.cliente.toLowerCase()===r.nome.toLowerCase());
    if(!preMatch){
      const qty=_contaBuoniFromNote(r);
      if(giacenze[r.tipo_buono]!==undefined)giacenze[r.tipo_buono]-=qty;
    }
  });
  return giacenze;
}
function _contaBuoniFromNote(r){const m=(r.note||'').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);return m?parseInt(m[1]):1}
function calcolaGiacenzeSigarette(){
  const inv=getInventarioReparto().filter(r=>r.categoria==='sigaretta');
  const byMarca={};
  inv.forEach(r=>{if(!byMarca[r.tipo])byMarca[r.tipo]=0;if(r.movimento==='entrata')byMarca[r.tipo]+=r.quantita;else byMarca[r.tipo]-=r.quantita});
  return byMarca;
}
function renderInventario(){
  if(_invTab==='buoni'){renderInventarioBuoni();document.getElementById('inv-section-buoni').style.display='';document.getElementById('inv-section-sigarette').style.display='none'}
  else{renderInventarioSigarette();document.getElementById('inv-section-buoni').style.display='none';document.getElementById('inv-section-sigarette').style.display=''}
  document.querySelectorAll('.inv-tab-btn').forEach(b=>{
    const isActive=b.dataset.tab===_invTab;
    b.classList.toggle('active',isActive);
    b.style.background=isActive?'var(--ink)':'var(--paper)';b.style.color=isActive?'var(--paper)':'var(--ink)';b.style.borderColor=isActive?'var(--ink)':'var(--line)';
  });
}
function switchInvTab(tab){_invTab=tab;renderInventario()}
function renderInventarioBuoni(){
  const giacenze=calcolaGiacenzaBuoni();
  const nonPareggiati=getInventarioReparto().filter(r=>r.categoria==='buono'&&r.movimento==='preassegno'&&!r.pareggiato).length;
  const kpiEl=document.getElementById('inv-buoni-kpi');
  if(kpiEl){
    const labels={BU:'Buono Unico',BL:'Buono Lounge',CG:'C. Gourmet',WL:'Welcome L.'};
    const _scortaBassa=['BU','BL','CG','WL'].filter(t=>(giacenze[t]||0)>0&&(giacenze[t]||0)<=10);
    const _scortaFinita=['BU','BL','CG','WL'].filter(t=>(giacenze[t]||0)<=0&&getInventarioReparto().some(r=>r.categoria==='buono'&&r.tipo===t));
    kpiEl.innerHTML=['BU','BL','CG','WL'].map(t=>{
      const v=giacenze[t]||0;const col=v<=0?'var(--accent)':v<=10?'#e67e22':'#2c6e49';
      return '<div class="mini-stat"><div class="mini-stat-num" style="color:'+col+'">'+v+'</div><div class="mini-stat-label">'+labels[t]+'</div></div>';
    }).join('')+(_scortaFinita.length?'<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(192,57,43,0.15);color:var(--accent);border-radius:3px;font-size:.85rem;font-weight:600">&#9888; Scorta esaurita: '+_scortaFinita.join(', ')+'</div>':'')+(_scortaBassa.length?'<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(230,126,34,0.12);color:#e67e22;border-radius:3px;font-size:.85rem">&#9888; Scorta bassa (&le;10): '+_scortaBassa.map(t=>t+' ('+giacenze[t]+')').join(', ')+'</div>':'')+(nonPareggiati?'<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(230,126,34,0.12);color:#e67e22;border-radius:3px;font-size:.85rem">&#9888; '+nonPareggiati+' buoni pre-assegnati non pareggiati</div>':'');
  }
  renderInventarioBuoniTable();
}
function _invPopulateAnni(){
  const anni=new Set();getInventarioReparto().forEach(r=>{if(r.data_movimento)anni.add(r.data_movimento.substring(0,4))});
  getMaisonReparto().filter(r=>r.tipo_buono).forEach(r=>{if(r.data_giornata)anni.add(r.data_giornata.substring(0,4))});
  const sorted=[...anni].sort().reverse();
  ['inv-b-filt-anno','inv-s-filt-anno'].forEach(id=>{
    const sel=document.getElementById(id);if(!sel)return;const cv=sel.value;
    sel.innerHTML='<option value="">Tutti</option>'+sorted.map(a=>'<option'+(a===cv?' selected':'')+'>'+a+'</option>').join('')});
}
function renderInventarioBuoniTable(){
  const el=document.getElementById('inv-buoni-table');if(!el)return;
  _invPopulateAnni();
  const ft=(document.getElementById('inv-b-filt-tipo')||{}).value||'';
  const fc=(document.getElementById('inv-b-filt-cliente')||{}).value||'';
  const fq=(document.getElementById('inv-b-filt-cerca')||{}).value||'';
  const fmese=(document.getElementById('inv-b-filt-mese')||{}).value||'';
  const fanno=(document.getElementById('inv-b-filt-anno')||{}).value||'';
  const fd=(document.getElementById('inv-b-filt-dal')||{}).value||'';
  const fa=(document.getElementById('inv-b-filt-al')||{}).value||'';
  const fs=(document.getElementById('inv-b-filt-stato')||{}).value||'';
  function _filtDate(d){if(!d)return false;if(fd&&d<fd)return false;if(fa&&d>fa)return false;if(fmese&&d.substring(5,7)!==fmese)return false;if(fanno&&d.substring(0,4)!==fanno)return false;return true}
  function _filtCerca(r){if(!fq)return true;const q=fq.toLowerCase();return(r.tipo||'').toLowerCase().includes(q)||(r.cliente||'').toLowerCase().includes(q)||(r.note||'').toLowerCase().includes(q)||(r.movimento||'').toLowerCase().includes(q)}
  let rows=getInventarioReparto().filter(r=>r.categoria==='buono');
  if(ft)rows=rows.filter(r=>r.tipo===ft);
  if(fc)rows=rows.filter(r=>(r.cliente||'').toLowerCase().includes(fc.toLowerCase()));
  rows=rows.filter(r=>_filtDate(r.data_movimento));
  rows=rows.filter(_filtCerca);
  if(fs==='pareggiato')rows=rows.filter(r=>r.pareggiato);
  if(fs==='non_pareggiato')rows=rows.filter(r=>r.movimento==='preassegno'&&!r.pareggiato);
  const linkedIds=new Set(getInventarioReparto().filter(r=>r.maison_id).map(r=>r.maison_id));
  let autoRows=getMaisonReparto().filter(r=>r.tipo_buono&&!linkedIds.has(r.id)).map(r=>({
    tipo:r.tipo_buono,movimento:'auto',quantita:_contaBuoniFromNote(r),
    cliente:r.nome,data_movimento:r.data_giornata,note:'Da Maison',_auto:true
  }));
  const all=[...rows,...autoRows.filter(r=>{
    if(ft&&r.tipo!==ft)return false;
    if(fc&&!r.cliente.toLowerCase().includes(fc.toLowerCase()))return false;
    if(!_filtDate(r.data_movimento))return false;
    if(!_filtCerca(r))return false;
    if(fs)return false;
    return true;
  })].sort((a,b)=>(b.data_movimento||'').localeCompare(a.data_movimento||''));
  if(!all.length){el.innerHTML='<p style="color:var(--muted);padding:16px;text-align:center">Nessun movimento</p>';return}
  const movLabels={entrata:'&#9650; Carico',uscita:'&#9660; Uscita man.',preassegno:'&#9660; Pre-assegnato',auto:'&#9660; Da Maison'};
  const movColors={entrata:'#2c6e49',uscita:'#c0392b',preassegno:'#e67e22',auto:'#8a7d6b'};
  const tipColors={BU:'#b8860b',BL:'#1a4a7a',CG:'#2c6e49',WL:'#7b2d8b'};
  let html='<table style="width:100%;border-collapse:collapse;font-size:.88rem"><thead><tr style="border-bottom:2px solid var(--line);text-align:left"><th style="padding:8px">Data</th><th style="padding:8px">Tipo</th><th style="padding:8px">Qty</th><th style="padding:8px">Movimento</th><th style="padding:8px">Cliente</th><th style="padding:8px">Stato</th><th style="padding:8px"></th></tr></thead><tbody>';
  all.forEach(r=>{
    const d=r.data_movimento?new Date(r.data_movimento+'T12:00:00').toLocaleDateString('it-IT'):'';
    const mov=movLabels[r.movimento]||r.movimento;const col=movColors[r.movimento]||'var(--ink)';
    const qSign=r.movimento==='entrata'?'+':'-';
    const stato=r.movimento==='preassegno'?(r.pareggiato?'<span style="color:#2c6e49">&#10003; Pareggiato</span>':'<span style="color:#e67e22">&#9203; In attesa</span>'):(r._auto?'<span style="color:var(--muted)">auto</span>':'');
    const actions=r._auto?'':'<div style="display:flex;gap:4px"><button class="entry-action-btn" onclick="modificaInventario('+r.id+')" title="Modifica">&#9998;</button><button class="entry-action-btn" onclick="eliminaInventario('+r.id+')" title="Elimina">&#128465;</button></div>';
    html+='<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 8px;white-space:nowrap;color:var(--muted);font-size:.82rem">'+d+'</td><td style="padding:6px 8px"><span style="background:'+(tipColors[r.tipo]||'var(--muted)')+';color:white;padding:2px 8px;border-radius:2px;font-size:.78rem;font-weight:600">'+escP(r.tipo)+'</span></td><td style="padding:6px 8px;font-weight:700;color:'+col+'">'+qSign+r.quantita+'</td><td style="padding:6px 8px;color:'+col+'">'+mov+'</td><td style="padding:6px 8px">'+escP(r.cliente||'')+'</td><td style="padding:6px 8px">'+stato+'</td><td style="padding:6px 8px">'+actions+'</td></tr>';
  });
  html+='</tbody></table>';el.innerHTML=html;
}
function renderInventarioSigarette(){
  const giacenze=calcolaGiacenzeSigarette();
  const kpiEl=document.getElementById('inv-sig-kpi');
  if(kpiEl){
    const brands=Object.entries(giacenze).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    const totale=brands.reduce((s,[k,v])=>s+v,0);
    kpiEl.innerHTML=brands.map(([marca,qty])=>'<div class="mini-stat"><div class="mini-stat-num">'+qty+'</div><div class="mini-stat-label">'+escP(marca)+'</div></div>').join('')+'<div class="mini-stat"><div class="mini-stat-num" style="color:var(--ink)">'+totale+'</div><div class="mini-stat-label">Totale pacchetti</div></div>';
    if(!brands.length)kpiEl.innerHTML='<p style="color:var(--muted);text-align:center;padding:12px">Nessuna sigaretta in scorta</p>';
  }
  renderInventarioSigTable();_aggiornaMarche();
}
function renderInventarioSigTable(){
  const el=document.getElementById('inv-sig-table');if(!el)return;
  _invPopulateAnni();
  const fm=(document.getElementById('inv-s-filt-marca')||{}).value||'';
  const fq=(document.getElementById('inv-s-filt-cerca')||{}).value||'';
  const fmese=(document.getElementById('inv-s-filt-mese')||{}).value||'';
  const fanno=(document.getElementById('inv-s-filt-anno')||{}).value||'';
  const fd=(document.getElementById('inv-s-filt-dal')||{}).value||'';
  const fa=(document.getElementById('inv-s-filt-al')||{}).value||'';
  let rows=getInventarioReparto().filter(r=>r.categoria==='sigaretta');
  if(fm)rows=rows.filter(r=>r.tipo.toLowerCase().includes(fm.toLowerCase()));
  if(fq){const q=fq.toLowerCase();rows=rows.filter(r=>(r.tipo||'').toLowerCase().includes(q)||(r.cliente||'').toLowerCase().includes(q)||(r.note||'').toLowerCase().includes(q))}
  if(fmese)rows=rows.filter(r=>r.data_movimento&&r.data_movimento.substring(5,7)===fmese);
  if(fanno)rows=rows.filter(r=>r.data_movimento&&r.data_movimento.substring(0,4)===fanno);
  if(fd)rows=rows.filter(r=>r.data_movimento>=fd);
  if(fa)rows=rows.filter(r=>r.data_movimento<=fa);
  rows.sort((a,b)=>(b.data_movimento||'').localeCompare(a.data_movimento||''));
  if(!rows.length){el.innerHTML='<p style="color:var(--muted);padding:16px;text-align:center">Nessun movimento</p>';return}
  let html='<table style="width:100%;border-collapse:collapse;font-size:.88rem"><thead><tr style="border-bottom:2px solid var(--line);text-align:left"><th style="padding:8px">Data</th><th style="padding:8px">Marca</th><th style="padding:8px">Qty</th><th style="padding:8px">Movimento</th><th style="padding:8px">Cliente</th><th style="padding:8px">Collaboratore</th><th style="padding:8px"></th></tr></thead><tbody>';
  rows.forEach(r=>{
    const d=r.data_movimento?new Date(r.data_movimento+'T12:00:00').toLocaleDateString('it-IT'):'';
    const isIn=r.movimento==='entrata';
    html+='<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 8px;color:var(--muted);font-size:.82rem">'+d+'</td><td style="padding:6px 8px;font-weight:600">'+escP(r.tipo)+'</td><td style="padding:6px 8px;font-weight:700;color:'+(isIn?'#2c6e49':'#c0392b')+'">'+(isIn?'+':'-')+r.quantita+'</td><td style="padding:6px 8px;color:'+(isIn?'#2c6e49':'#c0392b')+'">'+(isIn?'&#9650; Sbagliata':'&#9660; Data a cliente')+'</td><td style="padding:6px 8px">'+escP(r.cliente||'')+'</td><td style="padding:6px 8px;color:var(--muted)">'+escP(r.note||'')+'</td><td style="padding:6px 8px"><div style="display:flex;gap:4px"><button class="entry-action-btn" onclick="modificaInventario('+r.id+')" title="Modifica">&#9998;</button><button class="entry-action-btn" onclick="eliminaInventario('+r.id+')" title="Elimina">&#128465;</button></div></td></tr>';
  });
  html+='</tbody></table>';el.innerHTML=html;
}
async function salvaInventarioCarico(){
  const tipo=(document.getElementById('inv-carico-tipo')||{}).value;
  const qty=parseInt((document.getElementById('inv-carico-qty')||{}).value)||0;
  const data=(document.getElementById('inv-carico-data')||{}).value||new Date().toISOString().split('T')[0];
  const nota=(document.getElementById('inv-carico-nota')||{}).value||'';
  if(!tipo){toast('Seleziona il tipo');return}
  if(!qty||qty<1){toast('Inserisci la quantit\u00e0');return}
  const rec={categoria:'buono',tipo:tipo,movimento:'entrata',quantita:qty,data_movimento:data,note:nota,operatore:getOperatore(),reparto_dip:currentReparto};
  try{const r=await secPost('inventario',rec);if(r&&r[0])inventarioCache.unshift(r[0]);
    document.getElementById('inv-carico-qty').value='';document.getElementById('inv-carico-nota').value='';
    const fp=document.getElementById('inv-carico-data');if(fp&&fp._flatpickr)fp._flatpickr.clear();
    logAzione('Inventario carico',qty+' '+tipo);renderInventario();toast(qty+' '+tipo+' caricati')}catch(e){toast('Errore: '+e.message)}
}
async function salvaInventarioUscita(){
  const cliente=capitalizzaNome((document.getElementById('inv-usc-cliente')||{}).value.trim());
  const tipo=(document.getElementById('inv-usc-tipo')||{}).value;
  const qty=parseInt((document.getElementById('inv-usc-qty')||{}).value)||0;
  const data=(document.getElementById('inv-usc-data')||{}).value||new Date().toISOString().split('T')[0];
  const nota=(document.getElementById('inv-usc-nota')||{}).value||'';
  if(!cliente){toast('Inserisci il cliente');return}
  if(!tipo){toast('Seleziona il tipo');return}
  if(!qty||qty<1){toast('Inserisci la quantit\u00e0');return}
  const rec={categoria:'buono',tipo:tipo,movimento:'preassegno',quantita:qty,cliente:cliente,data_movimento:data,note:nota,pareggiato:false,operatore:getOperatore(),reparto_dip:currentReparto};
  try{const r=await secPost('inventario',rec);if(r&&r[0])inventarioCache.unshift(r[0]);
    document.getElementById('inv-usc-cliente').value='';document.getElementById('inv-usc-qty').value='1';document.getElementById('inv-usc-nota').value='';
    const fp=document.getElementById('inv-usc-data');if(fp&&fp._flatpickr)fp._flatpickr.clear();
    logAzione('Inventario uscita',qty+' '+tipo+' a '+cliente);renderInventario();toast(qty+' '+tipo+' assegnati a '+cliente)}catch(e){toast('Errore: '+e.message)}
}
async function salvaInventarioSigEntrata(){
  const marca=capitalizzaNome((document.getElementById('inv-sig-marca')||{}).value.trim());
  const collab=(document.getElementById('inv-sig-collab')||{}).value.trim();
  const cliente=(document.getElementById('inv-sig-cliente')||{}).value.trim();
  const qty=parseInt((document.getElementById('inv-sig-qty')||{}).value)||1;
  const data=(document.getElementById('inv-sig-data')||{}).value||new Date().toISOString().split('T')[0];
  if(!marca){toast('Inserisci la marca');return}
  const rec={categoria:'sigaretta',tipo:marca,movimento:'entrata',quantita:qty,cliente:cliente||'',note:collab||'',data_movimento:data,operatore:getOperatore(),reparto_dip:currentReparto};
  try{const r=await secPost('inventario',rec);if(r&&r[0])inventarioCache.unshift(r[0]);
    document.getElementById('inv-sig-marca').value='';document.getElementById('inv-sig-collab').value='';document.getElementById('inv-sig-cliente').value='';
    logAzione('Inventario sigaretta',marca+' (sbagliata per '+cliente+')');renderInventario();toast(marca+' aggiunta alla scorta')}catch(e){toast('Errore: '+e.message)}
}
async function salvaInventarioSigUscita(){
  const marca=(document.getElementById('inv-sig-usc-marca')||{}).value;
  const cliente=(document.getElementById('inv-sig-usc-cliente')||{}).value.trim();
  const qty=parseInt((document.getElementById('inv-sig-usc-qty')||{}).value)||1;
  const data=(document.getElementById('inv-sig-usc-data')||{}).value||new Date().toISOString().split('T')[0];
  if(!marca){toast('Seleziona la marca');return}
  if(!cliente){toast('Inserisci il cliente');return}
  const rec={categoria:'sigaretta',tipo:marca,movimento:'uscita',quantita:qty,cliente:cliente,data_movimento:data,operatore:getOperatore(),reparto_dip:currentReparto};
  try{const r=await secPost('inventario',rec);if(r&&r[0])inventarioCache.unshift(r[0]);
    document.getElementById('inv-sig-usc-cliente').value='';
    logAzione('Inventario sigaretta',marca+' data a '+cliente);renderInventario();toast(marca+' data a '+cliente)}catch(e){toast('Errore: '+e.message)}
}
async function eliminaInventario(id){
  if(!confirm('Eliminare questo movimento?'))return;
  try{await secDel('inventario','id=eq.'+id);inventarioCache=inventarioCache.filter(r=>r.id!==id);
    logAzione('Inventario eliminato','ID '+id);renderInventario();toast('Movimento eliminato')}catch(e){toast('Errore eliminazione')}
}
function modificaInventario(id){
  const r=inventarioCache.find(x=>x.id===id);if(!r)return;
  const b=document.getElementById('pwd-modal-content');
  const isBuono=r.categoria==='buono';
  let html='<h3>Modifica movimento</h3>';
  if(isBuono){
    html+='<div class="pwd-field"><label>Tipo</label><select id="inv-edit-tipo" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option value="BU"'+(r.tipo==='BU'?' selected':'')+'>BU</option><option value="BL"'+(r.tipo==='BL'?' selected':'')+'>BL</option><option value="CG"'+(r.tipo==='CG'?' selected':'')+'>CG</option><option value="WL"'+(r.tipo==='WL'?' selected':'')+'>WL</option></select></div>';
  }else{
    html+='<div class="pwd-field"><label>Marca</label><input type="text" id="inv-edit-tipo" value="'+escP(r.tipo)+'" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  }
  html+='<div class="pwd-field"><label>Quantit\u00e0</label><input type="number" id="inv-edit-qty" value="'+r.quantita+'" min="1" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html+='<div class="pwd-field"><label>Cliente</label><input type="text" id="inv-edit-cliente" value="'+escP(r.cliente||'')+'" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html+='<div class="pwd-field"><label>Data</label><input type="text" id="inv-edit-data" value="'+(r.data_movimento?new Date(r.data_movimento+'T12:00:00').toLocaleDateString('it-IT'):'')+'" placeholder="GG/MM/AAAA" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html+='<div class="pwd-field"><label>Nota</label><input type="text" id="inv-edit-nota" value="'+escP(r.note||'')+'" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html+='<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaInventario('+id+')">Salva</button></div>';
  b.innerHTML=html;document.getElementById('pwd-modal').classList.remove('hidden');
  if(window.flatpickr)flatpickr('#inv-edit-data',{locale:'it',dateFormat:'d/m/Y',allowInput:true});
}
async function salvaModificaInventario(id){
  const tipo=(document.getElementById('inv-edit-tipo')||{}).value.trim();
  const qty=parseInt((document.getElementById('inv-edit-qty')||{}).value)||1;
  const cliente=(document.getElementById('inv-edit-cliente')||{}).value.trim();
  const dataRaw=(document.getElementById('inv-edit-data')||{}).value.trim();
  const nota=(document.getElementById('inv-edit-nota')||{}).value.trim();
  let dataISO='';
  if(dataRaw){const dm=dataRaw.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
    if(dm){const a=parseInt(dm[3]);dataISO=(a<100?2000+a:a)+'-'+dm[2].padStart(2,'0')+'-'+dm[1].padStart(2,'0')}
    else dataISO=dataRaw}
  const updates={tipo:tipo,quantita:qty,cliente:cliente,note:nota};
  if(dataISO)updates.data_movimento=dataISO;
  try{await secPatch('inventario','id=eq.'+id,updates);
    const c=inventarioCache.find(x=>x.id===id);if(c)Object.assign(c,updates);
    document.getElementById('pwd-modal').classList.add('hidden');
    logAzione('Inventario modificato',tipo+' qty='+qty);renderInventario();toast('Movimento modificato')}catch(e){toast('Errore modifica')}
}
function sincronizzaPareggioBuoni(){
  const inv=getInventarioReparto().filter(r=>r.categoria==='buono'&&r.movimento==='preassegno'&&!r.pareggiato);
  if(!inv.length)return;
  const maison=getMaisonReparto().filter(r=>r.tipo_buono);
  inv.forEach(async(pre)=>{
    const match=maison.find(m=>m.tipo_buono===pre.tipo&&m.nome.toLowerCase()===pre.cliente.toLowerCase()&&m.data_giornata>=pre.data_movimento);
    if(match){
      try{await secPatch('inventario','id=eq.'+pre.id,{pareggiato:true,pareggio_maison_id:match.id});
        pre.pareggiato=true;pre.pareggio_maison_id=match.id}catch(e){}
    }
  });
}
function _aggiornaMarche(){
  const sel=document.getElementById('inv-sig-usc-marca');if(!sel)return;
  const giacenze=calcolaGiacenzeSigarette();
  const brands=Object.entries(giacenze).filter(([k,v])=>v>0).sort((a,b)=>a[0].localeCompare(b[0]));
  sel.innerHTML='<option value="">Seleziona...</option>'+brands.map(([m,q])=>'<option value="'+escP(m)+'">'+escP(m)+' ('+q+')</option>').join('');
}
function initInventarioFP(){
  if(!window.flatpickr)return;
  const opts={locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false};
  ['inv-carico-data','inv-usc-data','inv-sig-data','inv-sig-usc-data'].forEach(id=>{
    const el=document.getElementById(id);if(el&&!el._flatpickr)flatpickr('#'+id,opts);
  });
  const fOpts=Object.assign({},opts,{onChange:function(){renderInventario()}});
  ['inv-b-filt-dal','inv-b-filt-al','inv-s-filt-dal','inv-s-filt-al'].forEach(id=>{
    const el=document.getElementById(id);if(el&&!el._flatpickr)flatpickr('#'+id,fOpts);
  });
}
function esportaInventarioCSV(){
  const isBuoni=_invTab==='buoni';
  const data=getInventarioReparto().filter(r=>r.categoria===(isBuoni?'buono':'sigaretta'));
  if(!data.length){toast('Nessun dato');return}
  const headers=isBuoni?['Data','Tipo','Quantit\u00e0','Movimento','Cliente','Stato','Nota']:['Data','Marca','Quantit\u00e0','Movimento','Cliente','Collaboratore'];
  const rows=data.map(r=>{
    const d=r.data_movimento?new Date(r.data_movimento+'T12:00:00').toLocaleDateString('it-IT'):'';
    if(isBuoni)return[d,r.tipo,(r.movimento==='entrata'?'+':'-')+r.quantita,r.movimento,r.cliente||'',r.pareggiato?'Pareggiato':(r.movimento==='preassegno'?'In attesa':''),r.note||''];
    return[d,r.tipo,(r.movimento==='entrata'?'+':'-')+r.quantita,r.movimento==='entrata'?'Sbagliata':'Data a cliente',r.cliente||'',r.note||''];
  });
  const csv=[headers,...rows].map(r=>r.map(c=>'"'+(c+'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inventario_'+(isBuoni?'buoni':'sigarette')+'_'+new Date().toISOString().split('T')[0]+'.csv';a.click();
}
function esportaInventarioPDF(){
  if(!window.jspdf){toast('Libreria PDF non caricata');return}
  const isBuoni=_invTab==='buoni';
  const data=getInventarioReparto().filter(r=>r.categoria===(isBuoni?'buono':'sigaretta'));
  if(!data.length){toast('Nessun dato');return}
  const jsPDF=window.jspdf.jsPDF;const doc=new jsPDF('landscape','mm','a4');
  doc.setFontSize(14);doc.setFont('helvetica','bold');
  doc.text('Inventario '+(isBuoni?'Buoni':'Sigarette')+' \u2014 '+currentReparto.charAt(0).toUpperCase()+currentReparto.slice(1),14,16);
  doc.setFontSize(9);doc.setFont('helvetica','normal');
  doc.text('Generato il '+new Date().toLocaleDateString('it-IT')+' alle '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),14,22);
  if(isBuoni){const giacenze=calcolaGiacenzaBuoni();doc.text('Giacenze: BU='+giacenze.BU+' | BL='+giacenze.BL+' | CG='+giacenze.CG+' | WL='+giacenze.WL,14,28)}
  const headers=isBuoni?[['Data','Tipo','Qty','Movimento','Cliente','Stato','Nota']]:[['Data','Marca','Qty','Movimento','Cliente','Collaboratore']];
  const rows=data.map(r=>{
    const d=r.data_movimento?new Date(r.data_movimento+'T12:00:00').toLocaleDateString('it-IT'):'';
    if(isBuoni)return[d,r.tipo,(r.movimento==='entrata'?'+':'-')+r.quantita,r.movimento,r.cliente||'',r.pareggiato?'Pareggiato':(r.movimento==='preassegno'?'In attesa':''),r.note||''];
    return[d,r.tipo,(r.movimento==='entrata'?'+':'-')+r.quantita,r.movimento==='entrata'?'Sbagliata':'Data a cliente',r.cliente||'',r.note||''];
  });
  doc.autoTable({head:headers,body:rows,startY:isBuoni?32:26,theme:'grid',styles:{fontSize:8,cellPadding:3,lineColor:[200,200,200]},headStyles:{fillColor:[44,62,80],textColor:255,fontStyle:'bold'},footStyles:{fillColor:[245,245,245],fontStyle:'bold'}});
  doc.save('inventario_'+(isBuoni?'buoni':'sigarette')+'_'+new Date().toISOString().split('T')[0]+'.pdf');
}

// MENU MOBILE
function toggleMobileNav(){document.getElementById('mobile-nav').classList.toggle('show')}
function chiudiMobileNav(){document.getElementById('mobile-nav').classList.remove('show')}
function aggiornaMenuMobile(){try{
  const items=document.getElementById('mobile-nav-items');if(!items)return;
  const tabs=[{page:'dashboard',icon:'&#127968;',label:'Home'},
    {page:'diario',icon:'&#128214;',label:'Diario'},
    {page:'rapporto',icon:'&#128197;',label:'Rapporto',vis:'rapporto'},
    {page:'note-collega',icon:'&#9993;&#65039;',label:'Note Colleghi',vis:'note_collega',badgeId:'note-badge'},
    {page:'statistiche',icon:'&#128202;',label:'Statistiche',vis:'statistiche'},
    {page:'moduli',icon:'&#128196;',label:'Moduli',vis:'moduli'},
    {page:'assistente',icon:'&#128113;&#8205;&#9792;&#65039;',label:'Assistente',vis:'assistente'},
    {page:'consegna',icon:'&#128221;',label:'Consegna',vis:'consegna',badgeId:'consegna-badge'},
    {page:'promemoria',icon:'&#128203;',label:'Promemoria',vis:'promemoria',badgeId:'promemoria-badge'},
    {page:'maison',icon:'&#127860;',label:'Maison',vis:'maison'},
    {page:'inventario',icon:'&#128230;',label:'Inventario',vis:'inventario'},
    {page:'registro',icon:'&#128203;',label:'Registro',adminOnly:true},
    {page:'impostazioni',icon:'&#9881;&#65039;',label:'Impostazioni'}];
  const cur=localStorage.getItem('pagina_corrente')||'dashboard';
  let html='';tabs.forEach(function(t){
    if(t.adminOnly&&!isAdmin())return;
    if(t.vis&&typeof isVis==='function'&&!isVis(t.vis))return;
    var badge=t.badgeId?document.getElementById(t.badgeId):null;
    var badgeHtml=badge&&badge.style.display!=='none'?'<span class="nav-badge">'+badge.textContent+'</span>':'';
    html+='<button class="mobile-nav-item'+(cur===t.page?' active':'')+'" onclick="switchPage(\''+t.page+'\');chiudiMobileNav()">'+t.icon+' '+t.label+badgeHtml+'</button>'});
  items.innerHTML=html;
  var curTab=tabs.find(function(t){return t.page===cur});
  var hBtn=document.getElementById('hamburger-btn');
  if(hBtn&&curTab)hBtn.innerHTML='&#9776; '+curTab.icon+' '+curTab.label;
  }catch(e){console.error('Menu mobile error:',e)}}

// INIT
window.addEventListener('load',async()=>{
  if(localStorage.getItem('tema')==='dark'){document.body.classList.add('dark-theme');document.getElementById('btn-tema').textContent='Tema chiaro'}// tema provvisorio, poi si applica quello dell'operatore
  document.getElementById('entries-list').innerHTML='<div class="loading">Caricamento...</div>';
  const h=document.getElementById('login-hint');const defCheck=await sbRpc('is_default_master_pwd',{p_default_hash:DEFAULT_PWD_HASH});
  if((defCheck&&defCheck.is_default)||operatoriAuthCache.length)h.innerHTML='Accedi come Admin oppure seleziona il tuo nome';
  // Carica mappa reparti e operatori da cache per il login
  if(!Object.keys(operatoriRepartoMap).length){try{const cached=localStorage.getItem('_cache_operatori_reparto');if(cached)operatoriRepartoMap=JSON.parse(cached)}catch(e){}}
  if(!operatoriAuthCache.length){try{const cached=localStorage.getItem('_cache_operatori_auth');if(cached)operatoriAuthCache=JSON.parse(cached)}catch(e){}}
  // Carica operatori dal DB per il login (leggero, senza loadAll)
  try{const _opLogin=await sbRpc('list_operators');if(_opLogin&&_opLogin.length){operatoriAuthCache=_opLogin;localStorage.setItem('_cache_operatori_auth',JSON.stringify(_opLogin))}}catch(e){}
  // Populate login dropdown
  aggiornaLoginOperatori();
  if(_isSessionValid()){
    // Se Face ID attivo e non gia verificato in questa tab (refresh): verifica PRIMA di entrare
    if(_hasBioForCurrentOp()&&!sessionStorage.getItem('bio_verified')){
      var bl=document.getElementById('biometric-login');if(bl){bl.style.display='block';var _bb=document.getElementById('bio-login-btn');if(_bb)_bb.textContent='\u{1F512} '+getBioName()}
      var bioOk=await loginBiometrico();
      if(bioOk){sessionStorage.setItem('bio_verified','1');sessionStorage.setItem('session_active','1')}
      else{document.getElementById('pwd-input').focus();
        var _sel=document.getElementById('login-nome');var _sop=localStorage.getItem('operatore_corrente');
        if(_sel&&_sop){for(var i=0;i<_sel.options.length;i++){if(_sel.options[i].value===_sop){_sel.selectedIndex=i;break}}}
        return}}
    document.getElementById('login-overlay').classList.add('hidden');applicaTemaOperatore();
    // Valida sessione admin se presente
    if(isAdmin()){const tk=getAdminToken();if(tk){const sv=await sbRpc('validate_admin_session',{p_token:tk});if(!sv||!sv.valid){sessionStorage.removeItem('is_admin');sessionStorage.removeItem('admin_token')}}else{sessionStorage.removeItem('is_admin')}}
    // Verifica/rinnova token sessione per caricare dati
    var _opTk=getOpToken();
    if(_opTk){var _vld=await sbRpc('validate_op_session',{p_token:_opTk});if(!_vld||!_vld.valid){sessionStorage.removeItem('op_token');_opTk=''}}
    if(!_opTk){var _ropN=getOperatore();if(_ropN){var _bioS=await sbRpc('create_bio_session',{p_nome:_ropN});if(_bioS&&_bioS.session_token)setOpToken(_bioS.session_token);
      else{var _bioS2=await sbRpc('create_bio_session',{p_nome:_ropN});if(_bioS2&&_bioS2.session_token)setOpToken(_bioS2.session_token)}}}
    await loadAll();
    // Se dati vuoti (possibile token scaduto/fallito), rinnova e riprova
    if(!datiCache.length&&getOperatore()){console.warn('Init: dati vuoti, rinnovo token...');if(await _renewToken())await loadAll()}
    _initNoteRealtime();applicaVisibilita();
    var _sp=localStorage.getItem('pagina_corrente');switchPage(_sp||'dashboard');
    _renderPostLogin();
    if(getOperatore()){document.getElementById('operatore-display').textContent='Operatore: '+getOperatore();
      const authCheck=await sbRpc('check_deve_cambiare',{p_nome:getOperatore()});
      if(authCheck&&authCheck.deve_cambiare_pwd)setTimeout(()=>forzaCambioPwdOperatore(getOperatore()),300);
      else{setTimeout(()=>mostraNoteNonLette(),800);setTimeout(()=>mostraPromemoriaLogin(),1500);setTimeout(()=>mostraConsegnaLogin(),2100)}
      if(isAdmin())document.getElementById('tab-registro').style.display='';
    }else if(isAdmin()){document.getElementById('operatore-display').textContent='Admin';document.getElementById('tab-registro').style.display=''}}
  else{
    // Face ID auto-trigger se QUALSIASI credenziale esiste (login screen)
    if(_hasBioForAnyOp()){
      // Imposta operatore_corrente dalla credenziale per far funzionare tentaBiometrico
      var _bioC=JSON.parse(localStorage.getItem('webauthn_cred'));
      localStorage.setItem('operatore_corrente',_bioC.op);
      var bl=document.getElementById('biometric-login');if(bl){bl.style.display='block';var _bb=document.getElementById('bio-login-btn');if(_bb)_bb.textContent='\u{1F512} '+getBioName()+' ('+_bioC.op+')'}
      setTimeout(()=>tentaBiometrico(),500)}
    else{
      // Pre-compila operatore se salvato
      var savedOp=localStorage.getItem('operatore_corrente');
      if(savedOp){var sel=document.getElementById('login-nome');if(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].value===savedOp){sel.selectedIndex=i;break}}}}
      document.getElementById('pwd-input').focus()}}
  const n=new Date();document.getElementById('today-date').innerHTML=n.getDate()+' '+MESI[n.getMonth()]+' '+n.getFullYear()+'<br><small style="color:var(--muted);font-size:.75rem">'+GIORNI[n.getDay()]+'</small>';
  // Render gia eseguito nel blocco login sopra (dopo loadAll)
  setTimeout(checkQrHash,1200);
  // Realtime note (con fallback a polling se Supabase JS non caricato)
  _initNoteRealtime();
  // Migra vecchi gruppi note al nuovo formato (una tantum)
  _migraNoteGruppi();
  // Menu mobile
  aggiornaMenuMobile();
  // Flatpickr date pickers
  if(window.flatpickr){const fpOpts={locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false,onChange:()=>render()};flatpickr('#filt-dal',fpOpts);flatpickr('#filt-al',fpOpts);const fpLog={locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false,onChange:()=>renderRegistro()};flatpickr('#log-filt-dal',fpLog);flatpickr('#log-filt-al',fpLog)}});
document.getElementById('pwd-modal').addEventListener('click',function(e){if(e.target===this){const c=document.getElementById('pwd-modal-content').innerHTML;if(c.includes('predefinita')||c.includes('Cambia la password')||c.includes('Password impostata')||c.includes('Reimpostata')||c.includes('Benvenuto')||c.includes('scegli una nuova'))return;this.classList.add('hidden')}});
document.getElementById('operatore-modal').addEventListener('click',function(e){if(e.target===this){const inp=document.getElementById('inp-operatore');if(inp&&inp.value.trim())confermaOperatore();else this.classList.add('hidden')}});
document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this)chiudiModal()});
document.getElementById('profilo-modal').addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden')});
document.getElementById('scadenza-modal').addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden')});
document.getElementById('note-modal').addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden')});
document.getElementById('inp-testo').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')salva()});
// Ctrl+Invio per note colleghi, consegne, promemoria
document.addEventListener('keydown',e=>{if(!e.ctrlKey||e.key!=='Enter')return;
  const id=e.target.id;if(id==='nota-msg')inviaNotaCollega();
  else if(id==='cons-messaggio')inviaConsegnaTurno();
  else if(id==='assist-input')assistenteGenera()});
// LOCK SCREEN: solo su PWA installata (mobile), non su browser desktop
var _isPWA=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;
document.addEventListener('visibilitychange',function(){
  if(document.hidden||!_isPWA)return;
  if(_isSessionValid()&&_hasBioForCurrentOp()){
    sessionStorage.removeItem('bio_verified');
    document.getElementById('login-overlay').classList.remove('hidden');
    document.documentElement.classList.remove('authed');
    var bl=document.getElementById('biometric-login');if(bl){bl.style.display='block';var _bb=document.getElementById('bio-login-btn');if(_bb)_bb.textContent='\u{1F512} '+getBioName()}
    setTimeout(function(){tentaBiometrico()},400)}});
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});
  navigator.serviceWorker.addEventListener('message',function(e){
    if(e.data&&e.data.action==='navigate'&&e.data.page)switchPage(e.data.page);
    if(e.data&&e.data.action==='push'&&e.data.data){var d=e.data.data;toast(d.titolo+(d.corpo?' — '+d.corpo:''))}})}
