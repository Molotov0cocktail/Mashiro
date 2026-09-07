// @vitest-environment jsdom
import {createElement} from 'react'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MemoryPanel} from '../../../src/renderer/src/features/memory/MemoryPanel'
import {memoryApi008Defaults} from '../../../tests/renderer/memory-api-fixture'
import type {MemoryRecord} from '../../../src/shared/memory-contract'
afterEach(cleanup)
it('labels a background accepted memory change as background organization rather than assistant',async()=>{
 const assistantId='00000000-0000-4000-8000-000000000001'
 const record:MemoryRecord={id:'00000000-0000-4000-8000-000000000002',ownerAssistantId:assistantId,objectVersion:1,kind:'continuity',scope:'assistant',title:'Synthetic chapter memory',markdown:'Synthetic accepted body',nature:'faithful-summary',event:null,state:'active',retention:'persistent',createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',sources:[]}
 const api=memoryApi008Defaults()
 vi.mocked(api.query).mockResolvedValue({ok:true,data:{records:[record],nextCursor:null}})
 vi.mocked(api.inspect).mockResolvedValue({ok:true,data:{record,changes:[{operationId:'00000000-0000-4000-8000-000000000003',action:'remember',objectVersion:1,actor:'background',createdAt:record.createdAt}],receipts:[],providedToRequests:[],cleanupPending:false,organizationPending:false}})
 render(createElement(MemoryPanel,{assistantId,assistantName:'Synthetic',api,pendingCommands:new Map(),onLocateRound:vi.fn()}))
 const title=await screen.findByText(record.title)
 const card=title.closest('article')!
 fireEvent.click(within(card).getByRole('button'))
 const summary=await screen.findByText('来源与变更')
 expect(summary.closest('details')).not.toHaveAttribute('open')
 fireEvent.click(summary)
 expect(await screen.findByText(/remember · v1 · 后台整理/)).toBeVisible()
 expect(screen.queryByText(/remember · v1 · 助手/)).not.toBeInTheDocument()
})
