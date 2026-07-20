// Warm the heavy, lazy-loaded 3D country globe during idle so the FIRST team sheet
// opens smoothly. The globe chunk is ~1.8 MB (Three.js + three-globe + friends), so
// parsing it on the click that first shows a globe janks the fly-in; every later open
// is smooth only because it's already cached. Kicking the import off during idle moves
// that whole cold-start (chunk parse/compile + remote GeoJSON + earth texture) off the
// first tap.
//
// Both TeamSheet's <Suspense> and this pre-warm import through `importCountryGlobe`, so
// they resolve to the same chunk (no duplicate download).
export const importCountryGlobe = () => import("./CountryGlobe");

let started = false;
export function preloadGlobe(): void {
  if (started) return;
  started = true;
  importCountryGlobe()
    .then((m) => m.warmGlobeAssets?.())
    .catch(() => {
      started = false; // let a later attempt retry if the chunk failed to load
    });
}
