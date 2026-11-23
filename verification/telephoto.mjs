import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {chromium} from 'playwright-core'
import {sceneRig,swapLens} from '../src/equipment.ts'
import {createScenePreset} from '../src/scenes.ts'
import {frames,project} from '../src/optics.ts'
import {filmToScreen,filmWindow} from '../src/focus-feedback.ts'

// Keep a baseline with --baseline before an image pipeline or subject change.
const baseline=process.argv.includes('--baseline')
const phone=process.argv.includes('--phone')
const store=path.join(tmpdir(),'obscura-telephoto-reference',phone?'phone':'desktop')
await mkdir(store,{recursive:true})
const browser=await chromium.launch({channel:'msedge',args:process.env.LFC_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1440,height:900}})
const errors=[]
p.on('pageerror',e=>errors.push(e.message))
p.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text())}})
const button=name=>p.getByRole('button',{name,exact:true})
const canvas=p.locator('.exposure canvas')
const waitForFilm=async()=>{
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await p.waitForFunction(()=>document.querySelector('.exposure canvas')?.dataset.converged==='true',null,{timeout:240000})
}
async function enter(name,value){
  await button('选择'+name).click()
  const input=p.getByRole('spinbutton',{name:name+'数值',exact:true})
  await input.fill(String(value));await input.press('Enter')
}
async function grab(){
  await waitForFilm()
  return canvas.evaluate(c=>c.toDataURL())
}
async function measure(first,second,centerFraction=1){
  return p.evaluate(async([a,b,fraction])=>{
    const pixels=async src=>{
      const image=new Image();image.src=src;await image.decode()
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0)
      const width=Math.max(1,Math.floor(c.width*fraction)),height=Math.max(1,Math.floor(c.height*fraction))
      return ctx.getImageData(Math.floor((c.width-width)/2),Math.floor((c.height-height)/2),width,height).data
    }
    const x=await pixels(a),y=await pixels(b)
    if(x.length!==y.length)throw new Error('Comparison surfaces must match')
    let difference=0
    for(let i=0;i<x.length;i+=4)for(let k=0;k<3;k++)difference+=Math.abs(x[i+k]-y[i+k])
    return difference/(x.length*.75)
  },[first,second,centerFraction])
}
async function contactSheet(images,labels,out){
  const bytes=await p.evaluate(async({images,labels})=>{
    const imgs=await Promise.all(images.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}))
    const w=Math.min(540,...imgs.map(i=>i.width)),h=Math.min(360,...imgs.map(i=>i.height))
    const c=document.createElement('canvas');c.width=(w+14)*imgs.length+14;c.height=h+66
    const ctx=c.getContext('2d');ctx.fillStyle='#edeee7';ctx.fillRect(0,0,c.width,c.height)
    ctx.fillStyle='#30382e';ctx.font='17px "Microsoft YaHei", sans-serif'
    imgs.forEach((i,n)=>{
      const x=14+n*(w+14)
      ctx.drawImage(i,Math.floor((i.width-w)/2),Math.floor((i.height-h)/2),w,h,x,14,w,h)
      ctx.fillText(labels[n],x,h+46)
    })
    return c.toDataURL().split(',')[1]
  },{images,labels})
  await writeFile(out,Buffer.from(bytes,'base64'))
}
try{
  await p.goto(process.env.WORKBENCH_URL??'http://127.0.0.1:5173/')
  if(await button('正像辅助').getAttribute('aria-pressed')!=='true')await button('正像辅助').click()
  const cases=[['architecture','巴黎街角'],['still-life','干版盒纸标'],['greenhouse','百日菊花芯']]
  for(const [scene,title] of cases){
    if(process.env.CHECK_SCENES&&!process.env.CHECK_SCENES.split(',').includes(scene))continue
    await p.getByRole('combobox',{name:'场景'}).selectOption(scene)
    await p.getByRole('combobox',{name:'镜头'}).selectOption('long210')
    const rig=swapLens(sceneRig(scene),'long210')
    await enter('皮腔长度',rig.extension)
    await button('全开对焦').click()
    if(scene!=='architecture'){
      const {lens,film}=frames(rig),{targets}=createScenePreset(scene)
      const point=filmToScreen(filmWindow(rig,1),project(targets.cylinder,lens,film))
      assert.ok(point.x>0&&point.x<1&&point.y>0&&point.y<1,'main subject should be on the film')
      const rect=await canvas.boundingBox()
      await p.mouse.click(rect.x+point.x*rect.width,rect.y+point.y*rect.height)
    }
    await button('4×').click()
    await p.waitForLoadState('networkidle')
    await p.waitForFunction(()=>!document.querySelector('.loading-scene'))
    const focus=await grab()
    const beforeFile=path.join(store,scene+'.png')
    if(baseline){
      await writeFile(beforeFile,Buffer.from(focus.split(',')[1],'base64'))
      console.log('Baseline',scene,await canvas.boundingBox());continue
    }
    await button('峰值对焦').click()
    await button('清晰度参照').click()
    const ref=await grab()
    assert.equal(await canvas.getAttribute('data-sharp-reference'),'true')
    assert.ok(await button('峰值对焦').isDisabled())
    await button('清晰度参照').click()
    assert.equal(await button('峰值对焦').getAttribute('aria-pressed'),'true')
    await button('峰值对焦').click()
    assert.ok(await measure(focus,await grab())<1,'returning to the glass must restore its appearance')
    await enter('皮腔长度',scene==='architecture'?218:rig.extension+12)
    const defocus=await grab()
    await button('清晰度参照').click()
    const defocusRef=await grab()
    // Judge the selected surface. At close focus, a petal or shelf behind
    // it can legitimately be out of focus elsewhere in the loupe.
    const region=scene==='architecture'?1:.22
    const focusError=await measure(focus,ref,region),defocusError=await measure(defocus,defocusRef,region)
    console.log(JSON.stringify({scene,phone,focusError,defocusError,resolution:await canvas.evaluate(c=>[c.width,c.height])}))
    if(defocusError<=focusError+1){
      await p.screenshot({path:path.join(store,scene+'-failed.png')})
      console.error('Optical image sample',await canvas.evaluate(c=>{
        const dst=document.createElement('canvas');dst.width=12;dst.height=8
        const ctx=dst.getContext('2d');ctx.drawImage(c,0,0,12,8)
        return Array.from(ctx.getImageData(0,0,12,8).data).slice(0,60)
      }))
    }
    assert.ok(defocusError>focusError+1,'wrong conjugate must visibly soften actual scene detail')
    if(!phone){
      let old
      try{old='data:image/png;base64,'+(await readFile(beforeFile)).toString('base64')}catch(e){if(e.code!=='ENOENT')throw e}
      const images=old?[old,focus,defocus]:[focus,defocus]
      const labels=[title+' · 新版合焦',title+' · 新版失焦']
      if(old)labels.unshift(title+' · 旧版合焦')
      await contactSheet(images,labels,'verification/telephoto-'+scene+'.png')
    }
    await button('1×').click();await waitForFilm()
    assert.equal(await button('清晰度参照').count(),0)
    assert.equal(await canvas.getAttribute('data-sharp-reference'),'false')
  }
  assert.deepEqual(errors,[])
}finally{await browser.close()}
