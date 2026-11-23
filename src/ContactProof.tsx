import {useEffect,useRef,useState} from 'react'
import {Download} from 'lucide-react'
import {Dialog} from './FieldManual'
import type {Rig} from './optics'

const tones={color:'原色正片',silver:'银盐黑白',platinum:'铂金印相'} as const
type Tone=keyof typeof tones
const signed=(n:number)=> (n>0?'+':'')+Number(n.toFixed(2))

function printProof(canvas:HTMLCanvasElement,image:HTMLImageElement,rig:Rig,scene:string,tone:Tone) {
  const w=image.naturalWidth,h=image.naturalHeight
  const scale=w/680,edge=Math.round(13*scale),footer=Math.round(80*scale)
  canvas.width=w+2*edge;canvas.height=h+2*edge+footer
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!
  ctx.fillStyle=tone==='platinum'?'#ece5d7':'#f2eee3'
  ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle='#191815';ctx.fillRect(0,0,canvas.width,h+2*edge)
  ctx.drawImage(image,edge,edge)
  if(tone!=='color'){
    const pixels=ctx.getImageData(edge,edge,w,h),p=pixels.data
    for(let i=0;i<p.length;i+=4){
      const l=(.27*p[i]+.64*p[i+1]+.09*p[i+2])/255
      const y=l+.34*l*(1-l)*(2*l-1)
      if(tone==='silver')p[i]=p[i+1]=p[i+2]=Math.round(y*255)
      else {p[i]=36+208*y;p[i+1]=31+208*y;p[i+2]=27+201*y}
    }
    ctx.putImageData(pixels,edge,edge)
  }
  ctx.fillStyle=tone==='platinum'?'#ece5d7':'#f2eee3'
  for(const x of [canvas.width-3.1*edge,canvas.width-2.28*edge]){
    ctx.beginPath();ctx.arc(x,0,.31*edge,0,Math.PI);ctx.fill()
  }
  const y=h+2*edge
  ctx.fillStyle='#322c24';ctx.font='600 '+Math.round(18*scale)+'px Georgia, serif'
  ctx.fillText('Obscura  /  '+scene,edge,y+25*scale,.69*w)
  ctx.font=Math.round(14*scale)+'px serif';ctx.textAlign='right'
  ctx.fillText(tones[tone],canvas.width-edge,y+25*scale,.25*w)
  ctx.textAlign='left';ctx.font=Math.round(13.5*scale)+'px monospace'
  ctx.fillText('4 × 5 in   ·   '+rig.focal+' mm   ·   f/'+rig.aperture+'   ·   Bellows '+rig.extension.toFixed(2)+' mm',edge,y+49*scale,w)
  ctx.fillText('Front tilt '+signed(rig.front.tilt)+'°   ·   rise '+signed(rig.front.rise)+' mm   ·   Rear tilt '+signed(rig.rear.tilt)+'°',edge,y+68*scale,w)
}

export function ContactProof({exposure,rig,scene,close}:{exposure:Promise<string>;rig:Rig;scene:string;close:()=>void}){
  const [tone,setTone]=useState<Tone>('color'),[image,setImage]=useState<HTMLImageElement|null>(null)
  const [error,setError]=useState(''),canvas=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    let active=true
    exposure.then(async src=>{const photo=new Image();photo.src=src;await photo.decode();if(active)setImage(photo)})
      .catch(()=>{if(active)setError('曝光未能完成。请关闭印样窗口，待毛玻璃稳定后重新曝光。')})
    return ()=>{active=false}
  },[exposure])
  useEffect(()=>{if(image&&canvas.current)printProof(canvas.current,image,rig,scene,tone)},[image,rig,scene,tone])
  function download(){
    canvas.current?.toBlob(blob=>{
      if(!blob){setError('PNG 生成失败，请重新曝光。');return}
      const url=URL.createObjectURL(blob),link=document.createElement('a')
      link.href=url;link.download='Obscura-4x5-Proof.png';link.click()
      setTimeout(()=>URL.revokeObjectURL(url),30000)
    },'image/png')
  }
  return <Dialog title="4×5 接触印样" close={close}>
    <div className="proof-tray" aria-busy={!image&&!error}><canvas hidden={!image} ref={canvas} aria-label="带曝光铭文的全幅正像印样"/>
      {!image&&<p role="status">{error||'正在完成整张底片的曝光…'}</p>}</div>
    <div className="proof-actions"><div role="group" aria-label="印相色调">{(Object.keys(tones) as Tone[]).map(key=>
      <button key={key} aria-pressed={tone===key} onClick={()=>setTone(key)}>{tones[key]}</button>)}</div>
      <button disabled={!image} onClick={download}><Download size={14}/>保存 PNG</button></div>
  </Dialog>
}
