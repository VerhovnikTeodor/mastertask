# MasterTask

Spletna aplikacija za projekte, ekipo in naloge s Kanban tablo. Frontend je React, API je Express, edini trajni vir podatkov je PostgreSQL.

## Arhitektura

```
frontend/   Vite + React + TypeScript (v produkciji statične datoteke)
backend/    Express API, migracije in seme
api/        Vercel serverless vstopna točka (/api/* → Express)
```

V lokalnem razvoju Vite (5173) posreduje `/api` na API (8001). Na Vercelu sta v enem projektu dve storitvi: `frontend` (Vite) in `backend` (Express, vstop `backend/src/app.js`). Javni promet na `/api` gre na backend, vse ostalo na frontend. Brskalnik kliče `/api` na istem naslovu, zato storitvi med seboj nimata notranje vezave.

Avtentikacija je JWT v piškotku `mt_session` (`httpOnly`, `SameSite=Lax`). Spreminjajoče zahteve morajo poslati glavo `X-Requested-With: MasterTask`. Globalni vlogi sta `admin` in `member`, vlogi v projektu pa `owner`, `manager`, `member` in `viewer`. Dovoljenja se preverjajo na strežniku; nečlan projekta dobi 404.

## Lokalni zagon

Potrebujete Node.js 20+ in Docker (samo za lokalni PostgreSQL).

```bash
cp .env.example .env
# v .env nastavite JWT_SECRET (vsaj 32 znakov)
npm ci
npm run db:up          # PostgreSQL 16 na portu 5433
npm run db:migrate
npm run db:seed        # demo podatki, samo v prazno bazo
npm run dev:api        # http://localhost:8001
npm run dev:web        # http://localhost:5173
```

Demo prijava po semenu: `ana.novak@mastertask.si` / `Demo1234` (administrator). Seme se v produkciji ne zažene, razen z zastavico `--force`, ki je ne uporabljajte nad obstoječimi podatki.

## Okoljske spremenljivke

| Spremenljivka | Kje | Namen |
| --- | --- | --- |
| `DATABASE_URL` | API | Povezava do PostgreSQL. Na Neon/Vercel Postgres uporabite pooled povezavo. |
| `DATABASE_URL_UNPOOLED` | migracije | Neposredna povezava. Če ni nastavljena, migracije uporabijo `DATABASE_URL`. |
| `JWT_SECRET` | API | Vsaj 32 znakov. V produkciji se aplikacija brez tega ne zažene. |
| `TEST_DATABASE_URL` | testi | Ločena baza, katere ime vsebuje `test`. Testi zbrišejo shemo. |
| `PORT` | API | Privzeto `8001`. Na Vercelu se ne uporablja. |
| `SESSION_DAYS` | API | Trajanje seje, privzeto 7. |
| `DB_POOL_MAX` | API | Velikost bazena. Na Vercelu privzeto 3, sicer 10. |
| `ALLOW_REGISTRATION` | API | `false` izklopi javno registracijo. |
| `APP_TIMEZONE` | API | IANA časovni pas za »danes«. Privzeto `Europe/Ljubljana`. |
| `BCRYPT_ROUNDS` | API | Privzeto 11. |

`.env` je v `.gitignore`. Vrednosti za produkcijo nastavite v Vercelu (Settings → Environment Variables), ne v repozitoriju.

## PostgreSQL, migracije in testi

Shema je v `backend/migrations/*.sql`. `npm run db:migrate` izvede samo še neuporabljene datoteke, vsako v svoji transakciji, in zabeleži ime v `schema_migrations`. Zaklep prepreči vzporedni zagon. Migracije samo dodajajo; obstoječih podatkov ne brišejo.

Lokalni `docker-compose.yml` zažene samo bazo za razvoj in teste. Aplikacija v produkciji Dockerja ne potrebuje in se ne objavlja na Docker Hub.

```bash
npm test         # backend (Jest + PostgreSQL) in frontend (Vitest)
npm run lint
npm run typecheck
npm run build
```

Backend testi berejo `TEST_DATABASE_URL`, nato zbrišejo shemo `public` in jo znova zgradijo. Zato se ne zaženejo, če URL kaže na isto bazo kot `DATABASE_URL` ali če ime baze ne vsebuje `test`.

## Objava na Vercel

Samodejne objave ob pushu so izklopljene (`vercel.json` → `git.deploymentEnabled: false`). Produkcija se objavi samo ročno.

1. Na Vercelu ustvarite projekt iz tega repozitorija in izklopite samodejne Git objave, če jih vmesnik ponudi.
2. Dodajte PostgreSQL (na primer Neon ali Vercel Postgres) in v projekt vnesite `DATABASE_URL`, `DATABASE_URL_UNPOOLED` in `JWT_SECRET`.
3. Lokalno povežite projekt: `npx vercel link`. Iz `.vercel/project.json` preberite `orgId` in `projectId`.
4. V GitHubu (Settings → Secrets and variables → Actions) dodajte `VERCEL_TOKEN`, `VERCEL_ORG_ID` in `VERCEL_PROJECT_ID`. Za migracije iz workflowa dodajte še `MIGRATION_DATABASE_URL` (neposredna povezava).
5. Za okolje `production` v GitHubu po potrebi nastavite zahtevane pregledovalce (workflow ga uporablja).
6. Actions → **Deploy to Vercel** → Run workflow. Možnost »Pred objavo poženi migracije« zažene `npm run db:migrate` in nato `vercel pull`, `vercel build --prod` ter `vercel deploy --prebuilt --prod`.

CI (`.github/workflows/ci.yml`) teče ob pushu na `main` in ob pull requestih: lint, tipi, testi in build. Ne objavlja in ne potrebuje skrivnosti.

Preusmeritve: `/api/*` gre na storitev `backend`, vse ostalo na storitev `frontend`. Express še vedno vidi celotno pot `/api/...`. Glave vključujejo HSTS, `X-Frame-Options: DENY` in CSP z `script-src 'self'`.

## Preverjanje

Lint, preverjanje tipov, 40 backend testov, 34 frontend testov in produkcijski build gredo skozi. V brskalniku so preverjeni prijava, nadzorna plošča, tabla (premik kartice se shrani in ostane po ponovnem nalaganju), predal naloge, podnaloge in komentarji.

Ni preverjeno v živi produkciji: objava na Vercel (ni nastavljenih skrivnosti in produkcijske baze) in celoten prehod po vseh straneh v svetli temi ter na mobilni širini.
