import {blurDiameter, coverage, dot, filmPoint, frames, project, sub, type Rig, type V} from './optics.ts'

export type FilmPoint = {x: number; y: number}
export type LoupeZoom = 1 | 2 | 4
export type FilmWindow = FilmPoint & {width: number; height: number}
export const circleCriterion = .10 // teaching criterion in millimetres on the film

/** Irradiance for a uniform-radiance scene viewed through a planar exit pupil
 * at the lens centre, relative to the on-axis infinity-conjugate exposure at
 * the same f-number. It excludes the separate mechanical image-circle mask. */
export function relativeIllumination(r: Rig, x: number, y: number) {
  const {lens, film} = frames(r)
  const ray = sub(filmPoint(film, x, y), lens.o), distanceSquared = dot(ray, ray)
  if (distanceSquared <= 0) return 0
  return r.focal ** 2 * Math.max(0, dot(lens.n, ray)) * Math.max(0, dot(film.n, ray)) / distanceSquared ** 2
}

/** All coordinates here are millimetres on the physical film, including its inversion. */
export function filmWindow(r: Pick<Rig, 'width' | 'height'>, zoom: LoupeZoom, center: FilmPoint = {x: 0, y: 0}): FilmWindow {
  const width = r.width / zoom, height = r.height / zoom
  if (zoom === 1) return {x: 0, y: 0, width, height}
  const xLimit = (r.width - width) / 2, yLimit = (r.height - height) / 2
  return {
    x: Math.max(-xLimit, Math.min(xLimit, center.x)),
    y: Math.max(-yLimit, Math.min(yLimit, center.y)), width, height
  }
}

/** u,v run from the top-left corner of the displayed window to bottom-right. */
export function screenToFilm(w: FilmWindow, u: number, v: number, upright = true): FilmPoint {
  const sign = upright ? -1 : 1
  return {x: w.x + sign * (u - .5) * w.width, y: w.y - sign * (v - .5) * w.height}
}

export function filmToScreen(w: FilmWindow, point: FilmPoint, upright = true): FilmPoint {
  const sign = upright ? -1 : 1
  return {x: .5 + sign * (point.x - w.x) / w.width, y: .5 - sign * (point.y - w.y) / w.height}
}

/** Drag the picture with the pointer. Deltas are fractions of the displayed
 * image rectangle, measured from the grab point in the original window. */
export function panFilmWindow(
  r: Pick<Rig, 'width' | 'height'>, zoom: LoupeZoom, start: FilmWindow,
  deltaU: number, deltaV: number, upright = true
): FilmWindow {
  const sign = upright ? 1 : -1
  return filmWindow(r, zoom, {
    x: start.x + sign * deltaU * start.width,
    y: start.y - sign * deltaV * start.height
  })
}

export function focusFeedback(r: Rig, point: V, criterion = circleCriterion) {
  const {lens, film: back} = frames(r)
  const film = project(point, lens, back)
  const diameter = blurDiameter(point, lens, back, r)
  const inFrame = !!film && Math.abs(film.x) <= r.width / 2 && Math.abs(film.y) <= r.height / 2
  const covered = !!film && coverage(lens, back, r, film.x, film.y) <= 1
  const ratio = diameter / criterion
  const withinDepth = Number.isFinite(diameter) && criterion > 0 && ratio <= 1
  const status: 'inside' | 'outside' | 'unavailable' =
    !inFrame || !covered || !Number.isFinite(ratio) || criterion <= 0 ? 'unavailable' : withinDepth ? 'inside' : 'outside'
  return {film, diameter, ratio, inFrame, covered, withinDepth, status}
}
