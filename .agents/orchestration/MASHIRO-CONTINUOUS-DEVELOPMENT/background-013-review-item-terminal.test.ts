import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {expect,it} from 'vitest'
import {AssistantService} from '../../../src/main/assistant/assistant-service'
import {SqliteStore} from '../../../src/main/data/sqlite'
import {TimelineRepository} from '../../../src/main/provider/timeline-repository'
import {ToolRepository} from '../../../src/main/provider/tool-repository'
import {ItemService} from '../../../src/main/item/item-service'
import {roundSource} from '../../../src/main/background/background-sources'
it.each([true,false])('allows actual accepted or rejected item confirmation terminal outcome: %s',(accept)=>{
 const root=mkdtempSync(join(tmpdir(),'mashiro-review-013-item-'))
 const db=join(root,'state.sqlite')
 const assistants=AssistantService.open(db)
 const result=assistants.create({protocolVersion:1,displayName:'Synthetic',expectedStateRevision:0})
 if(!result.ok) throw Error('fixture')
 const assistantId=result.data.assistants[0]!.id
 assistants.close()
 const store=new SqliteStore(db)
 try {
 const requestId=randomUUID(),createdAt='2030-01-01T00:00:00.000Z'
 new TimelineRepository(store).insert(assistantId,[{id:randomUUID(),requestId,role:'user',content:'Synthetic proposed update',status:'completed',createdAt,saved:true},{id:randomUUID(),requestId,role:'assistant',content:'Waiting for confirmation',status:'completed',createdAt,saved:true}])
 const ledger=new ToolRepository(store)
 const segment={id:randomUUID(),assistantId,requestId,endpointFingerprint:'a'.repeat(64),model:'synthetic',adapterVersion:'synthetic',messages:[],createdAt}
 ledger.create(segment)
 const call={id:'synthetic-call',type:'function' as const,function:{name:'prepare_item_update' as const,arguments:'{}'}}
 const operation=ledger.prepare(segment,randomUUID(),call)
 const items=new ItemService(store,()=>({fingerprint:'test-endpoint',display:'Synthetic'}),()=>undefined,()=>undefined)
 const content={kind:'task' as const,title:'Synthetic original',description:'',status:'open' as const,dueAt:null,timeZone:null,parentId:null,relatedIds:[],counterpart:''}
 const made=items.applyMutation(assistantId,randomUUID(),{action:'create',content},[])
 const preview=items.preview({protocolVersion:1,assistantId,commandId:operation.operationId,action:'replace-content',targets:[{id:made.objectId,expectedVersion:1}],content:{...content,title:'Synthetic replacement'}})
 if(!preview.ok) throw Error(JSON.stringify(preview))
 const receipt=preview.data.receipt
 ledger.update({...operation,state:'DISPATCHING'})
 ledger.update({...operation,state:'SUCCEEDED',itemReceipt:receipt},JSON.stringify(receipt))
 ledger.messages(segment.id,[{role:'assistant',content:'',tool_calls:[call]},{role:'tool',tool_call_id:call.id,content:JSON.stringify(receipt)},{role:'assistant',content:'Waiting for confirmation'}],true)
 expect(()=>roundSource(store,assistantId,requestId)).toThrow('PERMISSION_DENIED')
 const confirmed=items.confirm({protocolVersion:1,assistantId,confirmationId:receipt.confirmationId,accept})
 expect(confirmed.ok).toBe(true)
 expect(()=>roundSource(store,assistantId,requestId)).not.toThrow()
 // Synthetic storage uncertainty must not be mistaken for a settled business receipt.
 store.database.prepare("UPDATE item_commands SET receipt_json=json_set(receipt_json,'$.state','RESULT_UNKNOWN') WHERE id=?").run(operation.operationId)
 expect(()=>roundSource(store,assistantId,requestId)).toThrow('PERMISSION_DENIED')
 }finally{store.close();rmSync(root,{recursive:true,force:true})}
})
