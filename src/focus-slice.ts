import {add,axisFocus,cross,dot,filmPoint,focusPlane,length,mul,project,sub,unit,type Frame,type Rig,type V} from './optics.ts'

type Bounds={min:V;max:V}
export type FocusSlice={vertices:V[];axisPoint:V|null}

// Clip an ordered convex polygon to n·(P-origin) >= offset (all units mm).
function clip(vertices:V[],n:V,origin:V,offset=0):V[]{
  const out:V[]=[]
  if(!vertices.length)return out
  let a=vertices[vertices.length-1],da=dot(n,sub(a,origin))-offset
  for(const b of vertices){
    const db=dot(n,sub(b,origin))-offset
    if((da>0&&db<0)||(da<0&&db>0))out.push(add(a,mul(sub(b,a),da/(da-db))))
    if(db>=0)out.push(b)
    a=b;da=db
  }
  return out
}

/** The part of the object conjugate inside the scene, film gate and image circle.
 * A bellows setting may have an axial conjugate at infinity yet visible finite
 * conjugates off-axis. Always clip the plane before deciding what to display.
 */
export function focusSlice(lens:Frame,film:Frame,rig:Rig,bounds:Bounds):FocusSlice{
  const empty={vertices:[],axisPoint:null}
  const plane=focusPlane(lens,film,rig.focal)
  if(!plane)return empty
  const n=plane.normal,middle=mul(add(bounds.min,bounds.max),.5)
  const extent=mul(sub(bounds.max,bounds.min),.5)
  const signed=dot(n,sub(middle,plane.point))
  if(Math.abs(signed)>extent[0]*Math.abs(n[0])+extent[1]*Math.abs(n[1])+extent[2]*Math.abs(n[2]))return empty

  // Start with a square large enough to contain the complete plane/box cut.
  const center=sub(middle,mul(n,signed)),radius=length(extent)
  const tangent=unit(cross(n,Math.abs(n[1])<.8?[0,1,0]:[1,0,0]))
  const u=mul(tangent,radius),v=mul(cross(n,tangent),radius)
  let vertices=[sub(sub(center,u),v),sub(add(center,u),v),add(add(center,u),v),add(sub(center,u),v)]
  for(const axis of [[1,0,0],[0,1,0],[0,0,1]] as V[]){
    vertices=clip(vertices,axis,bounds.min)
    vertices=clip(vertices,mul(axis,-1),bounds.max)
  }
  const towardsSubject=mul(lens.n,-1)
  vertices=clip(vertices,towardsSubject,lens.o,rig.focal)

  // Each side of the true, possibly tilted and shifted film gate defines a
  // plane through the lens centre. Select the side containing the chief ray.
  const gate=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>
    sub(lens.o,filmPoint(film,x*rig.width/2,y*rig.height/2)))
  const chief=sub(lens.o,film.o)
  for(let i=0;i<4;i++){
    const side=unit(cross(gate[i],gate[(i+1)%4]))
    vertices=clip(vertices,dot(side,chief)>=0?side:mul(side,-1),lens.o)
  }

  // Approximate the round coverage boundary with an inscribed 96-gon only
  // when needed. Maximum radial boundary error is 0.054% of image radius.
  const slope=rig.circle/(2*rig.focal)
  const outsideCircle=vertices.some(p=>{
    const d=sub(p,lens.o)
    return Math.hypot(dot(d,lens.x),dot(d,lens.y))>slope*dot(d,towardsSubject)
  })
  if(outsideCircle){
    const sides=96,alongAxis=mul(towardsSubject,slope*Math.cos(Math.PI/sides))
    for(let i=0;i<sides&&vertices.length>=3;i++){
      const a=(i+.5)*2*Math.PI/sides
      const outward=add(mul(lens.x,Math.cos(a)),mul(lens.y,Math.sin(a)))
      vertices=clip(vertices,sub(alongAxis,outward),lens.o)
    }
  }
  if(vertices.length<3)return empty

  const distance=axisFocus(lens,film,rig.focal)
  if(!Number.isFinite(distance))return {vertices,axisPoint:null}
  const axis=add(lens.o,mul(towardsSubject,distance)),sample=project(axis,lens,film)
  const onGlass=sample&&Math.abs(sample.x)<=rig.width/2&&Math.abs(sample.y)<=rig.height/2
  const inBounds=axis.every((v,i)=>v>=bounds.min[i]&&v<=bounds.max[i])
  return {vertices,axisPoint:inBounds&&onGlass?axis:null}
}
