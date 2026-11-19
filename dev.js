// Local dev server: serves the static app and the two API functions the same
// way Vercel does.  Usage: node dev.js  →  http://localhost:3000
const http = require("http"), fs = require("fs"), path = require("path"), { URL } = require("url");
const listing = require("./api/listing.js"), image = require("./api/image.js");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  req.query = Object.fromEntries(u.searchParams);
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  res.send = (b) => res.end(b);
  if (u.pathname === "/api/listing") return listing(req, res);
  if (u.pathname === "/api/image") return image(req, res);
  const file = path.join(__dirname, u.pathname === "/" ? "index.html" : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
}).listen(PORT, () => console.log(`PropReel on http://localhost:${PORT}`));
