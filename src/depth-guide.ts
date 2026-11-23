import * as T from 'three'
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js'
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js'
import {clipSpatialLine,depthSection,opticalLines} from './depth-geometry'
import type {Frame,Rig,V} from './optics'

const colors={near:0xd6c599,far:0x8dc5cb,hinge:0xdbaa61,scheimpflug:0x88b597}
type Key=keyof typeof colors
type Bounds={min:V;max:V}
export class DepthGuide extends T.Group {
  private strokes=new Map<Key,LineSegments2[]>()
  private markers=new Map<Key,T.Points>()
  constructor(){
    super()
    this.visible=false;this.renderOrder=24
    for(const key of Object.keys(colors) as Key[]){
      const geometry=new LineSegmentsGeometry()
      const edges=[true,false].map(outline=>{
        const mat=new LineMaterial({color:outline?0x262c29:colors[key],linewidth:outline?4:1.8,
          transparent:true,opacity:outline?.78:1,toneMapped:false,depthTest:false,depthWrite:false,
          dashed:key!=='near',fog:false})
        const stroke=new LineSegments2(geometry,mat)
        stroke.renderOrder=outline?24:25;stroke.visible=false
        this.add(stroke);return stroke
      })
      this.strokes.set(key,edges)
      if(key==='hinge'||key==='scheimpflug'){
        // End-on intersections project to points in a principal view.
        const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3))
        const marker=new T.Points(geometry,new T.PointsMaterial({color:colors[key],size:6,sizeAttenuation:false,
          depthTest:false,depthWrite:false,fog:false,toneMapped:false}))
        marker.renderOrder=26;marker.visible=false;this.add(marker);this.markers.set(key,marker)
      }
    }
  }
  update(lens:Frame,film:Frame,r:Rig,b:Bounds,section:'side'|'top'){
    const span=Math.max(...b.max.map((v,i)=>v-b.min[i]))
    const boundaries=depthSection(lens,film,r,b,section),lines=opticalLines(lens,film,r.focal)
    const constructionBounds:Bounds={min:[...b.min],max:[...b.max]}
    for(let i=0;i<3;i++){
      constructionBounds.min[i]=Math.min(b.min[i],lens.o[i]-span*.85)
      constructionBounds.max[i]=Math.max(b.max[i],lens.o[i]+span*.85)
    }
    for(const [key,strokes] of this.strokes){
      const points=key==='near'||key==='far'?boundaries[key]:lines?clipSpatialLine(lines[key],constructionBounds):[]
      for(const s of strokes)s.visible=points.length>=2
      const marker=this.markers.get(key)
      if(marker){
        marker.visible=points.length>=2
        if(marker.visible)marker.position.fromArray(points[0]).lerp(new T.Vector3(...points[1]),.5)
      }
      if(points.length<2)continue
      const geometry=new LineSegmentsGeometry().setPositions(points.flat())
      strokes[0].geometry.dispose()
      for(const s of strokes){
        s.geometry=geometry
        s.material.dashSize=span*(key==='far'?.012:.006);s.material.gapSize=span*.006
      }
      strokes[0].computeLineDistances()
    }
  }
}
