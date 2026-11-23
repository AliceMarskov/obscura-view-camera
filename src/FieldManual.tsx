import {useEffect,useRef,type ReactNode} from 'react'
import {X} from 'lucide-react'
import {calibrationLink} from './navigation'
export function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const dlg=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const el=dlg.current!;el.showModal();return ()=>el.close()},[])
  return <dialog ref={dlg} aria-label={title} onCancel={close} onClick={e=>{if(e.target===dlg.current)close()}}>
    <section className="dialog-content"><header><h2>{title}</h2><button aria-label="关闭" onClick={close}><X size={18}/></button></header>{children}</section>
  </dialog>
}
export function FieldManual({close,soundSwitch}:{close:()=>void;soundSwitch:ReactNode}){
  return <Dialog title="实验手册" close={close}>
    <h3>用窗框检查透视</h3><p>街角建筑从人行道向上取景。打开网格，观察窗框的延长线。把整机俯仰调回 0°，再升高前组重新纳入屋檐。可以用「机位」观察镜头板、后背与焦平面的相对位置。</p>
    <h3>在毛玻璃上对焦</h3><p>点按画面即可放大一处细节。在 2× 或 4× 下拖动画面可移动放大镜，点一下会将该处移到中央。峰值用橙红色勾出清晰表面上的高反差边缘。纹理平坦处可能已合焦却没有描边。</p>
    <p>毛玻璃默认上下、左右倒像。「正像」可翻转显示。点「全开对焦」临时打开光圈，再点一次回到工作光圈。放大并钉住远处的 A 点，拖动主画面到近处，同时观察两处细节，交替微调皮腔和俯仰。</p>
    <h3>分辨失焦与素材细节</h3><p>在 2× 或 4× 下点「清晰度参照」，可以查看同一构图仅用镜心光线成像时的细节。比较干版盒上的小字或花芯上的细小花朵，再点一次回到工作光圈。参照中清楚、工作光圈下发虚的边缘，可以通过调整皮腔或前组俯仰继续对焦。接片始终记录实际光圈的成像。</p>
    <h3>观察后组俯仰</h3><p>在巴黎默认机位选择「光路侧视」，打开「光线」。金色光束穿过实际孔径，金点标出在当前示意范围内会聚的位置。绿色轮廓显示当前片幅和像圈内的物方焦面。侧视和俯视会透过场景显示光路。</p>
    <p>保持皮腔 90.38 mm，后组由 0° 转到 0.10°，焦面与镜头板的夹角会增至约 22.5°。用精调经过零位，观察绿色轮廓如何绕着约 21.4 m 处的轴上合焦点转动。</p>
    <p>侧视或俯视时打开「景深」，收小工作光圈，看近界与远界如何张开。绿色切线标出焦平面穿过实物的位置。沙姆交线是镜头板、片面与焦面三个延伸平面的公共交线。铰链线经过镜头前焦平面，J 表示其到镜心的距离。</p>
    <h3>滚轮粗调与精调</h3><p>选中俯仰、皮腔或其他参数后，左右拨动滚轮。粗调跨越大范围，精调每格移动 0.01 mm 皮腔或 0.01° 前后组角度。点击全行程刻度可快速定位，也可直接输入数值。</p>
    <h3>片幅与屏线</h3><p>点「横幅 / 竖幅」即可将片夹转动 90°。物方焦平面和地平线保持原方向，有效片幅在 120 × 96 mm 与 96 × 120 mm 间切换。白色细线间距为 10 mm，中心带十字，短角线为 6×9 卷片构图参考。放大镜会连同刻线一起放大。</p>
    <h3>取一张印样</h3><p>用「印样」拍下当前有效光圈的全幅正像。可选择原色、银盐或铂金色调，下载带曝光参数的 PNG。观看时的磨砂、网格和峰值只留在取景屏。</p>
    <h3>光学近似</h3><p>采用近轴薄透镜和片上 0.10 mm 容许弥散圈。全开光圈为圆形，收小时以七叶光圈模拟焦外形状；教学景深以标称圆孔计算。边缘亮度按出瞳和感光面的斜入射角、传播距离衰减。两组平行时相对照度符合 cos⁴ 定律。像圈以硬边近似，真实镜头的像差、衍射和菲涅尔增亮屏未计入。</p>
    <h3>场景与光源</h3><p>巴黎街角按奥斯曼街区的建筑尺度搭建。银盐工作间以侧窗照亮桌上的玻璃和纸张，温室以玻璃窗外的日光照亮不同距离的花叶。物方焦平面和毛玻璃取景使用同一套场景坐标。</p>
    <p>从默认机位和镜头开始，工作间皮腔从 178.81 mm 延长到约 192.47 mm，焦点由干版盒移到近处药瓶的纸标。温室皮腔从 268.81 mm 缩短到约 253.43 mm，可以把焦点从花芯移到后方湿度表的刻度。</p>
    <div className="manual-footer"><a className="manual-link" href={calibrationLink()}>打开光路校准台</a>
      {!document.documentElement.hasAttribute('data-standalone')&&<a className="manual-link" href="https://github.com/AliceMarskov/obscura-view-camera/releases/latest" target="_blank" rel="noreferrer">下载离线版</a>}{soundSwitch}</div>
  </Dialog>
}
