#!/usr/bin/env node
/**
 * publish-journey-map.mjs — Maana
 *
 * Encrypts maana-journey-map.html with a passphrase and writes a self-contained
 * password-gated page to journey/index.html, ready to push to GitHub Pages.
 *
 * GitHub only ever receives ciphertext. Nothing readable is published.
 *
 *   node publish-journey-map.mjs
 *   node publish-journey-map.mjs --in some-other.html --out docs/index.html
 *
 * Requires Node 16+. No dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

const ITER = 250000;                       // PBKDF2 rounds — matches the browser side
const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d; };

const IN   = resolve(argOf('--in',  'maana-journey-map.html'));
const OUT  = resolve(argOf('--out', 'journey/index.html'));
const TITLE = argOf('--title', 'Maana — Guest Journey Map');

/* ── read the passphrase without echoing it ── */
function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = c => {
      c = c + '';
      if (['\n', '\r', ''].includes(c)) { process.stdin.removeListener('data', onData); return; }
      process.stdout.clearLine(0); process.stdout.cursorTo(0);
      process.stdout.write(q + '*'.repeat(rl.line.length));
    };
    process.stdin.on('data', onData);
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}

const MIN = 5;

/* Rough offline-cracking estimate, so the trade-off is visible rather than nagged about.
   Assumes one high-end GPU at ~40,000 PBKDF2(250k rounds) guesses/sec. */
function crackEstimate(pw) {
  let space = 0;
  if (/[a-z]/.test(pw)) space += 26;
  if (/[A-Z]/.test(pw)) space += 26;
  if (/[0-9]/.test(pw)) space += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) space += 20;
  const combos = Math.pow(space || 26, pw.length) / 2;      // average case
  const secs = combos / 40000;
  const units = [[31536000,'years'],[86400,'days'],[3600,'hours'],[60,'minutes'],[1,'seconds']];
  for (const [d, n] of units) {
    if (secs >= d) { const v = secs / d; return (v > 1e6 ? '>1,000,000' : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()) + ' ' + n; }
  }
  return 'under a second';
}

const envPw = process.env.MAANA_MAP_PASSWORD;
const pass  = envPw || await askHidden('Passphrase for the published map: ');
if (!pass || pass.length < MIN) {
  console.error(`\n✖ Use at least ${MIN} characters.\n`);
  process.exit(1);
}
if (!envPw) {
  const again = await askHidden('Confirm passphrase: ');
  if (again !== pass) { console.error('\n✖ Passphrases did not match.\n'); process.exit(1); }
}

const est = crackEstimate(pass);
if (pass.length < 12) {
  console.log(`\n  Note: ${pass.length} characters. The ciphertext is public, so someone who`);
  console.log(`  downloads it could try passphrases offline — roughly ${est} on one GPU.`);
  console.log(`  Fine for a link you're handing to colleagues; worth lengthening if it spreads.`);
  console.log(`  A word-phrase like "kiyomizu-cedar-tub" is centuries at the same effort.\n`);
}

/* ── encrypt ── */
const plaintext = readFileSync(IN);
const salt = crypto.randomBytes(16);
const iv   = crypto.randomBytes(12);
const key  = crypto.pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
const c    = crypto.createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([c.update(plaintext), c.final()]);
const ct   = Buffer.concat([body, c.getAuthTag()]);   // Web Crypto expects the tag appended

const b64 = b => b.toString('base64');

/* ── the gate page ── */
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${TITLE}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  background:#faf5ea;color:#1a1714;min-height:100vh;
  display:flex;align-items:center;justify-content:center;padding:24px;
}
.gate{width:100%;max-width:396px;text-align:center}
.mark{font-family:'Cormorant Garamond',Georgia,serif;font-size:23px;letter-spacing:.44em;
  text-transform:uppercase;margin-bottom:38px;font-weight:400}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:33px;font-weight:400;line-height:1.1;margin-bottom:9px}
.sub{font-size:13px;color:#8b8074;line-height:1.55;margin-bottom:28px}
form{display:flex;flex-direction:column;gap:10px}
input{
  font-family:inherit;font-size:14.5px;padding:13px 15px;border:1px solid #d9cfb8;
  background:#f1e9d8;color:#1a1714;border-radius:2px;width:100%;text-align:center;
  letter-spacing:.06em;transition:border-color .18s;
}
input:focus{outline:none;border-color:#b3744a;background:#f6efe2}
button{
  font-family:inherit;font-size:12px;letter-spacing:.16em;text-transform:uppercase;
  padding:13px 15px;border:0;background:#1a1714;color:#f1e9d8;border-radius:2px;cursor:pointer;
  transition:background .18s;
}
button:hover{background:#3a332c}
button:disabled{opacity:.55;cursor:default}
.msg{font-size:12px;min-height:18px;margin-top:14px;letter-spacing:.02em}
.msg.err{color:#b3564a}
.msg.busy{color:#8b8074}
.foot{margin-top:34px;font-size:10.5px;color:#a89e90;line-height:1.6}
</style>
</head>
<body>
<div class="gate">
  <div class="mark">Maana</div>
  <h1>Guest Journey Map</h1>
  <p class="sub">This page is encrypted. Enter the passphrase shared by the team to open it.</p>
  <form id="f">
    <input id="pw" type="password" placeholder="Passphrase" autocomplete="current-password" autofocus>
    <button id="go" type="submit">Open</button>
  </form>
  <div class="msg" id="m"></div>
  <div class="foot">Internal working document · Maana Japan</div>
</div>
<script>
const D={s:"${b64(salt)}",i:"${b64(iv)}",c:"${b64(ct)}",n:${ITER}};
const b=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const m=document.getElementById('m'),go=document.getElementById('go');
document.getElementById('f').addEventListener('submit',async e=>{
  e.preventDefault();
  const pw=document.getElementById('pw').value;
  if(!pw)return;
  go.disabled=true; m.className='msg busy'; m.textContent='Decrypting…';
  try{
    const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:b(D.s),iterations:D.n,hash:'SHA-256'},
      km,{name:'AES-GCM',length:256},false,['decrypt']);
    const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:b(D.i)},key,b(D.c));
    const html=new TextDecoder().decode(out);
    document.open(); document.write(html); document.close();
  }catch(err){
    go.disabled=false; m.className='msg err'; m.textContent='That passphrase is not right.';
    document.getElementById('pw').select();
  }
});
</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page);

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`
✓ Encrypted  ·  ${kb(plaintext.length)} in, ${kb(Buffer.byteLength(page))} out
  ${OUT}
  AES-256-GCM · PBKDF2-SHA256 · ${ITER.toLocaleString()} rounds`);

if (!process.env.MAANA_IN_WRAPPER) console.log(`
  Next:
    git add journey/ .gitignore publish-journey-map.mjs
    git commit -m "Update journey map"
    git push

  Live in 2–5 min at:
    https://viola-creator.github.io/journey/
`);
else console.log('');
