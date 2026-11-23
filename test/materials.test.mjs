import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {pbr} from '../src/scenes/photographic.ts'
import {contactLight} from '../src/scenes/contact-light.ts'
import {ProbeSurfaces} from '../src/probe-surfaces.ts'

test('every finish carries separate sRGB colour, tangent normals and packed linear roughness/AO',async()=>{
  for(const name of ['limestone','cobbles','slate','plaster','walnut','paint','terracotta']){
    const m=pbr(name,[420,330])
    assert.equal(m.map.colorSpace,T.SRGBColorSpace)
    assert.equal(m.normalMap.colorSpace,T.NoColorSpace)
    assert.equal(m.roughnessMap.colorSpace,T.NoColorSpace)
    assert.equal(m.roughnessMap,m.aoMap)
    assert.deepEqual(m.userData.tile,[420,330])
    assert.equal(m.bumpMap,null)
    for(const suffix of ['color','normal','orm']){
      const bytes=await readFile(new URL(`../public/scenery/pbr-${name}-${suffix}.webp`,import.meta.url))
      assert.equal(bytes.toString('ascii',8,12),'WEBP')
    }
  }
})

test('a contact footprint changes only indirect lighting and preserves measured geometry',()=>{
  const group=new T.Group(),material=pbr('walnut')
  const mesh=new T.Mesh(new T.BoxGeometry(400,10,300),material)
  group.add(mesh)
  const cast=()=>new ProbeSurfaces(group).pick([10,80,4],[0,-1,0])
  const p=cast()
  const originalCache=material.customProgramCacheKey()
  contactLight(material,5,[[10,4,30,22]])
  assert.notEqual(material.customProgramCacheKey(),originalCache)
  assert.deepEqual(cast(),p)
  assert.deepEqual(p,[10,5,4])
  assert.equal(group.children.length,1)
  const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <aomap_fragment>'}
  material.onBeforeCompile(shader)
  assert.ok(shader.uniforms.contactMap.value.image.data[128*256+128]<100)
  assert.equal(shader.uniforms.contactMap.value.image.data[0],255)
})
