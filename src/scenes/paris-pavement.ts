import * as T from 'three'
import {beam,box,plaque,surface,turn} from './model.ts'

/** A street-side reading terrace. All dimensions are millimetres. */
export function pavementBooks(block:T.Group,w:number,h:number){
  const iron=surface(0x38423c,.52,.5),wood=surface(0x886247,.67),stone=surface(0xbdb2a0,.55)
  const cloth=new T.MeshStandardMaterial({roughness:.96,vertexColors:true,side:T.DoubleSide})
  const points:number[]=[],colors:number[]=[],uv:number[]=[]
  const red=new T.Color(0x85504a),oat=new T.Color(0xd7c7ab)
  const awningWidth=w*.30,cx=-w*.17,span=1320,rootY=h*.173
  const vertex=(x:number,y:number,z:number,c:T.Color)=>{
    points.push(x,y,z);colors.push(c.r,c.g,c.b);uv.push(x/200,z/200)
  }
  const stripes=35
  for(let i=0;i<stripes;i++){
    const x0=cx+awningWidth*(i/stripes-.5),x1=x0+awningWidth/stripes,c=i%2?oat:red
    for(let fold=0;fold<5;fold++){
      const a=fold/5,b=(fold+1)/5
      const height=(t:number)=>rootY-295*t-37*Math.sin(Math.PI*t)
      for(const [px,t] of [[x0,a],[x0,b],[x1,b],[x0,a],[x1,b],[x1,a]])vertex(px,height(t),175+t*span,c)
    }
    // The ends of each canvas stripe fall into a shallow scallop.
    const mid=(x0+x1)/2,front=175+span,edge=rootY-295
    for(const [px,yy] of [[x0,edge],[x0,edge-86],[mid,edge-130],[x0,edge],[mid,edge-130],[x1,edge-86],
      [x0,edge],[x1,edge-86],[x1,edge]])vertex(px,yy,front,c)
  }
  const geometry=new T.BufferGeometry()
  geometry.setAttribute('position',new T.Float32BufferAttribute(points,3))
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3))
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals()
  block.add(new T.Mesh(geometry,cloth))
  for(const support of [-.47,0,.47]){
    const sx=cx+support*awningWidth
    beam(block,iron,[sx,rootY-940,183],[sx,rootY-304,span+170],24)
  }
  const ground=154
  for(const cx of [-w*.268,-w*.12]){
    const z=1800
    turn(block,iron,cx,ground,z,[[0,0],[195,0],[200,13],[67,39],[27,72],[22,695],[107,709],[0,710]],20)
    turn(block,stone,cx,ground+707,z,[[0,0],[292,0],[302,7],[302,19],[297,24],[0,24]],32)
    for(const sign of [-1,1]){
      const chair=new T.Group()
      chair.position.set(cx+465*sign,ground,z+82*sign)
      chair.rotation.y=sign*1.24;block.add(chair)
      for(const x of [-154,154]){
        beam(chair,iron,[x,2,163],[x,439,-140],16)
        beam(chair,iron,[x,2,-177],[x,439,131],16)
        beam(chair,iron,[x,378,-112],[x,821,-193],15)
      }
      for(let k=0;k<4;k++)box(chair,wood,0,442,-115+k*77,345,18,64)
      for(const yy of [694,769]){
        const slat=box(chair,wood,0,yy,-164,350,54,14);slat.rotation.x=-.18
      }
    }
  }
  const stand=new T.Group()
  stand.position.set(w*.084,ground,2300);stand.rotation.y=-.3;block.add(stand)
  for(const x of [-235,235])for(const sign of [-1,1])
    beam(stand,wood,[x,0,sign*206],[x,1010,0],41)
  const board=new T.Group();board.position.set(0,205,158);board.rotation.x=-.19;stand.add(board)
  plaque(board,0,319,5,435,638,'LIVRES','D’OCCASION','#384039','#d2c7ae',wood)
}
