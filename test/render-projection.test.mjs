import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PerspectiveCamera,Vector3} from 'three'
import {frames,initial,objectRay} from '../src/optics.ts'
import {pupilCamera} from '../src/ground-glass.ts'
import {filmWindow} from '../src/focus-feedback.ts'
test('WebGL projection places reciprocal thin-lens rays at the same film sample',()=>{
  const r=initial()
  Object.assign(r.front,{swing:12,tilt:-9,shift:-18,rise:8})
  Object.assign(r.rear,{swing:-8,tilt:6,shift:29,rise:-15})
  r.pitch=9;r.yaw=-6
  const {lens,film}=frames(r)
  for(const [a,b] of [[0,0],[-5,4],[8,-2]]){
    const camera=pupilCamera(r,a,b)
    for(const [x,y] of [[0,0],[-60,48],[60,-48],[7,-13]]){
      const ray=objectRay(lens,film,r.focal,x,y,a,b)
      const p=new Vector3(...ray.origin).addScaledVector(new Vector3(...ray.direction),8).project(camera)
      assert.ok(Math.abs(p.x+x/(r.width/2))<1e-10)
      assert.ok(Math.abs(p.y+y/(r.height/2))<1e-10)
      assert.ok(p.z>=-1&&p.z<=1)
    }
  }
})

test('one camera can render a transmitting object across pupil samples, loupe positions and back rotation',()=>{
  const reused=new PerspectiveCamera(),rig=initial()
  for(const [width,height,zoom,x,y,a,b] of [
    [120,96,1,0,0,-3,4],[96,120,4,21,-18,7,-1],[120,96,2,-25,9,0,0]
  ]){
    Object.assign(rig,{width,height})
    const crop=filmWindow(rig,zoom,{x,y})
    const fresh=pupilCamera(rig,a,b,crop)
    assert.equal(pupilCamera(rig,a,b,crop,reused),reused)
    for(const matrix of ['projectionMatrix','projectionMatrixInverse','matrixWorld','matrixWorldInverse']){
      assert.deepEqual(reused[matrix].elements,fresh[matrix].elements,matrix)
    }
    assert.equal(reused.near,fresh.near);assert.equal(reused.far,fresh.far)
  }
})
