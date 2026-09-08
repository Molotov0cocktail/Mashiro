import { Buffer } from 'node:buffer'
import process from 'node:process'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,constants} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import {build} from 'esbuild'
const base='.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const helper=readFileSync(base+'post-release-019-full-domain-seed.mjs','utf8')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase()
assert.equal(hash(helper),'53CAF4364AB815A615222C9EB8ED99DB4EBF35BB456CB5E292B102799D32DC20')
const source=join(tmpdir(),'mashiro-f1-e2e-Blmtwb')
assert.equal(JSON.parse(readFileSync(join(source,'.mashiro-f1-e2e.json'),'utf8')).runId,'ddf02832-8aa5-4325-b995-6438275706c7')
const sourceDb=join(source,'data','mashiro.sqlite')
const sourceHash=hash(readFileSync(sourceDb))
const targetRoot='.cache/review019-seed-pause-independent-01'
mkdirSync(targetRoot,{recursive:false})
const target=join(targetRoot,'mashiro.sqlite')
const readonly=new DatabaseSync(sourceDb,{readOnly:true})
try {readonly.exec('BEGIN');readonly.prepare('SELECT count(*) FROM assistants').get();copyFileSync(sourceDb,target,constants.COPYFILE_EXCL);assert.equal(hash(readFileSync(target)),sourceHash)} finally {readonly.exec('ROLLBACK');readonly.close()}
const bundle=await build({stdin:{contents:"export {backgroundConfigurationSchema} from './src/shared/background-contract.ts'; export {dailyConfigurationSchema} from './src/shared/daily-contract.ts'; export {stewardConfigurationSchema,discoveryConfigurationSchema} from './src/shared/steward-contract.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'})
const schemas=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
const functions=helper.slice(helper.indexOf('function sqlName('),helper.indexOf('function assertMinimums('))
const pause=new Function('DatabaseSync','createHash',functions+'\nreturn pauseTargetDatabase')(DatabaseSync,createHash)
const result=pause(target,schemas)
assert.equal(hash(readFileSync(sourceDb)),sourceHash)
const db=new DatabaseSync(target,{readOnly:true})
try {
assert.equal(db.prepare('SELECT enabled FROM provider_connections').get().enabled,0)
for(const table of ['background_configs','daily_configs','steward_configs','discovery_configs']) for(const row of db.prepare('SELECT record_json FROM '+table).all())assert.equal(JSON.parse(row.record_json).enabled,false)
assert.equal(db.prepare('SELECT count(*) n FROM assistant_provider_bindings').get().n,1)
assert.equal(db.prepare('SELECT has_persistent_credential FROM provider_connections').get().has_persistent_credential,1)
} finally {db.close()}
const report={scope:'exact retained synthetic source read-only; target-only extracted pause function; no profile or native helper execution',helperSha256:hash(helper),sourceRunId:'ddf02832-8aa5-4325-b995-6438275706c7',sourceHash,sourceUnchanged:true,target:targetRoot,targetHash:hash(readFileSync(target)),changes:result.changes,retentionEpoch:result.retentionEpoch,tableDigestsBefore:result.before,tableDigestsAfter:result.after,allAutomationDisabled:true,connectionDisabled:true,bindingAndPersistentCredentialFlagRetained:true,providerCalls:0,verdict:'PASS'}
writeFileSync(base+'review019-seed-pause-independent-01.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
