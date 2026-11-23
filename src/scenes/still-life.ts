import * as T from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {batch,beam,box,marker,surface,turn} from './model.ts'
import {patch,photographic,pbr} from './photographic.ts'
import {contactLight} from './contact-light.ts'
import {atelierPaper} from './atelier-printing.ts'
import {contactFrame,developingTray,graduatedMeasure,loupe} from './atelier-instruments.ts'
import {studioRoom} from './atelier-room.ts'

const benchTop=-141
function bookcloth(color:number){
  const size=128,data=new Uint8Array(size*size*4)
  let seed=317
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    const grain=(seed/4294967296-.5)*25,warp=Math.sin(x*Math.PI/2)*9,weft=Math.cos(y*Math.PI/2)*8
    const value=225+grain+warp+weft+3*Math.sin(x*.2+Math.cos(y*.4))
    const i=4*(y*size+x);data[i]=data[i+1]=data[i+2]=value;data[i+3]=255
  }
  const map=new T.DataTexture(data,size,size);map.wrapS=map.wrapT=T.RepeatWrapping
  map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true
  const m=new T.MeshStandardMaterial({color,map,bumpMap:map,bumpScale:.22,roughness:.76})
  m.userData.tile=[29,29];return m
}
function rounded(p:T.Group,m:T.Material,w:number,h:number,d:number,x:number,y:number,z:number,r:number){
  const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,r),m);mesh.position.set(x,y,z);p.add(mesh);return mesh
}
function carton(parent:T.Group,x:number,y:number,z:number,w:number,h:number,d:number,angle:number,cloth:T.Material,edge:T.Material){
  const item=new T.Group();item.position.set(x,y,z);item.rotation.y=angle;parent.add(item)
  rounded(item,cloth,w,h,d,0,h/2,0,1.35)
  rounded(item,edge,w+.8,1.05,d+.8,0,h-10.3,0,.4)
  rounded(item,cloth,w+2.1,10,d+1.7,0,h-4.9,0,1)
  return item
}
function bottles(g:T.Group){
  const liquid=new T.MeshPhysicalMaterial({color:0x683219,roughness:.19,clearcoat:.78,clearcoatRoughness:.15,ior:1.46})
  const darkLiquid=new T.MeshPhysicalMaterial({color:0x35423a,roughness:.18,clearcoat:.85,clearcoatRoughness:.16})
  const shell=new T.MeshPhysicalMaterial({color:0x976134,transparent:true,opacity:.43,
    depthWrite:false,side:T.FrontSide,roughness:.13,clearcoat:.9,clearcoatRoughness:.16,ior:1.51})
  const edge=new T.MeshPhysicalMaterial({color:0x704021,roughness:.17,clearcoat:.9,clearcoatRoughness:.16})
  const stopper=new T.MeshPhysicalMaterial({color:0xb2b7a8,roughness:.24,clearcoat:.65,clearcoatRoughness:.20})
  const cork=bookcloth(0x88704b)
  function bottle(x:number,z:number,r:number,h:number,principal:boolean){
    const body=new T.Group();body.position.set(x,benchTop,z);g.add(body)
    const profile=[[0,0],[r*.71,0],[r*.85,1.2],[r*.945,3.8],[r*.995,8],[r,16],
      [r,h*.62],[r*.985,h*.684],[r*.964,h*.70],[r*.91,h*.724],[r*.82,h*.746],
      [r*.6,h*.78],[r*.43,h*.806],[r*.344,h*.834],[r*.324,h*.86],[r*.324,h*.95],
      [r*.39,h*.956],[r*.409,h*.968],[r*.406,h*.984],[r*.39,h*.999],[r*.31,h],[r*.285,h*.98]]
    turn(body,shell,0,0,0,profile,64)
    const level=h*(principal?.693:.744)
    const inner=profile.filter(a=>a[1]<=level&&a[1]>=7).map(([rad,yy])=>[rad-1.85,yy])
    const last=inner[inner.length-1][0]
    turn(body,principal?liquid:darkLiquid,0,0,0,[[0,6],[r*.81,6],...inner,[last,level],[last-1.4,level-.7],[0,level-.85]],64)
    turn(body,edge,0,0,0,[[r*.73,1],[r*.93,3.8],[r*.952,5],[r*.95,7.8],[r*.85,8],[r*.73,1]],64)
    // Neck ring, stopper shank, and differentiated crown above the shoulder.
    turn(body,edge,0,0,0,[[r*.324,h*.925],[r*.346,h*.927],[r*.346,h*.938],[r*.324,h*.94]],60)
    if(principal){
      turn(body,cork,0,h-6,0,[[r*.263,0],[r*.294,1],[r*.334,17],[r*.32,20],[0,20.5]],40)
      for(const y of [4,9])turn(body,cork,0,h+1,0,[[r*.296,y],[r*.325,y+.45],[r*.307,y+1]],40)
    }else{
      turn(body,stopper,0,h-5,0,[[r*.27,0],[r*.30,2],[r*.33,12],[r*.39,13],[r*.40,17],[r*.22,22],[0,22]],40)
      rounded(body,stopper,r*.95,23,11,0,h+22,0,3.8)
    }
    const label=atelierPaper(principal?'pyrogallol':'fixateur')
    const tag=new T.Mesh(new T.CylinderGeometry(r+.16,r+.16,h*.35,56,1,true,-1.31,2.62),label)
    tag.position.y=h*.424;body.add(tag)
    if(principal)marker(body,'sphere',0,h*.424,r+.16)
  }
  bottle(-140,-722,42,191,true)
  bottle(-182,-1214,46,247,false)
}
function curlingPrint(g:T.Group,print:T.Material,paper:T.Material){
  const album=new T.Group();album.position.set(45,benchTop+1.5,-791);album.rotation.y=-.42;g.add(album)
  const sheet=(width:number,depth:number,at:number,material:T.Material)=>{
    const geo=new T.PlaneGeometry(width,depth,20,12);geo.rotateX(-Math.PI/2)
    const points=geo.getAttribute('position')
    for(let i=0;i<points.count;i++){
      const x=points.getX(i),z=points.getZ(i)
      // The far-right corner lifts 9 mm away from the darker supporting stock.
      const curl=Math.max(0,(x+z*.26-24)/60)
      points.setY(i,at+curl*curl*9)
    }
    geo.computeVertexNormals();album.add(new T.Mesh(geo,material))
  }
  sheet(154,107,0,paper);sheet(143,96,.34,print)
}
export function stillLife(){
  const g=new T.Group();g.name='Atelier des plaques'
  const wood=pbr('walnut',[760,350]);wood.color.setHex(0xc5bcae)
  contactLight(wood,benchTop,[[-140,-722,64,60],[-182,-1214,66,62],[2,-977,156,118],
    [212,-879,125,90],[268,-1017,51,50],[-54,-737,44,43],[-277,-1340,100,80]])
  const print=photographic('contact-print',undefined,.75)
  const bronze=surface(0xaa8852,.34,.69),ebon=surface(0x24292a,.46,.12),board=surface(0xb2a080,.88)
  const wine=bookcloth(0x67443c),blue=bookcloth(0x2f5057),black=bookcloth(0x353834)
  const pane=studioRoom(g,wood,bronze,ebon,print)
  // A thin, hemmed linen underlay sits between the stock box and the bench.
  const linen=bookcloth(0x444641)
  contactLight(linen,benchTop+.25,[[2,-977,151,114]])
  const mat=box(g,linen,7,benchTop+.12,-978,288,.24,216);mat.rotation.y=-.15
  const low=carton(g,2,benchTop,-977,215,29,159,-.17,wine,board)
  patch(low,atelierPaper('bromide'),112,10,0,0,1,1,80.1).position.y+=8
  const middle=carton(g,-10,benchTop+29,-982,200,26,142,.105,blue,board)
  patch(middle,atelierPaper('matte'),105,10,0,0,1,1,71.6).position.y+=7
  // The centre of the letterpress face is held at z = -931 mm while the box
  // is turned so its cloth spine and the shadow of its lid remain visible.
  const angle=-.27
  const hero=carton(g,6-41*Math.sin(angle),benchTop+55,-931-41*Math.cos(angle),177,153,80,angle,blue,board)
  const paper=atelierPaper('carton')
  const face=patch(hero,paper,157,112,0,0,1,1,41);face.position.y+=24
  marker(hero,'cylinder',0,89,41)
  const side=new T.Group();side.position.set(88.8,17,0);side.rotation.y=Math.PI/2;hero.add(side)
  patch(side,atelierPaper('format'),64,11,0,0,1,1,0)
  for(const [i,x] of [-277,-272].entries()){
    const small=carton(g,x,benchTop+i*38,-1340,155,38,121,.14-i*.2,i?black:wine,board)
    patch(small,atelierPaper(i?'proofs':'archives'),81,13,0,0,1,1,61).position.y+=11
  }
  bottles(g)
  const frame=contactFrame(g,benchTop,wood,bronze,ebon,print)
  marker(frame,'arch',26,154,5)
  curlingPrint(g,print,board);developingTray(g,benchTop,ebon,bronze);graduatedMeasure(g,benchTop);loupe(g,benchTop,bronze,ebon)
  // Robe hooks and a plate-drying rack occupy the working surface at the side.
  const rack=new T.Group();rack.position.set(-522,benchTop,-1282);rack.rotation.y=.23;g.add(rack)
  for(const x of [-48,48])box(rack,wood,x,7,0,13,13,186)
  for(let i=0;i<6;i++)for(const x of [-49,49])beam(rack,wood,[x,7,-72+i*27],[x,102,-58+i*27],6)
  for(const z of [-76,70])box(rack,wood,0,8,z,110,14,12)
  const room=batch(g);room.add(pane);return room
}
