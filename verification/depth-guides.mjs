import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'
import path from 'node:path'

// Use the production Bench, meshes, materials and lenses. Route assets locally
// so this regression works without a web server or an internet connection.
const {outputFiles}=await build({stdin:{contents:`
  import {Bench} from './src/bench'
  import {sceneRig} from './src/equipment'
  import {onSceneryReady} from './src/scenes/photographic'
  window.ready=new Promise(resolve=>onSceneryReady(resolve))
  const canvas=document.querySelector('#stage')
  window.bench=new Bench(canvas,document.querySelector('#film'),document.querySelector('aside'),
    {axis:()=> 'tilt',select:()=>{},move:()=>{},focus:()=>{}},'still-life')
  window.rig=sceneRig('still-life')
  window.settle=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'})
const browser=await chromium.launch({channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const page=await browser.newPage({viewport:{width:1140,height:840}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.route('http://bench.test/**',async route=>{
    const url=new URL(route.request().url())
    if(url.pathname.startsWith('/scenery/')){
      const name=path.basename(url.pathname)
      return route.fulfill({path:path.resolve('public/scenery',name)})
    }
    return route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><meta charset="utf-8"><style>body{margin:0;background:#1d2422;color:#eee;font:16px system-ui}#stage{width:760px;height:420px;display:block}#film{display:none}</style><canvas id="stage"></canvas><canvas id="film"></canvas><aside></aside>'})
  })
  await page.goto('http://bench.test/')
  await page.addScriptTag({content:outputFiles[0].text})
  await page.evaluate(()=>window.ready)
  const result=await page.evaluate(async()=>{
    const images=[],canvas=document.querySelector('#stage')
    const capture=()=>images.push(canvas.toDataURL('image/png'))
    const rig=window.rig
    rig.front.tilt=12
    bench.setView('side')
    bench.setLayers({depth:true,planes:true,grid:false,rays:false})
    for(const n of [5.6,32]){
      rig.aperture=n;bench.setRig(rig);await settle();capture()
    }
    bench.setView('perspective');bench.zoom(.78)
    await settle();capture()
    // Toggle just the geometry intersections in the live perspective scene.
    // Geometry stays unchanged; compare with the plane renderer still active.
    const contour=bench.contour,show=contour.show.bind(contour)
    const read=()=>{
      const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height
      const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,c.width,c.height).data
    }
    const marked=read()
    contour.show=()=>show(false);bench.dirty=true;await settle()
    const clean=read();let changed=0
    for(let i=0;i<clean.length;i+=4)if(Math.abs(clean[i+1]-marked[i+1])>6)changed++
    contour.show=show
    bench.dispose();return {images,changed}
  })
  assert.deepEqual(errors,[])
  assert.ok(result.changed>=12,`workshop contour absent: ${result.changed} changed pixels`)
  assert.notEqual(result.images[0],result.images[1])
  await page.setContent('<!DOCTYPE html><meta charset=utf-8><style>*{box-sizing:border-box}body{margin:0;background:#1c211f;color:#d9d4c6;font:18px system-ui;padding:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px 2px}.wide{grid-column:1 / -1}.wide img{width:80%;margin:auto}</style><main></main>')
  await page.evaluate(async images=>{
    const labels=['前组俯仰 12°　·　f/5.6','前组俯仰 12°　·　f/32','银盐工作间　·　实际场景表面的焦平面交线']
    for(let i=0;i<images.length;i++){
      const f=document.createElement('figure'),img=new Image(),label=document.createElement('figcaption')
      if(i===2)f.className='wide'
      img.src=images[i];await img.decode();label.textContent=labels[i];f.append(img,label);document.querySelector('main').append(f)
    }
  },result.images)
  await page.locator('main').screenshot({path:'verification/depth-guides.png'})
  console.log('PASS real workshop depth guides, contour pixels:',result.changed)
}finally{await browser.close()}
