import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Mesh,MeshBasicMaterial,PlaneGeometry,Vector3} from 'three'
import {initial, frames, objectRay, coverage, sub} from '../src/optics.ts'
import {filmWindow, filmToScreen, screenToFilm, focusFeedback, panFilmWindow, relativeIllumination} from '../src/focus-feedback.ts'
import {pupilCamera, pupilSample} from '../src/ground-glass.ts'

test('seven-blade iris preserves f-number and samples equal areas across every triangle',()=>{
  const blades=7, sector=2*Math.PI/blades, radius=Math.sqrt(sector/Math.sin(sector))
  const apothem=radius*Math.cos(sector/2)
  assert.ok(Math.abs(blades*radius*radius*Math.sin(sector)/2-Math.PI)<1e-12)
  const bins=Array(blades).fill(0)
  let inner=0,xMean=0,yMean=0
  const count=8192
  for(let i=1;i<=count;i++){
    const {x,y}=pupilSample(i,blades)
    const angle=(Math.atan2(y,x)-.22+2*Math.PI)%(2*Math.PI)
    const bin=Math.floor(angle/sector), distance=Math.hypot(x,y)
    const boundary=apothem/Math.cos(angle-(bin+.5)*sector)
    assert.ok(distance<=boundary+1e-12)
    bins[bin]++
    if(distance<boundary/2)inner++
    xMean+=x/count;yMean+=y/count
  }
  assert.ok(bins.every(n=>Math.abs(n-count/blades)<4))
  assert.ok(Math.abs(inner/count-.25)<.002)
  assert.ok(Math.hypot(xMean,yMean)<.002)
})
import {createScenePreset,scenePresets} from '../src/scenes.ts'
import {sceneRig} from '../src/equipment.ts'
import {ProbeSurfaces} from '../src/probe-surfaces.ts'

const near = (a,b,epsilon=1e-8) => assert.ok(Math.abs(a-b)<epsilon, `${a} versus ${b}`)

test('loupe samples the rear film in mm, round-trips either viewing orientation and clamps at its edge', () => {
  const r = initial()
  for (const zoom of [1,2,4]) {
    const w = filmWindow(r,zoom,{x:999,y:-999})
    near(w.x+w.width/2,r.width/2); near(w.y-w.height/2,-r.height/2)
    near(w.width,r.width/zoom); near(w.height,r.height/zoom)
    for (const upright of [true,false]) {
      for (const [u,v] of [[0,0],[1,1],[.25,.78]]) {
        const p=screenToFilm(w,u,v,upright), at=filmToScreen(w,p,upright)
        near(at.x,u); near(at.y,v)
      }
    }
  }
})

test('all sampled pupil rays project to the re-centered 4x crop, including rear tilt and swing', () => {
  const r=initial(); r.front.tilt=8; r.rear.swing=-13; r.rear.rise=21; r.rear.shift=40
  const {lens,film}=frames(r), w=filmWindow(r,4,{x:28,y:-20})
  for(const [a,b] of [[0,0],[12,-5],[-9,7]]) {
    const camera=pupilCamera(r,a,b,w)
    for(const [u,v] of [[0,0],[1,1],[.17,.8]]) {
      const point=screenToFilm(w,u,v), ray=objectRay(lens,film,r.focal,point.x,point.y,a,b)
      const ndc=new Vector3(...ray.origin).addScaledVector(new Vector3(...ray.direction),8).project(camera)
      near(ndc.x,u*2-1); near(ndc.y,1-v*2)
    }
  }
})

test('the same grabbed film detail follows the pointer on upright and inverted glass at every loupe magnification', () => {
  const r=initial()
  for (const zoom of [2,4]) for (const upright of [false,true]) {
    const start=filmWindow(r,zoom,{x:-4,y:3})
    const grabbed=screenToFilm(start,.4,.55,upright)
    const end=panFilmWindow(r,zoom,start,.18,-.21,upright)
    const displayed=filmToScreen(end,grabbed,upright)
    near(displayed.x,.58);near(displayed.y,.34)
    const corner=panFilmWindow(r,zoom,start,12,-10,upright)
    near(Math.abs(corner.x)+corner.width/2,r.width/2)
    near(Math.abs(corner.y)+corner.height/2,r.height/2)
  }
  assert.deepEqual(panFilmWindow(r,1,filmWindow(r,1),5,7),filmWindow(r,1))
})

test('a shifted loupe renders metre-scale city streets and distant landscape at all three focal lengths', () => {
  for(const f of [90,150,210]) {
    const r=initial(); r.focal=f; r.extension=f*1.01; r.rear.rise=15; r.rear.tilt=10
    const {lens,film}=frames(r),w=filmWindow(r,4,{x:-21,y:18})
    const camera=pupilCamera(r,2,3,w),ray=objectRay(lens,film,f,w.x,w.y,2,3)
    for(const metres of [.5,16,45,220,3_000]) {
      const point=new Vector3(...ray.origin).addScaledVector(new Vector3(...ray.direction).normalize(),metres*1000)
      const clip=point.clone().project(camera)
      near(clip.x,0);near(clip.y,0)
      assert.ok(clip.z> -1&&clip.z<1,`clipped ${metres} m with ${f} mm lens`)
      assert.ok(clip.unproject(camera).distanceTo(point)<metres*1e-6)
    }
  }
})

test('image circle in a loupe is evaluated at its original shifted physical film point',()=>{
  const r=initial(); r.extension=r.focal; r.rear.shift=48
  const {lens,film}=frames(r), whole=filmWindow(r,1)
  const crop=filmWindow(r,4,{x:40,y:20})
  for (const u of [.1,.5,.9]) {
    const p=screenToFilm(crop,u,.5), fullScreen=filmToScreen(whole,p)
    const same=screenToFilm(whole,fullScreen.x,fullScreen.y)
    near(coverage(lens,film,r,p.x,p.y),coverage(lens,film,r,same.x,same.y))
  }
  assert.ok(coverage(lens,film,r,...Object.values(screenToFilm(crop,0,.5)))>1)
  assert.ok(coverage(lens,film,r,...Object.values(screenToFilm(crop,1,.5)))<1)
})

test('relative illumination gives cos^4 on parallel glass, inverse-square bellows loss and the same physical crop in portrait',()=>{
  const r=initial()
  for(const extension of [r.focal,174,245]) {
    r.extension=extension
    const center=(r.focal/extension)**2
    near(relativeIllumination(r,0,0),center)
    const cosine=extension/Math.hypot(extension,55,42)
    near(relativeIllumination(r,55,-42),center*cosine**4)
    near(relativeIllumination(r,-55,42),center*cosine**4)
  }
  r.extension=r.focal;r.rear.shift=25
  near(relativeIllumination(r,15,0),(r.focal/Math.hypot(r.focal,40))**4)
  near(relativeIllumination(r,-15,0),(r.focal/Math.hypot(r.focal,10))**4)
  r.rear.tilt=-7;r.front.swing=11
  const light=relativeIllumination(r,15,23)
  r.pitch=8;r.yaw=14
  near(relativeIllumination(r,15,23),light)
  const portrait={...r,width:r.height,height:r.width}
  const p=screenToFilm(filmWindow(portrait,4,{x:15,y:23}),.5,.5)
  near(relativeIllumination(portrait,p.x,p.y),light)
})

test('a near-surface probe can cross the photographic criterion and shows a resolvable optical blur in pixels',()=>{
  const r=initial(), sphere=[108,-105,-812]
  r.aperture=4; r.extension=150
  const unfocused=focusFeedback(r,sphere)
  assert.equal(unfocused.status,'outside')
  near(unfocused.diameter,150**2/(4*812))
  const fullPixels=unfocused.diameter*400/filmWindow(r,1).width
  assert.ok(fullPixels>20)
  near(unfocused.diameter*400/filmWindow(r,4).width,4*fullPixels)
  r.extension=1/(1/r.focal-1/812)
  const sharp=focusFeedback(r,sphere)
  assert.equal(sharp.status,'inside'); near(sharp.diameter,0)
  r.extension+=2
  const open=focusFeedback(r,sphere)
  r.aperture=32
  const closed=focusFeedback(r,sphere)
  assert.equal(open.status,'outside'); assert.equal(closed.status,'inside')
  near(open.diameter,8*closed.diameter)
  near(open.ratio,open.diameter/.1)
})

test('off-film, outside-circle, and behind-camera probes are not reported as visible',()=>{
  const r=initial(); r.extension=150; r.rear.shift=48
  const dark=focusFeedback(r,[-650,0,-1000])
  assert.equal(dark.inFrame,true); assert.equal(dark.covered,false); assert.equal(dark.status,'unavailable')
  assert.equal(focusFeedback(r,[1700,0,-1000]).inFrame,false)
  assert.equal(focusFeedback(r,[0,0,20]).film,null)
})

test('the aperture integral samples a filled, centered equal-area disk, without concentric rings',()=>{
  const points=Array.from({length:192},(_,i)=>pupilSample(i))
  const mean=fn=>points.reduce((sum,p)=>sum+fn(p),0)/points.length
  const radius=p=>Math.hypot(p.x,p.y)
  assert.ok(points.every(p=>radius(p)<=1))
  near(mean(p=>p.x),0,.025); near(mean(p=>p.y),0,.025)
  near(mean(p=>radius(p)**2),.5,.022)
  assert.ok(new Set(points.map(p=>radius(p).toFixed(3))).size>100)
})

test('default rays reach the photographed subjects, room ceiling, greenhouse ridge or open street sky',()=>{
  for(const spec of scenePresets){
    const {group,targets}=createScenePreset(spec.id)
    const surfaces=new ProbeSurfaces(group.clone(true))
    const eye=frames(sceneRig(spec.id)).lens.o
    for(const [key,point] of Object.entries(targets)){
      assert.equal(surfaces.occluded(key,eye,point),false)
      if(spec.id!=='architecture'){
        const hit=surfaces.pick(eye,sub(point,eye))
        assert.ok(hit&&Math.hypot(...sub(hit,point))<1,`${spec.id} ${key} must lie on its photographed surface`)
      }
    }
    const above=surfaces.pick(eye,[0,1,0])
    if(spec.id==='still-life'){
      assert.ok(above&&above[1]-eye[1]>2100&&above[1]-eye[1]<2200,'ceiling clearance at the workshop station')
      assert.equal(surfaces.pick(eye,[0,0,1]),null,'the open back of the cutaway room')
    }else if(spec.id==='greenhouse'){
      assert.ok(above,'steel ridge above the greenhouse station')
      near(above[1]-eye[1],2642,1)
    }else assert.equal(above,null,'open sky above the street')
  }
})

test('front shift can occlude the measured twenty-metre facade behind the four-metre streetlamp',()=>{
  const {group}=createScenePreset('architecture'),surfaces=new ProbeSurfaces(group)
  const r=sceneRig('architecture'),a=frames(r).lens.o
  const window=surfaces.pick(a,[-1946,825,-3950])
  assert.ok(window&&window[2]<-19000)
  assert.equal(surfaces.occluded('custom',a,window),false)
  r.front.shift=-48
  assert.equal(focusFeedback(r,window).inFrame,true)
  assert.equal(focusFeedback(r,window).covered,true)
  assert.equal(surfaces.occluded('custom',frames(r).lens.o,window),true)
  r.front.shift=0
  assert.equal(surfaces.occluded('custom',frames(r).lens.o,window),false)
})

test('probe visibility transmits clear glass, tolerates 0.25 mm relief and caches unchanged optical rays',()=>{
  const group=new Group(),opaque=new Mesh(new PlaneGeometry(20,20),new MeshBasicMaterial())
  opaque.position.z=-100;group.add(opaque)
  const pane=new Mesh(new PlaneGeometry(20,20),new MeshBasicMaterial({transparent:true,opacity:.18}))
  pane.position.z=-50;group.add(pane)
  let rays=0;const raycast=opaque.raycast.bind(opaque)
  opaque.raycast=(ray,hits)=>{rays++;raycast(ray,hits)}
  const surfaces=new ProbeSurfaces(group),a=[0,0,0],point=[0,0,-100.12]
  assert.equal(surfaces.pick(a,[0,0,-1])[2],-100)
  assert.equal(surfaces.occluded('custom',a,point),false)
  const count=rays
  assert.equal(surfaces.occluded('custom',[...a],[...point]),false)
  assert.equal(rays,count)
  assert.equal(surfaces.occluded('custom',a,[0,0,-102]),true)
  assert.equal(rays,count+1)
  assert.equal(surfaces.occluded('custom',[1,0,0],[0,0,-102]),true)
  assert.equal(rays,count+2)
})
