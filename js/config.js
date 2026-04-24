/**
 * Diario Collaboratori — Casino Lugano SA
 * File: config.js
 * Configurazione, costanti, variabili globali
 */
// ================================================================
// SEZIONE 1: CONFIGURAZIONE, COSTANTI, API KEYS
// Chiavi Supabase (offuscate), costanti app, tipi default, caches
// ================================================================
const _k='DiarioCL26',_a='IRArGgsoICV9Xw4gNAggXg0le0UNBzNHCiwKentdNDE3MSNWbSlLfDQKUj8AICoGSFIcKwkrBCk5FmF/NyAPOAU1KgUEfykjChchKXMpX2ArC1M0Hg4UNAFTKi8SKFtacQVbQS0KDEsaNRAFBH8pLxQQW1sqAHF8NDA5IwAgKQkBeD4kGDwDJnYBZnc3IAwkXQwABQR7LihVPS0IOQN2XTwkKUJHNXYJd1MmMQw6NgoWDkhwFSQZQ10uNQICQS8uAkIvCyIBakARACc+IAcTfA==',_u='LB0VAhpVbGNQUjwYFQgMBywtQl8oHhsDBQgtOhxFMRkAEAgcJmJRWQ==';function _d(e){const b=atob(e),r=[];for(let i=0;i<b.length;i++)r.push(String.fromCharCode(b.charCodeAt(i)^_k.charCodeAt(i%_k.length)));return r.join('')}
const SB_URL=_d(_u),SB_KEY=_d(_a);
const VAPID_PUBLIC_KEY='BLWf5mPlI4UySMKuPkj6O7nTxXbocOu8ggabz8Lit4MsgDuYHAkh49V4TH2dk8fuFu-gvDH1MYHSsdbNfIdPF_E';
const _ps='cVEDSllXIXQGAHZZAEULW3MuAQUgCFRDXgkmLQEBcVxTFFhbey4AAnYIUhZcCSF/A1NxDwNAUV4iLgoCdAsERw==';const PUSH_SECRET=_d(_ps);
function fmtCHF(n){if(!n&&n!==0)return'—';return parseFloat(n).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})}
const MESI=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MESI_FULL=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const GIORNI_SHORT=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const DEFAULT_PWD_HASH='7310db08dd56916e4ded25837db6cf4ff5005c958fb53e405a62fd10d2009cce';
const TIPI_DEFAULT=[{nome:'Attività',colore:'#1a4a7a'},{nome:'Richiesta',colore:'#2c6e49'},{nome:'Errore',colore:'#c0392b'},{nome:'Ammonimento Verbale',colore:'#7b2d8b'},{nome:'Malattia',colore:'#1a7a6d'},{nome:'Non Disponibilità',colore:'#5d6d7e'},{nome:'Nota',colore:'#8b6914'},{nome:'Altro',colore:'#8a7d6b'}];
let tipiPersonalizzati=[],coloriOverride={},tipoSelezionato='Attività',modalEntryId=null,modalTipoSel=null,datiCache=[],pinnedIds=new Set(),scadenzeCache=[],charts={},operatoriSalvati=[];
let rapportoMese=new Date().getMonth(),rapportoAnno=new Date().getFullYear(),rapportoGiornoAperto=null,rapportiCache={},noteColleghiCache=[],operatoriAuthCache=[];
// === ENTERPRISE CHAT SCHEMA CACHES ===
// Le 5 nuove tabelle chat_* sono la fonte di verita' per la chat.
// noteColleghiCache viene RIGENERATA da chatMessagesCache via _chatBuildNoteCache()
// per mantenere backward compat col rendering esistente (sintetizza N righe per gruppo).
let chatMessagesCache=[],chatGroupsCache=[],chatGroupMembersCache=[],chatLettiCache=[],chatHiddenCache=[];
// ================================================================
