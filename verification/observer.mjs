import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium} from 'playwright-core'

const baseline=process.argv.includes('--baseline')
const file=process.argv[2]||'../暗箱-大画幅取景台.html'
const url=pathToFileURL(path.resolve(file)).href
const browser=await chromium.launch({channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const p=await browser.newPage({viewport:{width:1250,height:800},offline:true})
  const errors=[]
  p.on('pageerror',error=>errors.push(error.message))
  const button=name=>p.getByRole('button',{name,exact:true})
  const field=p.getByRole('spinbutton',{name:'俯仰数值',exact:true})
  const stage=p.locator('.viewport')
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))
  const setAngle=async value=>{await field.fill(String(value));await field.press('Enter');await settle()}
  async function toggle(name,on){
    const control=button(name)
    if((await control.getAttribute('aria-pressed')==='true')!==on)await control.click()
    await settle()
  }
  const snapshot=async()=>{await settle();return 'data:image/png;base64,'+(await stage.screenshot()).toString('base64')}
  await p.goto(url)
  await button('机位').click()
  await p.waitForFunction(()=>!document.querySelector('.loading-scene'))
  await p.getByRole('combobox',{name:'观察视图'}).selectOption('side')
  await button('后组').click()
  await toggle('光学平面',true);await toggle('光线',true);await toggle('地面网格',true)
  const photos=[]
  for(const tilt of [-18,-.1,0,.1,18]){
    await setAngle(tilt)
    if(!baseline){
      const angle=Number.parseFloat(await p.locator('.plane-reading b').textContent())
      const radians=tilt*Math.PI/180
      const expected=Math.atan(90*Math.abs(Math.tan(radians))/.38)*180/Math.PI
      assert.ok(Math.abs(angle-expected)<.01)
      assert.match(await p.locator('[data-reading=focus]').textContent(),/21\.4/)
    }
    if(Math.abs(tilt)<=.1)photos.push(await snapshot())
  }
  if(!baseline){
    await setAngle(0)
    await button('俯仰精调').click();await button('增大俯仰').click()
    assert.equal(Number(await field.inputValue()),.01)
    assert.match(await p.locator('.plane-reading b').textContent(),/2\.37°/)
  }
  const sheet=await p.evaluate(async photos=>{
    const imgs=await Promise.all(photos.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}))
    const w=456,gap=12,margin=18,h=Math.round(w*imgs[0].height/imgs[0].width)
    const c=document.createElement('canvas');c.width=2*margin+3*w+2*gap;c.height=margin+h+43
    const ctx=c.getContext('2d');ctx.fillStyle='#eeeee6';ctx.fillRect(0,0,c.width,c.height)
    ctx.fillStyle='#29332c';ctx.font='17px "Microsoft YaHei",sans-serif'
    imgs.forEach((i,n)=>{const x=margin+n*(w+gap);ctx.drawImage(i,x,margin,w,h)
      ctx.fillText(['后组俯仰 −0.10°','后组俯仰 0.00°','后组俯仰 +0.10°'][n],x,margin+h+28)})
    return c.toDataURL().split(',')[1]
  },photos)
  const output=baseline?path.join(tmpdir(),'obscura-old-observer.png'):'verification/paris-rear-tilt.png'
  await writeFile(output,Buffer.from(sheet,'base64'));assert.deepEqual(errors,[])
  console.log('PASS observer sweep:',output)
}finally{await browser.close()}
