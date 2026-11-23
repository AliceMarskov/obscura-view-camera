import test from 'node:test'
import assert from 'node:assert/strict'
import {sceneRig,sceneById} from '../src/equipment.ts'
import {add,blurDiameter,coverage,cross,dot,focusPlane,frames,initial,length,mul,project,sub} from '../src/optics.ts'
import {focusSlice} from '../src/focus-slice.ts'

const room={min:[-10000,-10000,-10000],max:[10000,10000,10000]}
function checkPatch(r,bounds){
  const {lens,film}=frames(r),plane=focusPlane(lens,film,r.focal)
  const slice=focusSlice(lens,film,r,bounds),p=slice.vertices
  assert.ok(p.length>=3)
  let area=0
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],hit=project(a,lens,film)
    assert.ok(a.every((x,i)=>Number.isFinite(x)&&x>=bounds.min[i]-1e-7&&x<=bounds.max[i]+1e-7))
    assert.ok(-dot(sub(a,lens.o),lens.n)>r.focal)
    assert.ok(hit&&Math.abs(hit.x)<=r.width/2+1e-7&&Math.abs(hit.y)<=r.height/2+1e-7)
    assert.ok(coverage(lens,film,r,hit.x,hit.y)<1+1e-8)
    assert.ok(blurDiameter(a,lens,film,r)<1e-8)
    area+=dot(cross(sub(a,p[0]),sub(b,p[0])),plane.normal)
  }
  assert.ok(area>0,'clipped polygon must keep a consistent winding')
  return {slice,plane,lens,film}
}

test('Paris rear tilt rotates continuously about the same photographed point at 21.4 m',()=>{
  const r=sceneRig('architecture'),bounds=sceneById('architecture').bounds
  const u=r.focal*r.extension/(r.extension-r.focal)
  let last=-Math.PI/2
  for(let i=-1800;i<=1800;i++){
    r.rear.tilt=i/100
    const {slice,plane,lens}=checkPatch(r,bounds)
    const angle=Math.atan2(-dot(plane.normal,lens.y),-dot(plane.normal,lens.n))
    const expected=Math.atan(r.focal*Math.tan(r.rear.tilt*Math.PI/180)/(r.extension-r.focal))
    assert.ok(Math.abs(expected-angle)<1e-11)
    assert.ok(angle>last&&angle-last<2.4*Math.PI/180)
    assert.ok(length(sub(slice.axisPoint,add(lens.o,mul(lens.n,-u))))<1e-7)
    last=angle
  }
  assert.ok(Math.abs(last*180/Math.PI-89.2555)<.001)
})

test('infinite or virtual axial focus cannot produce a false axis marker or a sheet behind the lens',()=>{
  const r=initial()
  for(const v of [r.focal,r.focal-5]){
    r.extension=v;r.rear.tilt=0
    const {lens,film}=frames(r)
    assert.deepEqual(focusSlice(lens,film,r,room),{vertices:[],axisPoint:null})
    r.rear.tilt=18
    assert.equal(checkPatch(r,room).slice.axisPoint,null,'finite off-axis focus can still exist')
  }
})

test('a shifted gate crops the focus plane and the part outside the image circle',()=>{
  const r=initial()
  r.rear.shift=48;r.front.shift=-48
  const {slice}=checkPatch(r,room)
  assert.ok(slice.vertices.length>4,'lens coverage cuts the glass boundary')
  assert.equal(slice.axisPoint,null)
})
