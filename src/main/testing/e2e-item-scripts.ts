export const seedItemsScript = `
(async()=>{
  const snapshot=await window.mashiro.assistants.list()
  if(!snapshot.ok)throw Error('item-assistant')
  const assistantId=snapshot.data.currentAssistantId,api=window.mashiro.items,operations=[]
  for(const kind of ['goal','project','task','commitment','waiting']) {
    const commandId=crypto.randomUUID()
    const input={protocolVersion:1,assistantId,commandId,mutation:{action:'create',content:{kind,title:'E2E_ITEM_'+kind,description:'合成事项',status:'open',dueAt:null,timeZone:null,parentId:null,relatedIds:[],counterpart:''}}}
    const first=await api.mutate(input),again=await api.mutate(input)
    if(!first.ok||JSON.stringify(first)!==JSON.stringify(again))throw Error('item-identity')
    operations.push(first.data)
  }
  const query=await api.query({protocolVersion:1,assistantId,limit:100})
  if(!query.ok||query.data.formalCount!==5)throw Error('item-count')
  return {query:query.data,operations}
})()
`
export const restoreItemsScript = `
(async()=>{
  const snapshot=await window.mashiro.assistants.list()
  if(!snapshot.ok)throw Error('item-assistant')
  const assistantId=snapshot.data.currentAssistantId,api=window.mashiro.items
  const query=await api.query({protocolVersion:1,assistantId,limit:100})
  if(!query.ok||query.data.formalCount!==5)throw Error('item-restore-count')
  const operations=[]
  for(const item of [...query.data.items].reverse()) {
    const inspected=await api.inspect({protocolVersion:1,assistantId,type:'item',id:item.id})
    if(!inspected.ok||inspected.data.receipts.length!==1)throw Error('item-restore-receipt')
    const checked=await api.operation({protocolVersion:1,assistantId,commandId:inspected.data.receipts[0].operationId})
    if(!checked.ok||checked.data.state!=='SUCCEEDED')throw Error('item-operation')
    operations.push(checked.data)
  }
  return {query:query.data,operations}
})()
`
export const verifyItemsUiScript = `
(async()=>{
  let stage='input'; try {
  const waitFor=async(fn)=>{for(let i=0;i<400;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,25))}throw Error('item-ui-timeout')}
  const snapshot=await window.mashiro.assistants.list(),assistantId=snapshot.data.currentAssistantId
  const tab=[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent.trim()==='事项')
  if(!tab)throw Error('item-tab');tab.click()
  const input=await waitFor(()=>document.querySelector('.item-panel [aria-label="事项标题"]'))
  input.closest('details').open=true
  const title='E2E_ITEM_UI_'+crypto.randomUUID()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,title)
  input.dispatchEvent(new Event('input',{bubbles:true}))
  stage='button';
  const button=await waitFor(()=>[...document.querySelectorAll('.item-panel button')].find(el=>el.textContent.trim()==='创建正式事项'&&!el.disabled))
  button.click()
  stage='saved';
  const saved=await waitFor(async()=>{const r=await window.mashiro.items.query({protocolVersion:1,assistantId,query:title});return r.ok&&r.data.items.length===1?r.data:null})
  stage='receipt';
  const inspected=await window.mashiro.items.inspect({protocolVersion:1,assistantId,type:'item',id:saved.items[0].id})
  if(!inspected.ok||inspected.data.receipts.length!==1||saved.formalCount!==6)throw Error('item-ui-receipt')
  return {enteredViaDom:true,formalCount:saved.formalCount,receiptCount:inspected.data.receipts.length,objectVersion:saved.items[0].version}
  } catch { return { failureStage: stage } }
})()
`
