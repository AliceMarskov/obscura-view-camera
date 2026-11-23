import * as T from 'three'
import {printOnOriginalStock,type Engraving} from './atelier-plate.ts'

type Graphics=CanvasRenderingContext2D
const umber='#49382c', carmine='#743b35', blue='#293f48'

// Millimetre-sized type, paper fibres and ink are sampled by the pupil camera
// along with the supporting geometry. No type is drawn on the finished film.
function paper(w:number,h:number,paint:(c:Graphics)=>void,base=[214,198,160]) {
  if(typeof document==='undefined')return new T.MeshStandardMaterial({color:0xcbbd99,roughness:.89})
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
  const c=canvas.getContext('2d')!,pixels=c.createImageData(w,h)
  let seed=2274
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}
  for(let y=0;y<h;y++){
    const fibre=random()*.62
    for(let x=0;x<w;x++){
      const edge=Math.max(0,1-Math.min(x,w-1-x,y,h-1-y)/27)
      const speckle=(random()+random()-1)*14+fibre+2*Math.sin(x*.014+Math.sin(y*.025))*Math.cos(y*.017)-edge*random()*24
      const i=4*(x+y*w)
      for(let k=0;k<3;k++)pixels.data[i+k]=base[k]+speckle
      pixels.data[i+3]=255
    }
  }
  c.putImageData(pixels,0,0)
  // Very broad mottling from unequal sizing and localized edge foxing sit
  // under the type, so the printed rules still have a crisp black point.
  for(let i=0;i<42;i++){
    const x=random()*w,y=random()*h,r=(.06+random()*.16)*Math.min(w,h)
    const stain=c.createRadialGradient(x,y,0,x,y,r)
    stain.addColorStop(0,'rgba(101,74,39,.047)');stain.addColorStop(1,'rgba(128,94,55,0)')
    c.fillStyle=stain;c.fillRect(x-r,y-r,2*r,2*r)
  }
  for(let i=0;i<120;i++){
    const x=random()*w,y=i%2===0?random()**2*h*.16:h-random()**2*h*.2
    const r=.32+random()**2*2.7
    c.fillStyle='rgba(135,93,51,.16)';c.beginPath();c.ellipse(x,y,r,r*.69,random(),0,2*Math.PI);c.fill()
  }
  paint(c)
  // Worn ink and small foxing marks. Their density is tied to the print.
  for(let i=0;i<w*h/57;i++){
    c.fillStyle=random()>.4?'rgba(242,224,182,.25)':'rgba(83,61,44,.12)'
    c.fillRect(random()*w,random()*h,random()*2.1+.44,random()*1.45+.3)
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8
  return new T.MeshStandardMaterial({map,roughness:.9})
}
function type(c:Graphics,s:string,x:number,y:number,size:number,options:{font?:string;color?:string;width?:number}={}){
  c.fillStyle=options.color??umber;c.textAlign='center';c.textBaseline='middle'
  c.font=(options.font??'bold')+' '+size+'px Georgia, "Times New Roman", serif'
  c.fillText(s,x,y,options.width)
}
function ruled(c:Graphics,x:number,y:number,w:number,h:number,color:string,weight:number){
  c.strokeStyle=color;c.lineWidth=weight;c.strokeRect(x,y,w,h)
}
function rosette(c:Graphics,x:number,y:number,r:number){
  c.strokeStyle=carmine
  for(let ring=0;ring<8;ring++){
    c.beginPath()
    for(let i=0;i<=960;i++){
      const a=i*Math.PI/480,rad=r*(.82+.13*Math.cos(24*a+ring*.21))*(1-ring*.017)
      const px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad
      if(!i)c.moveTo(px,py);else c.lineTo(px,py)
    }
    c.lineWidth=.98;c.stroke()
  }
  c.beginPath();c.arc(x,y,r*.61,0,2*Math.PI);c.stroke()
}
export function plateLabel(){
  const compose=(c:Graphics,engraving?:Engraving)=>{
    if(!engraving){
      ruled(c,16,16,968,654,carmine,4);ruled(c,25,25,950,636,carmine,1.4)
      type(c,'PLAQUES',500,131,100,{color:blue,width:590})
      rosette(c,500,348,80)
    }else{
      engraving(119,43,551,80,210,85,580,86)
      engraving(290,172,192,148,360,239,280,216)
      engraving(153,177,139,40,109,240,172,50)
      engraving(480,176,143,44,719,238,176,54)
      engraving(324,393,137,20,402,475,196,29)
    }
    type(c,'M A N U F A C T U R E   D E   P L A Q U E S   P H O T O G R A P H I Q U E S',500,60,16,{color:carmine})
    type(c,'A U    G É L A T I N O - B R O M U R E',500,202,31,{color:blue})
    for(const x of [81,697]){
      c.fillStyle=carmine;c.fillRect(x,307,222,1.2);c.fillRect(x,406,222,1.2)
    }
    type(c,'F O R M A T',192,333,19,{color:carmine});type(c,'9 × 12 cm',192,376,39)
    type(c,'É M U L S I O N',808,333,19,{color:carmine});type(c,'Nº  2746',808,376,36)
    type(c,'A·P',500,347,27,{color:umber,font:'bold'})
    type(c,'EXTRA-RAPIDES   ·   ORTHOCHROMATIQUES',500,531,34,{color:blue})
    type(c,'Conserver en lieu sec et à l’abri de la lumière.',500,581,23,{font:'italic'})
    c.save();c.translate(894,586);c.rotate(-.17)
    c.font='italic 21px "Segoe Script", cursive';c.fillStyle='rgba(82,77,73,.7)'
    c.fillText('17 / III',0,0);c.restore()
    c.beginPath();c.moveTo(5,641);c.lineTo(57,662);c.lineTo(93,668)
    c.strokeStyle='rgba(128,101,69,.26)';c.lineWidth=1.3;c.stroke()
  }
  const label=paper(1000,686,compose)
  if(label.map instanceof T.CanvasTexture)printOnOriginalStock(label.map,compose)
  return label
}
export function chemistryLabel(name:string,kind:string,lot:string){
  return paper(736,420,c=>{
    for(const [x,y,w,h,n] of [[12,12,712,396,3],[20,20,696,380,1.5]])ruled(c,x,y,w,h,carmine,n)
    type(c,'L A B O R A T O I R E   P H O T O G R A P H I Q U E',368,52,16,{color:carmine,width:607})
    c.fillStyle=carmine;c.fillRect(86,78,564,1.6)
    type(c,name,368,145,62,{color:blue,width:585})
    type(c,kind,368,200,27,{font:'italic'})
    ruled(c,99,254,538,87,carmine,1)
    type(c,lot,368,298,31,{color:'#444556',font:'italic',width:479})
    type(c,'ATELIER DES PLAQUES     ·     PARIS',368,369,17,{color:carmine})
  },[205,194,164])
}
export function boxSpine(label:string){
  return paper(820,142,c=>{
    ruled(c,8,8,804,126,carmine,3);type(c,label,410,69,43,{color:blue,width:744})
  })
}
export function densityWedge(){
  return paper(544,150,c=>{
    for(let i=0;i<12;i++){
      const l=Math.round(220*10**(-i*.102))
      c.fillStyle='rgb('+l+','+Math.round(l*.98)+','+Math.round(l*.92)+')'
      c.fillRect(20+i*42,15,42,94)
      type(c,String(i+1),41+i*42,128,12,{color:umber,font:'normal'})
    }
  },[208,200,182])
}
export function woodenRule(){
  return paper(1024,114,c=>{
    c.fillStyle='#3a2d1c'
    for(let mm=0;mm<=150;mm++){
      const x=20+mm*6.55
      c.fillRect(x,0,mm%10===0?2.5:1.3,mm%10===0?46:mm%5===0?34:22)
      c.fillRect(x,96,1.3,18)
      if(mm%10===0)type(c,String(mm/10),x,66,24,{color:'#362a1a'})
    }
  },[161,123,68])
}
export function bottleScale(){
  if(typeof document==='undefined')return new T.MeshStandardMaterial({color:0x55452f})
  const canvas=document.createElement('canvas');canvas.width=448;canvas.height=944
  const c=canvas.getContext('2d')!;c.fillStyle='#493b32'
  for(let ml=0;ml<=100;ml+=2){
    const y=847-ml*7.15,major=ml%10===0,l=major?142:ml%5===0?105:60
    c.fillRect(110,y-2,l,major?5:3)
    if(major&&ml>0){c.fillStyle='#493b32';c.font='bold 37px Georgia';c.textAlign='left';c.fillText(String(ml),267,y+13)}
  }
  type(c,'100 mL',225,56,44,{color:'#493b32'})
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8
  return new T.MeshBasicMaterial({map,transparent:true,alphaTest:.48,depthWrite:false})
}
