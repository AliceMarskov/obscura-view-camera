import * as T from 'three'
import type {V} from './optics.ts'

const opaque=(material:T.Material)=>material.visible&&(!material.transparent||material.opacity>=1)
const samePoint=(a:V,b:V)=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]

/** One static optical scene. Picking and probe visibility share the same
 * opaque surfaces; an open pane transmits the chief ray to the object behind. */
export class ProbeSurfaces {
  private meshes:T.Mesh[]=[]
  private ray=new T.Raycaster()
  private cache=new Map<string,{origin:V;point:V;blocked:boolean}>()

  constructor(subject:T.Group) {
    subject.updateWorldMatrix(true,true)
    subject.traverseVisible(object=>{
      if(!(object instanceof T.Mesh))return
      const materials=Array.isArray(object.material)?object.material:[object.material]
      if(materials.some(opaque))this.meshes.push(object)
    })
  }

  private nearest(origin:V,direction:T.Vector3,far:number) {
    this.ray.set(new T.Vector3(...origin),direction.normalize())
    this.ray.far=far
    return this.ray.intersectObjects(this.meshes,false).find(hit=>{
      const {material}=hit.object as T.Mesh
      return !Array.isArray(material)||opaque(material[hit.face?.materialIndex??0])
    })
  }

  pick(origin:V,direction:V):V|null {
    const hit=this.nearest(origin,new T.Vector3(...direction),Infinity)
    return hit?hit.point.toArray():null
  }

  occluded(key:string,origin:V,point:V) {
    const previous=this.cache.get(key)
    if(previous&&samePoint(origin,previous.origin)&&samePoint(point,previous.point))return previous.blocked
    const delta=new T.Vector3(point[0]-origin[0],point[1]-origin[1],point[2]-origin[2])
    // Exclude the measured surface itself, including submillimetre bevels and
    // triangle-edge rounding. Distances and this tolerance are both in mm.
    const far=delta.length()-.25
    const blocked=far>0&&this.nearest(origin,delta,far)!==undefined
    this.cache.set(key,{origin:[...origin],point:[...point],blocked})
    return blocked
  }
}
