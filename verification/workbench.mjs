import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
import {PerspectiveCamera,Vector3} from 'three'
import {frames,project} from '../src/optics.ts'
import {sceneRig} from '../src/equipment.ts'

const url=process.env.WORKBENCH_URL??'http://127.0.0.1:5173/'
const browser=await chromium.launch({channel:'msedge',headless:true,
  args:process.env.LFC_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const groups=(process.env.CHECK_GROUPS??'scenes,glass,mechanism,architecture,stitch,phone').split(',')
const errors=[]
const button=(p,name)=>p.getByRole('button',{name,exact:true})
const menu=(p,name)=>p.getByRole('combobox',{name,exact:true})
const frame=p=>p.locator('.exposure:visible')
const film=p=>frame(p).locator('canvas')
const windowInfo=p=>frame(p).evaluate(e=>({zoom:Number(e.dataset.zoom),x:Number(e.dataset.centerX),y:Number(e.dataset.centerY)}))
const closeTo=(a,b,eps=.05)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`)
const shot=(p,n)=>p.screenshot({path:`verification/${n}.png`})
const png=p=>film(p).evaluate(c=>c.toDataURL())
const settle=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
async function ready(p) {
  await settle(p)
  await p.waitForFunction(()=>!document.querySelector('.loading-scene')&&document.querySelector('.exposure canvas')?.dataset.converged==='true',null,{timeout:240000})
}
async function field(p,name,n) {
  await button(p,'选择'+name).click()
  const control=p.getByRole('spinbutton',{name:name+'数值',exact:true})
  if(n!==undefined){await control.fill(String(n));await control.press('Enter')}
  return Number(await control.inputValue())
}
async function chooseScene(p,id) {
  await menu(p,'场景').selectOption(id)
  // Images decode asynchronously and restart the physical exposure once ready.
  await p.waitForLoadState('networkidle');await ready(p)
}
async function sameViewport(p,locators) {
  const viewport=p.viewportSize()
  for (const l of locators) {
    const box=await l.boundingBox()
    assert.ok(box&&box.width>0&&box.height>0,'operating surface disappeared')
    assert.ok(box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,
      `control outside viewport ${JSON.stringify(box)} / ${JSON.stringify(viewport)}`)
  }
}
async function imageSamples(locator,w=90,h=70) {
  return locator.evaluate((image,[w,h])=>{
    const c=document.createElement('canvas');c.width=w;c.height=h
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h)
    return Array.from(ctx.getImageData(0,0,w,h).data)
  },[w,h])
}
function difference(a,b) {
  assert.equal(a.length,b.length)
  let d=0
  for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)d+=Math.abs(a[i+k]-b[i+k])
  return d/(a.length*.75)
}
async function drag(p,x,y,dx,dy) {
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:6});await p.mouse.up()
}
async function touchDrag(p,x,y,dx,dy) {
  const session=await p.context().newCDPSession(p)
  try {
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]})
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  }finally{await session.detach()}
}
async function comparison(p,file,title,notes,photos,widths=[640,640]) {
  const result=await p.evaluate(async({title,notes,photos,widths})=>{
    const pictures=await Promise.all(photos.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}))
    const c=document.createElement('canvas'),pad=25,gap=16
    const h=Math.max(...pictures.map((i,n)=>Math.round(widths[n%2]*i.height/i.width)))
    const rows=Math.ceil(pictures.length/2)
    c.width=widths[0]+widths[1]+pad*2+gap;c.height=48+rows*(h+59)
    const ctx=c.getContext('2d');ctx.fillStyle='#eeeee6';ctx.fillRect(0,0,c.width,c.height)
    ctx.font='600 23px "Microsoft YaHei", sans-serif';ctx.fillStyle='#272e27';ctx.fillText(title,pad,34)
    for(let n=0;n<pictures.length;n++){
      const col=n%2,top=48+Math.floor(n/2)*(h+59)
      const i=pictures[n],w=widths[col],x=pad+col*(widths[0]+gap),height=w*i.height/i.width
      ctx.drawImage(i,x,top+(h-height)/2,w,height)
      ctx.font='17px "Microsoft YaHei", sans-serif';ctx.fillText(notes[n],x,top+30+h)
    }
    return c.toDataURL().split(',')[1]
  },{title,notes,photos,widths})
  await writeFile('verification/'+file+'.png',Buffer.from(result,'base64'))
}

async function scenes(p) {
  assert.equal(await menu(p,'场景').inputValue(),'architecture')
  assert.equal(await button(p,'毛玻璃').getAttribute('aria-pressed'),'true')
  assert.equal(await button(p,'摄影练习').count(),0)
  assert.equal(await p.locator('[data-probe]').count(),0)
  await sameViewport(p,[frame(p),p.locator('.viewport'),p.getByRole('slider',{name:'俯仰',exact:true})])
  const available=await menu(p,'场景').locator('option').evaluateAll(list=>list.map(o=>o.value))
  assert.deepEqual([...available].sort(),['architecture','greenhouse','still-life'])
  const pictures=[]
  const closeupScenes=[]
  for(const [id,file] of [['architecture','02-workbench'],['still-life','07-still-life'],['greenhouse','08-greenhouse']]) {
    await chooseScene(p,id);await shot(p,file)
    assert.equal(await button(p,'正像辅助').getAttribute('aria-pressed'),'false')
    await button(p,'正像辅助').click();await shot(p,file+'-upright');await button(p,'正像辅助').click()
    if(id!=='architecture')assert.equal(new URL(p.url()).searchParams.get('scene'),id)
    const img=await imageSamples(film(p))
    if(id!=='architecture'){
      closeupScenes.push(await png(p))
      await field(p,'皮腔长度',id==='still-life'?192.47:253.43);await ready(p)
      assert.ok(difference(img,await imageSamples(film(p)))>2,'refocusing should change the glass')
      closeupScenes.push(await png(p))
    }
    assert.ok(new Set(img.filter((v,i)=>i%4===0)).size>65,`flat or missing world ${id}`)
    for(const other of pictures)assert.ok(difference(img,other)>10,`unchanged photography in ${id}`)
    pictures.push(img)
  }
  await comparison(p,'interior-scenes','同一机位，改变皮腔长度',
    ['工作间　178.81 mm · 干版盒','工作间　192.47 mm · 近处药瓶',
     '温室　268.81 mm · 百日菊花芯','温室　253.43 mm · 后方湿度表'],closeupScenes)
  await p.reload({waitUntil:'networkidle'});await ready(p)
  assert.equal(await menu(p,'场景').inputValue(),'greenhouse','reopening a scene link must select that set')
  await chooseScene(p,'architecture')
  const lenses=await menu(p,'镜头').locator('option').evaluateAll(list=>list.map(o=>o.value))
  assert.deepEqual([...lenses].sort(),['long210','standard150','wide90'])
  const views=[]
  for(const name of lenses) {
    await menu(p,'镜头').selectOption(name);await ready(p)
    const view=await imageSamples(film(p))
    for(const earlier of views)assert.ok(difference(view,earlier)>5,'unchanged field of view on lens exchange')
    views.push(view)
  }
}

async function glass(p) {
  const img=film(p),holder=frame(p)
  assert.equal(await button(p,'正像辅助').getAttribute('aria-pressed'),'false')
  assert.match(await img.evaluate(e=>getComputedStyle(e).transform),/matrix\(-1, 0, 0, -1/)
  await button(p,'正像辅助').click()
  const baseline=await png(p)
  await menu(p,'观察视图').selectOption('detail')
  await settle(p);assert.equal(await png(p),baseline,'observer must leave all film pixels intact')
  await shot(p,'03-mechanism')
  await menu(p,'观察视图').selectOption('perspective')
  await button(p,'构图网格').click()
  const grid=p.locator('.screen-grid')
  assert.equal(await grid.getAttribute('data-pitch-mm'),'10')
  assert.equal(await grid.locator('pattern').getAttribute('width'),'10')
  const viewBox=async()=>grid.evaluate(g=>[g.viewBox.baseVal.x,g.viewBox.baseVal.y,g.viewBox.baseVal.width,g.viewBox.baseVal.height])
  assert.deepEqual(await viewBox(),[-60,-48,120,96])
  const box=await holder.boundingBox()
  await p.mouse.click(box.x+.35*box.width,box.y+.46*box.height);await ready(p)
  let c=await windowInfo(p);assert.equal(c.zoom,2)
  closeTo(c.x,18,.4);closeTo(c.y,-3.84,.4)
  await button(p,'4×').click();await ready(p)
  const oldPixels=await imageSamples(img),before=await windowInfo(p)
  await drag(p,box.x+.50*box.width,box.y+.50*box.height,.19*box.width,-.12*box.height);await ready(p)
  c=await windowInfo(p);closeTo(c.x-before.x,5.7,.1);closeTo(c.y-before.y,2.88,.1)
  assert.ok(difference(oldPixels,await imageSamples(img))>3,'pan moved scale but not film image')
  let vb=await viewBox();closeTo(vb[0],-c.x-15);closeTo(vb[1],c.y-12);assert.deepEqual(vb.slice(2),[30,24])
  await button(p,'正像辅助').click()
  vb=await viewBox();closeTo(vb[0],c.x-15);closeTo(vb[1],-c.y-12)
  assert.match(await img.evaluate(e=>getComputedStyle(e).transform),/matrix\(-1, 0, 0, -1/)
  const reversed=c
  await drag(p,box.x+.5*box.width,box.y+.5*box.height,.19*box.width,-.12*box.height);await ready(p)
  c=await windowInfo(p);closeTo(c.x-reversed.x,-5.7,.1);closeTo(c.y-reversed.y,-2.88,.1)
  await p.mouse.click(box.x+.70*box.width,box.y+.40*box.height);await ready(p)
  const tapped=await windowInfo(p);closeTo(tapped.x-c.x,6,.12);closeTo(tapped.y-c.y,2.4,.12)
  await button(p,'正像辅助').click();await button(p,'1×').click();await button(p,'构图网格').click();await ready(p)

  const off=await imageSamples(img,360,288),raw=await png(p)
  await button(p,'峰值对焦').click();await ready(p)
  const on=await imageSamples(img,360,288),withPeak=await png(p)
  assert.ok(difference(off,on)>.08,'no visible optical peak response')
  await comparison(p,'10-focus-comparison','同一张毛玻璃上的峰值对焦',['辅助关闭','辅助开启 · 标出清晰纹理'],[raw,withPeak])
  await shot(p,'06-focus');await button(p,'峰值对焦').click();await ready(p)
  assert.equal(await png(p),raw,'disabling peaking did not restore clean image')

  await button(p,'旋转后背').click();await button(p,'构图网格').click();await ready(p)
  const dims=await img.evaluate(e=>[e.width,e.height])
  closeTo(dims[1]/dims[0],120/96,.004)
  assert.deepEqual(await viewBox(),[-48,-60,96,120]);await shot(p,'13-portrait-back')
  await button(p,'构图网格').click();await ready(p)
  await comparison(p,'14-back-orientations','同一机位的横幅与竖幅 · 等毫米比例',['横幅 120 × 96 mm','竖幅 96 × 120 mm'],[raw,await png(p)],[600,480])
}

async function mechanism(p) {
  const baseline=await png(p), original=await imageSamples(film(p),300,240)
  await menu(p,'观察视图').selectOption('detail');await settle(p)
  const stage=await p.locator('.scene-canvas').boundingBox(),aspect=stage.width/stage.height
  const fov=2*Math.atan(Math.tan(33*Math.PI/360)*Math.max(1,1.35/aspect))*180/Math.PI
  const camera=new PerspectiveCamera(fov,aspect,4,480000)
  camera.position.set(350,155,-275);camera.lookAt(0,-16,85);camera.updateMatrixWorld()
  const start=sceneRig('architecture'),lens=frames(start).lens
  const glassScreen=new Vector3(...lens.o).addScaledVector(new Vector3(...lens.n),-38).project(camera)
  const x=stage.x+(1+glassScreen.x)*stage.width/2,y=stage.y+(1-glassScreen.y)*stage.height/2
  await drag(p,x,y,0,-28)
  assert.ok((await field(p,'俯仰'))>2,'dragging the physical lens did not move the front standard')
  await ready(p);assert.notEqual(await png(p),baseline)
  await button(p,'复位').click();await ready(p)
  const reset=await png(p)
  if(reset!==baseline){
    const error=difference(await imageSamples(film(p),300,240),original)
    throw Error('Reset changed the initial photograph, mean RGB difference '+error.toFixed(4))
  }
}

async function architecture(p) {
  await button(p,'正像辅助').click()
  const r=sceneRig('architecture')
  assert.ok(Math.abs(r.pitch)>=12,'street default should visibly converge')
  await button(p,'构图网格').click()
  const before=(await frame(p).screenshot()).toString('base64')
  const old=await imageSamples(film(p))
  const rise=Math.min(48,Math.round(r.extension*Math.tan(r.pitch*Math.PI/180)))
  await button(p,'皮腔 / 整机').click();await field(p,'整机俯仰',0)
  await button(p,'前组').click();await field(p,'升降',rise);await ready(p)
  const after=(await frame(p).screenshot()).toString('base64')
  assert.ok(difference(old,await imageSamples(film(p)))>6,'level plus rise did not alter the image')
  // A 13 m facade vertical observed from across the street.
  const line=[[5900,-1200,-22000],[5900,11800,-22000]]
  const slope=rig=>{
    const {lens,film}=frames(rig),[a,b]=line.map(v=>project(v,lens,film))
    return Math.abs((b.x-a.x)/(b.y-a.y))
  }
  const corrected={...r,pitch:0,front:{...r.front,rise}}
  assert.ok(slope(r)>.06&&slope(corrected)<.000001)
  await comparison(p,'11-architecture-correction','同一街角的垂直线与取景高度',
    [`整机仰拍 ${r.pitch}° · 前组 ${r.front.rise} mm`,`后背调平 0° · 前组上升 ${rise} mm`],
    [before,after].map(data=>'data:image/png;base64,'+data))
  console.log('Facade vertical, horizontal drift per unit of film height:',slope(r).toFixed(3),slope(corrected))
}

async function stitch(p) {
  // Work at 4× on portrait glass. Compare the actual panorama's non-overlapping
  // ends to both full-frame originals. Peaking and the etched grid stay out.
  await button(p,'旋转后背').click();await button(p,'后组').click()
  const shots=[]
  for(const [i,x] of [-20,20].entries()) {
    await field(p,'横移',x);await button(p,'1×').click()
    if(i===1){await button(p,'峰值对焦').click();await button(p,'构图网格').click()}
    await ready(p);shots.push(await png(p))
    await button(p,'4×').click();await button(p,'峰值对焦').click();await button(p,'构图网格').click()
    await button(p,'清晰度参照').click()
    await ready(p)
    await button(p,'移轴接片').click()
    await button(p,i?'记录第二张':'记录第一张').click()
    if(!i){await button(p,'记录第二张').waitFor();assert.equal(await button(p,'记录第二张').isEnabled(),false);await button(p,'关闭').click()}
  }
  const pano=p.getByAltText('移轴接片成片')
  await pano.waitFor({timeout:180000});assert.ok(await p.getByRole('link',{name:'保存接片'}).isVisible())
  const result=await pano.evaluate(async(img,srcs)=>{
    const [a,b]=await Promise.all(srcs.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}))
    await img.decode()
    const w=a.width,h=a.height,dx=Math.round(w*40/96)
    function compare(side,master,shift){
      const c=document.createElement('canvas');c.width=48;c.height=40
      const ctx=c.getContext('2d',{willReadFrequently:true}),span=dx*.65,left=side==='left'?2:w-span-2
      const cut=(image,x)=>{ctx.drawImage(image,x,h*.1,span,h*.8,0,0,48,40);return ctx.getImageData(0,0,48,40).data}
      const u=cut(master,left),v=cut(img,left+shift)
      return u.reduce((s,n,i)=>s+Math.abs(n-v[i]),0)/u.length
    }
    return {actual:[img.naturalWidth,img.naturalHeight],expected:[w+dx,h],left:compare('left',b,0),right:compare('right',a,dx)}
  },shots)
  assert.deepEqual(result.actual,result.expected)
  assert.ok(result.left<1.3&&result.right<1.3,'panorama contains a loupe crop or focus aid: '+JSON.stringify(result))
  await shot(p,'04-stitch')
}

async function phone(p) {
  const surface=frame(p),wheel=p.getByRole('slider',{name:'俯仰',exact:true})
  await sameViewport(p,[surface,wheel,button(p,'峰值对焦'),button(p,'选择皮腔长度')])
  assert.equal(await p.locator('.stage-panel').isVisible(),false)
  const filmBox=await surface.boundingBox();assert.ok(filmBox.width>290&&filmBox.height>225)
  await shot(p,'05-mobile')
  assert.equal(await button(p,'正像辅助').getAttribute('aria-pressed'),'false')
  await button(p,'正像辅助').tap()
  await p.touchscreen.tap(filmBox.x+filmBox.width*.48,filmBox.y+filmBox.height*.56);await ready(p)
  const before=await windowInfo(p);assert.equal(before.zoom,2)
  await touchDrag(p,filmBox.x+filmBox.width*.45,filmBox.y+filmBox.height*.50,.15*filmBox.width,.1*filmBox.height)
  await ready(p);const after=await windowInfo(p)
  closeTo(after.x-before.x,9,.4);closeTo(after.y-before.y,-4.8,.35)
  await button(p,'选择皮腔长度').tap();await button(p,'皮腔长度精调').tap()
  const drive=p.getByRole('slider',{name:'皮腔长度',exact:true}),v=Number(await drive.getAttribute('aria-valuenow'))
  const d=await drive.boundingBox()
  await touchDrag(p,d.x+d.width*.4,d.y+d.height*.5,d.width*.24,0)
  const newV=Number(await drive.getAttribute('aria-valuenow'))
  assert.ok(newV!==v&&Math.abs(newV-v)<.5,'touch fine drive failed')
  await button(p,'峰值对焦').tap();await ready(p);await shot(p,'09-focus-mobile')
  await button(p,'机位').tap();await sameViewport(p,[p.locator('.viewport'),drive])
  await button(p,'毛玻璃').tap();await sameViewport(p,[surface,drive])
  await button(p,'旋转后背').tap();await ready(p)
  const portrait=await film(p).boundingBox();closeTo(portrait.width/portrait.height,.8,.003)
}

try {
  for(const name of groups) {
    const isPhone=name==='phone'
    const context=await browser.newContext({viewport:isPhone?{width:390,height:844}:{width:1440,height:900},hasTouch:isPhone,deviceScaleFactor:1})
    const p=await context.newPage()
    p.setDefaultTimeout(16000)
    p.on('pageerror',e=>errors.push(e.message))
    p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    try{
      const entry=new URL(url)
      if(name==='stitch')entry.searchParams.set('grain','0')
      await p.goto(entry.href,{waitUntil:'networkidle'});await ready(p)
      await ({scenes,glass,mechanism,architecture,stitch,phone})[name](p)
      assert.deepEqual(errors,[])
      console.log('PASS',name)
    }finally{await context.close()}
  }
}finally{await browser.close()}
