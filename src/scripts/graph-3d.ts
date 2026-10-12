/** Where the 3D graph is seen from: turned around the vertical axis, then tilted. */
export interface Camera {
  yaw: number
  pitch: number
}

export interface Point3 {
  x: number
  y: number
  z: number
}

/** A point as drawn: its offset from the centre of the view, how much it is enlarged, and its depth (positive is nearer). */
export interface Projected {
  x: number
  y: number
  z: number
  s: number
}

/** The tilt stops short of looking straight down or up, where turning would flip the view. */
export const MAX_PITCH = Math.PI / 2 - 0.05

export function tilt(pitch: number, by: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + by))
}

/** Turn a point by the camera and project it in perspective, the eye `dist` away from the centre. */
export function project(p: Point3, cam: Camera, dist: number): Projected {
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const x = p.x * cy + p.z * sy
  const z1 = -p.x * sy + p.z * cy
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const y = p.y * cp - z1 * sp
  const z = p.y * sp + z1 * cp
  // Points behind the eye would blow up; keep them just in front of it.
  const s = dist / Math.max(dist * 0.1, dist - z)
  return { x: x * s, y: y * s, z, s }
}

/** The centre of a cloud of points and how far its farthest point lies from it. */
export function bounds(points: Point3[]): { centre: Point3; radius: number } {
  const centre = { x: 0, y: 0, z: 0 }
  if (!points.length) return { centre, radius: 0 }
  for (const p of points) (centre.x += p.x), (centre.y += p.y), (centre.z += p.z)
  centre.x /= points.length
  centre.y /= points.length
  centre.z /= points.length
  let radius = 0
  for (const p of points) radius = Math.max(radius, Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z))
  return { centre, radius }
}
