# pawtect
version 1 toh gawa ng branch before merge


yung backend kayo na bahala sa payment method tas yung server gamitin either mysql, aws or supabase


frontend paki ayos ung css ko magulo eh pero sindunan ko naman color pallate


server natin si jofer na di niya papatayin pc niya

magdamag 

tas testers natin sila jp pag na push sa vercel for webhosting yan vercel

Replaced Google Maps with Leaflet + OpenStreetMap, which is free and needs no API keyreplaced Google Maps with Leaflet + OpenStreetMap, which is free and needs no API key.

Browsers only allow GPS on https:// or localhost, so opening the file directly (file://) may block it. Use something like python -m http.server or VS Code Live Server when testing.

Recommendation ni claude: OpenStreetMap’s public tile and address servers are meant for light use. For heavy traffic, switch to a tile provider with a free tier (MapTiler, Stadia) or host your own. Only the OSM_TILES constant needs to change.

Fixed Front-End but stil no Log-in and admin side.