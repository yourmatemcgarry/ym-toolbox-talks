// ============================================================================
// Netlify Function: add-talk
//
// Lets the "Add a toolbox talk" page on the site create a new talk (and
// optionally upload a small file) WITHOUT anyone needing to touch GitHub
// directly. It works by committing straight to your GitHub repo using the
// GitHub API, authenticated with a token stored as a Netlify environment
// variable (never exposed to the browser).
//
// IMPORTANT — this endpoint is intentionally NOT gated by a login or
// passcode (that was a deliberate choice to keep the whole system
// login-free). That means anyone who can reach this URL can commit files
// and edit the talk list, not just add a talk through the nice form. See
// the README's "A note on how open this is" section for what that means
// and how to tighten it later if you want to.
//
// Required Netlify environment variables (Site configuration > Environment
// variables):
//   GITHUB_TOKEN   - a GitHub Personal Access Token with "repo" write access
//   GITHUB_OWNER   - your GitHub username or org, e.g. "yourmatesbrewing"
//   GITHUB_REPO    - the repo name, e.g. "mates-safety-simple"
//   GITHUB_BRANCH  - optional, defaults to "main"
// ============================================================================

const GITHUB_API = "https://api.github.com";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return respond(500, {
      error:
        "This site isn't configured yet — GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO need to be set as Netlify environment variables. See the README.",
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid request." });
  }

  const title = (payload.title || "").trim();
  const date = (payload.date || "").trim();
  const notes = (payload.notes || "").trim();
  const mediaType = ["pdf", "image", "video", "none"].includes(payload.mediaType) ? payload.mediaType : "none";
  let mediaUrl = (payload.mediaUrl || "").trim();

  if (!title || !date) {
    return respond(400, { error: "Title and date are required." });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "mates-safety-simple-add-talk-function",
  };

  try {
    // 1. If a file was included, commit it into /documents first.
    if (payload.fileBase64 && payload.fileName) {
      const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `documents/${Date.now()}-${safeName}`;

      const putFileRes = await fetch(
        `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
        {
          method: "PUT",
          headers: ghHeaders,
          body: JSON.stringify({
            message: `Add file for toolbox talk: ${title}`,
            content: payload.fileBase64,
            branch: GITHUB_BRANCH,
          }),
        }
      );
      if (!putFileRes.ok) {
        const errBody = await safeJson(putFileRes);
        return respond(502, { error: "Couldn't upload the file to GitHub.", detail: errBody });
      }
      mediaUrl = path;
    }

    // 2. Read the current talks.json so we know its sha and existing content.
    const talksPath = "data/talks.json";
    const getRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${talksPath}?ref=${GITHUB_BRANCH}`,
      { headers: ghHeaders }
    );
    if (!getRes.ok) {
      const errBody = await safeJson(getRes);
      return respond(502, { error: "Couldn't read data/talks.json from GitHub.", detail: errBody });
    }
    const getJson = await getRes.json();
    const currentContent = Buffer.from(getJson.content, "base64").toString("utf-8");
    let talks;
    try {
      talks = JSON.parse(currentContent);
    } catch {
      return respond(500, { error: "data/talks.json in the repo isn't valid JSON — fix that first." });
    }

    // 3. Build the new talk entry and prepend it.
    const id = `${date}-${slugify(title)}`.slice(0, 80);
    const newTalk = { id, title, date, mediaType, mediaUrl, notes };
    const updatedTalks = [newTalk, ...talks];

    // 4. Commit the updated talks.json.
    const newContentBase64 = Buffer.from(JSON.stringify(updatedTalks, null, 2), "utf-8").toString("base64");
    const putTalksRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${talksPath}`,
      {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
          message: `Add toolbox talk: ${title}`,
          content: newContentBase64,
          sha: getJson.sha,
          branch: GITHUB_BRANCH,
        }),
      }
    );
    if (!putTalksRes.ok) {
      const errBody = await safeJson(putTalksRes);
      return respond(502, { error: "Couldn't update data/talks.json on GitHub.", detail: errBody });
    }

    return respond(200, { ok: true, talk: newTalk });
  } catch (err) {
    return respond(500, { error: "Unexpected error.", detail: String(err) });
  }
};

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
