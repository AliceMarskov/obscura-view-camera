import * as T from 'three'
import type {V} from '../optics.ts'
import {beam,box,surface,turn} from './model.ts'
import {patch,sceneryTexture} from './photographic.ts'
import {atelierPaper} from './atelier-printing.ts'

function roundRectangle(width:number,depth:number,r:number){
  const points:T.Vector2[]=[]
  for(let k=0;k<4;k++){
    const a=k*Math.PI/2
    const x=Math.cos(a+Math.PI/4)>0?width/2-r:r-width/2
    const z=Math.sin(a+Math.PI/4)>0?depth/2-r:r-depth/2
    for(let j=0;j<=7;j++)points.push(new T.Vector2(x+r*Math.cos(a+j*Math.PI/14),z+r*Math.sin(a+j*Math.PI/14)))
  }
  return points
}
function perimeter(parent:T.Group,material:T.Material,rings:number[][]){
  const pos:number[]=[],uv:number[]=[],indices:number[]=[]
  for(const [width,depth,r,y] of rings){
    const points=roundRectangle(width,depth,r)
    for(const p of points){pos.push(p.x,y,p.y);uv.push(p.x/250,p.y/250)}
  }
  const count=32
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<count;j++){
    const a=i*count+j,b=i*count+(j+1)%count
    indices.push(a,a+count,b,b,a+count,b+count)
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3))
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals()
  parent.add(new T.Mesh(geo,material))
}
export function developingTray(g:T.Group,top:number,dark:T.Material,brass:T.Material){
  const tray=new T.Group();tray.position.set(212,top,-879);tray.rotation.y=-.32;g.add(tray)
  const enamel=new T.MeshPhysicalMaterial({color:0xb4b5a6,roughness:.29,clearcoat:.62,side:T.DoubleSide})
  // Pressed sheet, toe, sloping walls and a rolled, dark enamel lip. Both
  // ends are open to developing solution rather than intersecting five cubes.
  perimeter(tray,enamel,[[.2,.2,.08,3],[111,175,11,3],[121,185,14,6],[137,200,17,20],[142,205,19,21]])
  const rim=surface(0x303b3c,.28,.24);rim.side=T.DoubleSide
  perimeter(tray,rim,[[139,202,18,19.8],[143,206,19,20.4],[144,207,19.5,22],[142,205,19,23.2],[139,202,18,22.3]])
  for(const x of [-38,-20,-2,16,34]){
    const rib=turn(tray,enamel,x,3.2,0,[[0,-69],[1.8,-67],[2.4,-62],[2.4,62],[1.8,67],[0,69]],12)
    rib.rotation.x=Math.PI/2
  }
  // A crossed pair of wooden print tongs, with opposing tapered rubber pads.
  const tong=new T.Group();tong.position.set(194,top+5,-739);tong.rotation.y=.68;g.add(tong)
  const beech=surface(0x9b774a),rubber=surface(0x3f3932)
  for(const v of [-1,1]){
    beam(tong,beech,[v*8,3,-58],[v*2,4,7],3.8,7)
    beam(tong,beech,[v*2,4,7],[-v*5,5,42],3.8,6)
    beam(tong,rubber,[-v*5,5,41],[-v*4.4,3,47],5,7)
  }
  turn(tong,brass,0,7,1,[[0,0],[3,0],[3,1],[0,1.8]],18)
  // Boxwood rule, actual 1 mm subdivisions, raised over its brass hinge.
  const rule=new T.Group();rule.position.set(13,top+3,-763);rule.rotation.y=.43;g.add(rule)
  const leaf=box(rule,beech,0,3,0,157,4.6,18);leaf.rotation.x=-.1
  const face=new T.Mesh(new T.PlaneGeometry(157,18),atelierPaper('rule'))
  face.rotation.x=-Math.PI/2-.1;face.position.y=5.8;rule.add(face)
  for(const x of [-74.5,74.5]){box(rule,brass,x,3,0,4,5,18.5);turn(rule,dark,x,6,0,[[0,0],[.85,0],[0,.4]],12)}
}
export function graduatedMeasure(g:T.Group,top:number){
  const item=new T.Group();item.position.set(268,top,-1017);g.add(item)
  // One transmitted surface for the two-millimetre wall. A conventional
  // alpha-blended white cylinder would make the measuring glass look frosted.
  const glass=new T.MeshPhysicalMaterial({color:0xeaf1ed,roughness:.045,transmission:1,ior:1.50,
    thickness:2.2,attenuationColor:new T.Color(0xa8c3bf),attenuationDistance:115,
    transparent:true,depthWrite:false})
  const rolled=new T.MeshPhysicalMaterial({color:0xb4c5c5,roughness:.14,metalness:.12,clearcoat:.9,
    transparent:true,opacity:.73,side:T.DoubleSide})
  turn(item,rolled,0,0,0,[[0,0],[28,0],[30,2],[30,5],[27,7],[12,10],[10,17],[15,19],[0,20]],6)
  turn(item,glass,0,0,0,[[0,17],[15,17],[18,23],[18.6,173],[19.5,185],[20.5,187],[19.2,188],[17.8,184],[17,24],[14,20],[0,20]],64)
  turn(item,rolled,0,0,0,[[18.6,183],[20.2,184],[20.5,186],[19.3,187],[18.7,186]],64)
  const solution=new T.MeshPhysicalMaterial({color:0x819a89,roughness:.10,metalness:.05,clearcoat:1,
    opacity:.20,transparent:true,depthWrite:false})
  turn(item,solution,0,0,0,[[0,21],[15.8,21],[16.9,24],[17.3,87],[16,85.7],[11,85.1],[0,85]],60)
  const geo=new T.CylinderGeometry(18.94,18.27,149,48,1,true,-1.31,2.2)
  const ink=new T.MeshBasicMaterial({map:sceneryTexture('atelier-scale.webp'),transparent:true,alphaTest:.48,depthWrite:false})
  const scale=new T.Mesh(geo,ink);scale.position.y=103;item.add(scale)
}
export function loupe(g:T.Group,top:number,brass:T.Material,dark:T.Material){
  const l=new T.Group();l.position.set(-54,top+.6,-737);g.add(l)
  // A linen tester with an open foot. A printed edge beneath it can be seen
  // between its three uprights and highlights move over the curved eye lens.
  turn(l,brass,0,0,0,[[23,0],[27,0],[28,1.4],[27.6,3],[23,3],[23,0]],64)
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3
    const start:V=[Math.cos(a)*23,2,Math.sin(a)*23],end:V=[Math.cos(a)*18,24,Math.sin(a)*18]
    beam(l,brass,start,end,3.1,2.8)
  }
  turn(l,brass,0,0,0,[[17,20],[21,20],[22,22],[20.4,24],[20.4,31],[18,32],[17,31]],60)
  turn(l,dark,0,0,0,[[16,27],[20,27],[21,28.5],[20.7,39],[18.5,41],[15.5,41],[15,39]],64)
  for(let i=0;i<55;i++){
    const a=i*Math.PI*2/55
    const ridge=box(l,dark,20.55*Math.cos(a),34,20.55*Math.sin(a),.95,9,1)
    ridge.rotation.y=-a
  }
  const optic=new T.MeshPhysicalMaterial({color:0x344a48,roughness:.065,metalness:.22,clearcoat:1})
  turn(l,optic,0,0,0,[[0,37],[15.6,37],[15.5,39.3],[13,40.3],[8,41.2],[0,41.55]],64)
}
export function contactFrame(g:T.Group,top:number,wood:T.Material,brass:T.Material,dark:T.Material,print:T.Material){
  const frame=new T.Group();frame.position.set(155,top+37,-1440);frame.rotation.y=-.14;g.add(frame)
  const mat=surface(0xbcae90)
  // A recessed print, register, bevel and two pivoting spring retainers.
  box(frame,wood,0,125,-10,305,253,13);box(frame,mat,0,125,1,279,216,5)
  patch(frame,print,263,196,0,0,1,1,5).position.y+=27
  for(const side of [-1,1]){
    box(frame,wood,side*145,125,1,14,252,17);box(frame,wood,0,125+side*121,1,283,12,17)
    box(frame,dark,side*136,125,4,1.6,228,3)
    const latch=new T.Group();latch.position.set(side*121,236,10);latch.rotation.z=side*.45;frame.add(latch)
    box(latch,brass,0,-8,0,6.5,24,2.1)
    const pivot=turn(latch,dark,0,0,1,[[0,0],[3,0],[3,1],[0,1.8]],18);pivot.rotation.x=Math.PI/2
  }
  for(const x of [-95,95])beam(frame,wood,[x,10,-9],[x,-37,-90],14)
  return frame
}
