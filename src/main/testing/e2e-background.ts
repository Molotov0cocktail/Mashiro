import type { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataRoot } from '../data/data-root.js'

/** Only called from the existing marker-validated, isolated test profile. */
export async function runBackgroundE2e(window: BrowserWindow, dataRoot: DataRoot) {
  if (dataRoot.profile !== 'test' || !dataRoot.resultsDirectory || !dataRoot.runId)
    throw Error('background-e2e-profile')
  const prior =
    dataRoot.phase === 'verify'
      ? (
          JSON.parse(readFileSync(join(dataRoot.resultsDirectory, 'seed.json'), 'utf8')) as {
            background: { assistantId: string; chapterId: string; memoryId: string }
          }
        ).background
      : null
  const result = (await window.webContents.executeJavaScript(
    `(async()=>{
    const checked=result=>{if(!result.ok)throw Error('background-'+result.error.code);return result.data};
    const waitFor=async(fn)=>{for(let n=0;n<400;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,25))}throw Error('background-ui-timeout')};
    const api=window.mashiro;
    const current=checked(await api.assistants.list());
    const assistantId=current.currentAssistantId;
    const base={protocolVersion:1,assistantId};
    const prior=${JSON.stringify(prior)};
    let snapshot=checked(await api.background.query(base));
    if(!prior){
      if(snapshot.configuration.enabled||snapshot.jobs.length)throw Error('background-default');
      const providers=checked(await api.provider.list());
      const binding=providers.bindings.find(b=>b.assistantId===assistantId);
      if(!binding)throw Error('background-binding');
      const permission=checked(await api.memory.permissions({...base,scope:'assistant'}));
      if(!permission.read||!permission.write||!permission.receive)throw Error('background-existing-memory-permission');
      checked(await api.background.configure({...base,expectedVersion:0,grantSelectedRecipient:true,settings:{enabled:true,connectionId:binding.connectionId,model:binding.model,allowOwnCompletedRounds:true,budget:{window:'utc-day',calls:1,inputCharacters:100000}}}));
      checked(await api.background.run(base));
      snapshot=await waitFor(async()=>{const s=checked(await api.background.query(base));return s.jobs.some(j=>j.state==='COMPLETED')?s:null});
    }
    const chapter=prior?snapshot.chapters.find(c=>c.id===prior.chapterId):snapshot.chapters[0];
    if(!chapter||chapter.state!=='AVAILABLE'||snapshot.usage.calls!==1)throw Error('background-accepted');
    if(prior&&(prior.assistantId!==assistantId||prior.memoryId!==chapter.memoryId))throw Error('background-restored-identity');
    const accepted=checked(await api.background.chapter({...base,chapterId:chapter.id,expectedVersion:chapter.version}));
    if(!accepted.markdown.includes('E2E_BACKGROUND_ACCEPTED'))throw Error('background-markdown');
    const tab=await waitFor(()=>[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent.trim()==='章节后台'));
    tab.click();
    const checkbox=await waitFor(()=>document.querySelector('input[aria-label="选择章节：E2E章节"]'));
    const card=checkbox.closest('article');
    const details=card.querySelector('details');
    if(!details||details.open)throw Error('background-details-default');
    details.open=true;
    const read=await waitFor(()=>[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='读取正文'&&!b.disabled));
    read.click();
    await waitFor(()=>card.querySelector('.chapter-markdown')?.textContent.includes('E2E_BACKGROUND_ACCEPTED'));
    checkbox.click();
    await new Promise(requestAnimationFrame);
    document.querySelector('.background-panel')?.scrollIntoView({block:'start'});
    return {assistantId,chapterId:chapter.id,memoryId:chapter.memoryId,chapterVersion:chapter.version,budgetCalls:snapshot.usage.calls,priorIdentityRestored:!!prior,bodyReadThroughDom:true};
  })()`,
    true
  )) as {
    assistantId: string
    chapterId: string
    memoryId: string
    chapterVersion: number
    budgetCalls: number
    priorIdentityRestored: boolean
    bodyReadThroughDom: boolean
  }
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}-background-ui.png`),
    (await window.webContents.capturePage()).toPNG(),
    { flag: 'wx' }
  )
  await window.webContents.executeJavaScript(
    "document.querySelector('.background-chapter')?.scrollIntoView({block:'start'})",
    false
  )
  await new Promise((resolve) => setTimeout(resolve, 100))
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}-background-chapter-ui.png`),
    (await window.webContents.capturePage()).toPNG(),
    { flag: 'wx' }
  )
  const contextSentThroughDom = (await window.webContents.executeJavaScript(
    `(async()=>{
    const waitFor=async(fn)=>{for(let n=0;n<400;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,25))}throw Error('background-context-timeout')};
    const use=await waitFor(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('在对话中使用已选章节（1）')&&!b.disabled));
    use.click();
    await waitFor(()=>document.querySelector('[aria-label="当前章节上下文"]'));
    if(${dataRoot.phase === 'verify'}){
      const input=await waitFor(()=>document.querySelector('.provider-panel textarea'));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'E2E_BACKGROUND_CONTEXT');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(requestAnimationFrame);
      const send=await waitFor(()=>[...document.querySelectorAll('.provider-panel button')].find(b=>b.textContent.trim()==='发送'&&!b.disabled));
      send.click();
      await waitFor(()=>document.querySelector('[aria-label="消息时间线"]')?.textContent.includes('E2E_BACKGROUND_CONTEXT_REPLY'));
      return true;
    }
    return false;
  })()`,
    true
  )) as boolean
  return { ...result, contextSelectedThroughDom: true, contextSentThroughDom }
}
