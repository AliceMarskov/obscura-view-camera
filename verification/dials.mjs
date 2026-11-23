import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'

const testApp = [
  "import {useState} from 'react';",
  "import {createRoot} from 'react-dom/client';",
  "import {InstrumentPanel} from './src/InstrumentPanel';",
  "import {initial} from './src/optics';",
  "function Host(){",
  "  const [rig,set]=useState(initial), [axis,setAxis]=useState('tilt'), [tab,setTab]=useState('front');",
  "  const move=(s,k,v)=>set(prev=>({...prev,[s]:{...prev[s],[k]:v}}));",
  "  const body=(k,v)=>set(prev=>({...prev,[k]:v}));",
  "  return <InstrumentPanel rig={rig} axis={axis} tab={tab} defaultExtension={174} defaultAperture={8}",
  "    onTab={setTab} onAxis={setAxis} move={move} body={body} reset={()=>{set(initial());setTab('front');setAxis('tilt')}}/>;",
  "}",
  "createRoot(document.getElementById('root')).render(<Host/>);",
].join('\n')
const output=await build({stdin:{contents:testApp,loader:'tsx',resolveDir:process.cwd()},
  write:false,outdir:'in-memory',bundle:true,jsx:'automatic',platform:'browser',format:'iife',
  define:{'process.env.NODE_ENV':'"production"'}})
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
  const page=await browser.newPage({hasTouch:true,viewport:{width:390,height:650},deviceScaleFactor:1})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.setContent('<html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#e9e6dc;margin:18px;font:16px system-ui}#root{max-width:425px;margin:auto}</style><div id="root"></div></html>')
  const content=ext=>output.outputFiles.find(f=>f.path.endsWith(ext)).text
  await page.addStyleTag({content:content('.css')})
  await page.addScriptTag({content:content('.js')})
  const slider=name=>page.getByRole('slider',{name,exact:true})
  const field=name=>page.getByRole('spinbutton',{name:name+'数值',exact:true})
  const button=name=>page.getByRole('button',{name,exact:true})
  const val=async n=>Number(await slider(n).getAttribute('aria-valuenow'))
  const input=async(n,v)=>{await field(n).fill(String(v));await field(n).press('Enter')}
  const choose=n=>button('选择'+n).click()
  const tilt='俯仰',focus='皮腔长度',iris='工作光圈'
  await slider(tilt).waitFor()

  // The shared drive selects a parameter, but the mechanism values remain independent.
  await slider(tilt).press('ArrowUp'); assert.equal(await val(tilt),.01)
  await button('减小俯仰').click(); assert.equal(await val(tilt),0)
  await input(tilt,888);assert.equal(await val(tilt),18)
  await field(tilt).fill('-13');await field(tilt).press('Escape');await field(tilt).press('Tab')
  assert.equal(await val(tilt),18)
  await input(tilt,3.92);assert.equal(await val(tilt),3.92)
  await button('后组').click();assert.equal(await val(tilt),0)
  await button('前组').click();assert.equal(await val(tilt),3.92)
  await slider(tilt).dblclick();assert.equal(await val(tilt),0)
  await choose(focus);await input(focus,174)
  const rail=slider(focus+'全行程')
  const bed=await rail.boundingBox()
  await page.mouse.click(bed.x+1,bed.y+bed.height/2);assert.equal(await val(focus),150)
  await page.mouse.click(bed.x+bed.width-1,bed.y+bed.height/2);assert.equal(await val(focus),263)
  await rail.press('ArrowLeft');assert.equal(await val(focus),262.99)
  await slider(focus).dblclick();assert.equal(await val(focus),174)

  const hardware=await slider(focus).boundingBox()
  const x=hardware.x+hardware.width*.26,y=hardware.y+hardware.height/2
  async function drag(dx){
    await page.mouse.move(x,y);await page.mouse.down()
    const old=await val(focus)
    await page.mouse.move(x+dx,y,{steps:5});await page.mouse.up()
    return Number(((await val(focus))-old).toFixed(2))
  }
  const coarse=await drag(64)
  assert.ok(coarse>23&&coarse<53, 'coarse drag traverses a substantial fraction of travel')
  await input(focus,174);await button(focus+'精调').click()
  assert.equal(await drag(64),.08,'fine reduction is 8 CSS px per .01 mm')
  await button('增大皮腔长度').click();assert.equal(await val(focus),174.09)
  await field(focus).fill('175.37');await field(focus).press('Tab');assert.equal(await val(focus),175.37)
  await button(focus+'粗调').click();await page.keyboard.down('Shift')
  assert.equal(await drag(-32),-.04);await page.keyboard.up('Shift')
  await input(focus,174)
  // Change gears in flight. The stationary pointer introduces no reassignment to an absolute value.
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+12,y)
  const beforeFine=await val(focus)
  await page.keyboard.down('Shift');await page.mouse.move(x+20,y);await page.mouse.up();await page.keyboard.up('Shift')
  assert.ok(Math.abs((await val(focus))-beforeFine-.01)<1e-6)

  // Trusted Chromium touch events exercise pointer capture, cancellation and keyboard-free fine adjustment.
  const client=await page.context().newCDPSession(page)
  const touch=(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:x===undefined?[]:[{x,y,id:1,radiusX:3,radiusY:3}]})
  await button(focus+'精调').tap();await input(focus,174)
  await field(focus).fill('182.50')
  await page.mouse.move(x,y);await page.mouse.down()
  assert.equal(await val(focus),182.5,'pressing the wheel commits the active number field')
  await page.mouse.move(x+16,y);await page.mouse.up()
  assert.equal(await val(focus),182.52,'the next drag must begin at the just-entered value')
  await input(focus,174)
  await touch('touchStart',x,y);await touch('touchMove',x+32,y);await touch('touchEnd')
  assert.equal(await val(focus),174.04)
  await touch('touchStart',x,y);await touch('touchMove',x+72,y)
  assert.equal(await val(focus),174.13)
  await touch('touchCancel');assert.equal(await val(focus),174.04)
  await choose(iris);await input(iris,14.8);assert.equal(await val(iris),16)
  await slider(iris).press('ArrowRight');assert.equal(await val(iris),22)
  await slider(iris).dblclick();assert.equal(await val(iris),8)
  await choose(focus)
  assert.equal(await button(focus+'精调').getAttribute('aria-pressed'),'true')
  assert.equal(await val(focus),174.04)
  for(const width of [320,390,820,1440]){
    await page.setViewportSize({width,height:720})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    const bounds=await field(focus).boundingBox()
    assert.ok(bounds.width>56,'all six characters of the bellows value must be readable')
  }
  if(process.argv[2]) await page.locator('#root').screenshot({path:process.argv[2]})
  assert.deepEqual(errors,[])
  console.log('PASS: full-travel endpoints, independent movements, coarse travel ('+coarse+' mm / 64 px), fine travel (0.08 mm / 64 px), in-flight gear change, touch precision and cancellation, keyboard, typed values, stops, reset and four layouts.')
} finally {await browser.close()}
