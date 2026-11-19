/* PropReel extractor.
 * Turns a property listing page into one normalised object. Runs in three places:
 *   - the browser app (pasted text),
 *   - the serverless function api/listing.js (fetched HTML),
 *   - the "Import to PropReel" bookmarklet (the live page DOM).
 * No dependencies, no AI: structured data first (Property Finder's Next.js
 * payload, schema.org JSON-LD used by Bayut / dubizzle and many other portals,
 * Open Graph tags), then pattern rules on the description text.
 */
(function (root) {
  "use strict";

  var COMMUNITIES = [
    "Dubai Marina","Jumeirah Village Circle","JVC","Jumeirah Village Triangle","JVT","Downtown Dubai","Business Bay",
    "Dubai Silicon Oasis","Jumeirah Lake Towers","JLT","Palm Jumeirah","Arabian Ranches","Dubai Hills Estate","Dubai Hills",
    "Al Barsha","Jumeirah Beach Residence","JBR","Dubai Creek Harbour","Mohammed Bin Rashid City","MBR City","Meydan",
    "Dubai Sports City","Motor City","International City","Al Furjan","Town Square","Damac Hills","DAMAC Hills 2",
    "Dubai South","Discovery Gardens","Al Nahda","Mirdif","Deira","Bur Dubai","Al Qusais","Dubailand",
    "City Walk","Bluewaters","Emaar Beachfront","Dubai Harbour","DIFC","Sobha Hartland","Al Jaddaf","Culture Village",
    "Arjan","Al Warqa","Remraam","The Springs","The Meadows","The Greens","The Views","Emirates Hills",
    "Jumeirah Golf Estates","Tilal Al Ghaf","Arabian Ranches 2","Arabian Ranches 3","Mudon","Jumeirah Park",
    "Al Reem Island","Yas Island","Saadiyat Island","Al Raha Beach","Al Majaz","Aljada","Muwaileh","Al Khan",
  ];

  // [match (lowercase), display label, priority (lower shows first)]
  var FEATURES = [
    ["private pool","Private pool",1],["burj khalifa","Burj Khalifa view",2],["burj view","Burj Khalifa view",2],
    ["sea view","Sea view",2],["marina view","Marina view",2],["golf view","Golf course view",2],["landmark view","Landmark view",3],
    ["beach access","Beach access",2],["private garden","Private garden",3],["garden","Garden",6],
    ["balcony","Balcony",4],["terrace","Terrace",4],["maid","Maid's room",4],["study","Study room",5],["walk-in","Walk-in closet",5],
    ["built-in wardrobe","Built-in wardrobes",6],["upgraded","Upgraded unit",4],["furnished","Furnished",3],
    ["unfurnished","Unfurnished",3],["high floor","High floor",4],["vacant","Vacant",5],["chiller free","Chiller free",4],
    ["central a/c","Central A/C",7],["centrally air","Central A/C",7],["shared pool","Swimming pool",5],
    ["swimming pool","Swimming pool",5],["pool","Swimming pool",6],["private gym","Private gym",4],["gym","Gym",6],
    ["covered parking","Covered parking",6],["parking","Parking",7],["kids play","Kids' play area",7],
    ["children's play","Kids' play area",7],["barbeque","BBQ area",8],["barbecue","BBQ area",8],["sauna","Sauna",8],
    ["jacuzzi","Jacuzzi",8],["steam room","Steam room",9],["concierge","Concierge",7],["security","24/7 security",9],
    ["pets allowed","Pet friendly",6],["pet friendly","Pet friendly",6],["metro","Near the metro",6],
    ["storage room","Storage room",8],["laundry","Laundry room",8],
  ];

  /* ---------------- helpers ---------------- */
  function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
  function typesOf(n) { return arr(n && n["@type"]).map(function (t) { return String(t).toLowerCase(); }); }
  // case-insensitive property lookup (dubizzle writes "Image", "floorsize")
  function get(o, key) {
    if (!o || typeof o !== "object") return undefined;
    if (key in o) return o[key];
    var lk = key.toLowerCase();
    for (var k in o) if (k.toLowerCase() === lk) return o[k];
    return undefined;
  }
  function num(x) {
    if (x == null) return null;
    if (typeof x === "object") x = get(x, "value");
    var n = parseFloat(String(x).replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }
  function clean(s) { return s == null ? "" : String(s).replace(/\s+/g, " ").trim(); }
  function decodeEntities(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  }
  function dropParens(s) { return clean(String(s || "").replace(/\s*\([^)]*\)\s*$/, "")); }
  function uniq(list) { var seen = {}; return list.filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }); }

  function formatPhone(p) {
    var d = String(p || "").replace(/[^\d+]/g, "");
    if (!d) return "";
    if (/^\+?971/.test(d)) {
      var rest = d.replace(/^\+?971/, "");
      if (/^5\d{8}$/.test(rest)) return "+971 " + rest.slice(0, 2) + " " + rest.slice(2, 5) + " " + rest.slice(5);
      if (/^\d{8}$/.test(rest)) return "+971 " + rest[0] + " " + rest.slice(1, 4) + " " + rest.slice(4);
    }
    return p;
  }

  function rankFeatures(names, text) {
    var found = {};
    function consider(str) {
      var lo = " " + String(str).toLowerCase() + " ";
      for (var i = 0; i < FEATURES.length; i++) {
        var f = FEATURES[i];
        if (lo.indexOf(f[0]) !== -1) {
          if (f[1] === "Furnished" && /unfurnished/.test(lo)) continue;
          if (!(f[1] in found) || found[f[1]] > f[2]) found[f[1]] = f[2];
          break; // one label per amenity name
        }
      }
    }
    arr(names).forEach(consider);
    if (text) {
      var lo = String(text).toLowerCase();
      FEATURES.forEach(function (f) {
        if (lo.indexOf(f[0]) !== -1 && !(f[1] in found)) {
          if (f[1] === "Furnished" && lo.indexOf("unfurnished") !== -1) return;
          found[f[1]] = f[2] + 0.5;
        }
      });
    }
    var out = Object.keys(found).sort(function (a, b) { return found[a] - found[b]; });
    // drop weaker duplicates
    function drop(weak, strong) { if (out.indexOf(strong) !== -1) out = out.filter(function (x) { return x !== weak; }); }
    drop("Parking", "Covered parking"); drop("Swimming pool", "Private pool"); drop("Gym", "Private gym");
    drop("Garden", "Private garden"); drop("Furnished", "Unfurnished"); drop("Landmark view", "Burj Khalifa view");
    return out.slice(0, 8);
  }

  /* ---------------- free-text rules (used for pasted text and as a fallback) ---------------- */
  function fromText(raw) {
    var t = String(raw || "").replace(/ /g, " ");
    var o = {}, m;
    if (/\b(for rent|to rent|rental|per year|yearly|per annum|annual(ly)?|cheques?)\b/i.test(t)) o.status = "FOR RENT";
    if (/\b(for sale|selling price|asking price|off[- ]plan|handover|payment plan)\b/i.test(t)) o.status = /off[- ]plan/i.test(t) ? "OFF-PLAN" : "FOR SALE";

    m = t.match(/(?:AED|Dhs?\.?)\s*([\d][\d,\.]*\s*(?:k|m|million|mn)?)(?![\w])/i) || t.match(/([\d][\d,\.]*\s*(?:k|m|million|mn)?)\s*(?:AED|Dhs?\b)/i);
    if (m) {
      var s = m[1].trim().toLowerCase(), v = parseFloat(s.replace(/,/g, ""));
      var unit = s.replace(/[\d,\.\s]/g, "");
      if (/^(m|million|mn)$/.test(unit)) v *= 1e6; else if (unit === "k") v *= 1e3;
      if (v > 0) { o.price = Math.round(v); o.currency = "AED"; }
    }
    if (/per year|yearly|\/\s*year|per annum|annual/i.test(t)) o.period = "year";
    else if (/per month|monthly|\/\s*month/i.test(t)) o.period = "month";
    if (!o.status && o.period) o.status = "FOR RENT";

    if (/\bstudio\b/i.test(t)) o.beds = "Studio";
    else if ((m = t.match(/(\d+)\s*(?:\+\s*maid'?s?\s*)?(?:-|\s)?(?:bed(?:room)?s?|br|bhk)\b/i))) o.beds = m[1];
    if ((m = t.match(/(\d+)\s*(?:-|\s)?(?:bath(?:room)?s?|ba)\b/i))) o.baths = m[1];
    if ((m = t.match(/([\d][\d,\.]*)\s*(?:sq\.?\s*ft|sqft|square\s*feet|ft²|ft2)/i))) o.sqft = Math.round(num(m[1]));
    else if ((m = t.match(/([\d][\d,\.]*)\s*(?:sq\.?\s*m\b|sqm|m²|square\s*met)/i))) o.sqft = Math.round(num(m[1]) * 10.7639);

    var types = ["Penthouse","Townhouse","Villa","Duplex","Hotel Apartment","Apartment","Office","Retail","Warehouse","Land"];
    for (var i = 0; i < types.length; i++) if (new RegExp("\\b" + types[i] + "\\b", "i").test(t)) { o.type = types[i]; break; }
    if (!o.type && /\bflat\b/i.test(t)) o.type = "Apartment";

    var hits = COMMUNITIES.filter(function (c) {
      return new RegExp("\\b" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(t);
    }).sort(function (a, b) { return b.length - a.length; });
    if (hits.length) o.area = hits[0];

    // "... for rent at Forte, Downtown Dubai for AED ..." (Bayut / dubizzle summaries)
    if ((m = t.match(/\bfor (?:rent|sale) (?:at|in) ([^,\n]{2,50}),\s*([^,\n]{2,50}?)\s+for\s/i))) { o.building = clean(m[1]); o.area = o.area || clean(m[2]); }
    else if ((m = t.match(/(?:building|tower|project)\s*[:\-]\s*([^\n,|]{2,40})/i))) o.building = clean(m[1]);
    else if ((m = t.match(/\b(?:in|at)\s+([A-Z][\w'&\-]*(?:\s+[A-Z0-9][\w'&\-]*){0,3})/))) {
      var cand = clean(m[1]);
      if (!o.area || cand.toLowerCase() !== o.area.toLowerCase()) o.building = cand;
    }

    if ((m = t.match(/(?:[Aa]gent|[Cc]ontact|[Cc]all|[Bb]roker)[ \t]*[:\-]?[ \t]*([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,2})/))) o.agent = m[1];
    if ((m = t.match(/(?:agency|brokerage|company)\s*[:\-]\s*([^\n|]{2,50})/i))) o.agency = clean(m[1]);
    else if ((m = t.match(/listed by ([A-Z][^\n.,]{2,50})/))) o.agency = clean(m[1]);
    else if ((m = t.match(/\b([A-Z][\w&]*(?:\s+[A-Z][\w&]*){0,3}\s+(?:Real Estate|Properties|Property Management|Realty|Homes))\b/))) o.agency = m[1];
    if ((m = t.match(/(\+?971[\s\-]?\d{1,2}[\s\-]?\d{3}[\s\-]?\d{4}|\b05\d[\s\-]?\d{3}[\s\-]?\d{4})/))) o.phone = formatPhone(m[1]);

    var feats = rankFeatures([], t);
    if (feats.length) o.features = feats;
    return o;
  }

  /* ---------------- structured sources ---------------- */

  // Property Finder: Next.js page props
  function fromPropertyFinder(next) {
    var pr = next && next.props && next.props.pageProps && next.props.pageProps.propertyResult;
    var p = pr && (pr.property || pr);
    if (!p || !p.price) return null;
    var o = { source: "Property Finder" };
    o.title = clean(p.title);
    o.price = num(p.price.value); o.currency = p.price.currency || "AED";
    o.period = /year/i.test(p.price.period) ? "year" : /month/i.test(p.price.period) ? "month" : /week/i.test(p.price.period) ? "week" : "";
    o.status = /rent/i.test(p.offering_type || "") || o.period ? "FOR RENT" : "FOR SALE";
    o.type = clean(p.property_type);
    o.beds = /studio/i.test(String(p.bedrooms)) || p.bedrooms_value === 0 ? "Studio" : String(p.bedrooms_value != null ? p.bedrooms_value : p.bedrooms || "");
    o.baths = String(p.bathrooms_value != null ? p.bathrooms_value : p.bathrooms || "");
    if (p.size) o.sqft = /m/i.test(p.size.unit) && !/ft/i.test(p.size.unit) ? Math.round(num(p.size.value) * 10.7639) : num(p.size.value);
    var loc = p.location || {};
    var path = String(loc.path_name || "").split(",").map(clean).filter(Boolean); // "Dubai, Palm Jumeirah, Shoreline Apartments"
    o.building = clean(loc.name);
    o.area = path[1] || path[0] || "";
    if (o.area === o.building) o.area = path[0] || "";
    var imgs = p.images && p.images.property;
    o.photos = arr(imgs).map(function (i) { return i && (i.full || i.medium || i.url); }).filter(Boolean);
    o.agent = clean(p.agent && p.agent.name);
    o.agency = clean(p.broker && p.broker.name).replace(/\s+-\s+.*$/, "");
    var co = arr(p.contact_options), wa = co.filter(function (c) { return c.type === "whatsapp" && c.value; })[0],
        ph = co.filter(function (c) { return c.type === "phone" && c.value; })[0];
    o.phone = formatPhone((wa || ph || {}).value || "");
    o.description = clean(p.description);
    var amen = arr(p.amenities).map(function (a) { return typeof a === "string" ? a : a && (a.name || a.title); });
    o.features = rankFeatures(amen, o.title + " " + o.description + (p.furnished === "YES" ? " furnished" : ""));
    return o;
  }

  // schema.org JSON-LD (Bayut, dubizzle, many other portals)
  function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(function (n) { walk(n, visit); }); return; }
    visit(node);
    for (var k in node) if (node[k] && typeof node[k] === "object") walk(node[k], visit);
  }
  var HOME_TYPES = ["apartment","house","singlefamilyresidence","residence","accommodation","room","villa","apartmentcomplex","realestatelisting"];

  function fromJsonLd(blocks) {
    var listing = null, home = null, breadcrumbs = [], offerNode = null, agentNode = null;
    blocks.forEach(function (b) {
      walk(b, function (n) {
        var ts = typesOf(n);
        if (ts.indexOf("realestatelisting") !== -1 && !listing) listing = n;
        if (ts.some(function (t) { return HOME_TYPES.indexOf(t) !== -1 && t !== "realestatelisting"; })
            && (get(n, "numberOfBedrooms") != null || get(n, "floorSize") != null || get(n, "image") || get(n, "priceSpecification"))) {
          if (!home || (get(n, "priceSpecification") && !get(home, "priceSpecification"))) home = n;
        }
        if (ts.indexOf("breadcrumblist") !== -1) breadcrumbs.push(n);
        if ((ts.indexOf("rentaction") !== -1 || ts.indexOf("buyaction") !== -1 || ts.indexOf("offer") !== -1) && get(n, "price") != null) offerNode = offerNode || n;
        if (ts.indexOf("realestateagent") !== -1) agentNode = agentNode || n;
      });
    });
    if (!listing && !home) return null;
    var h = home || get(listing, "mainEntity") || listing;
    var o = {};
    o.title = clean(get(listing || h, "name"));
    var ps = get(h, "priceSpecification") || get(listing || {}, "priceSpecification") || get(get(h, "offers") || {}, "priceSpecification");
    var offers = arr(get(h, "offers") || get(listing || {}, "offers"))[0];
    var priceSrc = ps || offers || offerNode;
    if (priceSrc) {
      o.price = num(get(priceSrc, "price")); o.currency = get(priceSrc, "priceCurrency") || "AED";
      var unit = String(get(priceSrc, "unitText") || get(get(priceSrc, "priceSpecification") || {}, "unitText") || "");
      o.period = /year/i.test(unit) ? "year" : /month/i.test(unit) ? "month" : /week/i.test(unit) ? "week" : /day/i.test(unit) ? "day" : "";
    }
    var ts = typesOf(h).concat(typesOf(offerNode));
    o.status = ts.indexOf("rentaction") !== -1 || o.period ? "FOR RENT" : ts.indexOf("buyaction") !== -1 || ts.indexOf("sellaction") !== -1 ? "FOR SALE" : "";
    o.type = clean(get(h, "accommodationCategory")) || "";
    var beds = get(h, "numberOfBedrooms"); if (beds == null) beds = get(h, "numberOfRooms");
    if (beds != null) o.beds = num(beds) === 0 ? "Studio" : String(num(beds));
    var baths = get(h, "numberOfBathroomsTotal"); if (baths == null) baths = get(h, "numberOfFullBathrooms");
    if (baths != null) o.baths = String(num(baths));
    var fs = get(h, "floorSize");
    if (fs) { var v = num(fs), u = String(get(fs, "unitText") || get(fs, "unitCode") || "sqft"); o.sqft = /mtk|sqm|m2|square met/i.test(u) ? Math.round(v * 10.7639) : v; }
    o.photos = uniq(arr(get(h, "image") || get(listing || {}, "image")).map(function (i) { return typeof i === "string" ? i : get(i, "url") || get(i, "contentUrl"); }));

    var addr = get(h, "address") || {};
    var crumbs = [];
    breadcrumbs.forEach(function (b) {
      arr(get(b, "itemListElement")).forEach(function (it) { crumbs.push({ name: clean(get(it, "name")), item: get(it, "item") }); });
    });
    // Location crumbs: drop "Home", the category crumb ("Apartments for rent in Dubai") and the listing itself
    var locs = crumbs.filter(function (c) {
      return c.name && c.item && !/^home|for (rent|sale)|^property finder$|^bayut|^dubizzle/i.test(c.name) && c.name !== o.title;
    }).map(function (c) { return c.name; });
    if (locs.length) {
      o.area = dropParens(locs[0]);
      if (locs.length > 1) o.building = dropParens(locs[locs.length - 1]);
    }
    if (!o.area) o.area = dropParens(get(addr, "addressLocality") || get(addr, "addressRegion"));

    var ag = get(h, "realEstateAgent") || get(listing || {}, "realEstateAgent") || get(offerNode || {}, "provider") || agentNode;
    if (ag) {
      o.agent = clean(get(ag, "name"));
      var org = get(ag, "memberOf") || get(ag, "parentOrganization") || get(ag, "worksFor");
      o.agency = clean(org && get(org, "name")).replace(/\s+-\s+.*$/, "");
      o.phone = formatPhone(get(ag, "telephone") || "");
    }
    o.description = clean(get(h, "description") || get(listing || {}, "description"));
    var amen = arr(get(h, "amenityFeature")).filter(function (a) { return !/false/i.test(String(get(a, "value"))); }).map(function (a) { return get(a, "name"); });
    o.features = rankFeatures(amen, o.title + " " + o.description);
    return o;
  }

  /* ---------------- merge + photo upgrades ---------------- */
  function upgradePhoto(u) {
    if (!u) return u;
    u = String(u).replace(/^\/\//, "https://");
    // Bayut thumbnails: 800x600 → 1066x800 (largest size the CDN serves)
    u = u.replace(/(images\.bayut\.com\/thumbnails\/\d+)-\d+x\d+\.(jpe?g|webp)/i, "$1-1066x800.$2");
    return u;
  }

  function merge(primary, rest) {
    var o = {};
    [primary].concat(rest).forEach(function (src) {
      if (!src) return;
      for (var k in src) {
        var v = src[k];
        var empty = v == null || v === "" || (Array.isArray(v) && !v.length);
        if (!empty && (o[k] == null || o[k] === "" || (Array.isArray(o[k]) && !o[k].length))) o[k] = v;
      }
    });
    return o;
  }

  function sourceName(url) {
    var h = "";
    try { h = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
    if (/propertyfinder\./.test(h)) return "Property Finder";
    if (/bayut\./.test(h)) return "Bayut";
    if (/dubizzle\./.test(h)) return "dubizzle";
    return h;
  }

  function finish(o, url) {
    o.url = url || o.url || "";
    o.source = o.source || sourceName(o.url);
    o.photos = uniq(arr(o.photos).map(upgradePhoto)).slice(0, 30);
    o.features = arr(o.features).slice(0, 8);
    if (o.beds === "0") o.beds = "Studio";
    ["sqft", "price"].forEach(function (k) { if (o[k] != null && o[k] !== "") o[k] = Math.round(num(o[k])); });
    if (o.type && /studio/i.test(o.type) && !o.beds) o.beds = "Studio";
    if (o.building && o.area && o.building.toLowerCase() === o.area.toLowerCase()) o.building = "";
    return o;
  }

  /* ---------------- entry points ---------------- */
  function fromParts(parts) {
    var pf = parts.next ? fromPropertyFinder(parts.next) : null;
    var ld = parts.ld && parts.ld.length ? fromJsonLd(parts.ld) : null;
    var og = parts.og || {};
    var ogText = [og.title, og.description].filter(Boolean).join("\n");
    var txt = fromText(ogText + "\n" + ((pf || ld || {}).description || ""));
    var o = merge(pf, [ld, txt]);
    if (!o.photos || !o.photos.length) o.photos = og.image ? [og.image] : [];
    if (!o.title) o.title = clean(og.title);
    o.found = !!(pf || ld) || !!(txt.price || txt.beds || txt.sqft);
    return finish(o, parts.url);
  }

  function partsFromHtml(html, url) {
    var ld = [], next = null, og = {}, m;
    var re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = re.exec(html))) { try { ld.push(JSON.parse(m[1].trim())); } catch (e) {} }
    m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) { try { next = JSON.parse(m[1]); } catch (e) {} }
    var mre = /<meta[^>]+(?:property|name)=["'](og:[a-z:]+)["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["'](og:[a-z:]+)["'][^>]*>/gi;
    while ((m = mre.exec(html))) {
      var key = (m[1] || m[4]).slice(3), val = decodeEntities(m[2] != null ? m[2] : m[3]);
      if (!(key in og)) og[key] = val;
    }
    return { ld: ld, next: next, og: og, url: url };
  }

  function partsFromDocument(doc) {
    var ld = [];
    [].forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'), function (s) { try { ld.push(JSON.parse(s.textContent)); } catch (e) {} });
    var next = null, nd = doc.getElementById("__NEXT_DATA__");
    if (nd) { try { next = JSON.parse(nd.textContent); } catch (e) {} }
    var og = {};
    [].forEach.call(doc.querySelectorAll('meta[property^="og:"],meta[name^="og:"]'), function (mt) {
      var k = (mt.getAttribute("property") || mt.getAttribute("name")).slice(3);
      if (!(k in og)) og[k] = mt.getAttribute("content");
    });
    return { ld: ld, next: next, og: og, url: doc.location ? doc.location.href : "" };
  }

  var api = {
    fromHtml: function (html, url) { return fromParts(partsFromHtml(html, url)); },
    fromDocument: function (doc) { return fromParts(partsFromDocument(doc)); },
    fromText: function (text) { return finish(fromText(text), ""); },
    formatPhone: formatPhone,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ListingExtract = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
