# PawTect integrated starter (Node.js + Express + MySQL)

## Requirements
- Node.js LTS
- MySQL Server and MySQL Workbench
- VS Code

## 1. Database
Open `database/schema.sql` in MySQL Workbench and execute it against your local MySQL server.
It creates `pawtect_db` and the 11 PawTect tables if they do not exist.

**Important:** If you already created tables earlier, compare their columns first. `CREATE TABLE IF NOT EXISTS` does not update an existing table's structure.

## 2. Environment configuration
Copy `.env.example` to `.env` in this folder. Fill in your own MySQL password and a long random `JWT_SECRET`.

Do not commit or share `.env`. The project ZIP deliberately excludes `.env`.

Example local configuration:
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=pawtect_db
JWT_SECRET=PUT_A_LONG_RANDOM_SECRET_HERE
JWT_EXPIRES_IN=1d
CLIENT_ORIGIN=http://localhost:3000
```

## 3. Install and run
Open a terminal in `pawtect-backend`:
```bash
npm install
npm run dev
```
The Express server serves the PawTect HTML/CSS/JS from the project root as well as the API.

Open `http://localhost:3000/api/health`. Expected result:
```json
{"status":"ok","database":"connected"}
```
Then open `http://localhost:3000/auth.html`.

## 4. Integrated endpoints
- `POST /api/auth/register` — create reporter account
- `POST /api/auth/verify-email` — verify account
- `POST /api/auth/login` — login and receive JWT
- `GET /api/auth/me` — get current account
- `PATCH /api/auth/me` — update first name, last name, username, contact number, birthday
- `GET /api/reports` — reporter sees own reports; rescuer/admin can see all reports
- `POST /api/reports` — submit a report
- `GET /api/reports/mine` — list current user's reports
- `GET /api/reports/:id` — report details and status history
- `GET /api/cases` — list rescue cases visible to the account
- `POST /api/cases/:reportId/claim` — rescuer claims a report
- `PATCH /api/cases/:caseId/status` — rescuer/admin updates case status

Protected requests use `Authorization: Bearer TOKEN`.

## 5. Frontend integration status and limitations
- Added `auth.html` for reporter registration and login.
- `script.js` uses the backend for authentication, profile read/basic name/contact updates, report submission, rescue-report listing, and report details.
- Existing map initialization, Google Maps script tag/API key, map markers, and geolocation code have been preserved.
- Existing CSS palette/layout is retained.
- Donation UI banner/navigation links were removed from pages where present; no donation tables or API were added.
- Photo upload preview exists in the page, but actual image file storage is **not implemented**. Reports currently save the text/details and location address; `photo_url` remains NULL.
- The report form currently has no latitude/longitude capture; address is saved. Google Maps API integration has not been modified.
- The current HTML set has no separate admin dashboard or rescuer application review screen. Rescuer/admin account provisioning and rescuer approval workflows need to be implemented before production.
- Email verification uses a development-only token returned by the API. Configure a real email provider before production.
- Email, location, note, password, avatar, and notification preferences are not all editable through the current API. Unsupported controls show a message instead of pretending to save.
- `case-overview.html` loads a report when opened with `?id=REPORT_ID`. The rescue list links to this format.

## Security notes
- Never put MySQL credentials or JWT secrets in browser JavaScript.
- Use HTTPS and a real email provider before deployment.
- The Google Maps API key in `map.html` is existing frontend configuration and was left unchanged. Restrict that key by HTTP referrer and API in Google Cloud Console.
- Do not use the development email token behavior in production.
