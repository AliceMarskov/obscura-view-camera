import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'

// Execute the production renderer in an actual WebGL context. Both targets
// project identical chart detail, at 2 m and 45 m, on opposite sides of frame.
async function chartTest() {
  const film=document.querySelector('canvas')
  const r=initial(),scene=new THREE.Scene(),glass=new GroundGlass(film,r)
  scene.background=new THREE.Color('#92928c')
  r.aperture=4
  const size=128, texels=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const c=((x>>2)+(y>>4))%2?210:45
    texels.set([c,c,c,255],4*(y*size+x))
  }
  const texture=new THREE.DataTexture(texels,size,size)
  texture.colorSpace=THREE.SRGBColorSpace
  texture.magFilter=THREE.LinearFilter
  texture.minFilter=THREE.LinearFilter
  texture.needsUpdate=true
  const material=new THREE.MeshBasicMaterial({map:texture})
  for(const [side,distance] of [[-1,2000],[1,45000]]) {
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(.32*distance,.4*distance),material)
    plate.position.set(side*.2*distance,0,-distance)
    scene.add(plate)
  }
  glass.resize(420)
  const settle=async(subject=scene)=>{
    let i=0
    while(glass.pending&&i<260) {
      glass.render(subject)
      if(++i%8===0)await new Promise(resolve=>setTimeout(resolve,0))
    }
    if(glass.pending)throw Error('Film did not converge')
  }
  const pixels=()=>{
    const copy=document.createElement('canvas')
    copy.width=film.width;copy.height=film.height
    const ctx=copy.getContext('2d')
    ctx.drawImage(film,0,0)
    return ctx.getImageData(0,0,copy.width,copy.height).data
  }
  const fractions=(clean,peaked)=>{
    const regions=[[.09,.38],[.62,.91]]
    return regions.map(([left,right])=>{
      let changed=0,total=0
      for(let y=Math.floor(.32*film.height);y<.68*film.height;y++)
        for(let x=Math.floor(left*film.width);x<right*film.width;x++) {
          const i=4*(x+y*film.width)
          if(peaked[i]-peaked[i+1]>45&&Math.abs(peaked[i+1]-clean[i+1])>8)changed++
          total++
        }
      return changed/total
    })
  }

  const report=[]
  for(const distance of [2000,45000]) {
    r.extension=r.focal*distance/(distance-r.focal)
    glass.setState({...r});glass.setPeaking(false);await settle()
    const clean=pixels(),raw=await glass.captureFullFrame(scene)
    glass.setPeaking(true);await settle()
    const peak=pixels()
    const cleanWithPeaking=await glass.captureFullFrame(scene)
    if(raw!==cleanWithPeaking)throw Error('Focus assist entered the captured frame')
    const pixelsAfterCapture=pixels()
    if(!peak.every((v,i)=>v===pixelsAfterCapture[i]))throw Error('Focus assist was not restored after capture')
    report.push(fractions(clean,peak))
  }
  const original=await glass.captureFullFrame(scene)
  glass.setPeaking(false);await settle()
  const printStock={temperature:.12,contrast:1.08,saturation:.92,shadows:[.96,.98,1.04],highlights:[1.04,1.01,.95]}
  glass.setAppearance(printStock,false);await settle()
  const cleanPrint=await glass.captureFullFrame(scene), cleanDisplay=pixels()
  if(cleanPrint===original)throw Error('The scene stock did not reach the print')
  glass.setAppearance(printStock,true);await settle()
  const screen=pixels(),changed=screen.filter((value,i)=>value!==cleanDisplay[i]).length
  if(changed<.02*screen.length)throw Error('Etched screen did not visibly change its display')
  if(await glass.captureFullFrame(scene)!==cleanPrint)throw Error('Etched screen entered the print')
  if(!pixels().every((v,i)=>v===screen[i]))throw Error('Screen texture was not restored after capture')
  const pin=document.createElement('canvas')
  glass.setFocusPin(pin,{x:19,y:2},4)
  await settle()
  if(pin.dataset.samples!=='48')throw Error('Pinned magnifier did not converge')
  const firstPin=pin.toDataURL()
  glass.setLoupe(4,{x:-20,y:2});await settle()
  if(pin.toDataURL()!==firstPin)throw Error('Panning B changed the pinned A field')
  glass.setState({...r,extension:r.focal*2000/(2000-r.focal)});await settle()
  if(pin.toDataURL()===firstPin)throw Error('A did not follow bellows focus')
  glass.setSharpReference(true);await settle()
  const cleanReference=pixels()
  glass.setAppearance(printStock,false);await settle()
  if(!pixels().every((v,i)=>v===cleanReference[i]))throw Error('Screen grain contaminated the reference')
  glass.setFocusPin(null);glass.setAppearance();glass.setSharpReference(false);glass.setState({...r});glass.setLoupe(1);await settle()
  glass.setLoupe(4,{x:-20,y:2});await settle()
  glass.setLoupe(4,{x:18,y:4});glass.render(scene)
  const panFirst=film.dataset.samples
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,80)))
  await settle()
  const cropSamples=Number(film.dataset.samples)
  const cropCapture=await glass.captureFullFrame(scene)
  const cleanLoupe=original===cropCapture
  glass.setPeaking(false);await settle()
  const opticalCrop=pixels()
  // At infinity-side focus the loupe is on the 2 m near chart. The
  // underlying bright/dark bars must recover in center-pupil reference.
  function chartContrast(rgba) {
    const gray=[]
    for(let y=Math.floor(film.height*.34);y<film.height*.66;y+=3)
      for(let x=Math.floor(film.width*.34);x<film.width*.66;x+=2)
        gray.push(rgba[4*(x+y*film.width)])
    gray.sort((a,b)=>a-b)
    return gray[Math.floor(.92*gray.length)]-gray[Math.floor(.08*gray.length)]
  }
  glass.setSharpReference(true);await settle()
  const referenceCrop=pixels()
  const contrast=[chartContrast(opticalCrop),chartContrast(referenceCrop)]
  if(Number(film.dataset.samples)!==4)throw Error('Center-pupil reference did not converge in four samples')
  if(await glass.captureFullFrame(scene)!==original)throw Error('Sharpness reference appeared in a finite-aperture capture')
  const restoredReference=pixels()
  if(!referenceCrop.every((v,i)=>v===restoredReference[i]))throw Error('Sharpness reference did not return after capture')
  glass.setSharpReference(false);glass.render(scene)
  const restoredOptics=pixels()
  if(glass.pending||!opticalCrop.every((v,i)=>v===restoredOptics[i]))throw Error('Finite-aperture render did not return intact in one frame')

  // Read untonemapped uniform-field irradiance in linear light. Rendering the
  // same off-axis film area at 1×/4× must not renormalize its brightness.
  const flat=new THREE.Scene()
  flat.background=new THREE.Color(.25,.25,.25)
  glass.renderer.toneMapping=THREE.NoToneMapping
  const normal={...r,extension:r.focal}
  glass.setPeaking(false);glass.setLoupe(1);glass.setState(normal);await settle(flat)
  function linearAt(x,y) {
    const srgb=pixels()[4*(x+y*film.width)]/255
    return srgb<=.04045?srgb/12.92:((srgb+.055)/1.055)**2.4
  }
  const reference=linearAt(Math.floor(film.width/2),Math.floor(film.height/2))
  const portrait={...normal,width:96,height:120,rear:{...r.rear,tilt:8,shift:27}}
  glass.setState(portrait);await settle(flat)
  const shape=[film.width,film.height,glass.fullCanvas.width,glass.fullCanvas.height]
  const photometry=[]
  function compare(window,u,v) {
    const x=Math.floor(u*film.width),y=Math.floor(v*film.height)
    const at=screenToFilm(window,(x+.5)/film.width,(y+.5)/film.height)
    photometry.push([linearAt(x,y)/reference,relativeIllumination(portrait,at.x,at.y)])
  }
  const whole=filmWindow(portrait,1)
  for(const [u,v] of [[.5,.5],[.14,.18],[.85,.79]])compare(whole,u,v)
  const crop=filmWindow(portrait,4,{x:24,y:28})
  glass.setLoupe(4,crop);await settle(flat);compare(crop,.5,.5)
  const portraitCapture=await glass.captureFullFrame(flat)
  const decoded=new Image();decoded.src=portraitCapture;await decoded.decode()

  // A singular surface derivative can produce NaN at one position on the
  // pupil. Test both one bad ray and half the pupil to catch blackening from
  // either non-finite propagation or dividing by all initially requested rays.
  const faultScene=new THREE.Scene()
  const materialWithFault=new THREE.ShaderMaterial({
    uniforms:{fault:{value:0}},
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform int fault;void main(){
      bool invalid=(fault==1 && length(cameraPosition.xy)<.001) || (fault==2 && cameraPosition.x>0.);
      float light=invalid ? uintBitsToFloat(0x7fc00000u) : .25;
      gl_FragColor=vec4(vec3(light),1.);
    }`
  })
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),materialWithFault)
  sheet.position.z=-2000;faultScene.add(sheet)
  glass.setState(normal);glass.setLoupe(4);glass.resize(96)
  const invalidRadiance=[]
  for(const fault of [0,1,2]){
    materialWithFault.uniforms.fault.value=fault;glass.setState(normal);await settle(faultScene)
    const x=Math.floor(film.width/2),y=Math.floor(film.height/2)
    const integrated=new Uint16Array(4)
    glass.renderer.readRenderTargetPixels(glass.crop.average,x,y,1,1,integrated)
    invalidRadiance.push([THREE.DataUtils.fromHalfFloat(integrated[3]),linearAt(x,y)])
  }
  // A small viewing canvas must yield the same photograph as the native
  // high-resolution sensor. Compare decoded pixels, not PNG compression.
  glass.setState(r);glass.resize(120);glass.setLoupe(4);glass.setPeaking(true);await settle()
  const loupeBefore=film.toDataURL(), sizeBefore=[film.width,film.height]
  const cancelled=promise=>promise.then(()=>false,error=>error.name==='AbortError')
  const superseded=cancelled(glass.capturePrint(scene))
  const controller=new AbortController()
  const closedPrint=cancelled(glass.capturePrint(scene,controller.signal))
  controller.abort()
  if(!await superseded || !await closedPrint)throw Error('Cancelled print completed')
  const changedRig=cancelled(glass.capturePrint(scene))
  glass.setState({...r,extension:r.extension+1})
  if(!await changedRig)throw Error('Print survived an optical state change')
  glass.setState(r);await settle()
  const print=await glass.capturePrint(scene)
  if(film.width!==sizeBefore[0]||film.height!==sizeBefore[1]||film.toDataURL()!==loupeBefore)throw Error('High-resolution exposure changed the magnified glass')
  glass.setLoupe(1);glass.setPeaking(false);glass.resize(1200);await settle()
  const native=await glass.captureFullFrame(scene)
  async function decode(src){
    const image=new Image();image.src=src;await image.decode()
    const sheet=document.createElement('canvas');sheet.width=image.width;sheet.height=image.height
    const ctx=sheet.getContext('2d');ctx.drawImage(image,0,0)
    return ctx.getImageData(0,0,sheet.width,sheet.height)
  }
  const [fromPhone,fromNative]=await Promise.all([decode(print),decode(native)])
  if(fromPhone.width!==1200||fromPhone.height!==960||fromNative.width!==1200)throw Error('Wrong native print dimensions')
  if(!fromPhone.data.every((v,i)=>v===fromNative.data[i]))throw Error('Print was enlarged from the display or contaminated by a viewing aid')
  sheet.geometry.dispose();materialWithFault.dispose();glass.dispose()
  return {report,panFirst,cropSamples,cleanLoupe,contrast,photometry,shape,invalidRadiance,portraitCaptureSize:[decoded.width,decoded.height]}
}

const bundle=await build({stdin:{contents:`
  import * as THREE from 'three';
  import {GroundGlass} from './src/ground-glass.ts';
  import {initial} from './src/optics.ts';
  import {filmWindow,screenToFilm,relativeIllumination} from './src/focus-feedback.ts';
  window.chartTest = ${chartTest.toString()};
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'})
const browser=await chromium.launch({channel:'msedge',headless:true,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try {
  const page=await browser.newPage({viewport:{width:600,height:460}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.setContent('<canvas></canvas>')
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  const result=await page.evaluate(()=>window.chartTest())
  assert.deepEqual(errors,[])
  const [[nearSharp,farSoft],[nearSoft,farSharp]]=result.report
  assert.ok(nearSharp>.08&&farSharp>.08,`missing in-focus texture: ${result.report}`)
  assert.ok(farSoft<.001&&nearSoft<.001,`out-of-focus texture highlighted: ${result.report}`)
  assert.equal(result.panFirst,'0')
  assert.ok(result.cropSamples>=48&&result.cleanLoupe)
  assert.ok(result.contrast[1]>result.contrast[0]*1.5,`Near chart did not resolve in sharpness reference: ${result.contrast}`)
  assert.deepEqual(result.shape,[420,525,420,525])
  assert.deepEqual(result.portraitCaptureSize,[420,525])
  const [[all,clean],[oneMissing,withOneMissing],[half,withHalfMissing]]=result.invalidRadiance
  assert.ok(all>.999 && oneMissing>.96 && oneMissing<all && half>.45 && half<.55,`invalid pupil coverage: ${result.invalidRadiance}`)
  assert.ok(clean>.23 && Math.abs(clean-withOneMissing)<.006 && Math.abs(clean-withHalfMissing)<.006,`invalid radiance normalization: ${result.invalidRadiance}`)
  for(const [measured,expected] of result.photometry)assert.ok(Math.abs(measured-expected)<.021,`irradiance ${measured} vs ${expected}`)
  console.log('Peak fractions [near, far], focus at 2 m and 45 m:',result.report)
  console.log('Unmarked captures at 1×/4×, immediate drag preview and settled optical crop verified.')
  console.log('Verified print grading, screen-only grain, reference purity and independent live A/B focusing.')
  console.log('120 px glass → 1200 × 960 print equals native sensor pixels; cancellation, supersession and loupe restoration passed.')
  console.log('Near chart contrast, defocused optical / center-pupil reference:',result.contrast)
  console.log('Portrait uniform field, GPU / expected relative illumination:',result.photometry)
  console.log('Valid pupil coverage / output luminance with zero, one and half of rays invalid:',result.invalidRadiance)
} finally {await browser.close()}
