/**
 * Diario Collaboratori — Casino Lugano SA
 * File: chat-core.js
 * Righe originali: 186
 * Estratto automaticamente da index.html
 */
// SEZIONE 3: CHAT ENTERPRISE (schema normalizzato)
// Cache synthesis, helpers, wrapper operazioni
// ================================================================
// === ENTERPRISE CHAT: helpers di sintesi ===
// Decifra tutti i chat_messages cached
async function decryptChatMessagesCache(){
  for(const m of chatMessagesCache){
    if(m.messaggio&&m.messaggio.startsWith('ENC:')&&!m._decrypted){
      m.messaggio=await decryptNota(m.messaggio);
      m._decrypted=true;
    }
  }
}
// Helper: trova un chat_groups dato il suo id
function _chatGetGroupById(group_id){return chatGroupsCache.find(g=>g.id===group_id)}
// Helper: trova i membri di un gruppo
function _chatGetGroupMembers(group_id){return chatGroupMembersCache.filter(m=>m.group_id===group_id).map(m=>m.operatore)}
// Helper: ritorna il legacy gruppo_id se disponibile, altrimenti sintetizzato
function _chatGroupGid(group){if(!group)return null;return group.legacy_gid||('__chat_group_'+group.id)}
// Helper: trova chat_message per id
function _chatFindMsg(id){return chatMessagesCache.find(m=>m.id===id)}
// Helper: chi ha letto un messaggio
function _chatLetti(message_id){return chatLettiCache.filter(l=>l.message_id===message_id)}
// Helper: ha letto un operatore?
function _chatHasLetto(message_id,operatore){return chatLettiCache.some(l=>l.message_id===message_id&&l.operatore===operatore)}
// Helper: e' nascosto per un operatore?
function _chatIsHidden(message_id,operatore){return chatHiddenCache.some(h=>h.message_id===message_id&&h.operatore===operatore)}
// Trasforma un chat_message in 1 o N synthetic note_colleghi rows (per backward compat rendering)
function _chatToSyntheticNotes(m){
  const result=[];
  if(m.a_operatore){
    // 1-to-1
    const isHiddenMitt=_chatIsHidden(m.id,m.da_operatore);
    const isHiddenDest=_chatIsHidden(m.id,m.a_operatore);
    const lettoDest=_chatHasLetto(m.id,m.a_operatore);
    result.push({
      id:m.id,
      da_operatore:m.da_operatore,
      a_operatore:m.a_operatore,
      gruppo_id:null,
      messaggio:m.messaggio,
      letta:lettoDest,
      letta_at:lettoDest?(_chatLetti(m.id).find(l=>l.operatore===m.a_operatore)||{}).letta_at:null,
      nascosta_mitt:isHiddenMitt,
      nascosta_dest:isHiddenDest,
      reazioni:m.reazioni,
      importante:m.importante,
      urgente:m.urgente,
      created_at:m.created_at,
      updated_at:m.edited_at,
      _decrypted:!!m._decrypted,
      _chat_id:m.id,// id del chat_messages canonico
    });
  }else if(m.group_id){
    // Group: sintetizza N synthetic rows
    const group=_chatGetGroupById(m.group_id);
    if(!group)return result;
    const gid=_chatGroupGid(group);
    const members=_chatGetGroupMembers(m.group_id);
    const isHiddenMitt=_chatIsHidden(m.id,m.da_operatore);
    // Add 1 row per (member who is NOT the sender)
    for(const member of members){
      if(member===m.da_operatore)continue;// no self-row
      const letto=_chatHasLetto(m.id,member);
      const isHiddenForMember=_chatIsHidden(m.id,member);
      result.push({
        id:m.id,// stesso id canonico per tutte le sintesi
        da_operatore:m.da_operatore,
        a_operatore:member,
        gruppo_id:gid,
        messaggio:m.messaggio,
        letta:letto,
        letta_at:letto?(_chatLetti(m.id).find(l=>l.operatore===member)||{}).letta_at:null,
        nascosta_mitt:isHiddenMitt,
        nascosta_dest:isHiddenForMember,
        reazioni:m.reazioni,
        importante:m.importante,
        urgente:m.urgente,
        created_at:m.created_at,
        updated_at:m.edited_at,
        _decrypted:!!m._decrypted,
        _chat_id:m.id,
      });
    }
  }
  return result;
}
// Rigenera noteColleghiCache da chatMessagesCache (chiamato dopo loadAll e dopo realtime events)
function _chatBuildNoteCache(){
  const result=[];
  for(const m of chatMessagesCache){
    const syn=_chatToSyntheticNotes(m);
    result.push(...syn);
  }
  // Sort desc per created_at (come ordering REST originale)
  result.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  noteColleghiCache=result;
}
// === ENTERPRISE CHAT: WRAPPER OPERAZIONI ===
// Patch un chat_message - traduce campi legacy (letta, nascosta_*) in operazioni corrette
async function _chatPatchMessage(chatMessageId,updates){
  const tk=getOpToken();const op=getOperatore();
  const directUpdates={};
  for(const k in updates){
    const v=updates[k];
    if(k==='letta'&&v===true){
      // Marca come letto per l'operatore corrente (idempotent)
      try{await sbRpc('chat_mark_letta',{p_token:tk,p_message_id:chatMessageId})}catch(e){console.warn('chat_mark_letta:',e.message)}
      if(!chatLettiCache.some(l=>l.message_id===chatMessageId&&l.operatore===op)){
        chatLettiCache.push({message_id:chatMessageId,operatore:op,letta_at:new Date().toISOString()});
      }
    }else if((k==='nascosta_mitt'||k==='nascosta_dest')&&v===true){
      // Nascondi per operatore corrente (per nascosta_mitt si nasconde solo a chi lo ha inviato)
      try{await sbRpc('chat_hide_message',{p_token:tk,p_message_id:chatMessageId})}catch(e){console.warn('chat_hide_message:',e.message)}
      if(!chatHiddenCache.some(h=>h.message_id===chatMessageId&&h.operatore===op)){
        chatHiddenCache.push({message_id:chatMessageId,operatore:op,hidden_at:new Date().toISOString()});
      }
    }else if(k==='letta_at'||k==='updated_at'){
      // Skip - gestiti automaticamente
    }else{
      // Colonna reale su chat_messages
      directUpdates[k]=v;
    }
  }
  if(Object.keys(directUpdates).length>0){
    if('messaggio' in directUpdates){
      directUpdates.edited_at=new Date().toISOString();
    }
    try{await secPatch('chat_messages','id=eq.'+chatMessageId,directUpdates)}
    catch(e){console.error('chat_messages patch fallita:',e.message);throw e}
    const m=chatMessagesCache.find(x=>x.id===chatMessageId);
    if(m)Object.assign(m,directUpdates);
  }
  _chatBuildNoteCache();
}
// Elimina un chat_message dal DB e dalla cache (cascades a letti e hidden)
async function _chatDeleteMessage(chatMessageId){
  try{await secDel('chat_messages','id=eq.'+chatMessageId)}
  catch(e){console.error('chat_messages delete fallita:',e.message);throw e}
  chatMessagesCache=chatMessagesCache.filter(m=>m.id!==chatMessageId);
  chatLettiCache=chatLettiCache.filter(l=>l.message_id!==chatMessageId);
  chatHiddenCache=chatHiddenCache.filter(h=>h.message_id!==chatMessageId);
  _chatBuildNoteCache();
}
// Inserisce un nuovo chat_message (1-to-1 o gruppo) e aggiorna la cache
// Usa: opts = {da, partner: 'nome' | 'gruppo:gid', messaggioCifrato, urgente?, gruppoMembers?}
async function _chatInsertMessage(opts){
  const tk=getOpToken();
  const da=opts.da;
  const partner=opts.partner;
  const isGroup=partner.startsWith('gruppo:');
  const _batchTs=new Date().toISOString();
  const rec={da_operatore:da,messaggio:opts.messaggioCifrato,created_at:_batchTs};
  if(opts.urgente)rec.urgente=true;
  if(opts.importante)rec.importante=true;
  if(isGroup){
    const legacyGid=partner.replace('gruppo:','');
    let group=chatGroupsCache.find(g=>g.legacy_gid===legacyGid||String(g.id)===legacyGid);
    if(!group){
      let tipo='custom',nome=null;
      if(legacyGid==='__gruppo_slots'){tipo='slots';nome='Tutti Slots'}
      else if(legacyGid==='__gruppo_tavoli'){tipo='tavoli';nome='Tutti Tavoli'}
      else if(legacyGid==='__gruppo_tutti'){tipo='tutti';nome='Tutti'}
      else if(legacyGid.startsWith('__gruppo_custom_'))nome=_getGruppoNome(legacyGid)||'Gruppo personalizzato';
      const newGroupId=await sbRpc('chat_get_or_create_group',{p_token:tk,p_tipo:tipo,p_legacy_gid:legacyGid,p_nome:nome,p_members:opts.gruppoMembers||[da]});
      group={id:newGroupId,nome,tipo,legacy_gid:legacyGid,creato_da:da,created_at:_batchTs};
      chatGroupsCache.push(group);
      for(const m of (opts.gruppoMembers||[da])){
        if(!chatGroupMembersCache.some(x=>x.group_id===newGroupId&&x.operatore===m)){
          chatGroupMembersCache.push({group_id:newGroupId,operatore:m,joined_at:_batchTs});
        }
      }
    }
    rec.group_id=group.id;
  }else{
    rec.a_operatore=partner;
  }
  const r=await secPost('chat_messages',rec);
  const newMsg=r[0];
  newMsg.messaggio=opts.messaggioPlain||newMsg.messaggio;
  newMsg._decrypted=!!opts.messaggioPlain;
  chatMessagesCache.unshift(newMsg);
  _chatBuildNoteCache();
  return newMsg;
}
// ================================================================
