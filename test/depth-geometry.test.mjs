import test from 'node:test'
import assert from 'node:assert/strict'
import {depthAtFilmSample,depthSection,opticalLines} from '../src/depth-geometry.ts'
import {add,axisDepthOfField,blurDiameter,coverage,dot,filmPoint,focusPlane,frames,initial,length,mul,project,sub} from '../src/optics.ts'
import {sceneRig,sceneById} from '../src/equipment.ts'

const equal=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`)

test('the Scheimpflug and hinge lines satisfy their distinct three planes and J=f/sin(theta)',()=>{
  const r=initial()
  assert.equal(opticalLines(...Object.values(frames(r)),r.focal),null)
  r.pitch=14;r.yaw=-19;r.rear.shift=32;r.front.rise=13;r.front.tilt=7;r.rear.tilt=-9;r.rear.swing=15
  const {lens,film}=frames(r),plane=focusPlane(lens,film,r.focal),g=opticalLines(lens,film,r.focal)
  for(const line of [g.scheimpflug,g.hinge]){
    for(const t of [-12000,0,8500]){
      const p=add(line.point,mul(line.direction,t))
      equal(dot(plane.normal,sub(p,plane.point)),0)
      equal(dot(lens.n,sub(p,lens.o)),line===g.hinge?-r.focal:0)
      equal(dot(film.n,sub(p,line===g.hinge?lens.o:film.o)),0)
    }
  }
  equal(g.hingeDistance,r.focal/Math.sqrt(1-dot(film.n,lens.n)**2))
  equal(g.hingeDistance,length(sub(g.hinge.point,lens.o)))
  assert.ok(length(sub(g.hinge.point,g.scheimpflug.point))>r.focal)
})

test('on-axis limits recover independently searched CoC limits and correctly cross infinity',()=>{
  const r=initial()
  for(const v of [r.focal,r.focal+.15,r.focal+3,r.extension]){
    r.extension=v
    const {lens,film}=frames(r),{near,far}=depthAtFilmSample(lens,film,r,0,0),numeric=axisDepthOfField(r)
    equal(v/near,numeric.near,numeric.near*1e-6)
    if(far>0)equal(v/far,numeric.far,numeric.far*1e-6)
    else assert.equal(numeric.far,Infinity)
  }
})

test('off-axis depth limits match all 24 traced pupil rays on rotated, shifted, tilted standards',()=>{
  let checked=0
  for(const scene of ['still-life','architecture','greenhouse']){
    const r=sceneRig(scene)
    r.rear.shift=29;r.front.rise=26;r.pitch+=11;r.yaw=-14
    for(const tilt of [-18,-.1,0,.1,17]){
      r.rear.tilt=tilt;r.front.swing=12
      for(const stop of [5.6,32]){
        r.aperture=stop
        const {lens,film}=frames(r)
        for(const [x,y] of [[-50,35],[0,0],[44,-32]]){
          const ray=sub(filmPoint(film,x,y),lens.o),w=depthAtFilmSample(lens,film,r,x,y)
          assert.ok(w.near>w.far)
          for(const val of Object.values(w))if(val>0){
            const p=sub(lens.o,mul(ray,1/val))
            equal(blurDiameter(p,lens,film,r),.1,1e-9);checked++
          }
        }
      }
    }
  }
  assert.ok(checked>65)
})

test('side and top sections remain inside scene and covered film when a boundary crosses infinity',()=>{
  const r=sceneRig('architecture'),box=sceneById('architecture').bounds
  r.rear.shift=25;r.front.rise=-30;r.circle=125
  let count=0
  for(const tilt of [-16,-3,0,3,16]){
    r.rear.tilt=tilt;r.rear.swing=tilt*.4
    const {lens,film}=frames(r)
    for(const side of ['side','top']){
      const section=depthSection(lens,film,r,box,side)
      for(const v of [...section.near,...section.far]){
        assert.ok(v.every((p,i)=>Number.isFinite(p)&&p>=box.min[i]-1e-6&&p<=box.max[i]+1e-6))
        const sample=project(v,lens,film)
        equal(side==='side'?sample.x:sample.y,0,1e-6)
        assert.ok(coverage(lens,film,r,sample.x,sample.y)<=1.000001)
        equal(blurDiameter(v,lens,film,r),.1,.00012);count++
      }
    }
  }
  assert.ok(count>100)
})
