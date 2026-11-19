// node test/extract.test.js — checks the extractor against trimmed copies of
// real Property Finder, Bayut and dubizzle page data (captured Nov 2026).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require("../extract.js");
const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const page = ({ ld, next, ogTitle = "", ogDesc = "" }) =>
  `<html><head><meta property="og:title" content="${ogTitle}"><meta property="og:description" content="${ogDesc}">` +
  (ld ? `<script type="application/ld+json">${ld}</script>` : "") + `</head><body>` +
  (next ? `<script id="__NEXT_DATA__" type="application/json">${next}</script>` : "") + `</body></html>`;

let n = 0;
function check(name, got, want) {
  for (const k in want) assert.deepStrictEqual(got[k], want[k], `${name}: ${k} = ${JSON.stringify(got[k])}`);
  n++; console.log("ok", name);
}

check("Property Finder", E.fromHtml(page({ next: fx("pf.json") }), "https://www.propertyfinder.ae/en/plp/rent/x-164581923.html"),
  { source: "Property Finder", status: "FOR RENT", price: 350000, period: "year", beds: "2", baths: "3", sqft: 1550,
    building: "Al Nabat", area: "Palm Jumeirah", agent: "Alex Morgan", agency: "Example Homes" });

check("Bayut", E.fromHtml(page({ ld: fx("bayut.json") }), "https://www.bayut.com/property/details-17195135.html"),
  { source: "Bayut", status: "FOR RENT", price: 39999, beds: "Studio", baths: "1", sqft: 399, building: "Bloom Heights 1",
    area: "Jumeirah Village Circle", agent: "Sam Rahman", agency: "Sample Realty", phone: "+971 50 000 0001",
    photos: ["https://images.bayut.com/thumbnails/880149740-1066x800.jpeg", "https://images.bayut.com/thumbnails/880149741-1066x800.jpeg"] });

check("dubizzle", E.fromHtml(page({ ld: fx("dbz.json") }), "https://dubai.dubizzle.com/property-for-rent/x/"),
  { source: "dubizzle", price: 261000, beds: "3", baths: "4", sqft: 1723, building: "Forte 1", area: "Downtown Dubai",
    agent: "Omar Haddad", agency: "Demo Properties" });

check("Open Graph only", E.fromHtml(page({ ogTitle: "Villa for sale", ogDesc: "4 beds, 5 baths, 3,200 sqft villa for sale at Saheel, Arabian Ranches for AED 6,500,000, listed by Allsopp &amp; Allsopp" }), "https://example.com/l/1"),
  { status: "FOR SALE", price: 6500000, beds: "4", baths: "5", sqft: 3200, type: "Villa", building: "Saheel", area: "Arabian Ranches", agency: "Allsopp & Allsopp" });

check("Pasted text", E.fromText("FOR RENT | 1 Bedroom in Marina Gate 2, Dubai Marina\nAED 115k per year\n1 Bed | 2 Baths | 75 sqm\nAgent: Sara Malik\nCall 050 123 4567"),
  { status: "FOR RENT", price: 115000, period: "year", beds: "1", baths: "2", sqft: 807, area: "Dubai Marina", agent: "Sara Malik" });

console.log(`\n${n} passed`);
