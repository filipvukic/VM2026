import { useData } from "../state/dataset";
import { useNotif, fireNotification } from "../state/notifications";
import { kr } from "../lib/format";
import { PRIZES } from "../data/static/names";

export function InfoView() {
  const ds = useData();
  const bp = ds.bonusPoints || ({} as Record<string, number>);
  const splitLabels = ["1:a", "2:a", "3:a"];

  const notif = useNotif();
  return (
    <div className="view container" style={{ maxWidth: 880 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Så funkar det</div>
      </div>

      {/* notifications */}
      {notif.supported && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Notiser</div>
          <div className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Få en avi för <b>mål, avspark och slutsignal</b> — bevaka en enskild match via klockan inne på
            matchen, eller slå på avisering när <b>vilken match som helst</b> börjar här nedan.
            Notiserna fungerar så länge <b>fliken är öppen</b> (även som bakgrundsflik) — en helt stängd flik
            kan tyvärr inte ta emot notiser utan en server.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <button
              role="switch"
              aria-checked={notif.kickoffAll}
              onClick={async () => {
                const turningOn = !notif.kickoffAll;
                await notif.setKickoffAll(turningOn);
                if (turningOn && useNotif.getState().kickoffAll) {
                  fireNotification("🔔 Avspark-notiser på", "Du får en avi när en match börjar (håll fliken öppen).", "ko-all-on");
                }
              }}
              style={{
                width: 46, height: 27, borderRadius: 999, flexShrink: 0, position: "relative",
                background: notif.kickoffAll ? "var(--win)" : "var(--surface-3)", border: "1px solid var(--line-2)", transition: "background .2s",
              }}
            >
              <span style={{ position: "absolute", top: 2, left: notif.kickoffAll ? 21 : 2, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>Notis när en match börjar</span>
          </label>

          {/* permission state + a way to grant and to verify it works */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {notif.permission === "granted" ? (
              <>
                <span className="chip" style={{ fontSize: 10.5, color: "var(--win)" }}>Notiser är på ✓</span>
                <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => fireNotification("✅ Notiser funkar!", "Du får aviseringar härifrån.", "vm-test")}>
                  Skicka testnotis
                </button>
              </>
            ) : notif.permission === "denied" ? (
              <div className="dim" style={{ fontSize: 11, color: "var(--loss)" }}>
                Notiser är blockerade i webbläsaren — tillåt dem via hänglåset/inställningarna bredvid adressfältet.
              </div>
            ) : (
              <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => notif.request()}>
                Tillåt notiser
              </button>
            )}
          </div>
        </div>
      )}

      {/* pot */}
      <div className="card" style={{ padding: 18, background: "linear-gradient(120deg, color-mix(in srgb,var(--gold) 18%, var(--surface)), var(--surface))", marginBottom: 16 }}>
        <div className="kicker" style={{ color: "var(--gold)" }}>Sammanlagd pott</div>
        <div className="display" style={{ fontSize: 40, margin: "4px 0 14px" }}>{kr(ds.pot.total)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {PRIZES.map((p, i) => (
            <div key={i} className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
              <div className="num" style={{ fontSize: 22, color: ["var(--gold)", "#cfd6e6", "#e8965a"][i] }}>{kr(p)}</div>
              <div className="kicker" style={{ fontSize: 9.5 }}>{splitLabels[i]} plats</div>
            </div>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 12 }}>
          {ds.players.length} spelare × {kr(ds.pot.perPlayer)} · potten fördelas 50/30/20.
        </div>
      </div>

      {/* match scoring */}
      <div className="section-head"><div className="section-title" style={{ fontSize: 20 }}>Poäng per match</div></div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 8 }}>
        <RuleCard points="5p" title="Exakt resultat" desc="Helt rätt slutresultat." accent="var(--gold)" />
        <RuleCard points="2p" title="Rätt utgång" desc="Rätt vinnare eller oavgjort." accent="var(--win)" />
        <RuleCard points="1p" title="Annars" desc="Fel utgång – tröstpoäng." accent="var(--ink-3)" />
      </div>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="dim" style={{ fontSize: 12.5 }}>
          <b style={{ color: "var(--ink)" }}>Slutspel:</b> {ds.knockoutRuleText}
        </div>
      </div>

      {/* tie-break */}
      <div className="card card-pad" style={{ marginBottom: 16, borderColor: "color-mix(in srgb,var(--gold) 35%, var(--line-2))" }}>
        <div className="kicker" style={{ color: "var(--gold)", marginBottom: 8 }}>Vid lika poäng</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li><b>Flest exakta resultat</b> avgör i första hand.</li>
          <li>Är det fortfarande lika räknas <b>flest rätt utgång</b>.</li>
          <li>Skulle det vara helt jämnt ända in i mål <b>delas placeringen och prispengarna lika</b> mellan spelarna.</li>
        </ol>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
          Tabellen sorteras alltså på totalpoäng → exakta → rätt utgång.
        </div>
      </div>

      {/* bonus */}
      <div className="section-head"><div className="section-title" style={{ fontSize: 20 }}>Bonuspoäng</div></div>
      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        {[
          ["Vinnare", bp.winner ?? 10],
          ["Silver", bp.silver ?? 5],
          ["Brons", bp.bronze ?? 3],
          ["Skyttekung", bp.top_scorer ?? 3],
          ["Bästa spelare", bp.best_player ?? 3],
          ["Bästa unga spelare", bp.best_young ?? 3],
          ["Bästa målvakt", bp.best_keeper ?? 3],
        ].map(([label, pts], i, arr) => (
          <div key={label as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
            <span style={{ fontWeight: 700 }}>{label}</span>
            <span className="num" style={{ color: "var(--gold)" }}>{pts}p</span>
          </div>
        ))}
      </div>

      {/* format */}
      <div className="section-head"><div className="section-title" style={{ fontSize: 20 }}>Turneringsformat</div></div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 18 }}>
        <RuleCard points="48" title="Lag" desc="Största VM någonsin." accent="var(--hot)" />
        <RuleCard points="12" title="Grupper (A–L)" desc="Fyra lag i varje." accent="var(--cool)" />
        <RuleCard points="104" title="Matcher" desc="Hela turneringen." accent="var(--warm)" />
        <RuleCard points="32" title="Lag till slutspel" desc="Topp 2 + 8 bästa treor." accent="var(--win)" />
      </div>

      <div className="dim" style={{ textAlign: "center", fontSize: 11.5, paddingBottom: 8 }}>
        Spelas i USA, Mexiko och Kanada · 11 juni – 19 juli 2026. Data hämtas automatiskt.
      </div>
    </div>
  );
}

function RuleCard({ points, title, desc, accent }: { points: string; title: string; desc: string; accent: string }) {
  return (
    <div className="card" style={{ padding: "14px 12px" }}>
      <div className="num" style={{ fontSize: 26, color: accent }}>{points}</div>
      <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 4 }}>{title}</div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>{desc}</div>
    </div>
  );
}
