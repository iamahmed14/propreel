// GET /api/image?url=<photo>
// Same-origin image proxy, so listing photos can be drawn on a <canvas> and
// recorded (cross-origin images without CORS headers would "taint" it).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX = 15 * 1024 * 1024;

function badHost(h) {
  return !h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || /\.(local|internal)$/.test(h);
}

module.exports = async (req, res) => {
  let u;
  try { u = new URL(String(req.query.url || "")); } catch { return res.status(400).end("bad url"); }
  if (!/^https?:$/.test(u.protocol) || badHost(u.hostname)) return res.status(400).end("bad url");
  // Many CDNs check the referer: send the portal's own home page.
  const site = u.hostname.split(".").slice(-2).join(".");
  let r;
  try {
    r = await fetch(u.href, { signal: AbortSignal.timeout(12000), headers: { "user-agent": UA, referer: `https://www.${site}/`, accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
  } catch { return res.status(502).end("fetch failed"); }
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.startsWith("image/")) return res.status(502).end("not an image");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX) return res.status(413).end("too large");
  res.setHeader("content-type", type);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "public, max-age=86400, s-maxage=604800");
  return res.status(200).send(buf);
};
