import test from 'node:test'
import assert from 'node:assert/strict'
import {sceneRig, swapLens, extensionLimits, lensById} from '../src/equipment.ts'
import {createScenePreset,scenePresets} from '../src/scenes.ts'
import {add, axisFocus, dot, frames, initial, mul, project, sub} from '../src/optics.ts'
import {focusFeedback} from '../src/focus-feedback.ts'

const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected} (±${tolerance})`)

test('changing a lens keeps an attainable axial conjugate with independent oblique standards', () => {
  const original = initial()
  Object.assign(original.front, {tilt: 9, swing: -7, shift: 8, rise: 16})
  Object.assign(original.rear, {tilt: -6, swing: 4, shift: 9, rise: 14})
  Object.assign(original, {pitch: -3, yaw: 12, extension: 184.1, aperture: 4})
  const before = frames(original)
  const objectDistance = axisFocus(before.lens, before.film, original.focal)

  for (const id of ['wide90', 'long210']) {
    const next = swapLens(original, id), preset = lensById(id)
    const {lens, film} = frames(next)
    assert.deepEqual(lens, before.lens)
    assert.deepEqual(next.rear, original.rear)
    assert.equal(next.focal, preset.focal)
    assert.equal(next.circle, preset.circle)
    assert.equal(next.aperture, 5.6)
    const imageDistance = next.focal * objectDistance / (objectDistance - next.focal)
    const axialImage = add(lens.o, mul(lens.n, imageDistance))
    // Signed distance from the original object's ideal new image to the actual film.
    near(dot(film.n, sub(axialImage, film.o)), 0, .005000001)
    near(next.extension * 100, Math.round(next.extension * 100), 1e-8)
  }
})

test('lens exchange respects the teaching lenses’ bellows limits, image circles and available stops', () => {
  const original = sceneRig('architecture')
  original.extension = original.focal
  original.aperture = 45
  for (const [id, focal, maximum, circle] of [
    ['wide90',90,158,216], ['standard150',150,263,180], ['long210',210,355,295]
  ]) {
    const next = swapLens(original, id)
    assert.deepEqual(extensionLimits(focal), [focal, maximum])
    assert.equal(next.extension, focal)
    assert.equal(next.circle, circle)
    assert.equal(next.aperture, 45)
    const {lens,film} = frames(next)
    assert.equal(axisFocus(lens,film,next.focal), Infinity)
  }

  const wide = swapLens(original, 'wide90')
  wide.extension = 128.6 // ~300 mm object distance asks for ~700 mm behind a 210 mm lens.
  assert.equal(swapLens(wide, 'long210').extension, 355)
  wide.extension = 158 // ~209 mm is inside the replacement lens’s 210 mm focal length.
  assert.equal(swapLens(wide, 'long210').extension, 355)
})

test('each scene focuses an actual middle surface; wide lenses retain distant depth while close-ups isolate subjects', () => {
  for (const {id} of scenePresets) {
    const {spec, targets} = createScenePreset(id)
    const rig = sceneRig(id), {lens} = frames(rig)
    const measuredDistance = -dot(lens.n, sub(targets.cylinder, lens.o))
    near(measuredDistance, spec.focusDistance, 1e-6)
    near(rig.extension, rig.focal * measuredDistance / (measuredDistance - rig.focal), .005000001)
    const middle = focusFeedback(rig, targets.cylinder)
    assert.equal(middle.status, 'inside', id)
    assert.ok(middle.diameter < .01, id + ' middle probe')
    assert.equal(focusFeedback(rig,targets.sphere).status,'outside',id)
    const far=focusFeedback(rig,targets.arch)
    assert.equal(far.status,id==='architecture'?'inside':'outside',id)
    assert.ok(far.diameter>middle.diameter,id)
  }
})

test('on the boulevard 19° upwards narrows the top by over 18%; a level back and front rise retain the centre and correct the verticals',()=>{
  const rig=sceneRig('architecture')
  function facade(){
    const {lens,film}=frames(rig)
    const width=y=>project([-5200,y,-22000],lens,film).x-project([5200,y,-22000],lens,film).x
    return {ratio:width(15150)/width(0),mid:project([0,7600,-22000],lens,film).y}
  }
  const tilted=facade()
  assert.ok(tilted.ratio<.82)
  rig.pitch=0;rig.front.rise=32
  const corrected=facade()
  near(corrected.ratio,1,1e-9);near(corrected.mid,tilted.mid,1)
})
