/**
 * Diario Collaboratori — Casino Lugano SA
 * File: stats.js
 * Righe originali: 82
 * Estratto automaticamente da index.html
 */
// SEZIONE 10: STATISTICHE E GRAFICI
// Chart.js, trend mensili, report PDF
// ================================================================
// STATISTICHE
function initStatsFlatpickr(){if(document.getElementById('stats-filt-dal')&&!document.getElementById('stats-filt-dal')._flatpickr&&window.flatpickr){const o={locale:'it',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',allowInput:false,onChange:()=>renderStatistiche()};flatpickr('#stats-filt-dal',o);flatpickr('#stats-filt-al',o)}}
function resetStatsFiltri(){['stats-filt-dal','stats-filt-al'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';if(el._flatpickr)el._flatpickr.clear()}});renderStatistiche()}
function renderStatistiche(){const _dsAll=getDatiReparto();
  const _sfDal=(document.getElementById('stats-filt-dal')||{}).value||'';
  const _sfAl=(document.getElementById('stats-filt-al')||{}).value||'';
  const _ds=_dsAll.filter(e=>{const d=(e.data||'').substring(0,10);if(_sfDal&&d<_sfDal)return false;if(_sfAl&&d>_sfAl)return false;return true});
  if(!_ds.length){document.getElementById('stats-summary').innerHTML='<p style="color:var(--muted);text-align:center;padding:40px">Nessun dato da analizzare</p>';
  ['chart-mesi','chart-tipi','chart-giorni','chart-collab'].forEach(function(id){if(charts[id]){charts[id].destroy();delete charts[id]}});return}
  // Summary with month-over-month trends
  const nCollab=new Set(_ds.map(e=>e.nome)).size;const nErr=_ds.filter(e=>e.tipo===nomeCorrente('Errore')).length;const totImp=_ds.reduce((s,e)=>s+(parseFloat(e.importo)||0),0);
  const _nMalStat=_contaTotaleMalattie(_ds,nomeCorrente('Malattia'));
  // Trend: current month vs previous month
  const _tNow=new Date(),_tCurrM=_tNow.getFullYear()+'-'+String(_tNow.getMonth()+1).padStart(2,'0');
  const _tPrevD=new Date(_tNow.getFullYear(),_tNow.getMonth()-1,1);const _tPrevM=_tPrevD.getFullYear()+'-'+String(_tPrevD.getMonth()+1).padStart(2,'0');
  const _tPrevName=MESI[_tPrevD.getMonth()].toLowerCase();
  const _errCurr=_dsAll.filter(e=>e.tipo===nomeCorrente('Errore')&&(e.data||'').startsWith(_tCurrM)).length;
  const _errPrev=_dsAll.filter(e=>e.tipo===nomeCorrente('Errore')&&(e.data||'').startsWith(_tPrevM)).length;
  const _malCurr=_contaTotaleMalattie(_dsAll.filter(e=>(e.data||'').startsWith(_tCurrM)),nomeCorrente('Malattia'));
  const _malPrev=_contaTotaleMalattie(_dsAll.filter(e=>(e.data||'').startsWith(_tPrevM)),nomeCorrente('Malattia'));
  function _trendBadge(curr,prev,label){const d=curr-prev;if(d===0)return'';const col=d>0?'var(--accent)':'#2c6e49';const sign=d>0?'+':'';return' <span style="font-size:.72rem;font-weight:600;color:'+col+';background:'+col+'15;padding:1px 6px;border-radius:8px">'+sign+d+' vs '+label+'</span>'}
  document.getElementById('stats-summary').innerHTML='<div class="stats-bar" style="margin-bottom:0"><div class="stat"><div class="stat-num">'+_ds.length+'</div><div class="stat-label">Registrazioni totali</div></div><div class="stat"><div class="stat-num blue">'+nCollab+'</div><div class="stat-label">Collaboratori</div></div><div class="stat"><div class="stat-num red">'+nErr+'</div><div class="stat-label">'+nomeCorrente('Errore')+_trendBadge(_errCurr,_errPrev,_tPrevName)+'</div></div><div class="stat"><div class="stat-num teal">'+_nMalStat+'</div><div class="stat-label">'+nomeCorrente('Malattia')+' (giorni)'+_trendBadge(_malCurr,_malPrev,_tPrevName)+'</div></div><div class="stat"><div class="stat-num gold">'+(totImp?fmtCHF(totImp):'0')+'</div><div class="stat-label">Importo totale</div></div></div>';
  // Grafico mensile (full width, primo)
  const tipiCount={};_ds.forEach(e=>{tipiCount[e.tipo]=(tipiCount[e.tipo]||0)+1});
  const tl=Object.keys(tipiCount).sort((a,b)=>tipiCount[b]-tipiCount[a]);
  const now=new Date(),ml=[],md=[],me=[];for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);ml.push(MESI[d.getMonth()]+' '+d.getFullYear());md.push(_ds.filter(e=>{const ed=new Date(e.data);return ed.getMonth()===d.getMonth()&&ed.getFullYear()===d.getFullYear()}).length);me.push(_ds.filter(e=>{const ed=new Date(e.data);return e.tipo===nomeCorrente('Errore')&&ed.getMonth()===d.getMonth()&&ed.getFullYear()===d.getFullYear()}).length)}
  renderChart('chart-mesi','bar',{labels:ml,datasets:[{label:'Tutte le registrazioni',data:md,backgroundColor:'rgba(26,74,122,0.7)',borderRadius:4},{label:'Di cui errori',data:me,backgroundColor:'rgba(192,57,43,0.7)',borderRadius:4}]},{plugins:{legend:{position:'top',labels:{font:{size:13},padding:16}}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,font:{size:12}}},x:{ticks:{font:{size:11}}}}});
  // Doughnut tipi
  renderChart('chart-tipi','doughnut',{labels:tl.map(t=>t+' ('+tipiCount[t]+')'),datasets:[{data:tl.map(t=>tipiCount[t]),backgroundColor:tl.map(t=>getColore(t)),borderWidth:2,borderColor:'white'}]},{plugins:{legend:{position:'bottom',labels:{font:{size:12},padding:12,usePointStyle:true}}}});
  // Giorni settimana
  const gc=[0,0,0,0,0,0,0];_ds.forEach(e=>{gc[new Date(e.data).getDay()]++});const go=[1,2,3,4,5,6,0];
  renderChart('chart-giorni','bar',{labels:go.map(i=>GIORNI[i]),datasets:[{label:'Eventi',data:go.map(i=>gc[i]),backgroundColor:go.map(i=>i===0||i===6?'rgba(192,57,43,0.7)':'rgba(44,110,73,0.7)'),borderRadius:4}]},{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,font:{size:12}}},x:{ticks:{font:{size:12}}}}});
  // Top collaboratori
  const cc={};_ds.forEach(e=>{cc[e.nome]=(cc[e.nome]||0)+1});const cs=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,15);
  renderChart('chart-collab','bar',{labels:cs.map(c=>c[0]),datasets:[{label:'Registrazioni',data:cs.map(c=>c[1]),backgroundColor:'rgba(139,105,20,0.7)',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1,font:{size:12}}},y:{ticks:{font:{size:13}}}}});
  const _tipoMalStat=nomeCorrente('Malattia');
  const tutti=getTuttiTipi(),cd={};_ds.forEach(e=>{if(!cd[e.nome])cd[e.nome]={tot:0};cd[e.nome].tot++;
    if(e.tipo===_tipoMalStat){cd[e.nome][e.tipo]=(cd[e.nome][e.tipo]||0)+_contaGiorniMalattia(e)}
    else{cd[e.nome][e.tipo]=(cd[e.nome][e.tipo]||0)+1}});
  const cr=Object.entries(cd).sort((a,b)=>b[1].tot-a[1].tot),tp=tutti.filter(t=>_ds.some(e=>e.tipo===t.nome));
  let th='<table class="collab-table"><thead><tr><th>Collaboratore</th><th class="num">Tot</th>'+tp.map(t=>'<th class="num">'+t.nome+'</th>').join('')+'</tr></thead><tbody>';
  cr.forEach(([n,d])=>{const ne=n.replace(/'/g,"\\'");th+='<tr><td><span class="entry-name" onclick="apriSchedaCollaboratore(\''+ne+'\')"><strong>'+escP(n)+'</strong></span></td><td class="num"><strong>'+d.tot+'</strong></td>'+tp.map(t=>{const v=d[t.nome]||0;return'<td class="num">'+(v?'<span class="mini-badge" style="background:'+t.colore+'">'+v+'</span>':'-')+'</td>'}).join('')+'</tr>'});
  const totGen=cr.reduce((s,c)=>s+c[1].tot,0);th+='<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td class="num"><strong>'+totGen+'</strong></td>'+tp.map(t=>{const v=cr.reduce((s,c)=>s+(c[1][t.nome]||0),0);return'<td class="num"><strong>'+(v?'<span class="mini-badge" style="background:'+t.colore+'">'+v+'</span>':'-')+'</strong></td>'}).join('')+'</tr>';
  th+='</tbody></table>';document.getElementById('collab-table-wrap').innerHTML=th;
  // Tabella errori con importi e reparto
  const errori=_ds.filter(e=>e.tipo===nomeCorrente('Errore'));const errMap={};
  errori.forEach(e=>{if(!errMap[e.nome])errMap[e.nome]={count:0,totCHF:0,totEUR:0,reparti:{}};errMap[e.nome].count++;const imp=parseFloat(e.importo)||0;if(imp){if(e.valuta==='EUR')errMap[e.nome].totEUR+=imp;else errMap[e.nome].totCHF+=imp}const rep=e.reparto||'N/D';errMap[e.nome].reparti[rep]=(errMap[e.nome].reparti[rep]||0)+1});
  const errSorted=Object.entries(errMap).sort((a,b)=>b[1].count-a[1].count);
  if(errSorted.length){let et='<table class="collab-table"><thead><tr><th>Collaboratore</th><th class="num">N. Errori</th><th>Reparti</th><th class="num">Totale CHF</th><th class="num">Totale EUR</th></tr></thead><tbody>';
    let gCHF=0,gEUR=0,gCount=0;
    errSorted.forEach(([n,d])=>{gCHF+=d.totCHF;gEUR+=d.totEUR;gCount+=d.count;
      const reps=Object.entries(d.reparti).map(([r,c])=>'<span class="mini-badge" style="background:var(--muted)">'+r+': '+c+'</span>').join(' ');
      const ne=n.replace(/'/g,"\\'");et+='<tr><td><span class="entry-name" onclick="apriSchedaCollaboratore(\''+ne+'\')"><strong>'+escP(n)+'</strong></span></td><td class="num"><span class="mini-badge" style="background:var(--accent)">'+d.count+'</span></td><td>'+reps+'</td><td class="num">'+(d.totCHF?fmtCHF(d.totCHF):'-')+'</td><td class="num">'+(d.totEUR?d.totEUR.toFixed(2):'-')+'</td></tr>'});
    et+='<tr style="border-top:2px solid var(--ink)"><td><strong>TOTALE</strong></td><td class="num"><strong>'+gCount+'</strong></td><td></td><td class="num"><strong>'+(gCHF?fmtCHF(gCHF)+' CHF':'-')+'</strong></td><td class="num"><strong>'+(gEUR?gEUR.toFixed(2)+' EUR':'-')+'</strong></td></tr>';
    et+='</tbody></table>';document.getElementById('errori-table-wrap').innerHTML=et}
  else document.getElementById('errori-table-wrap').innerHTML='<p style="color:var(--muted)">Nessun errore registrato</p>'}
function renderChart(id,type,data,opts){if(charts[id])charts[id].destroy();charts[id]=new Chart(document.getElementById(id),{type,data,options:Object.assign({responsive:true,maintainAspectRatio:true,animation:{duration:600}},opts||{})})}

// EXPORT CSV
function esportaCSV(){const f=getFiltrati();if(!f.length){toast('Nessun dato');return}const rows=[['Data','Ora','Collaboratore','Tipo','Reparto','Descrizione','Importo','Valuta','Operatore']];f.forEach(e=>{const d=new Date(e.data);rows.push([d.toLocaleDateString('it-IT'),d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),e.nome,e.tipo,e.reparto||'','"'+e.testo.replace(/"/g,'""').replace(/\n/g,' ')+'"',e.importo||'',e.valuta||'',e.operatore||''])});
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.join(';')).join('\n')],{type:'text/csv;charset=utf-8'});Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'diario_'+new Date().toLocaleDateString('it-IT').replace(/\//g,'-')+'.csv'}).click();toast('CSV esportato!')}

// EXPORT PDF
async function caricaJsPDF(){if(window.jspdf)return true;
  try{await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.integrity='sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';s.crossOrigin='anonymous';s.onload=ok;s.onerror=ko;document.head.appendChild(s)});
  await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js';s.integrity='sha384-Xl/CUCfJbzsngMp0CFxkmF0VW/8C160IsGujqeQlIhaGxKz2+JsIGORFqtCPeldF';s.crossOrigin='anonymous';s.onload=ok;s.onerror=ko;document.head.appendChild(s)});return true}catch(e){return false}}
async function esportaPDF(){const f=getFiltrati();if(!f.length){toast('Nessun dato');return}
  if(!window.jspdf){toast('Caricamento PDF...');if(!await caricaJsPDF()){toast('Errore caricamento libreria PDF');return}}
  try{const{jsPDF}=window.jspdf;const doc=new jsPDF('landscape','mm','a4');
  doc.setFontSize(16);doc.setFont('helvetica','bold');doc.text('Diario Collaboratori - Casino Lugano SA',14,15);
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(120);doc.text('Generato il '+new Date().toLocaleDateString('it-IT')+' - '+f.length+' registrazioni',14,21);doc.setTextColor(0);
  doc.autoTable({theme:'grid',startY:26,head:[['Data','Ora','Collaboratore','Tipo','Reparto','Descrizione','Importo']],body:f.map(e=>{const d=new Date(e.data);return[d.toLocaleDateString('it-IT'),d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),e.nome,e.tipo,e.reparto||'',e.testo.replace(/\n/g,' '),e.importo?(fmtCHF(e.importo)+' '+(e.valuta||'CHF')):'']}),
    styles:{lineColor:[220,215,205],lineWidth:0.15,fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[26,18,8],textColor:[250,247,242],fontStyle:'bold'},columnStyles:{0:{cellWidth:22},1:{cellWidth:15},2:{cellWidth:30},3:{cellWidth:25},4:{cellWidth:18},5:{cellWidth:'auto'},6:{cellWidth:22}},alternateRowStyles:{fillColor:[250,247,242]},
    didParseCell:function(d){if(d.section==='body'&&d.column.index===3){var c=getColore(d.cell.raw);if(c){var r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);d.cell.styles.textColor=[r,g,b]}d.cell.styles.fontStyle='bold'}},
    margin:{top:26,left:14,right:14},didDrawPage:function(){doc.setFontSize(7);doc.setTextColor(150);doc.text('Casino Lugano SA - Pag. '+doc.internal.getNumberOfPages(),14,doc.internal.pageSize.height-8)}});
  mostraPdfPreview(doc,'diario_'+new Date().toLocaleDateString('it-IT').replace(/\//g,'-')+'.pdf','Diario Collaboratori')}catch(e){console.error('PDF error:',e);toast('Errore generazione PDF: '+e.message)}}

// ========================
// ================================================================
