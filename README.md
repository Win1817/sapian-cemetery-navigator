# 🪦 Cemetery Navigation WebApp

**Search · Locate · Navigate to Graves Using Leaflet + OpenStreetMap + Photon API + Supabase**

This web application allows users to **search the name of a deceased person**, **locate their grave**, and **visualize the exact position on a map** with **path/direction guidance** inside a cemetery.
Admins can manage graves through a secure admin dashboard.

---

# 🚀 Features

### **🗺 Map & Search**

* OpenStreetMap + Leaflet interactive map
* Photon Geocoder for fast location search
* Shows grave image + details on click
* Custom path/direction inside cemetery (user-defined path recordings)

### **👨‍💼 Admin Dashboard**

* Add new graves
* Update grave details
* Upload grave photos
* Manage sections, rows, lot numbers

### **🔐 Authentication**

* Supabase Auth (email/password)

### **📦 Tech Stack**

| Layer              | Technology                        |
| ------------------ | --------------------------------- |
| Frontend           | React + TypeScript + Vite         |
| Styling            | TailwindCSS + ShadCN UI           |
| Map                | Leaflet + OSM                     |
| Search             | Photon API                        |
| Backend/DB         | Supabase                          |
| Realtime & Storage | Supabase Storage                  |
| Deployment         | Vercel / Netlify / Docker / Nginx |

---

# 📁 Project Structure

```bash
src/
  components/
  pages/
  lib/
  integrations/
  ...
supabase/
public/
```

---

# 🛠 Prerequisites

Make sure you have installed:

| Tool         | Version                  |
| ------------ | ------------------------ |
| Node.js      | ≥ 18                     |
| NPM or PNPM  | latest                   |
| Supabase CLI | optional but recommended |
| Git          | latest                   |

---

# ⚙️ 1. Install Dependencies

```bash
npm install
```

or using pnpm:

```bash
pnpm install
```

---

# 🔧 2. Configure Environment Variables

Create an `.env` file in the project root:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Optional:

```
VITE_PHOTON_URL=https://photon.komoot.io/api/?q=
```

---

# ▶️ 3. Run Development Server

```bash
npm run dev
```

App will be available at:

```
http://localhost:5173
```

---

# 🗃 4. Running Supabase (optional local dev)

If you want to use Supabase locally:

```bash
supabase start
```

Apply migrations:

```bash
supabase migration up
```

---

# 🏗 5. Build for Production

```bash
npm run build
```

Preview:

```bash
npm run preview
```

---

# 📤 6. Deploying

You can deploy to:

### **Vercel**

```bash
vercel deploy
```

### **Netlify**

```bash
netlify deploy
```

### **Docker**

```bash
docker build -t cemetery-webapp .
docker run -p 3000:80 cemetery-webapp
```

---

# 👨‍🔧 Admin Guide

To access the admin page:

```
/admin
```

Admin features include:

* Add grave
* Edit grave details
* Upload images
* View list of graves
* Search by name, block, row, lot

---

# 📌 Notes for Map Path Feature

* Google Maps cannot provide directions inside cemeteries
* This app allows **manual path recording** via GeoJSON
* You can walk the cemetery and record the trace using any GPS tracker then upload to Supabase or embed into the map

---

# 🧑‍💻 Development Commands Summary

| Command                 | Description          |
| ----------------------- | -------------------- |
| `npm run dev`           | Start dev server     |
| `npm run build`         | Build for production |
| `npm run preview`       | Preview the build    |
| `supabase start`        | Run supabase locally |
| `supabase migration up` | Apply migrations     |

---

# 🤝 Contributing

Pull requests are welcome.
Please follow the coding style used in this project:

* TypeScript
* Prettier Formatting
* ShadCN UI component patterns

---

# 📄 License
MIT © 2025 – Surely Win Dilag
Feel free to use, modify, and deploy.
# sapian-cemetery-navigator
