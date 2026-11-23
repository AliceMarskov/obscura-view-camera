import * as T from 'three'
import {Line2} from 'three/examples/jsm/lines/Line2.js'
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js'
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js'
import type {V} from './optics.ts'

/** Side/top construction views show the concealed edges as dashed lines. */
export class FocusOutline extends T.Group{
  private edges:Line2[]=[]
  constructor(){
    super()
    this.renderOrder=20
    const geometry=new LineGeometry()
    for(const hidden of [false,true]){
      for(const [width,color,opacity] of [[3.6,0x123e32,.78],[1.5,0x8af1be,1]]){
        const material=new LineMaterial({color,linewidth:width,transparent:true,opacity,
          depthWrite:false,depthFunc:hidden?T.GreaterDepth:T.LessEqualDepth,
          toneMapped:false,fog:false,dashed:hidden})
        const edge=new Line2(geometry,material)
        edge.renderOrder=width>2?20:21
        this.edges.push(edge);this.add(edge)
      }
    }
  }
  setSlice(vertices:V[],span:number){
    for(const edge of this.edges)edge.visible=vertices.length>=3
    if(vertices.length<3)return
    const geometry=new LineGeometry().setPositions([...vertices,vertices[0]].flat())
    this.edges[0].geometry.dispose()
    for(const edge of this.edges){
      edge.geometry=geometry
      edge.material.dashSize=span*.012;edge.material.gapSize=span*.006
    }
    this.edges[0].computeLineDistances()
  }
}
