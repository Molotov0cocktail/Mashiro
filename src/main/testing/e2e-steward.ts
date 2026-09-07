import type { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataRoot } from '../data/data-root.js'

/** The caller already validated the owned synthetic test marker. */
export async function runStewardE2e(window: BrowserWindow, dataRoot: DataRoot) {
  if (dataRoot.profile !== 'test' || !dataRoot.resultsDirectory || !dataRoot.runId)
    throw Error('steward-e2e-profile')
  const prior =
    dataRoot.phase === 'verify'
      ? (
          JSON.parse(readFileSync(join(dataRoot.resultsDirectory, 'seed.json'), 'utf8')) as {
            steward: { assistantId: string; branchId: string; memoryId: string; commandId: string }
          }
        ).steward
      : null
  const result = (await window.webContents.executeJavaScript(
    `(async()=>{
    const checked=r=>{if(!r.ok)throw Error('steward-'+r.error.code);return r.data};
    const waitFor=async(fn)=>{for(let n=0;n<500;n++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,25))}throw Error('steward-ui-timeout')};
    const api=window.mashiro;
    const assistantId=checked(await api.assistants.list()).currentAssistantId;
    const base={protocolVersion:1,assistantId};
    const prior=${JSON.stringify(prior)};
    let s=checked(await api.steward.query(base));
    if(!prior){
      if(s.configuration.enabled||s.discovery.enabled||s.jobs.length)throw Error('steward-default');
      const binding=checked(await api.provider.list()).bindings.find(b=>b.assistantId===assistantId);
      const permission=checked(await api.memory.permissions({...base,scope:'global'}));
      if(!permission.read||!permission.write||!permission.receive)throw Error('steward-existing-permission');
      const common={enabled:true,connectionId:binding.connectionId,model:binding.model,budget:{window:'utc-day',calls:1,inputCharacters:100000}};
      const discovery={...common,allowOwnCompletedRounds:true};
      checked(await api.steward.configure({...base,role:'assistant',expectedVersion:s.discovery.version,grantSelectedRecipient:true,settings:discovery}));
      s=await waitFor(async()=>{const v=checked(await api.steward.query(base));return v.jobs.some(j=>j.role==='assistant'&&j.state==='COMPLETED')?v:null});
      const candidate=s.pending.find(p=>p.entryKind==='shared-candidate'&&p.state==='pending');
      if(!candidate)throw Error('steward-pending');
      const before=checked(await api.memory.query({...base,scope:'global',query:'E2E_STEWARD_ACCEPTED'}));
      if(before.records.length)throw Error('steward-pending-recalled');
      const settings={...common,assistantIds:[assistantId],allowAcceptedMemories:false,allowSharedCandidates:true,allowWrite:true,allowInferences:false};
      checked(await api.steward.configure({...base,role:'steward',expectedVersion:s.configuration.version,grantSelectedRecipient:true,settings}));
      s=await waitFor(async()=>{const v=checked(await api.steward.query(base));return v.jobs.some(j=>j.role==='steward'&&j.state==='COMPLETED')?v:null});
      checked(await api.steward.configure({...base,role:'assistant',expectedVersion:s.discovery.version,grantSelectedRecipient:false,settings:{...discovery,enabled:false}}));
      checked(await api.steward.configure({...base,role:'steward',expectedVersion:s.configuration.version,grantSelectedRecipient:false,settings:{...settings,enabled:false}}));
      s=checked(await api.steward.query(base));
    }
    const job=s.jobs.find(j=>j.role==='steward'&&j.state==='COMPLETED');
    const slot=job?.slots.find(slot=>slot.state==='COMPLETED');
    const branch=s.branches.find(branch=>branch.id===slot?.branchId);
    if(!slot||!branch||s.usage.calls!==1||s.discoveryUsage.calls!==1)throw Error('steward-receipts');
    if(prior&&(prior.assistantId!==assistantId||prior.branchId!==branch.id||prior.memoryId!==slot.memoryId||prior.commandId!==slot.commandId))throw Error('steward-restored-identity');
    const detail=checked(await api.steward.branch({...base,id:branch.id,expectedVersion:branch.version}));
    if(!detail.markdown.includes('E2E_STEWARD_ACCEPTED')||detail.members.length!==1||detail.members[0].id!==slot.memoryId)throw Error('steward-markdown');
    const inspect=checked(await api.memory.inspect({...base,id:slot.memoryId}));
    if(!inspect.changes.some(c=>c.actor==='steward'))throw Error('steward-provenance');
    const tab=await waitFor(()=>[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent.trim()==='资料整理'));
    tab.click();
    const card=await waitFor(()=>[...document.querySelectorAll('[aria-label="资料分支"] article')].find(a=>a.textContent.includes('E2E仓储分支')));
    const read=[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='读取分支');
    if(!read||read.disabled)throw Error('steward-read-button');
    read.click();
    await waitFor(()=>card.querySelector('.branch-detail')?.textContent.includes('E2E_STEWARD_ACCEPTED'));
    const sources=document.querySelector('[aria-label="全局待整理"] details');
    if(!sources||sources.open)throw Error('steward-source-default');
    card.scrollIntoView({block:'start'});
    return {assistantId,branchId:branch.id,branchVersion:branch.version,memoryId:slot.memoryId,memoryVersion:slot.memoryVersion,commandId:slot.commandId,discoveryBudgetCalls:s.discoveryUsage.calls,stewardBudgetCalls:s.usage.calls,bodyReadThroughDom:true,sourcesInitiallyCollapsed:true,priorIdentityRestored:!!prior};
  })()`,
    true
  )) as {
    assistantId: string
    branchId: string
    branchVersion: number
    memoryId: string
    memoryVersion: number
    commandId: string
    discoveryBudgetCalls: number
    stewardBudgetCalls: number
    bodyReadThroughDom: boolean
    sourcesInitiallyCollapsed: boolean
    priorIdentityRestored: boolean
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}-steward-ui.png`),
    (await window.webContents.capturePage()).toPNG(),
    { flag: 'wx' }
  )
  const governance =
    dataRoot.phase === 'verify'
      ? ((await window.webContents.executeJavaScript(
          `(async()=>{
      const checked=r=>{if(!r.ok)throw Error('steward-governance-'+r.error.code);return r.data};
      const before=${JSON.stringify(result)};
      const base={protocolVersion:1,assistantId:before.assistantId};
      const receipt=checked(await window.mashiro.memory.mutate({...base,commandId:crypto.randomUUID(),mutation:{
        action:'correct',targetId:before.memoryId,expectedVersion:before.memoryVersion,kind:'user',scope:'global',
        title:'E2E用户纠正',markdown:'E2E_STEWARD_USER_CORRECTED',nature:'user-statement',event:null
      }}));
      if(receipt.state!=='SUCCEEDED'||receipt.objectVersion!==before.memoryVersion+1)throw Error('steward-correction-receipt');
      const old=await window.mashiro.steward.branch({...base,id:before.branchId,expectedVersion:before.branchVersion});
      if(old.ok||old.error.code!=='STALE_WRITE')throw Error('steward-old-export-token');
      for(let n=0;n<400;n++){
        if(!document.querySelector('[aria-label="资料分支"]')?.textContent.includes('E2E_STEWARD_ACCEPTED'))
          return {oldExportRejected:true,cachedBodyCleared:true,correctedMemoryVersion:receipt.objectVersion};
        await new Promise(r=>setTimeout(r,25));
      }
      throw Error('steward-cached-body-lingered');
    })()`,
          true
        )) as {
          oldExportRejected: boolean
          cachedBodyCleared: boolean
          correctedMemoryVersion: number
        })
      : null
  return { ...result, governance }
}
