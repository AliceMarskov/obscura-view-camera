import assert from 'node:assert/strict'
import test from 'node:test'
import {zeroDetent} from '../src/detent.ts'

test('the neutral notch holds the centre for seven pixels and releases symmetrically',()=>{
  for(const x of [-3.5,-1,0,2,3.5])assert.ok(zeroDetent(x,3.5)===0)
  for(const x of [4,5,12,50]) {
    assert.equal(zeroDetent(x,3.5),x-3.5)
    assert.equal(zeroDetent(-x,3.5),3.5-x)
  }
})
