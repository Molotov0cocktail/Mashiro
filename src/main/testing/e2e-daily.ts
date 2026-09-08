import type { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataRoot } from '../data/data-root.js'

type DailyEvidence = {
  assistantId: string
  configurationId: string
  configurationVersion: number
  jobId: string
  jobVersion: number
  reportId: string
  reportVersion: number
  governanceVersion: number
  observationId: string
  observationVersion: number
  memoryId: string
  memoryVersion: number
  sourceMemoryIds: string[]
  budgetCalls: number
  budgetInputCharacters: number
  configuredThroughDom: boolean
  bodyReadThroughDom: boolean
  sourcesInitiallyCollapsed: boolean
  inferenceAcceptedThroughDom: boolean
  priorIdentityRestored: boolean
  capture: {
    innerHeight: number
    rects: { top: number; bottom: number }[]
  }
}

/** Only called from the existing marker-validated, isolated Electron test profile. */
export async function runDailyE2e(
  window: BrowserWindow,
  dataRoot: DataRoot
): Promise<DailyEvidence> {
  if (dataRoot.profile !== 'test' || !dataRoot.resultsDirectory || !dataRoot.runId)
    throw Error('daily-e2e-profile')
  const prior =
    dataRoot.phase === 'verify'
      ? (
          JSON.parse(readFileSync(join(dataRoot.resultsDirectory, 'seed.json'), 'utf8')) as {
            daily: DailyEvidence
          }
        ).daily
      : null
  let result: DailyEvidence
  try {
    result = (await window.webContents.executeJavaScript(
      `(async()=>{
    const checked=result=>{if(!result.ok)throw Error('daily-'+result.error.code);return result.data};
    const waitFor=async(stage,fn)=>{for(let n=0;n<600;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,25))}throw Error('daily-ui-timeout-'+stage)};
    const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const api=window.mashiro;
    const assistant=checked(await api.assistants.list());
    const assistantId=assistant.currentAssistantId;
    const base={protocolVersion:1,assistantId};
    const prior=${JSON.stringify(prior)};
    const dailyArea=await waitFor('daily-area',()=>document.querySelector('button[aria-label="自动工作"]'));
    dailyArea.click();
    const dailyPage=await waitFor('daily-page',()=>[...document.querySelectorAll('[aria-label="自动工作与运行"] button')].find(element=>element.textContent.trim()==='日常计划'));
    dailyPage.click();
    const panel=await waitFor('daily-panel',()=>{const value=document.querySelector('.daily-panel');return value&&!value.closest('[hidden]')?value:null});
    const observationTab=await waitFor('observation-tab',()=>[...panel.querySelectorAll('[aria-label="日常工作类别"] [role="tab"]')].find(element=>element.textContent.trim()==='日常观察'));
    observationTab.click();
    await nextFrame();
    let sourceMemoryIds=[];
    let configuredThroughDom=false;
    if(!prior){
      const initial=checked(await api.daily.query({...base,view:'configurations',feature:'observation'}));
      if(initial.configurations.length!==1||initial.configurations[0].enabled)throw Error('daily-default-enabled');
      if(checked(await api.daily.query({...base,view:'jobs',feature:'observation'})).jobs.length)throw Error('daily-default-job');
      const now=Date.now();
      for(const [index,hoursAgo] of [2,1].entries()){
        const receipt=checked(await api.memory.mutate({...base,commandId:crypto.randomUUID(),mutation:{
          action:'remember',targetId:null,expectedVersion:null,kind:'event',scope:'global',
          title:'E2E日常事件'+(index+1),markdown:'E2E_DAILY_EVENT_'+(index+1)+'：独立合成事件已发生。',nature:'user-statement',
          event:{status:'reported-happened',occurredAt:new Date(now-hoursAgo*3600000).toISOString(),timeZone:'UTC'}
        }}));
        if(receipt.state!=='SUCCEEDED')throw Error('daily-source-receipt');
        sourceMemoryIds.push(receipt.objectId);
      }
      const binding=checked(await api.provider.list()).bindings.find(value=>value.assistantId===assistantId);
      if(!binding)throw Error('daily-binding');
      const config=await waitFor('configuration',()=>panel.querySelector('details.daily-config'));
      config.open=true;
      const label=text=>[...config.querySelectorAll('label')].find(element=>element.textContent.includes(text));
      const checkbox=async(text,value=true)=>{
        const input=label(text)?.querySelector('input[type="checkbox"]');
        if(!input)throw Error('daily-checkbox-'+text);
        if(input.checked!==value)input.click();
        await nextFrame();
      };
      const setValue=async(element,value)=>{
        const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,String(value));
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
        await nextFrame();
      };
      await checkbox('启用此类自动运行');
      const connection=label('模型连接')?.querySelector('select');
      const model=label('模型名称')?.querySelector('input');
      if(!connection||!model)throw Error('daily-recipient-fields');
      await setValue(connection,binding.connectionId);
      await setValue(model,binding.model);
      await checkbox('授权当前所选实际接收方');
      await checkbox('本助手对话',false);
      await checkbox('全局记忆');
      await checkbox('事件');
      await checkbox('按本地时间自动运行');
      const scheduleAt=new Date(Date.now()+2*3600000);
      const localTime=[scheduleAt.getHours(),scheduleAt.getMinutes()].map(value=>String(value).padStart(2,'0')).join(':');
      const localTimeInput=label('本地时间')?.querySelector('input');
      if(!localTimeInput)throw Error('daily-local-time-field');
      await setValue(localTimeInput,localTime);
      const recovery=label('错过运行')?.querySelector('select');
      if(!recovery)throw Error('daily-recovery-field');
      await setValue(recovery,'EXPLICIT');
      await checkbox('允许用户确认后保存观察');
      await checkbox('设置每日预算');
      const save=await waitFor('save-button',()=>[...config.querySelectorAll('button')].find(button=>button.textContent.trim()==='保存配置'&&!button.disabled));
      save.click();
      const configured=await waitFor('configuration-saved',async()=>{
        const value=checked(await api.daily.query({...base,view:'configurations',feature:'observation'})).configurations[0];
        return value.enabled&&value.authorizedRecipient&&value.dataScope.globalMemories&&value.dataScope.events&&value.schedule&&value.budget?value:null;
      });
      if(configured.connectionId!==binding.connectionId||configured.model!==binding.model||configured.allowSaveObservations!==true||configured.budget.calls!==5||configured.budget.maxOutputTokens!==1200)throw Error('daily-dom-configuration');
      configuredThroughDom=true;
      const run=await waitFor('run-button',()=>[...panel.querySelectorAll('[aria-label="日常观察运行"] button')].find(button=>button.textContent.trim()==='立即运行'&&!button.disabled));
      run.click();
      await waitFor('job-settled',async()=>{
        const jobs=checked(await api.daily.query({...base,view:'jobs',feature:'observation'})).jobs;
        const value=jobs[0];
        if(value&&!['QUEUED','RUNNING'].includes(value.state)){
          if(value.state!=='COMPLETED')throw Error('daily-job-'+value.state);
          return value;
        }
        return null;
      });
    } else sourceMemoryIds=[...prior.sourceMemoryIds];
    const configuration=checked(await api.daily.query({...base,view:'configurations',feature:'observation'})).configurations[0];
    const job=checked(await api.daily.query({...base,view:'jobs',feature:'observation'})).jobs.find(value=>!prior||value.id===prior.jobId);
    if(!configuration||!job||job.state!=='COMPLETED'||!job.reportId||job.attempts!==1)throw Error('daily-receipt');
    if(job.budget.callsUsed!==1||job.budget.inputCharactersUsed<=0)throw Error('daily-budget-snapshot');
    let report=checked(await api.daily.query({...base,view:'reports',feature:'observation'})).reports.find(value=>value.id===job.reportId);
    if(!report||report.state!=='ACTIVE'||!report.bodyAvailable)throw Error('daily-report');
    const reportSection=await waitFor('report-section',()=>panel.querySelector('[aria-label="日常观察报告"]'));
    const reportCard=await waitFor('report-card',()=>[...reportSection.querySelectorAll('article')].find(card=>[...card.querySelectorAll('button')].some(button=>button.textContent.trim()==='查看报告')));
    const view=[...reportCard.querySelectorAll('button')].find(button=>button.textContent.trim()==='查看报告');
    if(!view||view.disabled)throw Error('daily-view-button');
    view.click();
    let detailElement=await waitFor('report-detail',()=>{const value=panel.querySelector('.daily-detail');return value?.textContent.includes('E2E_DAILY_REPORT')?value:null});
    const sourceDetails=[...detailElement.querySelectorAll('details')].find(value=>value.querySelector('summary')?.textContent.trim()==='来源与范围');
    if(!sourceDetails||sourceDetails.open)throw Error('daily-source-default');
    let detail=checked(await api.daily.inspect({...base,id:report.id,expectedVersion:report.version,governanceVersion:report.governanceVersion}));
    const inference=detail.observations.find(value=>value.title==='E2E_DAILY_INFERENCE');
    if(!inference)throw Error('daily-inference');
    if(!prior){
      const card=[...detailElement.querySelectorAll('[aria-label="观察确认"] article')].find(value=>value.textContent.includes('E2E_DAILY_INFERENCE'));
      const accept=[...card.querySelectorAll('button')].find(button=>button.textContent.trim()==='接受并保存');
      if(!accept||accept.disabled)throw Error('daily-accept-button');
      accept.click();
      await waitFor('observation-accepted',()=>[...panel.querySelectorAll('[role="status"]')].some(value=>value.textContent.includes('观察已保存为真实接受记忆')));
      report=checked(await api.daily.query({...base,view:'reports',feature:'observation'})).reports.find(value=>value.id===job.reportId);
      detail=checked(await api.daily.inspect({...base,id:report.id,expectedVersion:report.version,governanceVersion:report.governanceVersion}));
    }
    const accepted=detail.observations.find(value=>value.id===(prior?.observationId??inference.id));
    if(!accepted||accepted.status!=='active'||accepted.nature!=='inference'||!accepted.memoryId||accepted.memoryVersion===null)throw Error('daily-inference-not-accepted');
    const memory=checked(await api.memory.inspect({...base,id:accepted.memoryId}));
    if(memory.record.state!=='active'||memory.record.objectVersion!==accepted.memoryVersion||memory.record.nature!=='inference'||!memory.changes.some(change=>change.actor==='user'))throw Error('daily-memory-receipt');
    if(prior&&(prior.assistantId!==assistantId||prior.configurationId!==configuration.id||prior.jobId!==job.id||prior.reportId!==report.id||prior.observationId!==accepted.id||prior.memoryId!==accepted.memoryId||prior.memoryVersion!==accepted.memoryVersion||JSON.stringify(prior.sourceMemoryIds)!==JSON.stringify(sourceMemoryIds)))throw Error('daily-restored-identity');
    const currentReportCard=await waitFor('current-report-card',()=>[...panel.querySelectorAll('[aria-label="日常观察报告"] article')].find(card=>[...card.querySelectorAll('button')].some(button=>button.textContent.trim()==='查看报告')));
    const currentView=[...currentReportCard.querySelectorAll('button')].find(button=>button.textContent.trim()==='查看报告');
    if(!currentView||currentView.disabled)throw Error('daily-current-view-button');
    currentView.click();
    detailElement=await waitFor('refreshed-detail',()=>{const value=panel.querySelector('.daily-detail');return value?.textContent.includes('E2E_DAILY_REPORT')&&value.textContent.includes(accepted.memoryId)?value:null});
    const refreshedSources=[...detailElement.querySelectorAll('details')].find(value=>value.querySelector('summary')?.textContent.trim()==='来源与范围');
    if(!refreshedSources||refreshedSources.open)throw Error('daily-refreshed-source-default');
    const usage=checked(await api.operations.usage({protocolVersion:1,assistantId,actor:'assistant',feature:'observation'}));
    if(usage.summary.calls!==1||usage.attempts.length!==1||usage.attempts[0].state!=='SETTLED')throw Error('daily-usage');
    const configurationDetails=panel.querySelector('details.daily-config');
    if(configurationDetails)configurationDetails.open=false;
    await nextFrame();
    detailElement=await waitFor('capture-detail',()=>{const value=panel.querySelector('.daily-detail');return value&&!value.closest('[hidden]')&&value.textContent.includes(accepted.memoryId)?value:null});
    const acceptedCardForCapture=[...detailElement.querySelectorAll('[aria-label="观察确认"] article')].find(value=>value.textContent.includes('E2E_DAILY_INFERENCE'));
    if(!acceptedCardForCapture)throw Error('daily-capture-card');
    const captureTitle=acceptedCardForCapture.querySelector('strong');
    const captureStatus=acceptedCardForCapture.querySelector('.daily-card-heading span');
    const captureBody=[...acceptedCardForCapture.querySelectorAll('p')].find(value=>value.textContent.includes('两条合成事件'));
    const captureReceipt=acceptedCardForCapture.querySelector('.scope-note');
    if(!captureTitle||!captureStatus||!captureBody||!captureReceipt||captureStatus.textContent.trim()!=='推测 · 已接受'||!captureReceipt.textContent.includes(accepted.memoryId))throw Error('daily-capture-content');
    captureReceipt.scrollIntoView({block:'center',behavior:'instant'});
    await nextFrame();
    const capture={
      innerHeight:window.innerHeight,
      rects:[captureTitle,captureStatus,captureBody,captureReceipt].map(value=>{const rect=value.getBoundingClientRect();return {top:Math.round(rect.top),bottom:Math.round(rect.bottom)};})
    };
    return {
      assistantId,configurationId:configuration.id,configurationVersion:configuration.version,
      jobId:job.id,jobVersion:job.version,reportId:report.id,reportVersion:report.version,governanceVersion:report.governanceVersion,
      observationId:accepted.id,observationVersion:accepted.version,memoryId:accepted.memoryId,memoryVersion:accepted.memoryVersion,
      sourceMemoryIds,budgetCalls:job.budget.callsUsed,budgetInputCharacters:job.budget.inputCharactersUsed,
      configuredThroughDom:configuredThroughDom||!!prior,
      bodyReadThroughDom:true,sourcesInitiallyCollapsed:true,inferenceAcceptedThroughDom:true,priorIdentityRestored:!!prior,capture
    };
  })()`,
      true
    )) as DailyEvidence
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stage = message.match(/daily-ui-timeout-[a-z-]+/u)?.[0] ?? 'daily-script-error'
    let controls: unknown
    try {
      controls = await window.webContents.executeJavaScript(
        `(()=>{
          const visible=(element)=>Boolean(element)&&!element.closest('[hidden]')&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden';
          const dailyArea=document.querySelector('button[aria-label="自动工作"]');
          const navigation=document.querySelector('[aria-label="自动工作与运行"]');
          const dailyPage=navigation?[...navigation.querySelectorAll('button')].find(element=>element.textContent.trim()==='日常计划'):null;
          const panel=document.querySelector('.daily-panel');
          const categoryTabs=panel?[...panel.querySelectorAll('[aria-label="日常工作类别"] [role="tab"]')]:[];
          const observationTab=categoryTabs.find(element=>element.textContent.trim()==='日常观察');
          const configuration=panel?.querySelector('details.daily-config');
          const runSection=panel?.querySelector('[aria-label="日常观察运行"]');
          const reportSection=panel?.querySelector('[aria-label="日常观察报告"]');
          const saveButton=configuration?[...configuration.querySelectorAll('button')].find(button=>button.textContent.trim()==='保存配置'):null;
          const runButton=runSection?[...runSection.querySelectorAll('button')].find(button=>button.textContent.trim()==='立即运行'):null;
          return {
            diagnosticsAvailable:true,
            dailyAreaPresent:Boolean(dailyArea),dailyAreaVisible:visible(dailyArea),
            navigationPresent:Boolean(navigation),navigationVisible:visible(navigation),
            dailyPagePresent:Boolean(dailyPage),dailyPageVisible:visible(dailyPage),
            panelPresent:Boolean(panel),panelVisible:visible(panel),
            categoryTabCount:categoryTabs.length,
            observationTabPresent:Boolean(observationTab),observationTabVisible:visible(observationTab),
            observationTabSelected:observationTab?.getAttribute('aria-selected')==='true',
            configurationPresent:Boolean(configuration),configurationOpen:Boolean(configuration?.open),configurationVisible:visible(configuration),
            saveButtonPresent:Boolean(saveButton),saveButtonDisabled:Boolean(saveButton?.disabled),
            runSectionPresent:Boolean(runSection),runSectionVisible:visible(runSection),
            runButtonPresent:Boolean(runButton),runButtonDisabled:Boolean(runButton?.disabled),
            reportSectionPresent:Boolean(reportSection),reportSectionVisible:visible(reportSection),
            activeElementInPanel:Boolean(panel&&panel.contains(document.activeElement))
          };
        })()`,
        true
      )
    } catch {
      controls = { diagnosticsAvailable: false }
    }
    const failureStem = `${dataRoot.phase}-daily-failure`
    try {
      writeFileSync(
        join(dataRoot.resultsDirectory, `${failureStem}.json`),
        `${JSON.stringify({ stage, controls }, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      )
    } catch {
      // Preserve the original UI failure when evidence capture itself is unavailable.
    }
    try {
      writeFileSync(
        join(dataRoot.resultsDirectory, `${failureStem}.png`),
        (await window.webContents.capturePage()).toPNG(),
        { flag: 'wx' }
      )
    } catch {
      // Preserve the original UI failure when evidence capture itself is unavailable.
    }
    throw error
  }
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}-daily-ui.png`),
    (await window.webContents.capturePage()).toPNG(),
    { flag: 'wx' }
  )
  return result
}
