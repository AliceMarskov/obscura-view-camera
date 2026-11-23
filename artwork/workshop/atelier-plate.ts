import * as T from 'three'
export const engravingSource=new T.LoadingManager()

export type Engraving=(sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number)=>void
type RGB=[number,number,number]

// Keep the crease, paper fibres, engraved letters and burin hatching of the
// workshop's original facsimile. Separate stock from ink so the new size and
// emulsion inscriptions can be typeset independently of its old lettering.
export function printOnOriginalStock(target:T.CanvasTexture,compose:(c:CanvasRenderingContext2D,ink:Engraving)=>void){
  new T.ImageLoader(engravingSource).load('./scenery/plate-label.webp',source=>{
    const original=document.createElement('canvas');original.width=source.width;original.height=source.height
    const oc=original.getContext('2d',{willReadFrequently:true})!;oc.drawImage(source,0,0)
    const w=original.width,h=original.height,scan=oc.getImageData(0,0,w,h)
    const stock=document.createElement('canvas');stock.width=w;stock.height=h
    const sc=stock.getContext('2d')!,paper=sc.createImageData(w,h),engraved=oc.createImageData(w,h)
    // Estimate local unprinted paper with a percentile instead of averaging
    // the black lettering into the paper around it.
    const step=32,nx=Math.ceil(w/step)+1,ny=Math.ceil(h/step)+1,base:RGB[][]=[]
    for(let j=0;j<ny;j++){
      base[j]=[]
      for(let i=0;i<nx;i++){
        const samples:RGB[]=[]
        for(let dy=-16;dy<=16;dy+=4)for(let dx=-16;dx<=16;dx+=4){
          const px=Math.max(0,Math.min(w-1,i*step+dx)),py=Math.max(0,Math.min(h-1,j*step+dy)),p=4*(px+py*w)
          samples.push([scan.data[p],scan.data[p+1],scan.data[p+2]])
        }
        samples.sort((a,b)=>a[1]-b[1]);base[j][i]=samples[Math.floor(samples.length*.76)]
      }
    }
    const mirror=(v:number,n:number)=>{const r=v%(n*2);return r<n?r:2*n-1-r}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=x>>5,j=y>>5,fx=x/step-i,fy=y/step-j,k=4*(x+y*w)
      // The upper corner is an unprinted patch of the same photographic stock.
      const px=41+mirror(x+Math.floor(3*Math.sin(y*.04)),71),py=37+mirror(y+Math.floor(4*Math.sin(x*.023)),78)
      const fibre=4*(px+py*w)
      const margin=Math.min(x,w-1-x,y,h-1-y)
      const interior=Math.max(0,Math.min(1,(margin-25)/8))
      let paperGreen=0
      for(let ch=0;ch<3;ch++){
        const top=base[j][i][ch]*(1-fx)+base[j][i+1][ch]*fx
        const bottom=base[j+1][i][ch]*(1-fx)+base[j+1][i+1][ch]*fx
        const tone=top*(1-fy)+bottom*fy
        if(ch===1)paperGreen=tone
        const grain=scan.data[fibre+ch]-[211,190,157][ch]
        paper.data[k+ch]=scan.data[k+ch]*(1-interior)+(tone+grain*.52-4)*interior
      }
      paper.data[k+3]=255
      const coverage=Math.max(0,(paperGreen-scan.data[k+1]-5)/(paperGreen-38))
      engraved.data[k]=45;engraved.data[k+1]=40;engraved.data[k+2]=35
      engraved.data[k+3]=255*coverage
      // Retain the engraved frame, but give the fictional workshop its own initials.
      if(x>=355&&x<=415&&y>=232&&y<=254)engraved.data[k+3]=0
    }
    sc.putImageData(paper,0,0);oc.putImageData(engraved,0,0)
    const c=target.image.getContext('2d')!
    c.drawImage(stock,0,0,target.image.width,target.image.height)
    compose(c,(sx,sy,sw,sh,x,y,width,height)=>c.drawImage(original,sx,sy,sw,sh,x,y,width,height))
    target.needsUpdate=true
  })
}
