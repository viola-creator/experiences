#!/usr/bin/env node
/**
 * publish-maana-marketing.mjs — Maana
 *
 * Encrypts every dashboard listed in PAGES and builds one password-gated hub
 * with top navigation at maana-marketing/index.html.
 *
 * One passphrase unlocks all tabs. GitHub only ever receives ciphertext.
 *
 *   node publish-maana-marketing.mjs
 *
 * To add a dashboard later: drop the .html in this folder, add a line to PAGES,
 * re-run. Nothing else to change.
 *
 * Requires Node 16+. No dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { REDACTIONS } from './redactions.mjs';

/* ── the tabs, in order ─────────────────────────────────────────────────── */
const PAGES = [
  { id: 'journey', label: 'Journey Map',  file: 'maana-journey-map.html',   note: 'Service design' },
  { id: 'annex',   label: 'Annex List',   file: 'annex-list-all_0803.html', note: 'Sign-up list' },
  { id: 'sales',   label: 'Weekly Sales', file: 'Weekly Sales Report.html', note: 'Homes and workshops' }
];

const OUTDIR = 'maana-marketing';
const SITE   = 'https://viola-creator.github.io/maana-marketing/';
const ITER   = 250000;
const MIN    = 5;

/* ── passphrase ─────────────────────────────────────────────────────────── */
function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = c => {
      c = c + '';
      if (['\n', '\r', ''].includes(c)) { process.stdin.removeListener('data', onData); return; }
      process.stdout.clearLine(0); process.stdout.cursorTo(0);
      process.stdout.write(q + '*'.repeat(rl.line.length));
    };
    process.stdin.on('data', onData);
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}
function crackEstimate(pw) {
  let space = 0;
  if (/[a-z]/.test(pw)) space += 26;
  if (/[A-Z]/.test(pw)) space += 26;
  if (/[0-9]/.test(pw)) space += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) space += 20;
  const secs = Math.pow(space || 26, pw.length) / 2 / 40000;
  for (const [d, n] of [[31536000,'years'],[86400,'days'],[3600,'hours'],[60,'minutes'],[1,'seconds']]) {
    if (secs >= d) { const v = secs / d; return (v > 1e6 ? '>1,000,000' : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()) + ' ' + n; }
  }
  return 'under a second';
}

/* ── check the sources exist before asking for anything ─────────────────── */
const missing = PAGES.filter(p => !existsSync(resolve(p.file)));
if (missing.length) {
  console.error('\n✖ Missing source file(s):');
  missing.forEach(p => console.error(`    ${p.file}   (tab: ${p.label})`));
  console.error('\n  Fix the filename in PAGES at the top of this script, or add the file.\n');
  process.exit(1);
}

const envPw = process.env.MAANA_MAP_PASSWORD;
const pass  = envPw || await askHidden('Passphrase for the published dashboards: ');
if (!pass || pass.length < MIN) { console.error(`\n✖ Use at least ${MIN} characters.\n`); process.exit(1); }
if (!envPw) {
  const again = await askHidden('Confirm passphrase: ');
  if (again !== pass) { console.error('\n✖ Passphrases did not match.\n'); process.exit(1); }
}
if (pass.length < 12) {
  console.log(`\n  Note: ${pass.length} characters. The ciphertext is public, so someone who`);
  console.log(`  downloads it could try passphrases offline — roughly ${crackEstimate(pass)} on one GPU.`);
  console.log(`  This now covers subscriber emails and revenue, so it is worth lengthening.`);
  console.log(`  A word-phrase like "kiyomizu-cedar-tub" is centuries at the same effort.\n`);
}

/* ── encrypt each page against one shared key ───────────────────────────── */
const salt = crypto.randomBytes(16);
const key  = crypto.pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
const b64  = b => b.toString('base64');
let totalIn = 0;

const redactionLog = [];
const payload = PAGES.map(p => {
  let src = readFileSync(resolve(p.file), 'utf8');
  if (REDACTIONS[p.id]) {
    const r = REDACTIONS[p.id](src);
    src = r.html;
    if (r.steps?.length) redactionLog.push(`${p.label}: ${r.steps.join(', ')}`);
  }
  const plain = Buffer.from(src, 'utf8');
  totalIn += plain.length;
  const iv = crypto.randomBytes(12);
  const c  = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return { id: p.id, label: p.label, note: p.note, iv: b64(iv), ct: b64(ct), kb: Math.round(plain.length / 1024) };
});

/* ── the hub ────────────────────────────────────────────────────────────── */
const tabs = payload.map((p, i) =>
  `<button class="tab${i ? '' : ' on'}" data-id="${p.id}">${p.label}</button>`).join('');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Maana — Marketing</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:#faf5ea;color:#1a1714;overflow:hidden}

/* ── gate ── */
.gate-wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.gate{width:100%;max-width:396px;text-align:center}
.mark{font-family:'Cormorant Garamond',Georgia,serif;font-size:23px;letter-spacing:.44em;text-transform:uppercase;margin-bottom:38px;font-weight:400}
.gate h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:33px;font-weight:400;line-height:1.1;margin-bottom:9px}
.sub{font-size:13px;color:#8b8074;line-height:1.55;margin-bottom:12px}
.contents{font-size:11.5px;color:#a89e90;line-height:1.7;margin-bottom:26px}
form{display:flex;flex-direction:column;gap:10px}
input{font-family:inherit;font-size:14.5px;padding:13px 15px;border:1px solid #d9cfb8;background:#f1e9d8;color:#1a1714;border-radius:2px;width:100%;text-align:center;letter-spacing:.06em;transition:border-color .18s}
input:focus{outline:none;border-color:#b3744a;background:#f6efe2}
.gate button{font-family:inherit;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:13px 15px;border:0;background:#1a1714;color:#f1e9d8;border-radius:2px;cursor:pointer;transition:background .18s}
.gate button:hover{background:#3a332c}
.gate button:disabled{opacity:.55;cursor:default}
.msg{font-size:12px;min-height:18px;margin-top:14px;letter-spacing:.02em}
.msg.err{color:#b3564a}.msg.busy{color:#8b8074}
.foot{margin-top:34px;font-size:10.5px;color:#a89e90;line-height:1.6}

/* ── app ── */
#app{display:none;height:100%;flex-direction:column}
#app.on{display:flex}
.topnav{flex:0 0 auto;display:flex;align-items:center;gap:26px;padding:0 22px;height:54px;background:#1a1714;border-bottom:1px solid #000}
.topnav .wm{font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;letter-spacing:.4em;text-transform:uppercase;color:#f1e9d8;flex:0 0 auto}
.tabs{display:flex;gap:2px;flex:1 1 auto;min-width:0;overflow-x:auto}
.tab{font-family:inherit;font-size:12.5px;letter-spacing:.04em;padding:8px 15px;border:0;border-radius:2px;background:transparent;color:#9c9285;cursor:pointer;white-space:nowrap;transition:all .16s}
.tab:hover{color:#f1e9d8;background:#2a251f}
.tab.on{background:#f1e9d8;color:#1a1714}
.note{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6d655a;flex:0 0 auto;white-space:nowrap}
@media(max-width:760px){.note{display:none}.topnav{gap:14px;padding:0 12px}}
#frame{flex:1 1 auto;width:100%;border:0;background:#faf5ea}
#load{position:absolute;inset:54px 0 0 0;display:none;align-items:center;justify-content:center;background:#faf5ea;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b8074}
#load.on{display:flex}
</style>
</head>
<body>

<div class="gate-wrap" id="gateWrap">
  <div class="gate">
    <div class="mark">Maana</div>
    <h1>Marketing</h1>
    <p class="sub">These pages are encrypted. Enter the passphrase shared by the team.</p>
    <p class="contents">${payload.map(p => p.label).join(' &nbsp;·&nbsp; ')}</p>
    <form id="f">
      <input id="pw" type="password" placeholder="Passphrase" autocomplete="current-password" autofocus>
      <button id="go" type="submit">Open</button>
    </form>
    <div class="msg" id="m"></div>
    <div class="foot">Internal working documents · Maana Japan</div>
  </div>
</div>

<div id="app">
  <header class="topnav">
    <span class="wm">Maana</span>
    <div class="tabs">${tabs}</div>
    <span class="note" id="note"></span>
  </header>
  <iframe id="frame" title="Dashboard"></iframe>
</div>
<div id="load">Decrypting…</div>

<script>
const SALT="${b64(salt)}", ITER=${ITER};
const P=${JSON.stringify(payload.map(p => ({ id: p.id, label: p.label, note: p.note, iv: p.iv, ct: p.ct })))};
const bin=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const cache={};
let KEY=null;

const m=document.getElementById('m'), go=document.getElementById('go');
const app=document.getElementById('app'), frame=document.getElementById('frame');
const load=document.getElementById('load'), note=document.getElementById('note');

async function decrypt(id){
  if(cache[id]) return cache[id];
  const p=P.find(x=>x.id===id);
  const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:bin(p.iv)},KEY,bin(p.ct));
  return cache[id]=new TextDecoder().decode(out);
}

async function show(id){
  const p=P.find(x=>x.id===id);
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.id===id));
  note.textContent=p.note||'';
  if(!cache[id]){ load.classList.add('on'); }
  try{
    const html=await decrypt(id);
    frame.srcdoc=html;
    document.title='Maana — '+p.label;
    location.hash=id;
  }finally{ load.classList.remove('on'); }
}

document.getElementById('f').addEventListener('submit',async e=>{
  e.preventDefault();
  const pw=document.getElementById('pw').value;
  if(!pw) return;
  go.disabled=true; m.className='msg busy'; m.textContent='Decrypting…';
  try{
    const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
    KEY=await crypto.subtle.deriveKey({name:'PBKDF2',salt:bin(SALT),iterations:ITER,hash:'SHA-256'},
      km,{name:'AES-GCM',length:256},false,['decrypt']);
    const start=(location.hash||'').replace('#','');
    const first=P.some(x=>x.id===start)?start:P[0].id;
    await decrypt(first);                      // proves the passphrase before switching views
    document.getElementById('gateWrap').style.display='none';
    app.classList.add('on');
    await show(first);
  }catch(err){
    KEY=null; go.disabled=false;
    m.className='msg err'; m.textContent='That passphrase is not right.';
    document.getElementById('pw').select();
  }
});

document.querySelector('.tabs').addEventListener('click',e=>{
  const b=e.target.closest('.tab'); if(b) show(b.dataset.id);
});
</script>
</body>
</html>
`;

mkdirSync(resolve(OUTDIR), { recursive: true });
writeFileSync(resolve(OUTDIR, 'index.html'), page);

/* ── leave the old /journey/ link working ───────────────────────────────── */
mkdirSync(resolve('journey'), { recursive: true });
writeFileSync(resolve('journey', 'index.html'),
`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=../maana-marketing/#journey">
<title>Moved</title></head>
<body style="font-family:system-ui;background:#faf5ea;color:#5a524a;padding:60px;text-align:center">
This has moved to <a href="../maana-marketing/#journey" style="color:#b3744a">maana-marketing</a>.
</body></html>`);

const kb = n => Math.round(n / 1024) + ' KB';
console.log(`
✓ Encrypted ${payload.length} dashboards  ·  ${kb(totalIn)} in, ${kb(Buffer.byteLength(page))} out
  ${resolve(OUTDIR, 'index.html')}
  AES-256-GCM · PBKDF2-SHA256 · ${ITER.toLocaleString()} rounds
${payload.map(p => `    · ${p.label.padEnd(14)} ${String(p.kb).padStart(4)} KB`).join('\n')}
  /journey/ now redirects here.`);

if (redactionLog.length) {
  console.log('\n  Redacted before publishing (your local files are untouched):');
  redactionLog.forEach(l => console.log(`    · ${l}`));
}

if (!process.env.MAANA_IN_WRAPPER) console.log(`
  Next:
    git add ${OUTDIR}/ journey/ .gitignore publish-maana-marketing.mjs publish.sh
    git commit -m "Publish marketing dashboards"
    git push

  Live in 2–5 min at:
    ${SITE}
`);
else console.log('');
