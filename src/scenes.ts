import type * as T from 'three'
import type {V} from './optics.ts'
import {architecture,streetGround,streetFocus} from './scenes/architecture.ts'
import {greenhouse} from './scenes/greenhouse.ts'
import {stillLife} from './scenes/still-life.ts'
import {measure,type TargetKey,type Targets} from './scenes/model.ts'

export type SceneId='still-life'|'architecture'|'greenhouse'
export type LensId='wide90'|'standard150'|'long210'
export type {Targets,TargetKey}
export type SceneSpec={
  id:SceneId
  name:string
  description:string
  defaultLens:LensId
  defaultAperture:number
  /** Axial distance from neutral lens to the intended subject, in mm. */
  focusDistance:number
  initialPitch?:number
  initialRise?:number
  groundY?:number
  targetNames:Record<TargetKey,string>
  background:string
  observer:{position:V;target:V}
  /** Bounds of the teaching volume, in world millimetres. */
  bounds:{min:V;max:V}
}
export type LensSpec={
  id:LensId
  name:string
  description:string
  focal:number
  /** Nominal image-circle diameter at infinity, in mm. */
  circle:number
  apertures:number[]
}

// Generic teaching lenses. Circle and stop data describe these simulated
// presets; no manufacturer's illumination or resolution curve is implied.
export const lensPresets:LensSpec[]=[
  {id:'wide90',name:'90 mm 广角',description:'宽视野，适合立面和移轴构图。',focal:90,circle:216,apertures:[5.6,8,11,16,22,32,45]},
  {id:'standard150',name:'150 mm 标准',description:'接近 4×5 画幅对角线，便于观察视点、焦面与像场。',focal:150,circle:180,apertures:[4,5.6,8,11,16,22,32,45]},
  {id:'long210',name:'210 mm 长焦',description:'同一视点截取更小的画面，放大局部纹理。',focal:210,circle:295,apertures:[5.6,8,11,16,22,32,45,64]},
]

export const scenePresets:SceneSpec[]=[
  {id:'architecture',name:'巴黎 · 奥斯曼街角',description:'从人行道仰拍沿街书店，窗列在檐口会聚。调平后背，再升高前组重新纳入屋顶。',
    defaultLens:'wide90',defaultAperture:8,focusDistance:streetFocus,initialPitch:19,groundY:streetGround,
    targetNames:{sphere:'街道路牌',cylinder:'书店招牌',arch:'顶层窗扇'},background:'#c5d5da',
    observer:{position:[600,230,770],target:[0,-80,-150]},bounds:{min:[-18500,streetGround,-42000],max:[21000,21900,-2300]}},
  {id:'still-life',name:'银盐工作间',description:'观察药瓶标签、干版纸盒与接触印相照片由近及远的清晰位置。',
    defaultLens:'standard150',defaultAperture:5.6,focusDistance:931,groundY:-901,
    targetNames:{sphere:'药瓶纸标',cylinder:'干版纸盒',arch:'接触印相'},background:'#989083',
    observer:{position:[950,330,780],target:[0,-170,-400]},bounds:{min:[-530,-290,-1790],max:[530,360,-600]}},
  {id:'greenhouse',name:'冬园 · 标本温室',description:'隔着一米外的活体标本观察花盘、叶脉与玻璃背后的花园。',
    defaultLens:'long210',defaultAperture:8,focusDistance:969-4-35*.265*.55,
    groundY:-1130,
    targetNames:{sphere:'竹芋叶脉',cylinder:'百日菊花盘',arch:'黄铜湿度表'},background:'#bdc9ba',
    observer:{position:[905,340,740],target:[-6,-84,-360]},bounds:{min:[-710,-230,-3100],max:[720,480,-650]}},
]

export function createScenePreset(id:SceneId):{group:T.Group;targets:Targets;spec:SceneSpec} {
  const spec=scenePresets.find(p=>p.id===id)
  if(!spec)throw new RangeError('Unknown scene: '+id)
  const group={architecture,greenhouse,'still-life':stillLife}[id]()
  return {group,targets:measure(group),spec}
}
