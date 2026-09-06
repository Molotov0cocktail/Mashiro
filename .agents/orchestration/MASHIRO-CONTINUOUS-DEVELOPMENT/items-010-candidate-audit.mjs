import console from 'node:console'
import { readFileSync,writeFileSync,copyFileSync,constants,readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const dir='.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const files=[
  'src/shared/item-channels.ts','src/shared/item-contract.ts','src/shared/tool-contract.ts','src/shared/provider-contract.ts','src/shared/memory-contract.ts','src/shared/retention-contract.ts','src/shared/assistant-contract.ts',
  'src/main/item/item-service.ts','src/main/item/item-schema.ts','src/main/item/item-intent.ts','src/main/item/item-tool-schema.ts','src/main/item/item-tool-session.ts','src/main/item/item-retention.ts',
  'src/main/data/schema.ts','src/main/provider/provider-service.ts','src/main/provider/tool-protocol.ts','src/main/provider/tool-execution.ts','src/main/memory/memory-service.ts','src/main/retention/retention-service.ts',
  'src/main/assistant/assistant-repository.ts','src/main/assistant/assistant-service.ts','src/main/ipc/register-item-ipc.ts','src/main/index.ts','src/preload/index.ts','src/preload/index.d.ts','src/main/testing/e2e-controller.ts','src/main/testing/e2e-item-scripts.ts',
  'scripts/electron-f1-harness.mjs','tests/integration/item-service.test.ts','tests/integration/item-provider.test.ts','tests/integration/item-retention.test.ts','tests/integration/item-domain-oracles.test.ts','tests/unit/item-intent.test.ts','tests/integration/item-schema.test.ts','tests/unit/item-tool-candidate.test.ts',
  'tests/integration/retention-legacy-fixture.ts','tests/integration/provider-schema.test.ts','tests/integration/timeline-schema.test.ts','tests/integration/provider-tools.test.ts','tests/integration/timeline-context.test.ts','tests/integration/retention-schema.test.ts'
]
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase()
const manifest=files.map(path=>({path,sha256:sha(readFileSync(path))}))
const residuals=[]
for(const directory of ['src/main/item','src/shared','src/preload','src/main/provider','src/main/testing','tests/integration','tests/unit','scripts'])
  for(const name of readdirSync(directory))if(/\.(tmp|bak|sqlite|db)$/.test(name))residuals.push(directory+'/'+name)
const secretMatches=manifest.filter(({path})=>/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}/.test(readFileSync(path,'utf8'))).map(x=>x.path)
const assistantChannelCount=(readFileSync('src/shared/assistant-channels.ts','utf8').match(/assistant:/g)||[]).length
if(residuals.length||secretMatches.length||assistantChannelCount!==6)throw Error('Scoped audit failed')
copyFileSync('test-results/electron-f1.json',dir+'items-010-trusted-electron.json',constants.COPYFILE_EXCL)
copyFileSync('test-results/items-ui.png',dir+'items-010-trusted-ui.png',constants.COPYFILE_EXCL)
writeFileSync(dir+'items-010-trusted-manifest.json',JSON.stringify({createdAt:new Date().toISOString(),role:'AUTHOR_CANDIDATE_NOT_INDEPENDENT_REVIEW',files:manifest,checks:{assistantChannelCount,residuals,secretMatches},evidence:{tests:'items-010-trusted-final-tests.log',electron:'items-010-trusted-electron.json',screenshot:'items-010-trusted-ui.png'}},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({files:manifest.length,assistantChannelCount,residuals,secretMatches,manifest:'items-010-trusted-manifest.json'}))
