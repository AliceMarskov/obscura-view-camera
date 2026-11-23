import {photographic} from './photographic.ts'

type Print='carton'|'pyrogallol'|'fixateur'|'register'|'bromide'|'matte'|'format'|'archives'|'proofs'|'density'|'rule'

// Original size, lossless sRGB. The working artwork lives in artwork/workshop.
export function atelierPaper(id:Print){
  return photographic('atelier-'+id,undefined,.9)
}
