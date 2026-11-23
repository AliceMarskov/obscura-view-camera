import assert from 'node:assert/strict'
import test from 'node:test'
import {sceneRig,sceneById,turnFilmBack} from '../src/equipment.ts'
import {focusGuideBundles,traceFocusBundle} from '../src/focus-rays.ts'
import {focusSlice} from '../src/focus-slice.ts'
import {dot,frames,focusPlane,initial,length,project,pupilHit,sub} from '../src/optics.ts'

const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`)
const street=sceneById('architecture').bounds

test('both diagram rim rays meet the actual tilted object plane and return to the same physical film sample',()=>{
  const r=turnFilmBack(sceneRig('still-life'))
  Object.assign(r.front,{tilt:8,swing:-2,rise:11})
  Object.assign(r.rear,{tilt:4,swing:2,shift:7})
  const {lens,film}=frames(r),plane=focusPlane(lens,film,r.focal)
  const bounds={min:[-5000,-5000,-5000],max:[5000,5000,-200]}
  const sample=traceFocusBundle(lens,film,r,14,-21,bounds)
  assert.ok(sample.focus)
  close(dot(sub(sample.focus,plane.point),plane.normal),0)
  const filmXY=project(sample.focus,lens,film)
  close(filmXY.x,14);close(filmXY.y,-21)
  for(const {pupil,end} of sample.paths){
    close(length(sub(end,sample.focus)),0)
    const a=sub(pupil,lens.o)
    close(length(a),r.focal/(2*r.aperture))
    const hit=pupilHit(end,lens,film,r.focal,dot(a,lens.x),dot(a,lens.y))
    close(length(sub(hit,sample.sensor)),0)
  }
})

test('parallel, virtual and positive out-of-range conjugates terminate on the display boundary without a false focus',()=>{
  const bounds={min:[-4000,-3000,-1800],max:[4000,3000,-300]}
  const r=initial();r.extension=r.focal
  let {lens,film}=frames(r)
  const infinity=traceFocusBundle(lens,film,r,0,0,bounds)
  assert.equal(infinity.focus,null)
  const spread=b=>length(sub(b.paths[0].end,b.paths[1].end))
  close(spread(infinity),r.focal/r.aperture)
  for(const p of infinity.paths)close(p.end[2],bounds.min[2])
  r.rear.tilt=9;({lens,film}=frames(r))
  const virtual=traceFocusBundle(lens,film,r,0,-16,bounds)
  assert.equal(virtual.focus,null)
  assert.ok(spread(virtual)>spread(infinity))
  r.rear.tilt=0;r.extension+=.01;({lens,film}=frames(r))
  const distant=traceFocusBundle(lens,film,r,0,0,bounds)
  assert.equal(distant.focus,null)
  for(const p of distant.paths)close(p.end[2],bounds.min[2])
  assert.ok(spread(distant)>0&&spread(distant)<spread(infinity))
})

test('Paris rear tilt keeps the central conjugate fixed and puts both off-axis markers on the visible focus slice through the sweep',()=>{
  const r=sceneRig('architecture')
  let first,untilted
  for(let tilt=-18;tilt<=18;tilt+=.25){
    r.rear.tilt=tilt
    const {lens,film}=frames(r),slice=focusSlice(lens,film,r,street)
    const bundles=focusGuideBundles(lens,film,r,street,slice.vertices)
    const center=bundles.find(b=>b.center)
    assert.ok(center.focus)
    if(!first)first=center.focus
    close(length(sub(first,center.focus)),0)
    const sides=bundles.filter(b=>!b.center)
    assert.equal(sides.length,2)
    const plane=focusPlane(lens,film,r.focal)
    for(const side of sides){
      assert.ok(side.focus&&side.focus.every((v,i)=>v>=street.min[i]&&v<=street.max[i]))
      close(dot(plane.normal,sub(side.focus,plane.point)),0)
      for(const ray of side.paths)close(length(sub(ray.end,side.focus)),0)
    }
    if(tilt===0)untilted=sides[0].focus
    if(tilt===18)assert.ok(length(sub(sides[0].focus,untilted))>5000)
  }
})
