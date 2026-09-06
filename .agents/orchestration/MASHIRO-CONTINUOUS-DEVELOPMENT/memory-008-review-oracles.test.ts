import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../../src/main/data/sqlite.js'
import { MemoryService } from '../../../src/main/memory/memory-service.js'
import { ProviderService } from '../../../src/main/provider/provider-service.js'

import type { MemoryMutation } from '../../../src/shared/memory-contract.js'
import type {

  TransportResult
} from '../../../src/main/provider/chat-completions-transport.js'

const roots: string[] = [],
  closers: (() => void)[] = []
const fingerprint = createHash('sha256')
  .update('chat-completions-v1|https://open.bigmodel.cn/api/paas/v4')
  .digest('hex')
afterEach(() => {
  closers.splice(0).forEach((close) => close())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})
function setup(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-memory-test-'))
  roots.push(root)
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const first = assistants.create({
    protocolVersion: 1,
    displayName: '合成助手',
    expectedStateRevision: 0
  })
  if (!first.ok) throw Error('fixture')
  const assistantId = first.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  closers.push(() => store.close())
  const memory = new MemoryService(
    store,
    join(root, 'memory'),
    () => ({ fingerprint, display: '合成端点' }),
    undefined,
    fault
  )
  const query = () => memory.query({ protocolVersion: 1, assistantId })
  const mutate = (mutation: MemoryMutation, commandId = randomUUID()) =>
    memory.mutate({ protocolVersion: 1, assistantId, commandId, mutation })
  const grant = (scope: 'global' | 'assistant' = 'global', overrides = {}) => {
    const current = memory.permissionState(assistantId, scope)
    return memory.setPermissions({
      protocolVersion: 1,
      assistantId,
      scope,
      expectedVersion: current.version,
      read: true,
      write: true,
      writeInferences: false,
      receive: true,
      ...overrides
    })
  }
  return { root, path, store, memory, assistantId, query, mutate, grant }
}
const remember = (markdown = '我喜欢合成茶'): Extract<MemoryMutation, { markdown: string }> => ({
  action: 'remember',
  targetId: null,
  expectedVersion: null,
  kind: 'user',
  scope: 'global',
  title: '合成偏好',
  markdown,
  nature: 'user-statement',
  event: null
})
describe('memory accepted versions and trusted scope', () => {
it('independent: history search source survives into a derived memory', async () => {
 const f=setup(); let mode='plain'; let step=0;
 const transport=async ():Promise<TransportResult>=> {
   const call=(name:string,args:unknown):TransportResult=>({status:'completed',text:'',finishReason:'tool_calls',usage:null,toolCalls:[{id:'review-'+step,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
   if(mode==='derive') { step++; if(step===1)return call('search_conversation_history',{query:'OLD-SOURCE-REVIEW',limit:1}); if(step===2)return call('write_memory',{kind:'user',scope:'global',title:'derived review',markdown:'DERIVED-REVIEW',nature:'faithful-summary',event:null}); }
   return {status:'completed',text:'synthetic answer',finishReason:'stop',usage:null};
 };
 const service=ProviderService.open(f.path,join(f.root,'credentials'),{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()},transport);
 closers.push(()=>service.close());
 const c=service.saveConnection({protocolVersion:1,displayName:'review synthetic',baseUrl:'https://open.bigmodel.cn/api/paas/v4',enabled:true}); if(!c.ok)throw Error('connection'); const connectionId=c.data.connections[0]!.id;
 service.setCredential({protocolVersion:1,connectionId,apiKey:'synthetic-not-a-key',persistence:'temporary'});
 service.bindAssistant({protocolVersion:1,assistantId:f.assistantId,connectionId,model:'glm-5.3-flash',expectedVersion:null});
 const p=service.permissions({protocolVersion:1,assistantId:f.assistantId}); if(!p.ok)throw Error('permission');
 service.setPermissions({protocolVersion:1,assistantId:f.assistantId,connectionId,endpointFingerprint:p.data.endpointFingerprint,expectedVersion:p.data.version,readHistory:true,sendHistory:true}); f.grant();
 const req={protocolVersion:1 as const,assistantId:f.assistantId,mode:'normal' as const,context:{kind:'none' as const},tools:'off' as const,stream:false};
 const sourceId=randomUUID(); expect((await service.startChat({...req,requestId:sourceId,text:'OLD-SOURCE-REVIEW'},()=>undefined)).ok).toBe(true);
 for(let i=0;i<18;i++)expect((await service.startChat({...req,requestId:randomUUID(),text:'filler '+i},()=>undefined)).ok).toBe(true);
 mode='derive'; const derivedRequest=randomUUID();
 expect((await service.startChat({...req,requestId:derivedRequest,text:'search old source and remember a faithful summary',tools:'clock-history-and-memory',context:{kind:'recent'}},()=>undefined)).ok).toBe(true);
 const q=f.query(); if(!q.ok)throw Error('query'); expect(q.data.records).toHaveLength(1);
 const derived=q.data.records[0]!;
 const oldSource={type:'round' as const,id:sourceId,assistantId:f.assistantId,version:1};
 // Withdrawal of old source is the final externally observable safety oracle.
 f.store.database.prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)').run('round',sourceId,1,'withdrawal',derived.id);
 expect(service.memory.search({assistantId:f.assistantId,requestId:randomUUID(),fingerprint,assertCurrent:()=>undefined,sources:[]},'DERIVED-REVIEW',10)).toHaveLength(0);
 expect(derived.sources).toContainEqual(oldSource);
});
});

it('independent: faithful correction remains recallable through prior round provenance', () => {
 const f=setup(); f.grant();
 f.store.database.prepare('INSERT INTO history_permissions VALUES(?,?,?)').run(f.assistantId,1,1);
 f.store.database.prepare('INSERT INTO history_recipient_grants VALUES(?,?,?)').run(f.assistantId,fingerprint,1);
 const firstRequest=randomUUID();
 const ex={assistantId:f.assistantId,requestId:firstRequest,fingerprint,assertCurrent:()=>undefined,sources:[]};
 const saved=f.memory.toolMutation(ex,remember());
 const corrected=f.memory.toolMutation({...ex,requestId:randomUUID(),sources:[{type:'round',id:firstRequest,assistantId:f.assistantId,version:1}]},{...remember('CORRECTED-REVIEW'),action:'correct',targetId:saved.objectId,expectedVersion:1,nature:'faithful-summary'});
 expect(corrected.state).toBe('SUCCEEDED');
 expect(f.memory.search({...ex,requestId:randomUUID()},'CORRECTED-REVIEW',10)).toHaveLength(1);
 f.store.database.prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)').run('round',firstRequest,1,'withdrawal',saved.objectId);
 expect(f.memory.search({...ex,requestId:randomUUID()},'CORRECTED-REVIEW',10)).toHaveLength(0);
});it('independent: ordinary shared history DAG is not mistaken for excessive provenance',()=>{
 const f=setup();f.grant();f.store.database.prepare('INSERT INTO history_permissions VALUES(?,?,?)').run(f.assistantId,1,1);f.store.database.prepare('INSERT INTO history_recipient_grants VALUES(?,?,?)').run(f.assistantId,fingerprint,1);
 const roots: {type:'round';id:string;assistantId:string;version:number}[]=[];
 for(let i=0;i<15;i++){const r={type:'round' as const,id:randomUUID(),assistantId:f.assistantId,version:1};f.memory.addDependencies('round',r.id,1,[...roots]);roots.push(r);}
 expect(()=>f.memory.assertSource(roots[14]!,f.assistantId,fingerprint)).not.toThrow();
});