import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from 'playwright-core'

// Tilt a physical grey card in depth. Its intersection with the focus plane
// must move by a calculable number of pixels; an untouched second renderer
// shares the same scene and material, as the real ground glass does.
function measure(){
  const scene=new THREE.Scene(),observer=new THREE.WebGLRenderer({preserveDrawingBuffer:true})
  const filmRenderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true})
  for(const renderer of [observer,filmRenderer])renderer.setSize(400,180)
  const camera=new THREE.OrthographicCamera(-200,200,90,-90,1,4000)
  const material=new THREE.MeshBasicMaterial({color:0x818181})
  const board=new THREE.Mesh(new THREE.PlaneGeometry(1100,400),material)
  board.rotation.y=Math.PI/3;board.position.z=-1087.5
  const group=new THREE.Group();group.add(board);scene.add(group)
  const contour=new FocusContour(),r=initial()
  contour.attach(group,observer)
  const draw=(renderer,on)=>{
    contour.show(on);renderer.render(scene,camera)
    const canvas=document.createElement('canvas')
    canvas.width=400;canvas.height=180
    const context=canvas.getContext('2d')
    context.drawImage(renderer.domElement,0,0)
    return context.getImageData(0,90,400,1).data
  }
  const box={min:[-900,-200,-2000],max:[900,200,-350]}
  const readings=[]
  for(const u of [1087.5,1000,1180]){
    r.extension=r.focal*u/(u-r.focal)
    const {lens,film}=frames(r)
    contour.update(lens,film,r,box,true)
    const naked=draw(observer,false),marked=draw(observer,true)
    const photographic=draw(filmRenderer,true)
    const changed=Array.from({length:400},(_,x)=>x).filter(x=>marked[x*4+1]-naked[x*4+1]>15)
    readings.push({u,changed,photoMatches:naked.every((v,i)=>v===photographic[i]),
      expectedX:200+(u-1087.5)/Math.tan(Math.PI/3)-.5})
  }
  observer.dispose();filmRenderer.dispose();material.dispose();board.geometry.dispose()
  return readings
}

const {outputFiles}=await build({stdin:{contents:`
  import * as THREE from 'three'
  import {FocusContour} from './src/focus-contour'
  import {initial,frames} from './src/optics'
  window.measure=${measure.toString()}
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'})
const browser=await chromium.launch({channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.addScriptTag({content:outputFiles[0].text})
  const readings=await page.evaluate(()=>window.measure())
  assert.deepEqual(errors,[])
  for(const {changed,expectedX,photoMatches} of readings){
    assert.ok(changed.length>=1&&changed.length<=3,`unexpected contour width: ${changed}`)
    assert.ok(Math.abs(changed.reduce((v,x)=>v+x,0)/changed.length-expectedX)<.8)
    assert.ok(photoMatches,'observer contour leaked into photographic path')
  }
  console.log('WebGL tilted-card intersection and clean film:',readings)
}finally{await browser.close()}
