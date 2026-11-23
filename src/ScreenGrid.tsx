import type {FilmWindow} from './focus-feedback'

/** Physical millimetres on the screen. The loupe magnifies the printing along with the image. */
export function ScreenGrid({crop, width, height, upright}:{crop:FilmWindow;width:number;height:number;upright:boolean}){
  const sign=upright?-1:1
  const left=-width/2, top=-height/2
  const view=[sign*crop.x-crop.width/2,-sign*crop.y-crop.height/2,crop.width,crop.height].join(' ')
  const portrait=height>width
  const [frameW,frameH]=portrait?[56,84]:[84,56]
  const corners=[-1,1].flatMap(i=>[-1,1].map(j=>{
    const x=i*frameW/2,y=j*frameH/2
    return 'M '+(x-i*3)+' '+y+' H '+x+' v '+(-j*3)
  })).join(' ')
  return <svg className="screen-grid" aria-hidden="true" viewBox={view} preserveAspectRatio="none" data-pitch-mm="10">
    <defs><pattern id="engraved-centimeter" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 0 10 V 0 H 10" fill="none" stroke="#242824" strokeOpacity=".38" strokeWidth=".29"/>
      <path d="M 0 10 V 0 H 10" fill="none" stroke="#fffbed" strokeOpacity=".70" strokeWidth=".16"/>
    </pattern></defs>
    <rect x={left} y={top} width={width} height={height} fill="url(#engraved-centimeter)"/>
    <g fill="none" stroke="#fffbed" strokeOpacity=".87" strokeWidth=".23">
      <path d="M -3 0 H 3 M 0 -3 V 3"/><circle r=".82"/><path d={corners}/>
    </g>
  </svg>
}
