// Compare local HTML editions under the same software renderer and viewport:
// node verification/scenery.mjs path/to/file.html path/to/output
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium} from 'playwright-core'

const file=path.resolve(process.argv[2]??'dist/暗箱-大画幅取景台.html')
const folder=path.resolve(process.argv[3]??'.preview/scenery')
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const page=await browser.newPage({viewport:{width:1024,height:720},deviceScaleFactor:1})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.goto(pathToFileURL(file).href)
  const scenes=page.getByRole('combobox',{name:'场景'})
  const results=[]
  for(const name of ['architecture','still-life','greenhouse']){
    const start=Date.now()
    await scenes.selectOption(name)
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))
    await page.waitForFunction(()=>!document.querySelector('.loading-scene') &&
      document.querySelector('.exposure canvas')?.dataset.converged==='true',null,{timeout:300000})
    const photograph=await page.locator('.exposure canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1])
    const filename=path.join(folder,name+'.png')
    await writeFile(filename,Buffer.from(photograph,'base64'))
    results.push({scene:name,seconds:(Date.now()-start)/1000})
    console.log(results.at(-1))
    assert.deepEqual(errors,[],errors.join('\n'))
  }
  await writeFile(path.join(folder,'timings.json'),JSON.stringify(results,null,2)+'\n')
}finally{await browser.close()}
