# 场景资产来源 / Scene artwork and credits

巴黎街角是为观察建筑透视搭建的奥斯曼风格街区。书店、相机、摄影工作间和温室标本均按模拟器的构图与尺度制作。画面包含一张外部实拍天空，其余场景图像和三维结构来自本项目。

The Paris street is a constructed Haussmann-style scene for architectural photography. The bookshop, view camera, plate workshop and conservatory were built to the simulator’s framing and scale. One photographic sky comes from an external source. All other scenery artwork was produced for this project.

## 实拍天空 / Photographic sky

`public/scenery/paris-daylight.hdr` 使用 Greg Zaal 拍摄、Jarod Guest 处理的 Kloofendal 38d Partly Cloudy (Pure Sky)。运行资产裁取并缩小上半球，压低太阳核心亮度，由方向一致的投影光源补回直射光。原资产按 CC0 1.0 发布。

The Paris HDR sky uses Greg Zaal’s original Kloofendal photograph with sky edits by Jarod Guest. The runtime asset resamples the upper hemisphere and limits the solar core. A matched directional light supplies the direct sun and casts shadows. The original sky is CC0 1.0. [Source HDRI](https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky) · [Poly Haven asset license](https://polyhaven.com/license)

## 项目制作的图像 / Artwork produced for the project

下列图版以本项目生成的 AI 图像为底稿，经裁切、分区、校色或排版后贴到场景几何体上。地名和标本标签用于教学，植物细节为视觉近似。

These plates were created from AI-generated imagery made for this project, then cropped, arranged, colour-adjusted or typeset for the scene geometry. Location and specimen labels serve the teaching scenes. The plant imagery is an artistic approximation.

| 文件（均位于 `public/scenery/`） / Files | 用途 / Use |
| --- | --- |
| `boulevard-stone.webp`, `paris-interiors.webp`, `paris-bookshop.webp` | 正立面底图、窗内房间图集、书店陈列与书脊 / Rectified elevation, window-interior atlas, display and book spines |
| `paris-cut-stone.webp`, `stone-courses.webp`, `granite-setts.webp`, `roof-slate.webp`, `verdigris.webp` | 同一材质底稿裁切的石饰、砌石、铺路、板岩及铜绿 / Detail stock cropped from one generated material sheet |
| `studio-walnut.webp`, `studio-plaster.webp`, `plate-label.webp`, `contact-print.webp` | 从同一制作图版裁切的木纹、灰泥、刻版与接触印相 / Walnut, plaster, engraving source and contact print from one stock sheet |
| `winter-garden.webp` | 温室窗外花园 / Conservatory garden backdrop |
| `leaf-calathea.webp`, `leaf-fern.webp`, `leaf-rubber.webp`, `zinnia.webp`, `winter-petal.webp` | 三种叶面图、花盘和经过丝纹细化的花瓣 / Leaf surfaces, flower head and refined petal silk |
| `atelier-*.webp` | 程序排版的干版盒、瓶标、标尺和密度楔 / Typeset carton, labels, rules and density wedge |

干版盒和纸标可从仓库中的制作文件重新烘焙。 The workshop print assets can be regenerated from their included source. [Workshop artwork](artwork/workshop/bake.mjs)

## 材质和模型 / Materials and models

二十一张 `pbr-*.webp` 来自有固定种子的程序。石灰石、花岗岩铺路、板岩、胡桃木、旧漆木、灰泥和红陶分别保存色彩图、切线空间法线和打包的环境遮蔽/粗糙度/金属度。法线从独立的微表面高度场计算。所有默认教学镜头都使用生成的模型与参数。

The twenty-one `pbr-*.webp` maps come from a deterministic procedural bake. Limestone, cobbles, slate, walnut, worn paint, plaster and terracotta each have an sRGB colour map, a tangent-space normal map, and a linear packed AO/roughness/metalness map. Normals derive from a separate material height field. The camera and teaching lenses use project-authored geometry and parameters. [Material generator](artwork/materials.py) · [Camera geometry](src/camera-model.ts) · [Scene geometry](src/scenes/)
