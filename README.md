# PropReel

Paste a Property Finder, Bayut or dubizzle link and get a 1080×1920 listing video for Instagram Reels, TikTok and YouTube Shorts. Works on phones and computers.

No AI, no API keys, no subscription. Video is rendered on the user's own device.

**Live demo:** _add your Vercel link here_

## How it works

1. **Import.** Paste a listing link (or the text shared from the portal app). A small serverless function fetches the public page and the extractor reads:
   - **Property Finder:** the Next.js page payload (`__NEXT_DATA__`)
   - **Bayut, dubizzle and many other portals:** schema.org `RealEstateListing` JSON-LD
   - **Anything else:** Open Graph tags, then pattern rules on the text (price in AED / `1.2M` / `85k`, rent or sale, beds or studio, baths, sq ft or m², community, amenities, agent, agency, UAE phone numbers)
2. **Check.** Every auto-filled field is highlighted until edited, so it's clear what came from the listing.
3. **Photos.** The listing's photos come through a same-origin image proxy, so they can be drawn on a canvas. Users can also add their own and give any photo an optional caption.
4. **Style.** Six themes or custom brand colours, seconds per photo, closing line.
5. **Make video.** Full-screen photo scenes are drawn frame by frame on a `<canvas>` (slow push-in motion, spring-eased text kept inside the Reels/TikTok safe area, cross-fades) and recorded with `MediaRecorder` as H.264 MP4 (WebM on Firefox). On phones, **Save / share** opens the share sheet so the video can go straight to Photos, WhatsApp or Instagram.

If a portal blocks the server, there are two fallbacks: the **Import button** (a bookmarklet that runs the same extractor on the page open in the user's own browser) and **paste the listing text**.

## Project layout

| File | What it does |
| --- | --- |
| `index.html` | The app: mobile-first UI, canvas renderer, recorder |
| `extract.js` | Listing extractor shared by the API, the app and the bookmarklet |
| `extract.min.js` | Minified copy embedded in the bookmarklet (`npm run minify`) |
| `api/listing.js` | `GET /api/listing?url=…` fetches a listing page and returns clean JSON |
| `api/image.js` | `GET /api/image?url=…` same-origin photo proxy |
| `dev.js` | Local server that runs the app and both API routes |
| `test/` | Extractor tests on trimmed real page data |

## Run locally

```bash
node dev.js        # http://localhost:3000
npm test           # extractor tests
```

## Deploy (free)

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com), choose **Add New → Project**, import the repo, and press **Deploy**. No settings needed: `index.html` is served as the site and the `api/` files become serverless functions.

The Vercel Hobby plan is free for personal, non-commercial use.

## Design decisions

| Decision | Why |
| --- | --- |
| Structured data first, text rules second, no LLM | Free, instant, predictable, and it can't invent a price |
| One extractor for server, browser and bookmarklet | One place to fix when a portal changes its page |
| Auto-filled fields highlighted | Listing videos are advertising: a wrong price or size is a real problem |
| Rendering in the browser | No render servers to pay for, and private photos never leave the device |
| Same-origin image proxy | Cross-origin photos without CORS headers would block canvas recording |

## Limitations

- Portals can change their pages or block server requests at any time. When that happens, use the Import button or pasted text, and update `extract.js`.
- Recording happens in real time (a 28-second video takes about 28 seconds). Keep the screen on and the tab open.
- Respect each portal's terms. This tool is meant for agents making videos of their own listings.

## License

MIT
