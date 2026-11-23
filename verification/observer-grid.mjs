import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium} from 'playwright-core'

const url=process.argv[2]?pathToFileURL(path.resolve(process.argv[2])).href:(process.env.WORKBENCH_URL??'http://127.0.0.1:5173/')
const browser=await chromium.launch({channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const p=await browser.newPage({viewport:{width:1280,height:800}})
  const errors=[]
  p.on('pageerror',e=>errors.push(e.message))
  p.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  await p.goto(url)
  const button=name=>p.getByRole('button',{name,exact:true})
  await button('机位').click()
  const floor=button('地面网格')
  const settle=()=>p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))
  const read=selector=>p.locator(selector).evaluate(c=>c.toDataURL())
  const images=[]
  for(const [scene,view,label,layout='stage'] of [
    ['architecture','perspective','巴黎街角'],['architecture','top','巴黎俯视'],
    ['still-life','perspective','银盐工作间'],['greenhouse','perspective','标本温室'],
    ['architecture','side','街道侧视'],['architecture','perspective','桌面机位小窗','small'],
    ['architecture','perspective','手机竖屏','phone']
  ]){
    if(layout==='small')await button('毛玻璃').click()
    if(layout==='phone'){await p.setViewportSize({width:390,height:844});await button('机位').click()}
    await p.getByRole('combobox',{name:'场景'}).selectOption(scene)
    await p.getByRole('combobox',{name:'观察视图'}).selectOption(view)
    await settle()
    await p.waitForFunction(()=>{
      const film=document.querySelector('.exposure canvas')
      return !document.querySelector('.loading-scene')&&(!film.clientWidth||film.dataset.converged==='true')
    },null,{timeout:240000})
    if(await floor.getAttribute('aria-pressed')==='true')await floor.click()
    await settle()
    const off=await read('.scene-canvas')
    const visibleFilm=await p.locator('.exposure canvas').isVisible()
    const photo=visibleFilm?await read('.exposure canvas'):null
    await floor.click();await settle()
    const on=await read('.scene-canvas')
    if(visibleFilm)assert.equal(photo,await read('.exposure canvas'),'observation grid leaked onto the photograph')
    const fraction=await p.evaluate(async([off,on])=>{
      const sample=async url=>{
        const i=new Image();i.src=url;await i.decode()
        const c=document.createElement('canvas');c.width=i.width;c.height=i.height
        const ctx=c.getContext('2d');ctx.drawImage(i,0,0)
        return ctx.getImageData(0,0,i.width,i.height).data
      }
      const a=await sample(off),b=await sample(on)
      let changed=0
      for(let i=0;i<a.length;i+=4){
        if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>18)changed++
      }
      return 4*changed/a.length
    },[off,on])
    console.log(label,(100*fraction).toFixed(2)+'% of observer pixels changed visibly')
    images.push({label,off,on,fraction})
  }
  const sheet=await p.evaluate(async images=>{
    const first=new Image();first.src=images[0].off;await first.decode()
    const c=document.createElement('canvas'),w=490,h=Math.round(w*first.height/first.width),gap=12
    c.width=2*w+3*gap;c.height=images.length*(h+40)+gap
    const ctx=c.getContext('2d');ctx.fillStyle='#eeeee6';ctx.fillRect(0,0,c.width,c.height)
    ctx.font='16px "Microsoft YaHei",sans-serif';ctx.fillStyle='#27342d'
    for(const [r,row] of images.entries())for(const [col,key] of ['off','on'].entries()){
      const x=gap+(gap+w)*col,y=gap+r*(h+40),im=new Image();im.src=row[key];await im.decode()
      ctx.fillText(row.label+' · '+(col?'地面网格开启':'地面网格关闭'),x,y+18)
      ctx.drawImage(im,x,y+26,w,h)
    }
    return c.toDataURL().split(',')[1]
  },images.slice(0,4))
  await writeFile(process.env.GRID_SCREENSHOT??'verification/observer-grid.png',Buffer.from(sheet,'base64'))
  for(const {label,fraction} of images)assert.ok(fraction>.005,'grid too faint in '+label)
  assert.deepEqual(errors,[])
}finally{
  await browser.close()
}
