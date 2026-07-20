# Getting started with sybaubetting

A step-by-step walkthrough for running this app from a fresh clone — written
for anyone doing this for the first time, not just people already comfortable
with Node/Postgres. If you just want the quick reference version or the
architecture explanation, see [README.md](./README.md) instead. This
document only covers running it **locally on your own computer** — it does
not cover deploying it anywhere.

## What you'll need

- **Node.js 20 or newer** — [nodejs.org/download](https://nodejs.org/en/download)
- **Git** — to clone the repo. [git-scm.com/downloads](https://git-scm.com/downloads)
- **PostgreSQL** — a database server running on your own computer (installed
  in Step 3 below)
- Optional: a free API key from [the-odds-api.com](https://the-odds-api.com)
  for real sportsbook odds. Without one, the app runs on a small built-in
  sample dataset instead — everything still works, just with fake numbers.

You do **not** need Redis. It's an optional performance optimization the
app works fine without.

## 1. Clone the repository

```bash
git clone https://github.com/FLICK11-hash/sybaubetting.git
cd sybaubetting
```

## 2. Install dependencies

```bash
npm install
```

This also runs `prisma generate` automatically (you'll see it in the output)
— that's expected and needed.

## 3. Install and start PostgreSQL

If you already have PostgreSQL installed and running, skip to Step 4.

### Windows

1. Go to [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
   and click **"Download the installer"** under "Interactive installer by
   EDB." This takes you to a version table — click the download icon in the
   **Windows x86-64** column for the latest version (e.g. 17.x). Do **not**
   download the "zip archive" option — that's raw binaries with no setup
   wizard and is much harder to configure correctly.
2. Run the downloaded `.exe` and follow the installer:
   - Keep the default install directory
   - Keep **PostgreSQL Server**, **pgAdmin 4**, and **Command Line Tools**
     checked; you can uncheck Stack Builder
   - Keep the default data directory and port (`5432`)
   - **Set a password for the `postgres` user and write it down** — you'll
     need it in Step 5
   - Finish. If Stack Builder launches at the end, just close/cancel it —
     it's an optional extra-software installer, not required
3. Open a **new** PowerShell window (important — a window already open
   before installing won't have the updated settings).
4. Create the database:
   ```powershell
   createdb -U postgres sybaubetting
   createdb -U postgres sybaubetting_test
   ```
   If PowerShell says `createdb` isn't recognized, the installer didn't add
   it to your PATH. Use the full path instead (adjust the version number
   `17` if yours differs):
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres sybaubetting
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres sybaubetting_test
   ```
   Both will prompt for the password you set in step 2.

### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
createdb sybaubetting
createdb sybaubetting_test
```

### Linux

```bash
sudo apt install postgresql
sudo systemctl start postgresql
sudo -u postgres createdb sybaubetting
sudo -u postgres createdb sybaubetting_test
```

## 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Open `.env` in a text editor (on Windows: `notepad .env`) and set
`DATABASE_URL` to match your Postgres password from Step 3:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/sybaubetting"
```

If your password contains special characters like `@`, `#`, or `%`, those
need URL-encoding (e.g. `@` becomes `%40`) — simplest fix is to avoid those
characters when you set the Postgres password in the first place.

Leave everything else in `.env` at its default for now — we'll come back to
`ODDS_API_KEY` in Step 6 and `APP_PASSWORD` in Step 8.

**Save the file** before moving on (a common mistake is leaving it open
unsaved in an editor).

## 5. Set up the database schema

```bash
npx prisma migrate deploy
npm run db:seed
```

The first command creates all the tables. The second seeds reference data
only — sportsbooks, sports/leagues, market types, a starter NBA/EPL team
roster, and one user account. It does **not** create any fake games, odds,
or bets — those only ever come from the next step.

If `npx prisma migrate deploy` fails with `Can't reach database server`,
Postgres isn't running — go back to Step 3 and make sure the service is
started. If `npm run db:seed` fails with `Environment variable not found:
DATABASE_URL`, double check `.env` was actually saved with the right value
in Step 4.

## 6. Pull in odds data

```bash
npm run worker:once
```

This fetches odds, normalizes them, and computes best prices/expected
value/arbitrage. Without an `ODDS_API_KEY` set, it automatically uses a
small built-in sample dataset (one NBA game, a handful of sportsbooks) so
you can see the app working immediately.

**To use real odds instead:**

1. Sign up for a free key at [the-odds-api.com](https://the-odds-api.com)
   (free tier: 500 requests/month).
2. In `.env`, set:
   ```
   ODDS_API_KEY="your-real-key-here"
   ODDS_API_PROVIDER="the-odds-api"
   ```
3. Since player props and futures cost extra requests per league each
   cycle, and the free tier's quota is limited, also set:
   ```
   INCLUDE_PLAYER_PROPS="false"
   INCLUDE_FUTURES="false"
   ```
   (You can flip either back to `"true"` later if you want that coverage
   and don't mind using more of your quota.)
4. Run `npm run worker:once` again. Check the `errors` array in the output
   — it should be empty (or very short) if your key is working.

Re-run `npm run worker:once` any time you want fresh odds — it's safe to
run repeatedly (no duplicate data gets created).

## 7. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the
Dashboard populated with whatever data Step 6 pulled in.

## 8. If you're going to share this with anyone else

By default there's no login of any kind — anyone who can reach the app
(e.g. if you deploy it, or expose it on your network) can see and edit
everything, including bet history. If more than just you will have access,
set a shared password in `.env` before starting the app:

```
APP_PASSWORD="pick-something-only-you-and-your-friends-know"
```

Restart `npm run dev` after changing this. Everyone who has the password
gets full access — this is one shared passphrase, not separate accounts per
person.

## Troubleshooting quick reference

| Symptom | Fix |
|---|---|
| `createdb` / `psql` not recognized (Windows) | Use the full path: `& "C:\Program Files\PostgreSQL\<version>\bin\createdb.exe" ...` |
| `Can't reach database server at localhost:5432` | Postgres isn't running. Windows: check the "postgresql-x64-XX" service in Services. Mac: `brew services start postgresql@16`. Linux: `sudo systemctl start postgresql`. |
| `Environment variable not found: DATABASE_URL` | `.env` wasn't saved, is in the wrong folder, or has a typo on the `DATABASE_URL=` line. Re-open it and check. |
| Worker output has entries in `errors` about a database/team/player | Usually informational, not fatal — check the message text; most are logged and skipped rather than stopping the whole run. |
| Dashboard shows odds/games you don't recognize | If you're on a fresh clone this shouldn't happen (seed data has no fake games) — if you see this, something is off; open an issue or ask for help rather than assuming it's expected. |
| Port 3000 already in use | Another process is using it. Stop it, or run `npm run dev -- -p 3001` and use that port instead. |

If none of these match what you're seeing, paste the exact terminal output
somewhere you can get help — the specific error message is almost always
the fastest way to diagnose it.
