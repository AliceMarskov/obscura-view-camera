import {useState} from 'react'
import {Aperture, Camera, Frame, RotateCcw} from 'lucide-react'
import {Dial, type DialProps, type DriveGear} from './Dial'
import {extensionLimits, lensFor, movementStep} from './equipment'
import type {Rig, Movement} from './optics'
import type {Standard} from './bench'

export type ControlTab = Standard | 'body'
type BodyKey = 'extension' | 'pitch' | 'yaw' | 'aperture'
type Parameter = {id: keyof Movement | BodyKey} & DialProps
type Props = {
  rig: Rig; tab: ControlTab; axis: keyof Movement; defaultExtension: number; defaultAperture: number
  onTab: (tab: ControlTab) => void; onAxis: (axis: keyof Movement) => void
  move: (side: Standard, k: keyof Movement, v: number) => void
  body: (k: BodyKey, v: number) => void
  reset: () => void
}
const movements = [
  ['tilt','俯仰','TILT',18,'°'], ['swing','摆动','SWING',18,'°'],
  ['shift','横移','SHIFT',48,'mm'], ['rise','升降','RISE',48,'mm']
] as const
const tabs = [['front','前组',Aperture],['rear','后组',Frame],['body','皮腔 / 整机',Camera]] as const

function reading(field: Parameter) {
  if (field.steps) return 'f/' + field.value
  return field.value.toFixed(field.step === .01 ? 2 : 1) + (field.unit === '°' ? '°' : ' mm')
}

export function InstrumentPanel({rig,tab,axis,defaultExtension,defaultAperture,onTab,onAxis,move,body,reset}: Props) {
  const [choice,setChoice] = useState<{tab:ControlTab; auxiliary:BodyKey} | null>(null)
  const [gear,setGear] = useState<DriveGear>('coarse')
  const [lo,hi] = extensionLimits(rig.focal), stops = lensFor(rig).apertures
  const bellows: Parameter = {id:'extension',name:'皮腔长度',en:'FOCUS',unit:'mm',lo,hi,step:.01,
    value:rig.extension,resetValue:defaultExtension,change:v=>body('extension',v)}
  const aperture: Parameter = {id:'aperture',name:'工作光圈',en:'IRIS',unit:'f/',lo:stops[0],hi:stops[stops.length-1],
    steps:stops,value:rig.aperture,resetValue:defaultAperture,change:v=>body('aperture',v)}
  const fields: Parameter[] = tab === 'body' ? [
    bellows,aperture,
    {id:'pitch',name:'整机俯仰',en:'PITCH',unit:'°',lo:-20,hi:20,value:rig.pitch,change:v=>body('pitch',v)},
    {id:'yaw',name:'整机偏航',en:'YAW',unit:'°',lo:-25,hi:25,value:rig.yaw,change:v=>body('yaw',v)}
  ] : [
    ...movements.map(([id,name,en,limit,unit])=>({id,name,en,unit,lo:-limit,hi:limit,step:movementStep(id),value:rig[tab][id],change:(v:number)=>move(tab,id,v)})),
    bellows,aperture
  ]
  const selected = choice?.tab === tab ? choice.auxiliary : tab === 'body' ? 'extension' : axis
  const field = fields.find(f=>f.id===selected) ?? fields[0]
  function select(p: Parameter) {
    if (p.id==='extension'||p.id==='aperture'||p.id==='pitch'||p.id==='yaw') setChoice({tab,auxiliary:p.id})
    else { setChoice(null); onAxis(p.id) }
  }

  return <section className="instruments drive-panel" aria-label="相机旋钮">
    <div className="drive-panel__head"><h2>机构调节</h2>
      <button className="drive-panel__reset" onClick={()=>{setChoice(null);reset()}} title="恢复当前场景的起始机位与设置"><RotateCcw size={13}/>复位</button></div>
    <div className="drive-panel__tabs" role="group" aria-label="调节部位">
      {tabs.map(([id,label,Icon])=><button key={id} aria-pressed={tab===id} onClick={()=>{setChoice(null);onTab(id)}}><Icon size={14}/>{label}</button>)}
    </div>
    <div className="drive-panel__fields" role="group" aria-label="选择调节参数" data-count={fields.length}>
      {fields.map(f=><button type="button" key={f.id} aria-label={'选择'+f.name} aria-description={reading(f)} title={f.name+' '+reading(f)} aria-pressed={f.id===field.id}
        onClick={()=>select(f)}><span>{f.name}</span><b>{reading(f)}</b></button>)}
    </div>
    <Dial key={tab+':'+field.id+':'+rig.focal} {...field} gear={gear} onGear={setGear}/>
  </section>
}
