# Test fixtures

- `zurich-14-8581-5739.pbf.gz`: one vector tile of central Zurich, at the foot of the lake,
  in the OpenMapTiles schema (gzipped, as stored in .mbtiles). It comes from the TileServer GL
  test data, built by Planetiler from OpenStreetMap.
  Map data © OpenStreetMap contributors, available under the
  [Open Database License](https://www.openstreetmap.org/copyright).
- `photon.json`: a stand-in for photon.komoot.io in the end-to-end tests, shaped like its
  GeoJSON responses, with a few places in Zurich so their maps exist in the tile data.

The end-to-end tests draw from the whole Zurich tile set, which `npm run fixtures`
downloads into `.cache/` (about 36 MB, not committed).
