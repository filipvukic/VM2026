import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import ConicPolygonGeometry from "three-conic-polygon-geometry";
import { COUNTRY_FACTS } from "../../data/static/countryFacts";
import { EXTRA_COUNTRIES } from "../../data/static/extraCountries";

// 3D globe that zooms into the country + shows facts. Facts/centroid come from a
// bundled dataset (no flaky runtime API). We draw ALL country borders for context
// and highlight the selected one. Lazy-loaded so Three.js never lands in the main
// bundle. We use the LIGHT 110m world set (≈177 simple polygons) for smoothness,
// and bundle the couple of WC nations it omits (Cape Verde, Curaçao) separately.
const GEOJSON_URL = "https://vasturiano.github.io/react-globe.gl/example/datasets/ne_110m_admin_0_countries.geojson";
const EARTH_TEXTURE = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Feat = any;
// The world polygons never change — fetch once and share across every globe.
let FEATURES_CACHE: Feat[] | null = null;
const EMPTY: Feat[] = []; // stable empty ref for deferred label data

// ISO3 → label position + area, to drop a code label on each country sized by how
// big it is (the geojson has no label coords; COUNTRY_FACTS has a lat/lng + area).
const FACTS_BY_CCA3: Record<string, { lat: number; lng: number; area: number | null }> = {};
for (const f of Object.values(COUNTRY_FACTS)) FACTS_BY_CCA3[f.cca3] = { lat: f.lat, lng: f.lng, area: f.area };

// Label size from country area: big nations get big codes, tiny ones small codes —
// so when zoomed out only the large labels are legible and the small ones "appear"
// (become readable) as you zoom in, without any per-frame recompute.
function labelSizeForArea(area?: number | null): number {
  if (!area || area <= 0) return 0.25;
  // Size tracks the country's on-globe EXTENT (∝ √area), so a code is proportional to
  // how big the country actually is — giants (Russia/Canada/USA) get big labels, small
  // nations small ones (a natural level-of-detail: they only become legible zoomed in).
  return Math.max(0.22, Math.min(2.0, Math.sqrt(area) / 1500));
}

const norm = (s?: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// How far to sit from the surface, based on how big the country is. Tiny states
// (Qatar, Malta) zoom in close; giants (Russia, Brazil, USA) pull way back so the
// whole country fits. Uses sqrt(area) since area grows with the square of extent.
function altitudeForArea(area?: number | null): number {
  if (!area || area <= 0) return 1.3;
  // Zoom tracks the country's extent (√area). Lower base + floor than before so
  // SMALL countries (Qatar, Switzerland, Cape Verde…) actually fill the view instead
  // of sitting far out; giants still pull back enough to fit.
  const alt = 0.32 + 0.0006 * Math.sqrt(area);
  return Math.max(0.35, Math.min(2.85, alt));
}

// Build the selected country's flag as ONE flat cap spread across the WHOLE country
// instead of one full flag per island: three-conic-polygon-geometry UV-maps each
// polygon to its OWN bbox (→ a full flag on every disconnected part), so we remap each
// polygon's cap UVs from its own bbox to the country's GLOBAL bbox. Each scattered part
// then shows the correct SLICE of a single flag.
function ringBBox(ring: number[][]) {
  let mnLng = Infinity, mxLng = -Infinity, mnLat = Infinity, mxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < mnLng) mnLng = lng; if (lng > mxLng) mxLng = lng;
    if (lat < mnLat) mnLat = lat; if (lat > mxLat) mxLat = lat;
  }
  return { mnLng, mxLng, mnLat, mxLat };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFlagMesh(feature: any, R: number, material: THREE.Material): THREE.Object3D {
  const geom = feature?.geometry;
  const polys: number[][][][] =
    geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  if (!polys.length) return new THREE.Object3D();
  // global bbox over every polygon's outer ring
  let G = { mnLng: Infinity, mxLng: -Infinity, mnLat: Infinity, mxLat: -Infinity };
  for (const rings of polys) {
    const b = ringBBox(rings[0]);
    G = { mnLng: Math.min(G.mnLng, b.mnLng), mxLng: Math.max(G.mxLng, b.mxLng), mnLat: Math.min(G.mnLat, b.mnLat), mxLat: Math.max(G.mxLat, b.mxLat) };
  }
  const gLng = (G.mxLng - G.mnLng) || 1, gLat = (G.mxLat - G.mnLat) || 1;
  const group = new THREE.Group();
  for (const rings of polys) {
    let g: THREE.BufferGeometry;
    // Cap at the surface (0..R), like three-globe's polygon layer; we lift it by
    // SCALING the mesh (its proven altitude mechanism) so it renders reliably.
    try { g = new ConicPolygonGeometry(rings, 0, R, false, true, false, 3) as unknown as THREE.BufferGeometry; }
    catch { continue; }
    const uv = g.getAttribute("uv");
    if (uv) {
      const p = ringBBox(rings[0]);
      const uOff = (p.mnLng - G.mnLng) / gLng, uScale = ((p.mxLng - p.mnLng) || 1) / gLng;
      const vOff = (p.mnLat - G.mnLat) / gLat, vScale = ((p.mxLat - p.mnLat) || 1) / gLat;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, uOff + uv.getX(i) * uScale);
        uv.setY(i, vOff + uv.getY(i) * vScale);
      }
      uv.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(g, material);
    mesh.scale.setScalar(1.012); // lift just above the globe surface (like polygonAltitude)
    group.add(mesh);
  }
  return group;
}
// No-op update: providing ANY update fn stops three-globe's custom layer from
// emptying the scene on every render (which made the flag vanish instantly).
const FLAG_UPDATE = () => {};

export default function CountryGlobe({ iso, name, active }: { iso?: string | null; name: string; active?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animatedFor = useRef<string | null>(null);
  const setupDone = useRef(false);
  const [size, setSize] = useState(320);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false); // defer WebGL init past the sheet-open animation
  const [showLabels, setShowLabels] = useState(false); // defer the 170+ text labels past the fly-in
  const [features, setFeatures] = useState<Feat[]>(FEATURES_CACHE || []);
  // The flag material for the selected country's custom cap mesh — ONE stable instance
  // we mutate in place when the flag texture arrives. side:DoubleSide is REQUIRED (the
  // conic cap winds so a single-sided material is back-face culled → invisible). Starts
  // invisible (opacity 0) and fades in once the texture (or a pink fallback) loads.
  const capMat = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0 }), []);
  const iso2 = (iso || "").toUpperCase();
  const facts = COUNTRY_FACTS[iso2] || null;

  // Let the sheet's open animation finish before spinning up the WebGL globe — the
  // heavy mount (context + earth texture + border meshes) otherwise janks the
  // open. The space-gradient background shows in the meantime.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(t);
  }, []);
  // Labels (the heaviest part) come in after the fly-in motion has settled.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setShowLabels(true), 1100);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const set = () => setSize(Math.max(240, Math.min(el.clientWidth, 460)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch all world polygons once (cached across opens), plus the bundled extras.
  useEffect(() => {
    if (FEATURES_CACHE) { setFeatures(FEATURES_CACHE); return; }
    let alive = true;
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((d) => {
        FEATURES_CACHE = [...(d.features || []), ...(EXTRA_COUNTRIES as Feat[])];
        if (alive) setFeatures(FEATURES_CACHE!);
      })
      .catch(() => {
        FEATURES_CACHE = [...(EXTRA_COUNTRIES as Feat[])];
        if (alive) setFeatures(FEATURES_CACHE!);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Drape the country's flag over the selected polygon. We load the flag as a
  // texture and hand it in as the cap material: three-conic-polygon-geometry maps
  // the cap's UVs from the lng/lat bounding box, so the flag lands oriented on the
  // country's actual shape (west→east left→right, south→north bottom→top). If the
  // flag CDN fails (CORS / 404) we fall back to the old pink highlight so the
  // selected country is never left unmarked.
  useEffect(() => {
    if (!iso2) return;
    let alive = true;
    let tex: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      // Hi-res flag + trilinear/anisotropic filtering → smooth (no aliasing) as it
      // curves away on the sphere, instead of crisp/pixelated.
      `https://flagcdn.com/w1280/${iso2.toLowerCase()}.png`,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 16;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        tex = t;
        // Mutate the existing cap material in place — the globe already painted it
        // onto the selected country, so the flag shows on the next render frame.
        // Translucent + faintly muted so it's a soft, clean overlay rather than a
        // harsh full-saturation sticker.
        capMat.map = t;
        capMat.color.set(0xf2f2f2);
        capMat.transparent = true;
        capMat.depthWrite = false;
        capMat.needsUpdate = true;
        // Ease the flag in (easeOutCubic) instead of popping — the globe's render loop
        // picks up each opacity step. `alive` stops it on unmount. Opacity stays high so
        // the flag is clearly visible even where it sits over a dark part of the globe;
        // smoothness comes from the hi-res texture + filtering + soft edges, not from
        // being see-through.
        const TARGET = 0.92, start = performance.now(), DUR = 560;
        const tick = () => {
          if (!alive) return;
          const k = Math.min(1, (performance.now() - start) / DUR);
          capMat.opacity = TARGET * (1 - Math.pow(1 - k, 3));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      undefined,
      () => {
        // Flag CDN failed (CORS / 404) — keep the old pink highlight instead.
        if (!alive) return;
        capMat.color.set(0xff2d6e);
        capMat.opacity = 0.34;
        capMat.needsUpdate = true;
      }
    );
    return () => {
      alive = false;
      tex?.dispose();
    };
  }, [iso2, capMat]);

  // Free the cap materials (and any loaded flag texture) when this globe unmounts.
  useEffect(() => () => { capMat.map?.dispose(); capMat.dispose(); }, [capMat]);

  // The selected country's polygon (by ISO3 / name), found among all features.
  const selected = useMemo(() => {
    if (!features.length) return null;
    const cca3 = facts?.cca3;
    const nm = norm(facts?.name || name);
    return (
      features.find((ft) => {
        const p = ft.properties || {};
        return (
          (cca3 && (p.ADM0_A3 === cca3 || p.ISO_A3 === cca3 || p.ADM0_A3_US === cca3)) ||
          norm(p.ADMIN) === nm || norm(p.NAME) === nm || norm(p.NAME_LONG) === nm
        );
      }) || null
    );
  }, [features, facts, name]);

  // The flag is a CUSTOM cap mesh (one flag spread across the whole country), not the
  // polygon layer's per-polygon cap. Stable data ref so the mesh builds once.
  const flagLayer = useMemo(() => (selected ? [selected] : []), [selected]);
  // r defaults so TS accepts the 1-arg accessor type; three-globe passes the real
  // globe radius (100) at runtime.
  const flagObject = useCallback((f: Feat, r = 100) => buildFlagMesh(f, r, capMat), [capMat]);

  // Centered zoom + pinch. We change ONLY the altitude (keeping the current
  // lat/lng) via pointOfView instead of OrbitControls' dolly, which drifts the
  // sphere vertically. We also disable rotation while two fingers are down so the
  // globe doesn't jump/rotate at the START of a pinch. Non-passive so
  // preventDefault stops the page (the sheet is a scroll container) scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const MIN = 0.2, MAX = 3.4;
    const ctrl = () => globeRef.current?.controls?.();
    const onWheel = (e: WheelEvent) => {
      const g = globeRef.current;
      if (!g) return;
      e.preventDefault();
      const pov = g.pointOfView();
      const altitude = Math.max(MIN, Math.min(MAX, pov.altitude * Math.exp(e.deltaY * 0.0012)));
      g.pointOfView({ lat: pov.lat, lng: pov.lng, altitude }, 0);
    };
    let pinchDist = 0, pinchAlt = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const beginPinch = (e: TouchEvent) => {
      const c = ctrl();
      if (c) c.enableRotate = false;
      pinchDist = dist(e.touches);
      const g = globeRef.current;
      pinchAlt = g ? g.pointOfView().altitude : 1;
    };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) beginPinch(e); };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const g = globeRef.current;
      if (!g) return;
      if (pinchDist <= 0) { beginPinch(e); return; }
      const pov = g.pointOfView();
      const altitude = Math.max(MIN, Math.min(MAX, pinchAlt * (pinchDist / dist(e.touches))));
      g.pointOfView({ lat: pov.lat, lng: pov.lng, altitude }, 0);
    };
    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDist = 0;
      // Re-enable rotation ONLY when every finger is lifted, or the lone remaining
      // finger gets treated as a rotate from a stale anchor and the globe shoots off.
      if (e.touches.length === 0) {
        const c = ctrl();
        if (c) c.enableRotate = true;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    el.addEventListener("touchcancel", endPinch);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
      el.removeEventListener("touchcancel", endPinch);
    };
  }, []);

  // Free the WebGL context when this globe unmounts. Browsers cap live WebGL
  // contexts (~8–16); opening many team sheets in a row would otherwise pile up
  // contexts until the oldest get force-dropped and everything crawls. dispose +
  // forceContextLoss releases it immediately instead of waiting for GC.
  useEffect(() => {
    return () => {
      const g = globeRef.current;
      try {
        g?.pauseAnimation?.();
        const r = g?.renderer?.();
        if (r) {
          r.dispose?.();
          r.forceContextLoss?.();
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Pause the render loop while this globe's sheet sits behind another (not
  // interactive) — no point spending a rAF loop + GPU on an off-screen globe.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    if (active === false) g.pauseAnimation?.();
    else g.resumeAnimation?.();
  }, [active, ready]);

  // Configure the orbit controls once they exist: we drive zoom ourselves (above),
  // so leave only rotation to OrbitControls. onGlobeReady + polling fallback.
  const configure = () => {
    if (setupDone.current) return;
    const g = globeRef.current;
    const c = g?.controls?.();
    if (!c) return;
    setupDone.current = true;
    c.enableZoom = false;
    c.enablePan = false;
    c.rotateSpeed = 0.45;
    setReady(true);
  };
  useEffect(() => {
    if (ready) return;
    let n = 0;
    const id = setInterval(() => {
      configure();
      if (setupDone.current || n++ > 50) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, size]);

  // Fly-in: snap to the country pulled back + a little west, then glide in to the
  // size-based altitude with a subtle spin. Once per country.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !facts || !ready) return;
    if (animatedFor.current === iso2) return;
    animatedFor.current = iso2;
    const targetAlt = altitudeForArea(facts.area);
    const startAlt = Math.min(Math.max(targetAlt + 1.1, 2.6), 3.8);
    const spin = 34;
    g.pointOfView({ lat: facts.lat, lng: facts.lng - spin, altitude: startAlt }, 0);
    const t = setTimeout(() => g.pointOfView({ lat: facts.lat, lng: facts.lng, altitude: targetAlt }, 1600), 300);
    return () => clearTimeout(t);
  }, [iso2, facts, ready, size]);

  // Country code labels (ISO3 — initials, never the full name) on every country,
  // sized by area. Static (no per-zoom recompute → no jank); the size gives a
  // natural level-of-detail (tiny labels only become legible once you zoom in).
  // The selected country is always shown, bigger and pink.
  // Background country-code labels (ISO3) sized by area. The SELECTED country gets
  // NO label — we opened it, so we already know which country it is (and its flag is
  // draped right on it).
  const labels = useMemo(() => {
    const arr: { lat: number; lng: number; text: string; sel: boolean; sz: number }[] = [];
    for (const f of features) {
      if (f === selected) continue;
      const p = f.properties || {};
      const cca3 = p.ADM0_A3;
      const fc = cca3 ? FACTS_BY_CCA3[cca3] : null;
      if (!fc || !cca3) continue;
      arr.push({ lat: fc.lat, lng: fc.lng, text: cca3, sel: false, sz: labelSizeForArea(fc.area) });
    }
    return arr;
  }, [features, selected]);
  const fmt = (n?: number | null) => (n == null ? "–" : n.toLocaleString("sv-SE"));

  return (
    <div>
      <div
        ref={wrapRef}
        className="globe-stage"
        style={{ width: "100%", height: size, display: "grid", placeItems: "center", borderRadius: "var(--r-lg)", overflow: "hidden", touchAction: "none", background: "radial-gradient(circle at 50% 42%, #16306e, #05070f 72%)" }}
      >
        {/* The canvas must opt out of browser touch handling, or the scrollable
            sheet eats the pinch before our zoom handler sees it. */}
        <style>{`.globe-stage canvas{ touch-action:none !important; }`}</style>
        {mounted && size > 0 && (
          <Globe
            ref={globeRef}
            width={size}
            height={size}
            animateIn={false}
            onGlobeReady={configure}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl={EARTH_TEXTURE}
            showAtmosphere
            atmosphereColor="#9ec1ff"
            atmosphereAltitude={0.22}
            polygonsData={features}
            polygonAltitude={(f: Feat) => (f === selected ? 0.014 : 0.005)}
            polygonCapColor={() => "rgba(0,0,0,0)"}
            polygonSideColor={() => "rgba(0,0,0,0)"}
            polygonStrokeColor={(f: Feat) => (f === selected ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.42)")}
            polygonsTransitionDuration={0}
            polygonLabel={(f: Feat) => `<b>${f?.properties?.ADMIN || f?.properties?.NAME || ""}</b>`}
            customLayerData={flagLayer}
            customThreeObject={flagObject}
            customThreeObjectUpdate={FLAG_UPDATE}
            labelsData={showLabels ? labels : EMPTY}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize={(d: Feat) => d.sz}
            labelColor={(d: Feat) => (d.sel ? "#ffffff" : "rgba(255,255,255,.62)")}
            labelResolution={2}
            labelAltitude={(d: Feat) => (d.sel ? 0.032 : 0.008)}
            labelIncludeDot={false}
            labelsTransitionDuration={0}
          />
        )}
      </div>
      <div className="card card-pad" style={{ marginTop: 10 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Om {facts?.name || name}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
          <Fact label="Befolkning" value={fmt(facts?.population)} />
          <Fact label="Huvudstad" value={facts?.capital || "–"} />
          <Fact label="Region" value={facts?.subregion || facts?.region || "–"} />
          <Fact label="Yta" value={facts?.area != null ? `${fmt(facts.area)} km²` : "–"} />
        </div>
        <div className="dim" style={{ fontSize: 10, marginTop: 10 }}>Dra för att snurra · nyp eller scrolla för att zooma</div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kicker" style={{ fontSize: 9 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 14, marginTop: 1 }}>{value}</div>
    </div>
  );
}
