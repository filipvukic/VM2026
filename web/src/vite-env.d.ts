/// <reference types="vite/client" />

declare module "polylabel" {
  // Pole of inaccessibility: the most distant internal point of a polygon.
  // polygon = array of rings [[ [x, y], ... ], ...]; returns [x, y] with a .distance.
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean
  ): [number, number] & { distance: number };
}
