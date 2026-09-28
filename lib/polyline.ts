/**
 * Google encoded-polyline codec (precision 5), as used by Strava's
 * `map.summary_polyline`. Pure; no dependencies.
 */

export type LatLng = [lat: number, lng: number];

export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export function encodePolyline(points: LatLng[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [la, lo] of points) {
    const lat = Math.round(la * 1e5);
    const lng = Math.round(lo * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/** Metres from privacy trimming at each end of a route (keeps homes off the shape). */
export const PRIVACY_TRIM_M = 400;
/** Points kept per shape after resampling. */
const SHAPE_POINTS = 64;

/**
 * Turns a GPS track into a location-free shape: trims both ends, resamples to
 * evenly spaced points, and normalises into a unit box (longest side = 1,
 * centred, north up). The result cannot be placed back on a map.
 *
 * Returns a flat [x0, y0, x1, y1, …] array rounded to 3 decimals, or null if
 * the route is too short to be meaningful after trimming.
 */
export function routeShape(track: LatLng[]): number[] | null {
  if (track.length < 4) return null;
  const lat0 = (track[0][0] * Math.PI) / 180;
  // Local equirectangular projection in metres (fine at route scale).
  const xy = track.map(([la, lo]) => [lo * Math.cos(lat0) * 111_320, -la * 110_540] as const);

  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const total = cum.at(-1)!;
  if (total < PRIVACY_TRIM_M * 3) return null;

  // Resample evenly between the trimmed ends.
  const from = PRIVACY_TRIM_M;
  const to = total - PRIVACY_TRIM_M;
  const pts: [number, number][] = [];
  let seg = 1;
  for (let k = 0; k < SHAPE_POINTS; k++) {
    const d = from + ((to - from) * k) / (SHAPE_POINTS - 1);
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = (d - cum[seg - 1]) / span;
    pts.push([xy[seg - 1][0] + (xy[seg][0] - xy[seg - 1][0]) * t, xy[seg - 1][1] + (xy[seg][1] - xy[seg - 1][1]) * t]);
  }

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const offX = (1 - (maxX - minX) / size) / 2;
  const offY = (1 - (maxY - minY) / size) / 2;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return pts.flatMap(([x, y]) => [r3(offX + (x - minX) / size), r3(offY + (y - minY) / size)]);
}
