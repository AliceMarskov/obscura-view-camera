import {sceneryLoading} from './scenes/photographic'

// Both the image and HDR loaders use this manager. Only the active scene
// decodes and uploads images, even though the document carries every asset.
const payload=document.getElementById('scenery-assets')!
const assets:Record<string,string>=JSON.parse(payload.textContent!)
payload.remove()
sceneryLoading.setURLModifier(path=>{
  const embedded=assets[path]
  if(!embedded)throw new Error('离线文件中缺少素材 '+path)
  return embedded
})
void import('./main')
