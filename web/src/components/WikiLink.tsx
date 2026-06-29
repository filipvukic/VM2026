// A small "read more on Wikipedia" chip. We link via Wikipedia's go-search
// (?search=…&go=Go), which lands straight on the article when the query matches a
// title or redirect (so we never have to curate exact titles), and on search results
// otherwise. English Wikipedia — most complete for national teams and footballers.
function wikiUrl(query: string): string {
  return `https://en.wikipedia.org/w/index.php?title=Special:Search&search=${encodeURIComponent(query)}&go=Go`;
}

export function WikiLink({ query, label = "Läs mer på Wikipedia", style }: { query: string; label?: string; style?: React.CSSProperties }) {
  if (!query.trim()) return null;
  return (
    <a className="wiki-link" href={wikiUrl(query)} target="_blank" rel="noopener noreferrer" style={style}>
      <span className="wiki-w" aria-hidden>W</span>
      <span>{label}</span>
      <span className="wiki-go">›</span>
      <style>{`
        .wiki-link{ display:inline-flex; align-items:center; gap:8px; padding:7px 12px 7px 8px; border-radius:var(--r-pill);
          background:var(--surface); border:1px solid var(--line-2); color:var(--ink-2); font-weight:700; font-size:12.5px;
          transition:background .15s, color .15s; }
        .wiki-link:hover{ background:var(--surface-2); color:var(--ink); }
        .wiki-w{ display:grid; place-items:center; width:20px; height:20px; border-radius:6px; flex:0 0 auto;
          background:var(--surface-3); color:var(--ink); font-family:Georgia, "Times New Roman", serif; font-weight:700; font-size:13px; }
        .wiki-go{ color:var(--ink-3); margin-left:1px; }
      `}</style>
    </a>
  );
}
