import {initial,frames,axisFocus,dot,sub,rotate,type Rig,type Movement} from './optics.ts'
import {lensPresets,scenePresets,type SceneId,type LensId} from './scenes.ts'

export const sceneById=(id:SceneId)=>scenePresets.find(s=>s.id===id)!
export const lensById=(id:LensId)=>lensPresets.find(l=>l.id===id)!
export const lensFor=(r:Rig)=>lensPresets.find(l=>l.focal===r.focal)!
export const extensionLimits=(f:number):[number,number]=>[f,Math.min(355,Math.ceil(f*1.75))]
export const movementStep=(key:keyof Movement)=>key==='tilt'||key==='swing'?.01:.1
/** The reversible holder turns within its standard. Film coordinates stay
 * expressed in the upright standard axes, while the rectangular gate turns. */
export function turnFilmBack(r:Rig):Rig{return {...r,width:r.height,height:r.width}}
export function clampStep(v:number,lo:number,hi:number,step=.1){
  return Math.max(lo,Math.min(hi,Number((Math.round(v/step)*step).toFixed(5))))
}
export function sceneRig(id:SceneId):Rig{
  const spec=sceneById(id),lens=lensById(spec.defaultLens)
  const rig=initial()
  return {...rig,front:{...rig.front,rise:spec.initialRise??0},pitch:spec.initialPitch??0,
    focal:lens.focal,circle:lens.circle,aperture:spec.defaultAperture,
    extension:clampStep(lens.focal*spec.focusDistance/(spec.focusDistance-lens.focal),...extensionLimits(lens.focal),.01)}
}
/** Keep camera location, movements and the on-axis object conjugate while
 * changing the lens. The film may be oblique to both optical and rail axes. */
export function swapLens(r:Rig,id:LensId):Rig{
  const next=lensById(id),{lens,film}=frames(r),u=axisFocus(lens,film,r.focal)
  const currentGap=dot(film.n,sub(film.o,lens.o)),rail=rotate([0,0,1],r.pitch,r.yaw)
  const limits=extensionLimits(next.focal)
  const gap=dot(lens.n,film.n)*next.focal*(Number.isFinite(u)&&u>next.focal?u/(u-next.focal):1)
  const extension=Number.isFinite(u)&&u<=next.focal?limits[1]:clampStep(r.extension+(gap-currentGap)/dot(film.n,rail),...limits,.01)
  const aperture=next.apertures.reduce((a,b)=>Math.abs(b-r.aperture)<Math.abs(a-r.aperture)?b:a)
  return {...r,focal:next.focal,circle:next.circle,extension,aperture}
}
