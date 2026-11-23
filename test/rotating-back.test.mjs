import test from 'node:test'
import assert from 'node:assert/strict'
import {initial,frames,filmPoint,objectRay,axisFocus,add,mul} from '../src/optics.ts'
import {turnFilmBack} from '../src/equipment.ts'
import {focusFeedback,filmWindow} from '../src/focus-feedback.ts'

test('a quarter-turn changes the photographed gate without moving the standards or tilting the horizon',()=>{
  const horizontal=initial()
  Object.assign(horizontal.front,{tilt:3,shift:8})
  Object.assign(horizontal.rear,{swing:-2,rise:9})
  const vertical=turnFilmBack(horizontal)
  assert.deepEqual([vertical.width,vertical.height],[96,120])
  assert.deepEqual(turnFilmBack(vertical),horizontal)
  const {lens,film}=frames(horizontal),after=frames(vertical)
  assert.deepEqual(after,{lens,film})
  assert.equal(axisFocus(lens,film,150),axisFocus(after.lens,after.film,150))
  for(const [x,y,was,now] of [[55,0,true,false],[0,54,false,true],[0,0,true,true]]){
    const ray=objectRay(lens,film,150,x,y,0,0)
    const p=add(ray.origin,mul(ray.direction,10))
    const a=focusFeedback(horizontal,p),b=focusFeedback(vertical,p)
    assert.equal(a.inFrame,was);assert.equal(b.inFrame,now)
    assert.deepEqual(a.film,b.film);assert.equal(a.diameter,b.diameter)
  }
  const crop=filmWindow(vertical,4,{x:1e3,y:1e3})
  assert.deepEqual(crop,{x:36,y:45,width:24,height:30})
  assert.deepEqual(filmPoint(film,0,0),filmPoint(after.film,0,0))
})
