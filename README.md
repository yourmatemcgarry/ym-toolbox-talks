# Your Mates Brewing — Toolbox Talks

A plain static site — no database, no accounts, no admin panel to log into.
Toolbox talks live on one page. Open a talk, and each staff member writes
their name and ticks a box confirming they've read and understood it.
Sign-offs are captured by Netlify's built-in Forms feature and show up in
your Netlify dashboard. New talks (including file uploads) can be added
right from the site via an "Add a toolbox talk" page — no need to touch
GitHub directly.

## What you'll need

1. A free [GitHub](https://github.com) account (to hold the files)
2. A free [Netlify](https://netlify.com) account (to host the site, collect
   sign-offs, and run the small function that adds new talks)

That's it — no Supabase, no third database/auth service, nothing else to
sign up for. You will generate one GitHub access token (step 3 below) so the
site can commit changes on your behalf — that's the only extra setup step.

## How it works

- **`data/talks.json`** is the list of toolbox talks — title, date, an
  optional attached document/photo/video, and notes. This is the "central
  location."
- **`index.html`** reads that list and shows it as a page of toolbox talks.
- **`talk.html`** shows one talk's content plus a sign-off form: full name +
  "I confirm I have read and understood" checkbox.
- **`add-talk.html`** is a form for adding a new toolbox talk (with an
  optional file upload) straight from the browser. Submitting it calls a
  small Netlify Function (`netlify/functions/add-talk.js`) which commits the
  new talk — and file, if you attached one — directly to your GitHub repo.
  Netlify then redeploys automatically, and the new talk appears on the site
  about 30–60 seconds later.
- Sign-off submissions go to **Netlify Forms** — no server code, no
  database. Netlify stores each submission (name, talk, timestamp) and
  gives you a table you can view or export as CSV from your dashboard.

### Viewing who's signed off

Go to your Netlify site → **Site configuration → Forms** (or the **Forms**
tab, depending on your Netlify UI version). You'll see a "signoff" form with
every submission: name, which talk, and when. Export to CSV from there for
a compliance record — no code required.

### A note on how open this is

Nothing in this system requires a login — not signing off, and not adding a
new toolbox talk. That was a deliberate choice to keep friction at zero.
Worth being clear-eyed about what that means in practice:

- **Signing off:** anyone with the link can tick the box under any name.
  Fine for validating the workflow; not proof of who actually read it.
- **Adding a talk:** anyone with the link can also reach `add-talk.html` and
  commit new content (or a file) to your GitHub repo — there's no password
  or check of any kind on that page or the function behind it. In practice
  that means someone could add junk talks, upload a file you didn't want in
  the repo, or (in the worst case) someone deliberately hostile could spam
  commits. It's the trade-off you chose for a fast, frictionless proof of
  concept.

If it proves out and you want to keep using it, a sensible next step is
putting *some* gate on `add-talk.html` and the function — even a simple
shared passcode would close off casual misuse — while leaving the staff
sign-off exactly as-is. That's a small, self-contained follow-up whenever
you're ready.

---

## 1. Push this to GitHub

```bash
cd mates-safety-simple
git init
git add .
git commit -m "Toolbox talks site"
gh repo create mates-safety-simple --private --source=. --push
```

No `gh` CLI? Create an empty repo on github.com, then:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. Create a GitHub access token

This lets the site commit new toolbox talks to your repo on your behalf.

1. On GitHub, go to **Settings → Developer settings → Personal access
   tokens → Tokens (classic) → Generate new token (classic)**.
2. Give it a name like `mates-safety-add-talk`, set an expiry (or "No
   expiration" if you'd rather not renew it), and tick the **`repo`** scope
   (full control of private repositories — or just **`public_repo`** if your
   repo is public).
3. Generate it and copy the token somewhere safe — GitHub only shows it
   once.

## 3. Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site →
   Import an existing project** → connect GitHub → pick this repo.
2. Leave the build command blank and publish directory as `.` —
   `netlify.toml` already sets this, so the defaults should just work.
3. Before (or right after) deploying, go to **Site configuration →
   Environment variables** and add:
   - `GITHUB_TOKEN` — the token you generated in step 2
   - `GITHUB_OWNER` — your GitHub username or organisation
   - `GITHUB_REPO` — the repo name (e.g. `mates-safety-simple`)
   - `GITHUB_BRANCH` — optional, defaults to `main` if you leave it out
4. Click **Deploy** (or trigger a redeploy if you added the env vars after
   the first deploy — they only take effect on the next build). You'll get
   a URL like `mates-safety.netlify.app`.
5. Open that URL once after deploying and glance at it — this helps confirm
   Netlify's form-detection has picked up the sign-off form (it normally
   happens automatically at deploy time).

From here on, every `git push` to your main branch redeploys the site
automatically — and so does every talk added through `add-talk.html`,
since that's also just a commit to the repo.

## 4. Add a monthly toolbox talk

**From the site (recommended):** open `add-talk.html` (there's a button for
it on the home page), fill in the title, date, notes, and optionally upload
a PDF/photo or paste a video link, then submit. Give it 30–60 seconds to
redeploy, then refresh the home page.

**Directly on GitHub (fallback / for bigger files):** open `data/talks.json`
on github.com, click the pencil icon to edit, copy one of the existing
objects, and fill in your own `title`, `date`, `notes`, `mediaType`
(`"pdf"`, `"image"`, `"video"`, or `"none"`) and `mediaUrl`. For PDFs/photos,
upload the file into `documents/` first and point `mediaUrl` at
`"documents/your-file-name.pdf"`. For video, use an *unlisted* YouTube or
Vimeo link rather than uploading the file — GitHub repos aren't a good home
for large video, and the in-site uploader caps out at ~4MB anyway.

## Netlify Forms free-tier limit

The free plan includes **100 form submissions per month**. For a team of
~20–30 people doing one monthly toolbox talk, that's comfortably inside the
limit; if you start using the sign-off form for more than one thing a month
across a larger team, keep an eye on it — Netlify will tell you if you're
close, and paid plans raise the cap.

## Project structure

```
mates-safety-simple/
├── index.html                     Toolbox talk list (home page)
├── talk.html                      Talk detail + sign-off form (Netlify Forms)
├── add-talk.html                  Add a new toolbox talk from the browser
├── thanks.html                    Fallback confirmation page (JS-off case)
├── data/
│   └── talks.json                 The talk list — read by the site, written
│                                   to by the add-talk.html function
├── documents/                     Uploaded/attached PDFs and photos live here
├── netlify/functions/
│   └── add-talk.js                Commits new talks to GitHub via its API
└── netlify.toml                   Netlify deploy config (no build step)
```

## Queensland WHS compliance notes

- Under the **Work Health and Safety Act 2011 (Qld)**, a PCBU must provide
  workers with the information, training, instruction and supervision
  necessary to work safely, and keep records of that training.
- Training records should be kept for a **minimum of 5 years**. Export your
  Netlify Forms submissions to CSV periodically and keep a copy somewhere
  durable (e.g. a shared drive) — Netlify's own retention of form
  submissions isn't a substitute for your own record-keeping.
- Always check current requirements at
  [worksafe.qld.gov.au](https://www.worksafe.qld.gov.au) or with a WHS
  advisor.
