import type { Coords } from '../types';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres between two fictional points. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Urban delivery speed used to translate distance into minutes. */
export const CITY_SPEED_KMH = 27;
/** Loading / unloading and handover overhead, in minutes. */
export const HANDOVER_MINUTES = 14;

export function travelMinutes(km: number): number {
  return (km / CITY_SPEED_KMH) * 60 + 6;
}
