import {useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent} from 'react'
import './dial.css'
import {zeroDetent} from './detent'
import {mechanicalSound} from './sound'

export type DriveGear = 'coarse' | 'fine'

export interface DialProps {
  name: string
  en: string
  value: number
  unit: string
  lo: number
  hi: number
  change: (value: number) => void
  step?: number
  steps?: readonly number[]
  resetValue?: number
  gear?: DriveGear
  onGear?: (next: DriveGear) => void
}

type Gesture = {
  id: number
  input: 'wheel' | 'range'
  x: number
  accumulator: number
  travel: number
  initial: number
  last: number
  notch?:number
}

const limit = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number, lo: number, hi: number, step: number) =>
  limit(Number((lo + Math.round((value - lo) / step) * step).toFixed(8)), lo, hi)
const decimals = (step: number) => step.toFixed(8).replace(/0+$/, '').split('.')[1]?.length ?? 0
const closestIndex = (values: readonly number[], value: number) =>
  values.reduce((best, v, i) => Math.abs(v - value) < Math.abs(values[best] - value) ? i : best, 0)

export function Dial({name, en, value, unit, lo, hi, change, step = .1, steps, resetValue,
  gear: externalGear, onGear}: DialProps) {
  const [localGear, setLocalGear] = useState<DriveGear>('coarse')
  const [dragging, setDragging] = useState<Gesture['input'] | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const pointer = useRef<Gesture | null>(null)
  const gear = externalGear ?? localGear
  const discrete = !!steps?.length
  const ticks = discrete ? steps.length - 1 : Math.round((hi - lo) / step)
  const tickOf = (v: number) => discrete ? closestIndex(steps, v) : (v - lo) / step
  const valueAt = (ordinal: number) => {
    const tick = limit(Math.round(ordinal), 0, ticks)
    return discrete ? steps[tick] : snap(lo + tick * step, lo, hi, step)
  }
  const format = (v: number) => discrete ? String(v) : v.toFixed(decimals(step))
  const unitValue = (v: number) => unit === 'f/' ? 'f/' + format(v) : format(v) + ' ' + unit
  const ordinal = tickOf(value)
  const decimal = format(value)
  // The bed reads absolute travel. The grippable drum tracks movement and can make
  // many turns without losing a hundredth of a mm across a long focusing rack.
  const wheel = useRef<HTMLDivElement>(null)
  const rotation = useRef(0)
  const fineTravel = 8 // CSS pixels per smallest mechanical adjustment.

  function setGear(next: DriveGear) {
    setLocalGear(next)
    onGear?.(next)
  }
  function adjust(ticksToMove: number) { mechanicalSound('fine');change(valueAt(tickOf(value) + ticksToMove)) }
  function editedValue() {
    const n = draft?.trim() ? Number(draft) : value
    return Number.isFinite(n) ? valueAt(tickOf(n)) : value
  }
  function commit() {
    const next = editedValue()
    if (next !== value) change(next)
    setDraft(null)
  }
  function showMotion(delta: number) {
    rotation.current = (rotation.current + delta) % 6
    wheel.current?.style.setProperty('--tread-offset', rotation.current + 'px')
  }
  function seek(e: PointerEvent<HTMLDivElement>, gesture: Gesture) {
    const rect = e.currentTarget.getBoundingClientRect()
    const padding = 8 // Matches the inset of the engraved full-travel scale.
    const fraction = limit((e.clientX - rect.left - padding) / Math.max(1, rect.width - 2 * padding), 0, 1)
    gesture.accumulator = fraction * ticks
  }
  function publish(gesture: Gesture) {
    const next = valueAt(gesture.accumulator)
    if (next === gesture.last) return
    mechanicalSound(next===0&&lo<0?'detent':gear==='fine'?'fine':'coarse')
    gesture.last = next
    change(next)
  }
  function begin(e: PointerEvent<HTMLDivElement>, input: Gesture['input']) {
    if (pointer.current || !e.isPrimary || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Focusing the wheel commits any active number field. Start the drag at
    // that value even before React has delivered the subsequent render.
    const start = editedValue()
    const gesture: Gesture = {id:e.pointerId, input, initial:start, last:start, x:e.clientX,
      accumulator:tickOf(start), travel:limit(rect.width - 16, 100, 240)}
    e.preventDefault()
    e.currentTarget.focus({preventScroll:true})
    e.currentTarget.setPointerCapture(e.pointerId)
    pointer.current = gesture
    setDragging(input)
    if (input === 'range') { seek(e, gesture); publish(gesture) }
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const current = pointer.current
    if (!current || current.id !== e.pointerId) return
    const dx = e.clientX - current.x
    current.x = e.clientX
    if (current.input === 'range') seek(e, current)
    else {
      const precision = !discrete && (gear === 'fine' || e.shiftKey)
      const gain = precision ? 1 / fineTravel : ticks / current.travel
      if(!precision&&!discrete&&lo<0&&hi>0){
        const middle=tickOf(0),well=3.5*gain
        const offset=current.accumulator-middle
        current.notch??=offset+Math.sign(offset)*well
        current.notch=limit(current.notch+dx*gain,-middle-well,ticks-middle+well)
        current.accumulator=middle+zeroDetent(current.notch,well)
      }else{
        current.notch=undefined
        current.accumulator=limit(current.accumulator+dx*gain,0,ticks)
      }
      showMotion(dx)
    }
    publish(current)
  }
  function finish(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const current = pointer.current
    if (!current || current.id !== e.pointerId) return
    pointer.current = null
    if (cancel && current.last !== current.initial) change(current.initial)
    if (e.currentTarget.hasPointerCapture(current.id)) e.currentTarget.releasePointerCapture(current.id)
    setDragging(null)
  }
  function keys(e: KeyboardEvent<HTMLElement>, input = false) {
    if (input && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) return
    const start = tickOf(input ? editedValue() : value)
    let next: number
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': next = start + 1; break
      case 'ArrowLeft': case 'ArrowDown': next = start - 1; break
      case 'PageUp': next = start + 10; break
      case 'PageDown': next = start - 10; break
      case 'Home': next = 0; break
      case 'End': next = ticks; break
      default: return
    }
    e.preventDefault()
    setDraft(null)
    change(valueAt(next))
  }
  const slideProps = {
    role:'slider', tabIndex:0, 'aria-orientation':'horizontal' as const,
    'aria-valuemin':lo, 'aria-valuemax':hi, 'aria-valuenow':value, 'aria-valuetext':unitValue(value),
    onKeyDown:(e:KeyboardEvent<HTMLDivElement>) => keys(e),
    onPointerMove:move, onPointerUp:(e:PointerEvent<HTMLDivElement>) => finish(e),
    onPointerCancel:(e:PointerEvent<HTMLDivElement>) => finish(e,true),
    onLostPointerCapture:(e:PointerEvent<HTMLDivElement>) => finish(e,true)
  }
  return <div className="ob-drive" data-dragging={dragging || undefined} data-zero={lo<0&&value===0||undefined}>
    <div className="ob-drive__top">
      <div className="ob-drive__identity"><b>{name}</b><small>{en}</small></div>
      <div className="ob-drive__readout" aria-label="逐格微调或直接输入">
        <button type="button" className="ob-drive__step" aria-label={'减小'+name} title={'减小 '+(discrete?'一档':step+' '+unit)}
          disabled={value<=lo} onClick={()=>adjust(-1)}>−</button>
        <label className="ob-drive__display">{unit==='f/'&&<span>f/</span>}
          <input type="number" aria-label={name+'数值'} inputMode="decimal" min={lo} max={hi}
            step={discrete?'any':step} value={draft??decimal} style={{width:Math.max(2,(draft??decimal).length+.3)+'ch'}}
            onChange={e=>setDraft(e.target.value)} onFocus={e=>e.currentTarget.select()} onBlur={commit}
            onKeyDown={e=>{
              if (e.key==='Enter') {e.preventDefault();e.currentTarget.blur()}
              else if (e.key==='Escape') {e.preventDefault();e.stopPropagation();setDraft(null)}
              else keys(e,true)
            }}/>
          {unit!=='f/'&&<span>{unit}</span>}
        </label>
        <button type="button" className="ob-drive__step" aria-label={'增大'+name} title={'增大 '+(discrete?'一档':step+' '+unit)}
          disabled={value>=hi} onClick={()=>adjust(1)}>+</button>
      </div>
    </div>
    <div className="ob-drive__gearline">
      <span className="ob-drive__instruction">{discrete?'左右滚动 · 逐档':gear==='fine'?'左右滚动 · 每格 '+step+' '+unit:'左右滚动'}</span>
      {!discrete&&<div className="ob-drive__gears" role="group" aria-label="滚轮传动档位">
        <button type="button" aria-label={name+'粗调'} aria-pressed={gear==='coarse'} onClick={()=>setGear('coarse')}>粗调</button>
        <button type="button" aria-label={name+'精调'} aria-pressed={gear==='fine'} onClick={()=>setGear('fine')}>精调</button>
      </div>}
    </div>
    <div className="ob-drive__wheel" {...slideProps} aria-label={name} ref={wheel}
      title="左右拖动滚轮，按住 Shift 临时精调，双击复位" onPointerDown={e=>begin(e,'wheel')}
      onDoubleClick={()=>{mechanicalSound('detent');change(valueAt(tickOf(resetValue??limit(0,lo,hi))))}}>
      <div className="ob-drive__roller"><i/></div>
      <span className="ob-drive__bearing left"/><span className="ob-drive__bearing right"/>
    </div>
    <div className="ob-drive__range" {...slideProps} aria-label={name+'全行程'} title="点按或拖动刻度，直接定位到该行程"
      onPointerDown={e=>begin(e,'range')} style={{'--ob-position':limit(ordinal/ticks,0,1)*100+'%'} as CSSProperties}>
      <span className="ob-drive__rule"><i className="ob-drive__home" style={{left:limit(tickOf(resetValue??limit(0,lo,hi))/ticks,0,1)*100+'%'}}/>
        <i className="ob-drive__needle"/></span>
      <span className="ob-drive__endpoints"><span>{lo<0?'−'+Math.abs(lo):lo}</span><span>全行程</span><span>{hi>0&&lo<0?'+'+hi:hi}</span></span>
    </div>
  </div>
}
