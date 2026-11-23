import * as T from 'three'
import {box} from './model.ts'
import {photographic,sceneryTexture} from './photographic.ts'
import {pavementBooks} from './paris-pavement.ts'

// All lengths are in millimetres. The principal elevation is photographed
// from close enough to resolve the interior of a window with the 4× loupe.
const bays=[.085,.213,.332,.448,.566,.691,.813,.934]
const floors=[[.057,.184],[.238,.370],[.429,.558],[.614,.748]]
type Section=readonly [number,number][]

/** A swept stone or joinery profile. Flat faces preserve the highlight on
 * each bevel and let the projections shade their returns in the sun. */
function moulding(parent:T.Group,mat:T.Material,x:number,y:number,z:number,
  length:number,section:Section,vertical=false) {
  const positions:number[]=[],uv:number[]=[]
  for(let i=1;i<section.length;i++){
    const [a,b]=section[i-1],[c,d]=section[i]
    for(const [end,h,t] of [[-1,a,b],[1,a,b],[1,c,d],[-1,a,b],[1,c,d],[-1,c,d]]){
      positions.push(end*length/2,h,t);uv.push((end+1)/2,h/200)
    }
  }
  const geometry=new T.BufferGeometry()
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals()
  const mesh=new T.Mesh(geometry,mat);mesh.position.set(x,y,z)
  if(vertical)mesh.rotation.z=Math.PI/2
  parent.add(mesh)
}

// Wrought flat bar with a rectangular section, including its narrow return
// faces. One shared casting is repeated along each Juliet balcony.
function grilleGeometry() {
  const positions:number[]=[],uv:number[]=[]
  function bar(line:number[][],breadth:number) {
    const rings=line.map(([x,y],i)=>{
      const prev=line[Math.max(0,i-1)],next=line[Math.min(line.length-1,i+1)]
      const dx=next[0]-prev[0],dy=next[1]-prev[1],s=breadth/2/Math.hypot(dx,dy)
      return [[x-dy*s,y+dx*s,7],[x+dy*s,y-dx*s,7],[x+dy*s,y-dx*s,-7],[x-dy*s,y+dx*s,-7]]
    })
    for(let i=1;i<rings.length;i++)for(let s=0;s<4;s++){
      const n=(s+1)%4,a=rings[i-1][s],b=rings[i-1][n],c=rings[i][n],d=rings[i][s]
      for(const p of [a,b,c,a,c,d]){positions.push(...p);uv.push(p[0]/200,p[1]/700)}
    }
  }
  bar([[-120,0],[-120,710]],14)
  for(const mirror of [-1,1])for(const upper of [false,true]){
    const points=[[0,18],[14,85],[52,148],[90,219],[99,263]]
    for(let i=1;i<=15;i++){
      const t=i/15,a=t*Math.PI*1.80,r=64*(1-.85*t)
      points.push([35+r*Math.cos(a),263+r*Math.sin(a)])
    }
    bar(points.map(([x,y])=>[mirror*x,upper?710-y:y]),13)
  }
  bar([[0,158],[0,552]],12)
  const geo=new T.BufferGeometry()
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3))
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals()
  return geo
}

function slab(material:T.Material,w:number,h:number,variant:number,tint=0xffffff){
  const geo=new T.PlaneGeometry(w,h)
  const uv=geo.getAttribute('uv')
  for(let i=0;i<uv.count;i++){
    const extent=w/h/1.5,center=[.64,.44,.48,.44][variant]
    const u=center+(uv.getX(i)-.5)*extent,v=.008+.984*uv.getY(i)
    uv.setXY(i,(variant%2+u)/2,(1-Math.floor(variant/2)+v)/2)
  }
  const rgb=new T.Color(tint),colors=new Float32Array(uv.count*3)
  for(let i=0;i<uv.count;i++)rgb.toArray(colors,i*3)
  geo.setAttribute('color',new T.BufferAttribute(colors,3))
  return new T.Mesh(geo,material)
}

function fasciaTexture(title:string,subtitle:string){
  if(typeof document==='undefined')return null
  const c=document.createElement('canvas');c.width=3072;c.height=320
  const ctx=c.getContext('2d')!
  ctx.fillStyle='#422327';ctx.fillRect(0,0,c.width,c.height)
  ctx.strokeStyle='#9a774d';ctx.lineWidth=3;ctx.strokeRect(18,15,c.width-36,c.height-30)
  ctx.fillStyle='#d9b575';ctx.textAlign='center';ctx.textBaseline='middle'
  ctx.font='126px "Times New Roman",serif';ctx.fillText(title,c.width/2,129)
  ctx.font='38px Georgia,serif';ctx.fillText(subtitle,c.width/2,233)
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8
  return map
}

// A scallop-shell keystone with ribs cut in the limestone.
function coquille(){
  const v:number[]=[],uv:number[]=[],indices:number[]=[]
  for(let j=0;j<=6;j++)for(let i=0;i<=30;i++){
    const r=.015+j/6*.985,t=(i/30-.5)*Math.PI*.88
    const ridge=.5+.5*Math.cos(t*23),contour=1-.061*(1-ridge)*r
    const x=113*r*Math.sin(t)*contour,y=158*r*Math.cos(t)*contour
    v.push(x,y,12+13*r+42*Math.sin(r*Math.PI*.83)+14*r*ridge)
    uv.push(x/200,y/158)
    if(j&&i){const a=j*31+i;indices.push(a-32,a,a-1,a-32,a-31,a)}
  }
  const geo=new T.BufferGeometry();geo.setIndex(indices)
  geo.setAttribute('position',new T.Float32BufferAttribute(v,3))
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals()
  return geo
}

function windowBox(parent:T.Group,x:number,y:number,seed:number,materials:T.Material[]){
  const [clay,leaf,petal]=materials
  box(parent,clay,x,y+81,143,690,146,202)
  box(parent,clay,x,y+153,143,720,34,222)
  const blades=new T.SphereGeometry(1,7,4)
  const cluster=new T.IcosahedronGeometry(1,0)
  let s=seed
  const random=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296}
  for(let i=0;i<41;i++){
    const offset=(random()-.5)*650,z=(random()-.5)*175,crown=1-Math.abs(offset)/420
    const pos=y+170+random()*115*crown
    const m=new T.Mesh(i%5===0?cluster:blades,i%5===0?petal:leaf)
    m.position.set(x+offset,pos+(i%5===0?60:0),143+z)
    m.rotation.set(random()-.5,random()*Math.PI,(random()-.5)*1.5)
    const a=18+random()*17;m.scale.set(a,i%5===0?a*.66:a*.50,a*(.68+random()*.5));parent.add(m)
  }
}

export function parisFrontage(balustrades:T.Group,ashlar:T.MeshStandardMaterial){
  const stone=ashlar.clone();stone.userData.tile=[2240,1780]
  const cutStone=photographic('paris-cut-stone',[330,166],.80)
  cutStone.normalMap=ashlar.normalMap;cutStone.normalScale.set(.33,.33)
  const paint=new T.MeshStandardMaterial({color:0xc1b6a0,roughness:.58})
  const dark=new T.MeshStandardMaterial({color:0x353c3a,roughness:.85})
  const rail=new T.MeshStandardMaterial({color:0x393b34,roughness:.46,metalness:.46})
  const gutter=new T.MeshStandardMaterial({color:0x706f64,roughness:.65,metalness:.35})
  const backing=new T.MeshBasicMaterial({map:sceneryTexture('paris-interiors.webp'),vertexColors:true,color:0xb6b7ae})
  const glass=new T.MeshPhysicalMaterial({color:0xc5d6dd,metalness:.88,roughness:.085,
    transparent:true,opacity:.14,depthWrite:false})
  const fascias=[['L I B R A I R I E','L I V R E S   A N C I E N S'],['E S T A M P E S','G R A V U R E S   E T   C A R T E S']].map(
    ([title,subtitle])=>new T.MeshStandardMaterial({map:fasciaTexture(title,subtitle),roughness:.61}))
  const frameWood=new T.MeshStandardMaterial({color:0x482a29,roughness:.61})
  const display=new T.MeshBasicMaterial({map:sceneryTexture('paris-bookshop.webp'),color:0xbbb9b3})
  const shutters=new T.MeshStandardMaterial({color:0xabaf9e,roughness:.73})
  const flowers=[0x72503a,0x435433,0x9a3836].map(color=>new T.MeshStandardMaterial({color,roughness:.83}))
  const grille=grilleGeometry(),shell=coquille()
  const cornice:Section=[[-97,0],[-94,45],[-70,66],[-63,75],[-56,108],[-31,115],[-25,148],[-8,163],[12,161],[22,137],[27,0]]
  const edge:Section=[[-68,0],[-64,21],[-47,28],[-39,55],[-28,61],[-20,72],[15,72],[26,59],[34,55],[47,29],[51,0]]
  const sill:Section=[[-86,-3],[-85,85],[-66,103],[-62,155],[-23,175],[-19,185],[17,185],[28,135],[30,0]]

  function window(block:T.Group,x:number,base:number,head:number,w:number,row:number,col:number,casts:T.InstancedMesh|null) {
    const h=head-base,mid=(head+base)/2
    // Deep reveals and separate sashes. Glass, iron and the room's far wall
    // are three different subject distances seen by the optical simulator.
    box(block,dark,x,mid,-640,w+4,h+10,48)
    const glazingTints=[0x90867c,0xffe0aa,0x6f8397,0xf0ece2,0x45484d]
    const inside=slab(backing,w+420,h+690,(col+row*2)%4,glazingTints[(col*7+row*3)%5])
    inside.position.set(x,mid+185,-607);block.add(inside)
    for(const side of [-1,1]){
      const hx=x+side*(w/2+33)
      box(block,cutStone,hx,mid,-80,66,h+90,182)
      moulding(block,cutStone,hx+side*24,mid,0,h+120,edge,true)
      box(block,paint,x+side*(w/2-22),mid,-98,46,h+6,71)
      box(block,dark,x+side*(w/2-50),mid,-109,9,h-75,40)
    }
    box(block,paint,x,base+34,-99,w,70,73)
    box(block,paint,x,head-32,-99,w,66,70)
    const wGlass=w-80,hGlass=h-105
    const glazing=new T.Mesh(new T.PlaneGeometry(wGlass,hGlass),glass)
    glazing.position.set(x,mid,-129);block.add(glazing)
    box(block,paint,x,mid,-82,38,h-48,74)
    box(block,paint,x+21,mid,-73,10,h-59,40)
    box(block,paint,x,base+h*.60,-94,w-80,33,62)
    if((row+col)%4===1)box(block,paint,x,base+h*.82,-99,w-80,20,35)
    moulding(block,cutStone,x,head+30,0,w+238,edge)
    moulding(block,cutStone,x,base+8,0,w+333,sill)
    // Shaped corbels and a projecting keystone beneath the floor drip.
    for(const s of [-1,0,1]){
      const cx=x+s*(w/2+100),top=head+(s?303:328)
      const wide=s?132:248
      moulding(block,cutStone,cx,top,0,wide,[[-212,0],[-202,48],[-174,57],[-132,45],
        [-94,66],[-60,90],[-53,107],[-18,122],[4,119],[14,0]])
      for(const d of [-.23,.23])moulding(block,cutStone,cx+d*wide,top-23,40,wide*.13,
        [[-129,0],[-115,29],[-81,40],[-50,31],[-30,53],[-7,67],[0,0]])
    }
    moulding(block,cutStone,x,head+342,0,w+515,cornice)
    if(casts){
      const carver=new T.Mesh(shell,cutStone);carver.position.set(x,head+118,68);block.add(carver)
      if((row+col*3)%7===0||row===2&&col===3)windowBox(block,x,base+15,137+col*43+row*99,flowers)
      if(row===0&&col===1||row===2&&col===6){
        const step=67
        for(const side of [-1,1]){
          const cx=x+side*w*.25
          box(block,shutters,cx-side*w*.21,mid,8,40,h-15,33)
          box(block,shutters,cx+side*w*.21,mid,8,40,h-15,33)
          for(let y=base+45;y<head-20;y+=step){
            const slat=box(block,shutters,cx,y,5,w*.44,54,21);slat.rotation.x=-.38
          }
        }
      }
    }
    const railWidth=w+329,front=365
    box(block,rail,x,base+65,front,railWidth,22,29)
    box(block,rail,x,base+786,front,railWidth+34,37,52)
    if(casts)for(let i=0;i<6;i++){
      const matrix=new T.Matrix4().makeScale(railWidth/(6*240),1,1)
      matrix.setPosition(x-railWidth/2+railWidth*(i+.5)/6,base+76,front)
      casts.setMatrixAt((col%4)*6+i,matrix)
    }
    else for(let i=1;i<10;i++)
      box(block,rail,x-railWidth/2+i*railWidth/10,base+428,front,18,710,18)
    for(const s of [-1,1]){
      box(block,rail,x+s*railWidth/2,base+425,front,23,746,36)
      box(block,rail,x+s*railWidth/2,base+786,front/2,30,35,front)
      box(block,rail,x+s*railWidth/2,base+70,front/2,23,18,front)
      box(block,rail,x+s*railWidth/2,base+424,front*.53,16,710,16)
    }
  }

  return (block:T.Group,w:number,h:number,principal:boolean)=>{
    if(principal)pavementBooks(block,w,h)
    const positions=bays.map(c=>(c-.5)*w),opening=w*.049
    block.updateWorldMatrix(true,false)
    let upper=h
    for(const [row,[top,bottom]] of floors.entries()){
      const base=h*(1-bottom),head=h*(1-top)
      // Four windows share one set of scroll meshes. A loupe inspects only
      // one or two groups, and all groups share the same small vertex buffer.
      const castings=principal?[0,1].map(()=>{
        const m=new T.InstancedMesh(grille,rail,24)
        m.matrix.copy(block.matrixWorld);m.matrixAutoUpdate=false
        m.castShadow=m.receiveShadow=true;balustrades.add(m);return m
      }):[]
      // Each storey is a pierced wall with jambs, as opposed to mullions
      // drawn over a full flat wall, which would occlude the recessed rooms.
      box(block,stone,0,(upper+head)/2,-175,w,upper-head,350)
      let left=-w/2
      for(const [col,x] of positions.entries()){
        const right=x-opening/2
        box(block,stone,(left+right)/2,(head+base)/2,-175,right-left,head-base,350)
        window(block,x,base,head,opening,row,col,castings[Math.floor(col/4)]??null)
        left=x+opening/2
      }
      box(block,stone,(left+w/2)/2,(head+base)/2,-175,w/2-left,head-base,350)
      moulding(block,cutStone,0,base-130,0,w+60,cornice)
      upper=base
    }
    const shopTop=h*(1-.765)
    box(block,stone,0,(upper+shopTop)/2,-175,w,upper-shopTop,350)
    moulding(block,cutStone,0,shopTop+49,0,w+170,cornice)
    moulding(block,cutStone,0,h-85,0,w+210,cornice)
    for(const fraction of [.158,.75]){
      const x=(fraction-.5)*w
      const pipe=new T.Mesh(new T.CylinderGeometry(54,54,h-shopTop,12),gutter)
      pipe.position.set(x,(h+shopTop)/2,97);block.add(pipe)
      for(let y=shopTop+380;y<h-150;y+=1500)box(block,gutter,x,y,98,119,24,118)
    }
    // At street level the shop is an inset, rectified photographic plate.
    // Painted fascias and their type are separately resolved at close range.
    const signY=h*(1-.789),signW=w*.302,signH=h*.033
    for(const [i,center] of [.33,.682].entries()){
      const x=(center-.5)*w
      box(block,frameWood,x,signY,122,signW+82,signH+68,48)
      const sign=new T.Mesh(new T.PlaneGeometry(signW,signH),fascias[i])
      sign.position.set(x,signY,149);block.add(sign)
      box(block,frameWood,x,signY+signH/2+35,149,signW+101,39,89)
    }
    for(const [i,f] of [.220,.281,.338,.392,.450,.568,.623,.682,.741,.799].entries()){
      const x=(f-.5)*w,bayWidth=w*.050
      const floor=h*.042,ceiling=h*.183,mid=(floor+ceiling)/2
      const picture=slab(backing,bayWidth+320,ceiling-floor+410,i%4)
      picture.position.set(x,mid+140,-305);block.add(picture)
      for(const s of [-1,1])box(block,frameWood,x+s*bayWidth/2,mid,-75,76,ceiling-floor+18,275)
      box(block,frameWood,x,floor+10,-68,bayWidth+50,62,280)
      box(block,frameWood,x,ceiling-25,-65,bayWidth+50,83,280)
      if(i%3!==1){
        const size=bayWidth*(i%3===0?.84:.67),print=new T.Mesh(new T.PlaneGeometry(size,size/1.5),display)
        print.position.set(x+(i%3===0?0:-58),floor+100+size/3,-101);block.add(print)
        box(block,frameWood,print.position.x,print.position.y-size/3-14,-110,size+30,30,120)
      }
      if(i<5){
        // Antiquarian books on shelves deeper in the shop. The small printed
        // spines retain their physical size as the lens or the film crop changes.
        const spines=[[.007,.012,.013,.36],[.034,.098,.066,.371],[.072,.096,.096,.379],
          [.108,.095,.144,.379],[.156,.086,.193,.377],[.287,.163,.305,.375],[.310,.169,.327,.378],
          [.346,.167,.364,.381],[.726,.157,.753,.382],[.758,.153,.787,.377],[.805,.158,.829,.381],
          [.861,.17,.896,.382],[.902,.16,.932,.377],[.953,.152,.98,.378]]
        for(let j=0;j<3;j++){
          const bottom=floor+320+j*399,back=-239
          box(block,frameWood,x,bottom-18,back-78,bayWidth+230,36,205)
          let left=x-bayWidth*.54,k=0
          while(left<x+bayWidth*.52){
            const v=(k*7+j*11+i*32)%spines.length,bb=spines[v]
            const bw=29+(k*25+j*19+i)%41,bh=203+(v*17+k*3)%105
            const geo=new T.PlaneGeometry(bw,bh),uv=geo.getAttribute('uv')
            for(let n=0;n<uv.count;n++)uv.setXY(n,bb[0]+(bb[2]-bb[0])*uv.getX(n),1-bb[3]+(bb[3]-bb[1])*uv.getY(n))
            const book=new T.Mesh(geo,display)
            book.position.set(left+bw/2,bottom+bh/2,back+(v%4)*3)
            book.rotation.z=(v%7-3)*.012;block.add(book)
            left+=bw+3+(v%2)*2;k++
          }
        }
      }
      const pane=new T.Mesh(new T.PlaneGeometry(bayWidth-55,ceiling-floor-50),glass)
      pane.position.set(x,mid,42);block.add(pane)
      box(block,frameWood,x,ceiling-434,50,bayWidth,44,62)
    }
  }
}
