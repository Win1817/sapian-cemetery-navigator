# Application Workflow

This document outlines the architecture and user flow of the cemetery navigation application.

### Application Flowchart

```
[START]
   |
   v
[main.tsx] --> Renders App component
   |
   v
[App.tsx] --> Initializes React Query, Toaster, Tooltip providers
   |
   +-------------------------------------------------+
   |                                                 |
   v                                                 v
[Supabase Auth] --> Checks for user session     [App.tsx] --> Sets up routing using React Router
   |                                                 |
   +-----------------------+-------------------------+
                           |
                           v
        +------------------+------------------+
        |                  |                  |
   (No Session)       (Session)          (Admin Session)
        |                  |                  |
        v                  v                  v
    [/auth] -->      [Auth.tsx]         [/] --> [Index.tsx]    [/admin] --> [Admin.tsx]
        |                  |                  |
        v                  v                  v
    (User logs in)    (Displays Map)      (Admin Dashboard)
        |                  |                  |
        +----------------->+                  |
                                            |
                                            v
                                     (Manages Data)

```

### How the Application Works

This is a web application built with **React**, **Vite**, and **Supabase** that serves as a cemetery navigation and grave locator. Here's a breakdown of the process:

1.  **Entry Point:** The application starts with `src/main.tsx`, which renders the main `App` component into the HTML's root element.

2.  **App Component (`src/App.tsx`):**
    *   This component is the core of the application, wrapping everything in necessary providers like `QueryClientProvider` for data fetching, `TooltipProvider` for UI tooltips, and `Toaster` for notifications.
    *   It handles authentication and routing.
    *   **Authentication:**
        *   When the app loads, it uses `supabase.auth.getSession()` to see if a user is already logged in.
        *   It sets up a listener (`onAuthStateChange`) that automatically updates the UI when a user logs in or out.
    *   **Routing:**
        *   It uses `react-router-dom` to manage different pages.
        *   If the user is logged in, it shows the `Index` page (`/`) or the `Admin` page (`/admin`).
        *   If the user is not logged in, it redirects them to the `Auth` page (`/auth`).
        *   Any other URL will show the `NotFound` page.

3.  **Authentication Page (`src/pages/Auth.tsx`):**
    *   This page provides a user interface for signing in. It likely uses Supabase's authentication functions to handle user login.

4.  **Main Page (`src/pages/Index.tsx`):**
    *   This is the main page of the application that users see after logging in.
    *   **User and Admin Check:** It checks if the logged-in user has an "admin" role in the database. If so, it displays a button to navigate to the admin page.
    *   **Location Services:** It asks the user for their location to provide walking directions on the map.
    *   **Data Loading:** It fetches data from the Supabase database, specifically:
        *   `lot_polygons`: The geographical coordinates that define the boundaries of each cemetery lot.
        *   `graves`: Information about the individuals buried in the graves.
    *   **Map Display:**
        *   It uses the `CemeteryMap` component (likely built with a library like Leaflet) to render an interactive map.
        *   The map displays the cemetery boundary, lot polygons, and markers for each grave.
    *   **Search:**
        *   A `SearchBar` component allows users to search for graves.
    *   **Grave Details:** When a user selects a grave from the search or by clicking on the map, it displays detailed information about that grave, such as name, age, and dates of birth and death.

5.  **Admin Page (`src/pages/Admin.tsx`):**
    *   This page is only accessible to users with the "admin" role.
    *   It provides administrative functionalities, such as adding, editing, or deleting grave and lot information.

6.  **Supabase Integration (`src/integrations/supabase`):**
    *   The application connects to a Supabase project for its backend needs.
    *   `client.ts` initializes the Supabase client.
    *   `types.ts` likely contains TypeScript definitions for the database tables.
