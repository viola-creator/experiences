/**
 * redactions.mjs — Maana
 *
 * Transforms applied to a page's HTML *on the way to publication only*.
 * Your local source files are never touched.
 *
 * Keyed by the `id` in PAGES. Each function takes the source HTML and returns
 * the version that gets encrypted and pushed.
 *
 * To publish a page unredacted, delete or comment out its entry here.
 */

export const REDACTIONS = {

  /* ── Annex list: strip subscriber email addresses ──────────────────────────
     The team needs the segments, the counts and the "stayed" reading.
     They don't need 107 live addresses in a link that could be forwarded.
     Emailing anyone still happens in MailChimp, from your local copy.        */
  annex(html) {
    const steps = [];

    // 1. Blank every address in the data array. Structure and key order stay
    //    intact so nothing downstream has to change.
    let n = 0;
    html = html.replace(/("email":\s*)"(?:[^"\\]|\\.)*"/g, (_, k) => { n++; return k + '""'; });
    steps.push(`${n} addresses blanked`);

    // 2. Don't render an empty mailto anchor for a blank address.
    const before = html;
    html = html.replace(
      '<div class="meta"><a href="mailto:${esc(x.email)}">${hl(x.email)}</a>',
      '<div class="meta">${x.email?`<a href="mailto:${esc(x.email)}">${hl(x.email)}</a>`:``}'
    );
    if (html !== before) steps.push('mailto links removed');

    // 3. Remove the Copy emails button, and guard the handler that binds to it
    //    so the rest of the page's script keeps running.
    const b2 = html;
    html = html.replace(/<button class="act" id="copy">[^<]*<\/button>/, '');
    html = html.replace(/document\.getElementById\((["'])copy\1\)/g,
                        '(document.getElementById($1copy$1)||{})');
    if (html !== b2) steps.push('Copy emails button removed');

    // 4. Drop the email column from the CSV export.
    const b3 = html;
    html = html.replace('const cols=["name","email",', 'const cols=["name",');
    if (html !== b3) steps.push('email column dropped from CSV');

    // 5. Fix the intro sentence that explains the removed button.
    html = html.replace(
      /<strong>Copy emails<\/strong> copies whoever is showing\.\s*/,
      'Email addresses are held back from this shared copy — ask Viola if you need to reach someone. '
    );

    return { html, steps };
  }

};
