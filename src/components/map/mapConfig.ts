export const MAP_CONFIG = {
  // 📍 Center of the Cemetery
  CENTER: [11.4945215, 122.6100805] as [number, number],

  // 🔍 Default Zoom Level
  DEFAULT_ZOOM: 20, 

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
      maxZoom: 25,
    },
    OSM_STANDARD: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 25,
    },
    SATELLITE: {
      url:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
      maxZoom: 22,
    },
  },

  // 🚧 The Cemetery Boundary
  cemeteryBoundary: [
    [11.495086199371954, 122.60979650734345],
    [11.49409736890852, 122.60981504218586],
    [11.494004812975945, 122.60954291095021],
    [11.493743700849691, 122.60962529301156],
    [11.49404849578049, 122.61031507015758],
    [11.495119598888124, 122.6100489440683],
    [11.495086199371954, 122.60979650734345],
  ] as [number, number][],
};