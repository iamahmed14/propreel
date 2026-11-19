// GET /api/listing?url=<listing page>
// Fetches a public listing page server-side (browsers can't, because of CORS),
// extracts the listing with ../extract.js and returns JSON. Photo URLs are
// rewritten to /api/image so the browser can draw them on a canvas.
const Extract = require("../extract.js");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function badHost(h) {
  return !h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || /\.(local|internal)$/.test(h);
}

module.exports = async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  let target;
  try { target = new URL(String(req.query.url || "").trim()); } catch { return res.status(400).json({ error: "bad_url" }); }
  if (!/^https?:$/.test(target.protocol) || badHost(target.hostname)) return res.status(400).json({ error: "bad_url" });

  let r, html;
  try {
    r = await fetch(target.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
    });
    html = await r.text();
  } catch (e) {
    return res.status(502).json({ error: "fetch_failed", detail: String(e && e.message) });
  }
  const challenge = /captcha|cf-chl|px-captcha|access denied|are you a robot|incapsula/i.test(html.slice(0, 20000)) && !/application\/ld\+json|__NEXT_DATA__/.test(html);
  if (!r.ok || challenge) return res.status(502).json({ error: "blocked", status: r.status });

  const listing = Extract.fromHtml(html, r.url || target.href);
  if (!listing.found) return res.status(422).json({ error: "no_listing" });
  listing.photosOriginal = listing.photos;
  listing.photos = listing.photos.map((u) => "/api/image?url=" + encodeURIComponent(u));
  res.setHeader("cache-control", "public, s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(listing);
};
