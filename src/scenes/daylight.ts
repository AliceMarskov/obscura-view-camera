import * as T from 'three'
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js'
import {sceneryLoading} from './photographic.ts'

// Position on the sky of the direct sun. The modelled street and its
// hemispherical sky use the same afternoon direction in world space.
// Preserve the measured solar height while rotating the panorama and its
// shadow caster together to rake across the mouldings of the main elevation.
const solarAltitude=38.5*Math.PI/180,azimuth=-58*Math.PI/180
export const streetSun = new T.Vector3(Math.sin(azimuth)*Math.cos(solarAltitude),
  Math.sin(solarAltitude),Math.cos(azimuth)*Math.cos(solarAltitude))

// An emissive sky surround, shared by the observer and all aperture samples.
// The enveloping geometry has no measurable surface for a focusing probe.
// Keeping this on the class also preserves that behavior in group.clone(true).
class SkySurround extends T.Mesh {
  override raycast(): void {}
}

function noise(x:number,y:number,z:number) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z)
  const fade=(v:number)=>v*v*(3-2*v)
  const fx=fade(x-ix),fy=fade(y-iy),fz=fade(z-iz)
  const at=(a:number,b:number,c:number)=>{
    let h=Math.imul(ix+a,1597334677)^Math.imul(iy+b,3812015801)^Math.imul(iz+c,958282199)
    h=Math.imul(h^(h>>>16),2246822507)
    return ((h^(h>>>13))>>>0)/4294967295
  }
  const blend=(a:number,b:number,t:number)=>a+(b-a)*t
  return blend(
    blend(blend(at(0,0,0),at(1,0,0),fx),blend(at(0,1,0),at(1,1,0),fx),fy),
    blend(blend(at(0,0,1),at(1,0,1),fx),blend(at(0,1,1),at(1,1,1),fx),fy),fz)
}

export function daylight(group:T.Group,glazed=false,radius=6700) {
  if(!glazed){
    const geo=new T.SphereGeometry(radius,96,48),uv=geo.getAttribute('uv')
    for(let i=0;i<uv.count;i++)uv.setY(i,Math.max(0,2*uv.getY(i)-1))
    // Keep the CC0 Kloofendal sky in linear HDR down to the sampler. The
    // solar core was capped before filtering; direct solar illumination is
    // evaluated by the shadow-casting light along the photographed direction.
    const map=typeof document==='undefined'?new T.Texture():new HDRLoader(sceneryLoading).load('./scenery/paris-daylight.hdr')
    map.wrapS=T.RepeatWrapping
    // Match the relative exposure of the HDR capture to the simulated
    // afternoon key (the source panorama does not specify absolute cd/m²).
    const material=new T.MeshBasicMaterial({map,color:new T.Color(1.5,1.5,1.5),side:T.BackSide,depthWrite:false,fog:false})
    const sky=new SkySurround(geo,material)
    // The brightest point in the source HDR is at column 2455 of 4096.
    sky.rotation.y=Math.atan2(streetSun.z,-streetSun.x)-2*Math.PI*(2455.5/4096)
    sky.name='environment.daylight';sky.renderOrder=-10000;sky.frustumCulled=false;group.add(sky)
    return group
  }
  const geo=new T.SphereGeometry(radius,112,64),pos=geo.getAttribute('position')
  const sky=new T.Color(0x88a3a4),horizon=new T.Color(0xc9cbb8)
  const cloud=new T.Color(0xdfdfcc),color=new T.Color()
  const colors=new Float32Array(pos.count*3)
  // Coarse cloud fields live in direction space, without a panorama seam.
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i)/radius,y=pos.getY(i)/radius,z=pos.getZ(i)/radius
    const elevation=T.MathUtils.smoothstep(y,-.035,.40)
    const broad=noise(2.8*x+2.7,7.1*y+1.4,3.6*z+6.9)
    const detail=noise(10*x-4.2,18*y+.2,11*z+2.1)
    const vapor=T.MathUtils.smoothstep(.76*broad+.24*detail,.42,.73)
    color.copy(horizon).lerp(sky,elevation).lerp(cloud,vapor*.43*T.MathUtils.smoothstep(y,-.04,.09))
    color.toArray(colors,i*3)
  }
  geo.setAttribute('color',new T.BufferAttribute(colors,3))
  const material=new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,depthWrite:false,fog:false})
  const dome=new SkySurround(geo,material)
  dome.name='environment.daylight';dome.position.set(0,-40,-430)
  dome.renderOrder=-10000;dome.frustumCulled=false;group.add(dome)
  return group
}
