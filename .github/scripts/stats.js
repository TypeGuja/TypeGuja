// Generates github-stats(.en).svg and github-streak(.en).svg from the GitHub GraphQL API.
// usage: GITHUB_TOKEN=... node .github/scripts/stats.js
const fs = require('fs');

const LOGIN = 'TypeGuja';
const TOKEN = process.env.GITHUB_TOKEN;
// decompiled third-party code, would drown the language card
const LANG_SKIP = ['MAX-Messenger-'];

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'User-Agent': LOGIN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function collect() {
  const base = await gql(`query($l: String!) { user(login: $l) {
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount nodes {
      name description isFork stargazerCount forkCount pushedAt primaryLanguage { name color }
      languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
    } }
    followers { totalCount }
    contributionsCollection { contributionYears }
  } }`, { l: LOGIN });
  const u = base.user;
  const stats = {
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    repos: u.repositories.totalCount,
    followers: u.followers.totalCount,
    commits: 0, prs: 0, issues: 0,
  };
  // language share by bytes of code, forks excluded (their code is not ours)
  const langs = {};
  for (const r of u.repositories.nodes.filter(r => !r.isFork && !LANG_SKIP.includes(r.name)))
    for (const e of r.languages.edges) {
      const l = langs[e.node.name] ||= { name: e.node.name, color: e.node.color || '#888', size: 0, repos: 0 };
      l.size += e.size;
      l.repos++;
    }
  const languages = Object.values(langs).sort((a, b) => b.size - a.size);
  const recent = u.repositories.nodes.filter(r => !r.isFork)
    .sort((a, b) => b.stargazerCount - a.stargazerCount || b.pushedAt.localeCompare(a.pushedAt)).slice(0, 5);
  const days = [];
  for (const year of u.contributionsCollection.contributionYears.slice().sort()) {
    const d = await gql(`query($l: String!, $f: DateTime!, $t: DateTime!) { user(login: $l) {
      contributionsCollection(from: $f, to: $t) {
        totalCommitContributions totalPullRequestContributions totalIssueContributions
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      } } }`, { l: LOGIN, f: `${year}-01-01T00:00:00Z`, t: `${year}-12-31T23:59:59Z` });
    const c = d.user.contributionsCollection;
    stats.commits += c.totalCommitContributions;
    stats.prs += c.totalPullRequestContributions;
    stats.issues += c.totalIssueContributions;
    for (const w of c.contributionCalendar.weeks) days.push(...w.contributionDays);
  }
  const today = new Date().toISOString().slice(0, 10);
  const cal = days.filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  stats.month = cal.slice(-30).reduce((a, d) => a + d.contributionCount, 0);
  stats.total = cal.reduce((a, d) => a + d.contributionCount, 0);

  // current streak may end today or yesterday (today is not over yet)
  let i = cal.length - 1;
  if (i >= 0 && cal[i].contributionCount === 0) i--;
  const cur = { n: 0, from: null, to: i >= 0 ? cal[i].date : null };
  for (; i >= 0 && cal[i].contributionCount > 0; i--) { cur.n++; cur.from = cal[i].date; }
  const best = { n: 0, from: null, to: null };
  let run = 0, start = null;
  for (const d of cal) {
    if (d.contributionCount > 0) {
      if (!run) start = d.date;
      if (++run >= best.n) Object.assign(best, { n: run, from: start, to: d.date });
    } else run = 0;
  }
  return { stats, cur, best, firstDay: cal.length ? cal[0].date : today, languages, recent };
}

const L = {
  ru: {
    title: 'Статистика GitHub — TypeGuja',
    rows: ['Звёзд получено', 'Коммитов всего', 'Вкладов за 30 дней', 'Pull Request’ов', 'Issues', 'Публичных репозиториев'],
    total: 'Всего вкладов', current: 'Текущая серия', longest: 'Рекордная серия',
    none: 'нет серии', since: 'с',
    langs: 'Самые используемые языки', other: 'Другие', repoWord: ['репозиторий', 'репозитория', 'репозиториев'],
    top: 'Топ репозиториев',
    months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  },
  en: {
    title: 'GitHub Stats — TypeGuja',
    rows: ['Stars earned', 'Total commits', 'Contributions (30 days)', 'Pull requests', 'Issues', 'Public repositories'],
    total: 'Total contributions', current: 'Current streak', longest: 'Longest streak',
    none: 'no streak', since: 'since',
    langs: 'Most used languages', other: 'Other', repoWord: ['repo', 'repos', 'repos'],
    top: 'Top repositories',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

// GitHub's own palette; the media query follows the viewer's GitHub theme
const STYLE = `<style>
    .bg { fill: #0d1117; stroke: #3d444d; }
    .ln { stroke: #3d444d; }
    .h { font: 600 18px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #4493f8; }
    .k { font: 400 14px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #9198a1; }
    .v { font: 600 14px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #f0f6fc; }
    .big { font: 600 28px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #f0f6fc; }
    .cap { font: 600 13px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #4493f8; }
    .sub { font: 400 11px -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: #9198a1; }
    .l0 { fill: #151b23; } .l1 { fill: #033a16; } .l2 { fill: #196c2e; } .l3 { fill: #2ea043; } .l4 { fill: #56d364; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #d1d9e0; }
      .ln { stroke: #d1d9e0; }
      .h, .cap { fill: #0969da; }
      .k, .sub { fill: #59636e; }
      .v, .big { fill: #1f2328; }
      .l0 { fill: #eff2f5; } .l1 { fill: #aceebb; } .l2 { fill: #4ac26b; } .l3 { fill: #2da44e; } .l4 { fill: #116329; }
    }
    .f { animation: f .4s ease-in-out backwards; }
    @keyframes f { from { opacity: 0; } }
  </style>`;

function fmt(date, t) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCDate()} ${t.months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function range(s, t) {
  if (!s.n) return t.none;
  return s.from === s.to ? fmt(s.from, t) : `${fmt(s.from, t)} — ${fmt(s.to, t)}`;
}

function statsSvg({ stats: s }, t) {
  const vals = [s.stars, s.commits, s.month, s.prs, s.issues, s.repos];
  const rows = vals.map((v, i) => `
    <g class="f" style="animation-delay:${150 + i * 120}ms" transform="translate(25, ${70 + i * 28})">
      <text class="k" x="0" y="0">${t.rows[i]}:</text>
      <text class="v" x="300" y="0">${v}</text>
    </g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="250" viewBox="0 0 495 250" role="img">
  <title>${t.title}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="494" height="249" class="bg"/>
  <text class="h" x="25" y="38">${t.title}</text>${rows}
</svg>
`;
}

function streakSvg({ stats: s, cur, best, firstDay }, t) {
  const col = (x, big, cap, sub, delay) => `
  <g class="f" style="animation-delay:${delay}ms" text-anchor="middle">
    <text class="big" x="${x}" y="116">${big}</text>
    <text class="cap" x="${x}" y="150">${cap}</text>
    <text class="sub" x="${x}" y="172">${sub}</text>
  </g>`;
  // same 250 px height as the stats card: they share a row in the README
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="250" viewBox="0 0 495 250" role="img">
  <title>${t.current}: ${cur.n}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="494" height="249" class="bg"/>
  <line x1="165" y1="68" x2="165" y2="183" class="ln"/>
  <line x1="330" y1="68" x2="330" y2="183" class="ln"/>${
  col(82.5, s.total, t.total, `${t.since} ${fmt(firstDay, t)}`, 150)}${
  col(247.5, cur.n, t.current, range(cur, t), 300)}${
  col(412.5, best.n, t.longest, range(best, t), 450)}
</svg>
`;
}

const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plural(n, w) {
  if (w[0] === 'repo') return n === 1 ? w[0] : w[1];
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? w[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? w[1] : w[2];
}

function size(b) {
  return b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function langsSvg({ languages, rowH }, t) {
  const top = languages.slice(0, 8);
  const rest = languages.slice(8);
  if (rest.length) top.push({ name: t.other, color: '#9198a1', size: rest.reduce((a, l) => a + l.size, 0), repos: null });
  const sum = top.reduce((a, l) => a + l.size, 0) || 1;
  const W = 445;
  let x = 0;
  const bar = top.map(l => {
    const w = (l.size / sum) * W;
    const r = `<rect x="${(25 + x).toFixed(2)}" y="58" width="${w.toFixed(2)}" height="10" fill="${l.color}"/>`;
    x += w;
    return r;
  }).join('');
  const rows = top.map((l, i) => {
    const cx = i % 2 ? 260 : 25, cy = 100 + Math.floor(i / 2) * 36;
    const pct = (l.size / sum * 100).toFixed(1);
    const sub = l.repos === null ? `${size(l.size)} · ${rest.map(r => r.name).slice(0, 3).join(', ')}` : `${size(l.size)} · ${l.repos} ${plural(l.repos, t.repoWord)}`;
    return `
  <g class="f" style="animation-delay:${150 + i * 90}ms" transform="translate(${cx}, ${cy})">
    <circle cx="6" cy="-4" r="6" fill="${l.color}"/>
    <text class="k" x="20" y="0">${esc(l.name)}</text>
    <text class="v" x="210" y="0" text-anchor="end">${pct}%</text>
    <text class="sub" x="20" y="16">${esc(sub)}</text>
  </g>`;
  }).join('');
  const H = rowH;
  const p = pony(LANGS_PONY);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="${H + p.top}" viewBox="0 0 495 ${H + p.top}" role="img">
  <title>${t.langs}</title>
  ${STYLE}
  <g transform="translate(0, ${p.top})">
  <rect x="0.5" y="0.5" rx="6" width="494" height="${H - 1}" class="bg"/>
  <text class="h" x="25" y="38">${t.langs}</text>
  <clipPath id="b"><rect x="25" y="58" width="${W}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#b)">${bar}</g>${rows}
  </g>${p.svg}
</svg>
`;
}

// a pony lying on the card's top edge: `rest` is the y (in the pony's own
// viewBox) that touches the edge, so hooves can hang a little over it
const LANGS_PONY = { file: 'ponies/luna_sleeping.svg', x: 150, width: 330, rest: 283 };
// flying above the card, only the tail curl dips over the edge
const TOP_PONY = { file: 'ponies/celestia_flying.svg', x: 170, width: 320, rest: 900 };

function pony({ file, x, width, rest }) {
  if (!fs.existsSync(file)) return { top: 0, svg: '' };
  const src = fs.readFileSync(file, 'utf8');
  const vw = +src.match(/viewBox="0 0 ([\d.]+)/)[1];
  const s = width / vw;
  const body = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { top: Math.ceil(rest * s), svg: `\n  <g transform="translate(${x}, 0) scale(${s.toFixed(4)})">${body}</g>` };
}

function topSvg({ recent, rowH }, t, descs) {
  const rows = recent.map((r, i) => {
    let d = descs[r.name] || r.description || '';
    if (d.length > 62) d = d.slice(0, 60) + '…';
    const lang = r.primaryLanguage;
    return `
  <g class="f" style="animation-delay:${150 + i * 100}ms" transform="translate(25, ${72 + i * 44})">
    <text class="v" x="0" y="0">${esc(r.name)}</text>
    <text class="sub" x="0" y="17">${esc(d)}</text>
    ${lang ? `<circle cx="340" cy="-4" r="5" fill="${lang.color || '#888'}"/><text class="sub" x="350" y="0">${esc(lang.name)}</text>` : ''}
    <text class="cap" x="445" y="0" text-anchor="end">★ ${r.stargazerCount}</text>
  </g>`;
  }).join('');
  const H = rowH;
  const p = pony(TOP_PONY);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="${H + p.top}" viewBox="0 0 495 ${H + p.top}" role="img">
  <title>${t.top}</title>
  ${STYLE}
  <g transform="translate(0, ${p.top})">
  <rect x="0.5" y="0.5" rx="6" width="494" height="${H - 1}" class="bg"/>
  <text class="h" x="25" y="38">${t.top}</text>${rows}
  </g>${p.svg}
</svg>
`;
}

// short descriptions for repos without one on GitHub (or with a Russian-only one)
const DESC = {
  ru: {
    'claude-animate': 'Плагин Claude Code для работы в Adobe Animate',
    'TenzaX32': 'Движок 2D-анимации пони в реальном времени',
    'OSI-X': 'Прошивка самодельного 3D-принтера на ESP32-S3',
    'Garry-s-mod-RustCore': "Rust-ускоритель и тюнер для Garry's Mod (Metrostroi)",
    'AlKAsH3D-Engine': 'Движок для 3D RTX-игр на Rust (+Python)',
    'Desktop-ponies-2-': 'Desktop Ponies на Rust',
  },
  en: {
    'claude-animate': 'Claude Code plugin that works inside Adobe Animate',
    'TenzaX32': 'Real-time 2D pony animation engine',
    'OSI-X': 'Firmware for a homemade ESP32-S3 3D printer',
    'Garry-s-mod-RustCore': "Rust accelerator and tuner for Garry's Mod (Metrostroi)",
    'MAX-Messenger-': 'Decompiled source of the MAX messenger',
  },
};

(async () => {
  const data = await collect();
  // langs and top cards sit side by side: give them one height
  data.rowH = Math.max(100 + Math.ceil(Math.min(data.languages.length, 9) / 2) * 36 + 4, 72 + data.recent.length * 44);
  fs.writeFileSync('github-stats.svg', statsSvg(data, L.ru));
  fs.writeFileSync('github-stats-en.svg', statsSvg(data, L.en));
  fs.writeFileSync('github-streak.svg', streakSvg(data, L.ru));
  fs.writeFileSync('github-streak-en.svg', streakSvg(data, L.en));
  fs.writeFileSync('github-langs.svg', langsSvg(data, L.ru));
  fs.writeFileSync('github-langs-en.svg', langsSvg(data, L.en));
  fs.writeFileSync('github-top.svg', topSvg(data, L.ru, DESC.ru));
  fs.writeFileSync('github-top-en.svg', topSvg(data, L.en, DESC.en));
  console.log(JSON.stringify({ ...data.stats, streak: data.cur.n, longest: data.best.n,
    languages: data.languages.map(l => `${l.name}:${l.size}`) }));
})().catch(e => { console.error(e); process.exit(1); });
