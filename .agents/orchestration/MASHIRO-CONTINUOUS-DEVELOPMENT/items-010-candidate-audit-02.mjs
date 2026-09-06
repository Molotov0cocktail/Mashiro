import console from 'node:console'
import {readFileSync,writeFileSync,copyFileSync,constants,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
const dir='.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const old=JSON.parse(readFileSync(dir+'items-010-trusted-manifest.json','utf8'))
const files=[...old.files.map(file=>file.path),'tests/integration/item-retained-public-regression.test.ts']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase()
const manifest=files.map(path=>{
  if(!resolve(path).startsWith(resolve('D:/Mashiro')+'\\')||! /^(src|tests|scripts)\//.test(path))throw Error('Path outside fixed candidate')
  return {path,sha256:sha(readFileSync(path))}
})
const residuals=[]
for(const directory of ['src/main/item','src/shared','src/preload','src/main/provider','src/main/testing','tests/integration','tests/unit','scripts'])
  for(const name of readdirSync(directory))if(/\.(tmp|bak|sqlite|db)$/.test(name))residuals.push(directory+'/'+name)
const secretMatches=manifest.filter(({path})=>/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}/.test(readFileSync(path,'utf8'))).map(file=>file.path)
const assistantChannelCount=(readFileSync('src/shared/assistant-channels.ts','utf8').match(/assistant:/g)||[]).length
const temporaryOracles=['tests/unit','tests/integration','tests/renderer'].flatMap(directory=>readdirSync(directory).filter(name=>name.startsWith('items-010-review-final-')||name==='ItemPanel-root-independent-010.test.tsx').map(name=>directory+'/'+name))
const log=readFileSync(dir+'items-010-trusted-final-tests-03.log','utf8')
if(residuals.length||secretMatches.length||assistantChannelCount!==6||temporaryOracles.length||!log.includes('51 passed')||!log.includes('301 passed'))throw Error('Audit mismatch')
const electron=JSON.parse(readFileSync('test-results/electron-f1.json','utf8'))
if(electron.runId!=='f606bb22-de4e-4460-a1cc-3ac9d4b7afbb')throw Error('Electron identity')
copyFileSync('test-results/electron-f1.json',dir+'items-010-trusted-electron-02.json',constants.COPYFILE_EXCL)
copyFileSync('test-results/items-ui.png',dir+'items-010-trusted-ui-02.png',constants.COPYFILE_EXCL)
writeFileSync(dir+'items-010-trusted-manifest-02.json',JSON.stringify({createdAt:new Date().toISOString(),role:'AUTHOR_REPAIRED_CANDIDATE_NOT_INDEPENDENT_REVIEW',supersedes:'items-010-trusted-manifest.json',files:manifest,checks:{assistantChannelCount,residuals,secretMatches,temporaryOracles},validation:{testFiles:51,tests:301,maxWorkers:2,unchangedAssertions:true,typecheck:0,lint:0,format:0,build:0,electronPids:electron.pids},evidence:{tests:'items-010-trusted-final-tests-03.log',priorTimeout:'items-010-trusted-final-tests-02.log',trusted:'items-010-trusted-repair-tests.log',electron:'items-010-trusted-electron-02.json',screenshot:'items-010-trusted-ui-02.png'}},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({fileCount:manifest.length,temporaryOracles,assistantChannelCount,manifest:'items-010-trusted-manifest-02.json',pids:electron.pids}))
