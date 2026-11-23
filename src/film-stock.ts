import type {SceneId} from './scenes.ts'

/** Print controls only. The optics and exposure integration stay in scene-linear radiance. */
export type FilmStock = {
  temperature:number
  contrast:number
  saturation:number
  shadows: [number,number,number]
  highlights: [number,number,number]
}

export const neutralStock: FilmStock = {
  temperature:0, contrast:1, saturation:1, shadows:[1,1,1], highlights:[1,1,1]
}

export const filmStocks: Record<SceneId,FilmStock> = {
  architecture: {temperature:.12, contrast:1.08, saturation:.92, shadows:[.96,.98,1.04], highlights:[1.04,1.01,.95]},
  'still-life': {temperature:-.05, contrast:1.14, saturation:.84, shadows:[.95,.97,1.03], highlights:[1.03,1.01,.97]},
  greenhouse: {temperature:.04, contrast:1.06, saturation:.96, shadows:[.95,1.01,.97], highlights:[1.04,1.03,.96]}
}
