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
    .sort((a, b) => b.stargazerCount - a.stargazerCount || b.pushedAt.localeCompare(a.pushedAt)).slice(0, 6);
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
  return { stats, cur, best, firstDay: cal.length ? cal[0].date : today, languages, recent, cal };
}

const L = {
  ru: {
    title: 'Статистика GitHub — TypeGuja',
    rows: ['Звёзд получено', 'Коммитов всего', 'Вкладов за 30 дней', 'Pull Request’ов', 'Issues', 'Публичных репозиториев'],
    total: 'Всего вкладов', current: 'Текущая серия', longest: 'Рекордная серия',
    none: 'нет серии', since: 'с',
    langs: 'Самые используемые языки', other: 'Другие', repoWord: ['репозиторий', 'репозитория', 'репозиториев'],
    year: 'Активность за год', less: 'меньше', more: 'больше', contribs: 'вкладов',
    top: 'Топ репозиториев', days: ['пн', '', 'ср', '', 'пт', '', ''],
    months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  },
  en: {
    title: 'GitHub Stats — TypeGuja',
    rows: ['Stars earned', 'Total commits', 'Contributions (30 days)', 'Pull requests', 'Issues', 'Public repositories'],
    total: 'Total contributions', current: 'Current streak', longest: 'Longest streak',
    none: 'no streak', since: 'since',
    langs: 'Most used languages', other: 'Other', repoWord: ['repo', 'repos', 'repos'],
    year: 'Activity over the last year', less: 'less', more: 'more', contribs: 'contributions',
    top: 'Top repositories', days: ['Mon', '', 'Wed', '', 'Fri', '', ''],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

const STYLE = `<style>
    .h { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: #ff9e64; }
    .k { font: 600 14px 'Segoe UI', Ubuntu, sans-serif; fill: #a9b1d6; }
    .v { font: 700 14px 'Segoe UI', Ubuntu, sans-serif; fill: #7dcfff; }
    .big { font: 700 28px 'Segoe UI', Ubuntu, sans-serif; fill: #7dcfff; }
    .cap { font: 600 13px 'Segoe UI', Ubuntu, sans-serif; fill: #a9b1d6; }
    .sub { font: 400 11px 'Segoe UI', Ubuntu, sans-serif; fill: #565f89; }
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
  <rect x="0.5" y="0.5" rx="6" width="494" height="249" fill="#1a1b27" stroke="#2f334d"/>
  <text class="h" x="25" y="38">${t.title}</text>${rows}
</svg>
`;
}

function streakSvg({ stats: s, cur, best, firstDay }, t) {
  const col = (x, big, cap, sub, delay) => `
  <g class="f" style="animation-delay:${delay}ms" text-anchor="middle">
    <text class="big" x="${x}" y="88">${big}</text>
    <text class="cap" x="${x}" y="122">${cap}</text>
    <text class="sub" x="${x}" y="144">${sub}</text>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img">
  <title>${t.current}: ${cur.n}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="494" height="194" fill="#1a1b27" stroke="#2f334d"/>
  <line x1="165" y1="40" x2="165" y2="155" stroke="#2f334d"/>
  <line x1="330" y1="40" x2="330" y2="155" stroke="#2f334d"/>${
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

function langsSvg({ languages }, t) {
  const top = languages.slice(0, 8);
  const rest = languages.slice(8);
  if (rest.length) top.push({ name: t.other, color: '#565f89', size: rest.reduce((a, l) => a + l.size, 0), repos: null });
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
  const H = 100 + Math.ceil(top.length / 2) * 36 + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="${H}" viewBox="0 0 495 ${H}" role="img">
  <title>${t.langs}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="494" height="${H - 1}" fill="#1a1b27" stroke="#2f334d"/>
  <text class="h" x="25" y="38">${t.langs}</text>
  <clipPath id="b"><rect x="25" y="58" width="${W}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#b)">${bar}</g>${rows}
</svg>
`;
}

function heatSvg({ cal }, t) {
  const days = cal.slice(-364);
  // columns are weeks starting on Monday
  const lead = (new Date(days[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const max = Math.max(1, ...days.map(d => d.contributionCount));
  const shade = ['#232433', '#1f4e5f', '#2a7f8f', '#4fb3c4', '#7dcfff'];
  const lvl = n => n === 0 ? 0 : Math.min(4, Math.ceil(n / max * 4));
  const S = 11, G = 2, X0 = 52, Y0 = 70;
  let cells = '', months = '', lastM = -1;
  days.forEach((d, k) => {
    const i = k + lead, col = Math.floor(i / 7), row = i % 7;
    const x = X0 + col * (S + G), y = Y0 + row * (S + G);
    cells += `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="2" fill="${shade[lvl(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    const dt = new Date(d.date + 'T00:00:00Z'), m = dt.getUTCMonth();
    // label a month on the first week that starts inside it (skips a partial first column)
    if (m !== lastM && row === 0 && dt.getUTCDate() <= 7) {
      if (col < 51) months += `<text class="sub" x="${x}" y="${Y0 - 8}">${t.months[m]}</text>`;
      lastM = m;
    }
  });
  const labels = t.days.map((n, r) => n && `<text class="sub" x="${X0 - 8}" y="${Y0 + r * (S + G) + 9}" text-anchor="end">${n}</text>`).join('');
  const total = days.reduce((a, d) => a + d.contributionCount, 0);
  const cols = Math.ceil((days.length + lead) / 7);
  const W = X0 + cols * (S + G) + 20, H = Y0 + 7 * (S + G) + 40;
  const legend = shade.map((c, i) => `<rect x="${W - 125 + i * 15}" y="${H - 27}" width="${S}" height="${S}" rx="2" fill="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>${t.year}: ${total}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="${W - 1}" height="${H - 1}" fill="#1a1b27" stroke="#2f334d"/>
  <text class="h" x="25" y="34">${t.year}</text>
  <text class="cap" x="${W - 25}" y="34" text-anchor="end">${total} ${t.contribs}</text>
  ${months}${labels}<g class="f" style="animation-delay:150ms">${cells}</g>
  <text class="sub" x="${W - 132}" y="${H - 18}" text-anchor="end">${t.less}</text>${legend}
  <text class="sub" x="${W - 47}" y="${H - 18}">${t.more}</text>
</svg>
`;
}

function topSvg({ recent }, t, descs) {
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
  const H = 72 + recent.length * 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="${H}" viewBox="0 0 495 ${H}" role="img">
  <title>${t.top}</title>
  ${STYLE}
  <rect x="0.5" y="0.5" rx="6" width="494" height="${H - 1}" fill="#1a1b27" stroke="#2f334d"/>
  <text class="h" x="25" y="38">${t.top}</text>${rows}
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
  fs.writeFileSync('github-stats.svg', statsSvg(data, L.ru));
  fs.writeFileSync('github-stats-en.svg', statsSvg(data, L.en));
  fs.writeFileSync('github-streak.svg', streakSvg(data, L.ru));
  fs.writeFileSync('github-streak-en.svg', streakSvg(data, L.en));
  fs.writeFileSync('github-langs.svg', langsSvg(data, L.ru));
  fs.writeFileSync('github-langs-en.svg', langsSvg(data, L.en));
  fs.writeFileSync('github-activity.svg', heatSvg(data, L.ru));
  fs.writeFileSync('github-activity-en.svg', heatSvg(data, L.en));
  fs.writeFileSync('github-top.svg', topSvg(data, L.ru, DESC.ru));
  fs.writeFileSync('github-top-en.svg', topSvg(data, L.en, DESC.en));
  console.log(JSON.stringify({ ...data.stats, streak: data.cur.n, longest: data.best.n,
    languages: data.languages.map(l => `${l.name}:${l.size}`) }));
})().catch(e => { console.error(e); process.exit(1); });
