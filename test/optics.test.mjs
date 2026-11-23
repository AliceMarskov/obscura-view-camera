import test from 'node:test'
import assert from 'node:assert/strict'
import {initial,frames,focusPlane,axisFocus,signedAxisFocus,axisDepthOfField,project,blurDiameter,objectRay,pupilHit,filmPoint,coverage,rotate,sub,add,mul,dot,cross,length,tripodPivot} from '../src/optics.ts'
const eq=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`)
const setup=(edit=()=>{})=>{const r=initial();edit(r);return {r,...frames(r)}}
test('parallel standards satisfy reciprocal conjugate distances',()=>{
  for(const d of [151,160,174,200]){
    const {r,lens,film}=setup(r=>r.extension=d)
    eq(1/axisFocus(lens,film,r.focal)+1/d,1/r.focal)
  }
})
test('focal-length extension focuses at infinity',()=>{
  const {r,lens,film}=setup(r=>r.extension=r.focal)
  assert.equal(focusPlane(lens,film,r.focal),null)
  assert.equal(axisFocus(lens,film,r.focal),Infinity)
  const ray=(a)=>objectRay(lens,film,r.focal,11,-16,a,0)
  eq(length(sub(ray(-1).direction,ray(1).direction)),0)
})
test('tilted back and decenter distinguish a virtual axial conjugate from infinity',()=>{
  for(const rise of [-15,0,15]){
    const {r,lens,film}=setup(r=>{r.extension=r.focal;r.rear.tilt=8;r.rear.rise=rise;r.pitch=13})
    const signed=signedAxisFocus(lens,film,r.focal)
    if(rise===0){assert.equal(signed,Infinity);continue}
    assert.equal(Math.sign(signed),-Math.sign(rise))
    const plane=focusPlane(lens,film,r.focal)
    const crossing=add(lens.o,mul(lens.n,-signed))
    eq(dot(plane.normal,sub(crossing,plane.point)),0,1e-7)
  }
})
test('physical image inverts both axes with the expected magnification',()=>{
  const {lens,film}=setup();const hit=project([100,50,-1000],lens,film)
  eq(hit.x,-17.4);eq(hit.y,-8.7);assert.equal(project([0,0,100],lens,film),null)
})
test('Scheimpflug common line lies on all three planes under compound movements',()=>{
  const {r,lens,film}=setup(r=>{r.front.tilt=9;r.front.swing=-6;r.rear.tilt=-3;r.rear.shift=18;r.front.rise=12;r.pitch=5})
  const plane=focusPlane(lens,film,r.focal),v=cross(lens.n,film.n)
  const h=mul(cross(v,lens.n),dot(film.n,sub(film.o,lens.o))/dot(v,v))
  for(const t of [-340,0,290]){
    const p=add(lens.o,add(h,mul(v,t)))
    eq(dot(sub(p,lens.o),lens.n),0);eq(dot(sub(p,film.o),film.n),0)
    eq(dot(sub(p,plane.point),plane.normal),0)
  }
})
test('every pupil ray converges at the same conjugate on a tilted focus plane',()=>{
  const {r,lens,film}=setup(r=>{r.front.swing=10;r.front.tilt=-6;r.rear.tilt=3;r.rear.rise=20})
  const plane=focusPlane(lens,film,r.focal)
  const p=add(plane.point,mul(cross(plane.normal,[0,1,0]),70))
  const hit=project(p,lens,film)
  for(const [a,b] of [[0,0],[-7,5],[4,-6]]){
    const ray=objectRay(lens,film,r.focal,hit.x,hit.y,a,b)
    eq(length(cross(sub(p,ray.origin),ray.direction))/length(ray.direction),0)
  }
  eq(blurDiameter(p,lens,film,r),0)
})
test('off-focus forward and reverse rays agree under rear swing',()=>{
  const {r,lens,film}=setup(r=>{r.rear.swing=12;r.front.tilt=-5})
  const p=[120,50,-745]
  const hit=sub(pupilHit(p,lens,film,r.focal,5,6),film.o)
  const ray=objectRay(lens,film,r.focal,dot(hit,film.x),dot(hit,film.y),5,6)
  eq(length(cross(sub(p,ray.origin),ray.direction))/length(ray.direction),0)
})
test('blur diameter agrees with parallel-plane cone and halves at double f-number',()=>{
  const {r,lens,film}=setup(),p=[0,0,-720],v=1/(1/r.focal-1/720)
  const c=blurDiameter(p,lens,film,r)
  eq(c,r.focal/r.aperture*Math.abs(1-r.extension/v))
  eq(blurDiameter(p,lens,film,{...r,aperture:16}),c/2)
})
test('rear shift translates image coordinates equally at all depths for stitching',()=>{
  const {lens,film}=setup();const moved=setup(r=>r.rear.shift=35)
  for(const z of [-700,-1200,-5000]){
    eq(project([91,-16,z],lens,moved.film).x-project([91,-16,z],lens,film).x,-35)
  }
})
test('front shift changes viewpoint and produces depth dependent disparity',()=>{
  const base=setup(),other=setup(r=>r.front.shift=20)
  const delta=z=>project([0,0,z],other.lens,other.film).x-project([0,0,z],base.lens,base.film).x
  assert.ok(Math.abs(delta(-500)-delta(-2500))>4)
})
test('rigid camera rotation is independent of local standards and preserves projection under scene co-rotation',()=>{
  const base=setup(),turn=setup(r=>{r.pitch=9;r.yaw=-12})
  const p=[42,24,-960],a=project(p,base.lens,base.film),q=add(tripodPivot,rotate(sub(p,tripodPivot),9,-12)),b=project(q,turn.lens,turn.film)
  eq(a.x,b.x);eq(a.y,b.y)
})
test('cone coverage tracks the specified diameter at focal length and shifted borders',()=>{
  const {r,lens,film}=setup(r=>r.extension=r.focal)
  eq(coverage(lens,film,r,r.circle/2,0),1)
  const moved=setup(r=>{r.rear.shift=50;r.extension=r.focal})
  assert.ok(coverage(moved.lens,moved.film,moved.r,60,48)>1)
  eq(length(sub(filmPoint(film,0,0),film.o)),0)
})
test('axial depth limits equal analytic thin-lens limits and reach infinity',()=>{
  const {r}=setup(),u=1/r.focal-1/r.extension,delta=.1*r.aperture/(r.focal*r.extension)
  const d=axisDepthOfField(r)
  eq(d.near,1/(u+delta),.0001);eq(d.far,1/(u-delta),.0001)
  const inf=axisDepthOfField({...r,extension:r.focal})
  assert.equal(inf.far,Infinity);eq(inf.near,r.focal*r.focal/(.1*r.aperture),.02)
})
test('hinge line lies on focus plane with both standards rotated',()=>{
  const {r,lens,film}=setup(r=>{r.front.tilt=7;r.front.swing=5;r.rear.tilt=-4;r.rear.rise=11})
  const v=cross(film.n,lens.n),p=mul(cross(v,film.n),-r.focal/dot(v,v))
  const plane=focusPlane(lens,film,r.focal)
  eq(dot(p,film.n),0);eq(dot(p,lens.n),-r.focal)
  eq(dot(sub(add(lens.o,p),plane.point),plane.normal),0)
})
