# PawTect

Frontend pages and the Node.js + Express + MySQL backend are in this project.

See `pawtect-backend/README.md` for database setup, environment configuration, startup steps, API endpoints, and current integration limitations.

Start the backend from the `pawtect-backend` folder with `npm install` then `npm run dev`. Open `http://localhost:3000/auth.html`.





```
pawtect
├─ backend
│  ├─ database
│  │  └─ schema.sql
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ README.md
│  └─ src
│     ├─ create-admin.js
│     ├─ db.js
│     ├─ middleware
│     │  └─ auth.js
│     ├─ routes
│     │  ├─ admin.js
│     │  ├─ auth.js
│     │  ├─ cases.js
│     │  ├─ notifications.js
│     │  └─ reports.js
│     └─ server.js
├─ frontend
│  ├─ admin-dashboard.css
│  ├─ admin-dashboard.html
│  ├─ assets
│  │  └─ logo-removebg-preview.png
│  ├─ auth.css
│  ├─ case-details.html
│  ├─ case-overview.html
│  ├─ index.html
│  ├─ landing-page.html
│  ├─ map.html
│  ├─ profile.html
│  ├─ register.css
│  ├─ register.html
│  ├─ report.html
│  ├─ rescue-cases.html
│  ├─ script.js
│  ├─ style.css
│  └─ submit-report.html
└─ README.md

```