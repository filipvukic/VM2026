import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
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

// ISO3 → label position + area, to drop a code label on each country sized by how
// big it is (the geojson has no label coords; COUNTRY_FACTS has a lat/lng + area).
const FACTS_BY_CCA3: Record<string, { lat: number; lng: number; area: number | null }> = {};
for (const f of Object.values(COUNTRY_FACTS)) FACTS_BY_CCA3[f.cca3] = { lat: f.lat, lng: f.lng, area: f.area };

// Label size from country area: big nations get big codes, tiny ones small codes —
// so when zoomed out only the large labels are legible and the small ones "appear"
// (become readable) as you zoom in, without any per-frame recompute.
function labelSizeForArea(area?: number | null): number {
  if (!area || area <= 0) return 0.42;
  return Math.max(0.36, Math.min(1.0, 0.36 + Math.sqrt(area) / 3600));
}

const norm = (s?: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// How far to sit from the surface, based on how big the country is. Tiny states
// (Qatar, Malta) zoom in close; giants (Russia, Brazil, USA) pull way back so the
// whole country fits. Uses sqrt(area) since area grows with the square of extent.
function altitudeForArea(area?: number | null): number {
  if (!area || area <= 0) return 1.6;
  const alt = 0.6 + 0.00058 * Math.sqrt(area);
  // Don't dive too close on micro-states — keep some ocean/neighbour context.
  return Math.max(0.8, Math.min(2.85, alt));
}

export default function CountryGlobe({ iso, name }: { iso?: string | null; name: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animatedFor = useRef<string | null>(null);
  const setupDone = useRef(false);
  const [size, setSize] = useState(320);
  const [ready, setReady] = useState(false);
  const [features, setFeatures] = useState<Feat[]>(FEATURES_CACHE || []);
  const iso2 = (iso || "").toUpperCase();
  const facts = COUNTRY_FACTS[iso2] || null;

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
    const t = setTimeout(() => g.pointOfView({ lat: facts.lat, lng: facts.lng, altitude: targetAlt }, 2200), 350);
    return () => clearTimeout(t);
  }, [iso2, facts, ready, size]);

  // Country code labels (ISO3 — initials, never the full name) on every country,
  // sized by area. Static (no per-zoom recompute → no jank); the size gives a
  // natural level-of-detail (tiny labels only become legible once you zoom in).
  // The selected country is always shown, bigger and pink.
  const labels = useMemo(() => {
    const arr: { lat: number; lng: number; text: string; sel: boolean; sz: number }[] = [];
    for (const f of features) {
      const p = f.properties || {};
      const code = p.ADM0_A3;
      const fc = code ? FACTS_BY_CCA3[code] : null;
      if (!fc || !code) continue;
      const sel = f === selected;
      const sz = labelSizeForArea(fc.area);
      arr.push({ lat: fc.lat, lng: fc.lng, text: code, sel, sz: sel ? Math.max(sz * 1.5, 0.85) : sz });
    }
    if (facts && !selected) arr.push({ lat: facts.lat, lng: facts.lng, text: iso2, sel: true, sz: 0.9 });
    return arr;
  }, [features, selected, facts, iso2]);
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
        {size > 0 && (
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
            polygonAltitude={(f: Feat) => (f === selected ? 0.02 : 0.005)}
            polygonCapColor={(f: Feat) => (f === selected ? "rgba(255,45,110,.32)" : "rgba(0,0,0,0)")}
            polygonSideColor={(f: Feat) => (f === selected ? "rgba(255,45,110,.18)" : "rgba(0,0,0,0)")}
            polygonStrokeColor={(f: Feat) => (f === selected ? "#ff5c97" : "rgba(255,255,255,.42)")}
            polygonsTransitionDuration={0}
            polygonLabel={(f: Feat) => `<b>${f?.properties?.ADMIN || f?.properties?.NAME || ""}</b>`}
            labelsData={labels}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize={(d: Feat) => d.sz}
            labelColor={(d: Feat) => (d.sel ? "#ffd5e3" : "rgba(255,255,255,.62)")}
            labelResolution={1}
            labelAltitude={(d: Feat) => (d.sel ? 0.014 : 0.008)}
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
