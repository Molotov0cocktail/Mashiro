function profileUiScript(edit: boolean): string {
  return `
(async()=>{
 let profilePhase='initial';
 const diagnostics={};
 try {
 const waitFor=async(fn)=>{for(let n=0;n<400;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,25))}throw Error('profile-ui-timeout')}
 const label=(name)=>document.querySelector('[aria-label="'+name+'"]')
 const settings=document.querySelector('.assistant-settings');if(settings)settings.open=true
 const card=await waitFor(()=>label('助手配置：雪'))
 const cardLabel=(name)=>card.querySelector('[aria-label="'+name+'"]')
 const details=card.querySelector('details')
 if(!details)throw Error('profile-details')
 details.open=true
 const textarea=await waitFor(()=>cardLabel('人设 雪'))
 if(textarea.value!==(${edit}?'E2E_PROFILE_BEFORE':'E2E_PROFILE')||!cardLabel(${edit}?'选择新叶形象':'选择月光形象')?.checked)throw Error('profile-restored-value')
 profilePhase='before-save';
 const before=await window.mashiro.assistants.list()
 if(!before.ok)throw Error('profile-before')
 diagnostics.beforeRevision=before.data.stateRevision;
 diagnostics.beforeVersion=before.data.assistants.find(a=>a.id===before.data.currentAssistantId)?.version;
 if(${edit}){
   profilePhase='edit';
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,'E2E_PROFILE')
   textarea.dispatchEvent(new Event('input',{bubbles:true}))
   await new Promise(requestAnimationFrame)
   cardLabel('选择月光形象').click()
   await new Promise(requestAnimationFrame)
   const save=await waitFor(()=>[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存基础配置'&&!b.disabled))
   profilePhase='save';
   diagnostics.saveConnected=save.isConnected; diagnostics.personaDraftChanged=textarea.value==='E2E_PROFILE'; diagnostics.avatarDraftChanged=cardLabel('选择月光形象').checked;
   save.click()
   await waitFor(async()=>{const s=await window.mashiro.assistants.list();return s.ok&&s.data.stateRevision===before.data.stateRevision+1})
 }
 profilePhase='saved-values';
 const snapshot=await window.mashiro.assistants.list()
 if(!snapshot.ok)throw Error('profile-after')
 const current=snapshot.data.assistants.find(a=>a.id===snapshot.data.currentAssistantId)
 if(current.persona!=='E2E_PROFILE'||current.avatarKey!=='moon')throw Error('profile-save')
 await waitFor(()=>cardLabel('雪的内置形象：月光'))
 const navigationTargets=[]
 for(const [text,id] of [['打开Provider 与模型','provider-connection-settings'],['打开对话历史授权','history-permissions'],['打开记忆与个人事件授权','memory-permissions'],['打开事项授权','item-permissions']]){
   profilePhase='navigation-'+id;
   const button=await waitFor(()=>[...card.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.disabled))
   button.click()
   const target=await waitFor(()=>{const t=document.getElementById(id);if(!t||t.closest('[hidden]'))return null;const focused=document.activeElement===t||t.contains(document.activeElement);const expanded=!(t instanceof HTMLDetailsElement)||t.open;return focused&&expanded?t:null})
   if(id==='provider-connection-settings' && (!document.querySelector('.provider-panel').textContent.includes('GLM-5.3-FLASH')||!document.querySelector('.provider-panel').textContent.includes('open.bigmodel.cn')))throw Error('profile-recipient')
   navigationTargets.push(id)
 }
 profilePhase='chat-avatar';
 const providerButton=await waitFor(()=>[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='打开Provider 与模型'&&!b.disabled))
 providerButton.click()
 await waitFor(()=>{const target=document.getElementById('provider-connection-settings');return target&&!target.closest('[hidden]')?target:null})
 const chatButton=await waitFor(()=>document.querySelector('button[aria-label="对话"]'))
 chatButton.click()
 await waitFor(()=>{const avatar=label('雪的聊天形象：月光');return avatar&&!avatar.closest('[hidden]')?avatar:null})
 return {assistant:snapshot.data,profileUi:{editedViaDom:${edit},restoredViaDom:!${edit},navigationTargets,persona:current.persona,avatarKey:current.avatarKey}}
 } catch(error) {
   const code=error instanceof Error && /^profile-[a-z-]+$/.test(error.message)?error.message:'profile-script-error';
   const text=document.querySelector('.assistant-panel')?.textContent??'';
   diagnostics.staleWriteNotice=text.includes('配置已在别处更新');
   diagnostics.unconfirmedNotice=text.includes('配置保存结果未确认');
   diagnostics.savedNotice=text.includes('已保存 雪 的基础配置');
   const current=await window.mashiro.assistants.list();
   diagnostics.afterRevision=current.ok?current.data.stateRevision:null;
   diagnostics.afterVersion=current.ok?current.data.assistants.find(a=>a.id===current.data.currentAssistantId)?.version:null;
   return {profileFailure:{phase:profilePhase,code,diagnostics}};
 }
})()
`
}
export const seedProfileUiScript = profileUiScript(true)
export const verifyProfileUiScript = profileUiScript(false)
