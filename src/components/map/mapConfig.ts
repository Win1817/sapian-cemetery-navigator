export const MAP_CONFIG = {
  // 📍 Center of the Cemetery
  CENTER: [11.4945215, 122.6100805] as [number, number],

  // 🔍 Default Zoom Level
  DEFAULT_ZOOM: 18, 

  // 🎨 Color Palette
  COLORS: {
    PRIMARY: "#2d5f3f",
    HIGHLIGHT: "#a39f5a",
    BOUNDARY_FILL: "#2d5f3f",
    BOUNDARY_STROKE: "#2d5f3f",
  },

  // 🖌️ Polygon Style Options
  CEMETERY_STYLE: {
    color: "#2d5f3f",       // Stroke color (Boundary Stroke)
    fillColor: "#2d5f3f",   // Fill color (Boundary Fill)
    fillOpacity: 0.2,       // 20% opacity for transparency
    weight: 3,              // Thickness of the border line
  },

  // 🗺️ Tile Providers
  TILES: {
    CARTO_POSITRON: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
    },
    OSM_STANDARD: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20,
    },
    SATELLITE: {
      url:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
      maxZoom: 20,
    },
  },

  // 🚧 The Cemetery Boundary
  cemeteryBoundary: [
    [11.495086199371954, 122.60979650734345],
    [11.493881585771362, 122.60982924452287],
    [11.494108374835463, 122.61020540340468],
    [11.495115965795222, 122.61001343784352],
    [11.495086199371954, 122.60979650734345],
  ] as [number, number][],
};