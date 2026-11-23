import {add,coverage,dot,filmPoint,mul,objectRay,project,sub,type Frame,type Rig,type V} from './optics.ts'

type Bounds={min:V;max:V}

/** One film sample traced through two diametrically opposed points on the pupil.
 * All lengths are in world millimetres. A marked endpoint is a real object
 * conjugate inside the displayed volume; a clipped ray end is never a focus. */
export function traceFocusBundle(lens:Frame,film:Frame,rig:Rig,x:number,y:number,bounds:Bounds,pupilAngle=Math.PI/4){
  const sensor=filmPoint(film,x,y),offset=sub(sensor,lens.o)
  const excess=dot(offset,lens.n)-rig.focal
  // At this positive parameter the pupil offset cancels exactly in objectRay.
  // Infinite and virtual conjugates continue forward without a crossing.
  const tFocus=excess>1e-9?rig.focal/excess:Infinity
  const conjugate=Number.isFinite(tFocus)?add(lens.o,mul(offset,-tFocus)):null
  const focus=conjugate&&conjugate.every((v,i)=>v>=bounds.min[i]-1e-6&&v<=bounds.max[i]+1e-6)?conjugate:null
  const radius=rig.focal/(2*rig.aperture)
  const paths=[-1,1].map(sign=>{
    const ray=objectRay(lens,film,rig.focal,x,y,sign*radius*Math.cos(pupilAngle),sign*radius*Math.sin(pupilAngle))
    let t=tFocus
    for(let i=0;i<3;i++){
      const dir=ray.direction[i]
      if(Math.abs(dir)<1e-12)continue
      // Include the lens in the diagram even when the subject box starts farther away.
      const limit=dir>0?Math.max(bounds.max[i],ray.origin[i]):Math.min(bounds.min[i],ray.origin[i])
      t=Math.min(t,(limit-ray.origin[i])/dir)
    }
    return {pupil:ray.origin,end:add(ray.origin,mul(ray.direction,t))}
  })
  return {sensor,focus,paths}
}

/** Select two interior film samples of the visible focus polygon. In oblique
 * near-infinity setups its projection can be a very narrow strip on the glass. */
function sideSamples(lens:Frame,film:Frame,rig:Rig,vertices:V[]){
  const outline=vertices.map(p=>project(p,lens,film)).filter(p=>p!==null)
  const ys=outline.map(p=>p.y),low=Math.min(...ys),high=Math.max(...ys)
  if(outline.length<3||high-low<1e-8)return [
    {x:-rig.width*.25,y:-rig.height*.25},{x:rig.width*.25,y:rig.height*.25}
  ]
  return [.24,.76].map(fraction=>{
    const y=low+(high-low)*fraction
    const xs:number[]=[]
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length]
      if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))xs.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y))
    }
    const left=Math.min(...xs),right=Math.max(...xs)
    return {x:left+(right-left)*fraction,y}
  })
}

export function focusGuideBundles(lens:Frame,film:Frame,rig:Rig,bounds:Bounds,vertices:V[]){
  const samples=[{x:0,y:0},...sideSamples(lens,film,rig,vertices)]
  return samples.filter(({x,y})=>coverage(lens,film,rig,x,y)<=1).map(({x,y})=>({
    ...traceFocusBundle(lens,film,rig,x,y,bounds),center:x===0&&y===0
  }))
}
