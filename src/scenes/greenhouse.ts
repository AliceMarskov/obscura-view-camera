import * as T from 'three'
import {batch,box,plaque,surface} from './model.ts'
import {daylight} from './daylight.ts'
import {benchTop,conservatory,hygrometer,pots} from './greenhouse-fittings.ts'
import {specimenPlants} from './greenhouse-plants.ts'

export function greenhouse(){
  const g=new T.Group();g.name='Collection botanique'
  const frame=surface(0x48645b,.62,.23),brass=surface(0xa58c58,.43,.63)
  conservatory(g,frame,brass)
  const pot=pots(g),plants=specimenPlants(g)

  // Young specimens on the bench, at distinct real subject distances.
  // Every petiole and stem starts beneath its own pot's soil surface.
  plants.prayerPlant(-108,-865,pot(-108,-865,37,57),80,1.2,true)
  plants.flowerPlant(15,-1021,pot(15,-1021,42,67,true))
  plants.rubber(160,-1110,pot(160,-1110,38,58),127,.27)
  plants.fernPlant(-152,-1214,pot(-152,-1214,48,69,true),113,1.2)
  plants.prayerPlant(-258,-1490,pot(-258,-1490,64,100),153,.65)
  plants.fernPlant(190,-1485,pot(190,-1485,69,94),156,1.5)
  plants.rubber(-357,-1955,pot(-357,-1955,90,137),314,.91)
  plants.rubber(370,-2100,pot(370,-2100,83,134,true),281,2.3)
  plants.fernPlant(-79,-1865,pot(-79,-1865,60,87),146,-.14)

  for(const [x,z,name] of [[-146,-825,'Calathea'],[82,-990,'Zinnia elegans']] as const){
    const tag=new T.Group();tag.position.set(x,benchTop+12,z);tag.rotation.y=x<0?.22:-.26;tag.rotation.z=x<0?-.10:.08;g.add(tag)
    box(tag,brass,0,4,-1.7,2.4,43,2.5)
    plaque(tag,0,22,0,56,19,name,'HORT. BOT.','#dcd0ad','#444b39',brass)
  }
  hygrometer(g,frame,brass)
  return daylight(batch(g),true,35000)
}
