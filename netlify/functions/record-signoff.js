// ============================================================================
// Netlify Function: record-signoff
//
// This is a webhook receiver, not something the site calls directly. Wire
// it up once in Netlify: Site configuration > Forms > Submission
// notifications > Add notification > Outgoing webhook, event "New form
// submission", form "signoff", URL pointing at this function (see README).
//
// Every time someone signs off, Netlify POSTs the submission here. This
// function mirrors it into data/signoffs.json in your GitHub repo (using
// the same GITHUB_TOKEN/OWNER/REPO env vars as add-talk.js — no new
// secrets needed), so the site can read that file and show a live "who's
// signed off" list. The original submission also still lives in Netlify
// Forms as-is; this is a mirror, not a replacement.
//
// Netlify's outgoing webhook payload shape has varied a bit across
// versions, so this parses defensively rather than assuming one exact
// structure.
// ============================================================================

const GITHUB_API = "https://api.github.com";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return respond(500, { error: "GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO not configured." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid payload." });
  }

  // Defensive extraction — Netlify has nested this under "payload" in some
  // notification formats, and put it at the top level in others.
  const root = payload.payload || payload;
  const data = root.data || {};

  const submissionId = root.id || payload.id || null;
  const fullName = data.full_name || "";
  const talkId = data.talk_id || "";
  const talkTitle = data.talk_title || "";
  const confirmed = data.confirmed === "yes";
  const submittedAt = root.created_at || payload.created_at || new Date().toISOString();

  // Ignore anything that isn't a real, confirmed sign-off (e.g. spam caught
  // by the honeypot, or a malformed payload).
  if (!fullName || !talkId || !confirmed) {
    return respond(200, { ok: true, skipped: "Missing required fields — not recorded." });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "mates-safety-simple-record-signoff-function",
  };

  try {
    const path = "data/signoffs.json";
    const getRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
      { headers: ghHeaders }
    );
    if (!getRes.ok) {
      const errBody = await safeJson(getRes);
      return respond(502, { error: "Couldn't read data/signoffs.json from GitHub.", detail: errBody });
    }
    const getJson = await getRes.json();
    const currentContent = Buffer.from(getJson.content, "base64").toString("utf-8");
    let signoffs;
    try {
      signoffs = JSON.parse(currentContent);
    } catch {
      return respond(500, { error: "data/signoffs.json in the repo isn't valid JSON — fix that first." });
    }

    // Dedupe: if we've already recorded this exact submission (Netlify can
    // occasionally fire a webhook more than once), skip it.
    if (submissionId && signoffs.some((s) => s.submission_id === submissionId)) {
      return respond(200, { ok: true, skipped: "Already recorded." });
    }

    const entry = {
      submission_id: submissionId,
      talk_id: talkId,
      talk_title: talkTitle,
      full_name: fullName,
      submitted_at: submittedAt,
    };
    const updated = [entry, ...signoffs];

    const newContentBase64 = Buffer.from(JSON.stringify(updated, null, 2), "utf-8").toString("base64");
    const putRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message: `Sign-off: ${fullName} — ${talkTitle || talkId}`,
        content: newContentBase64,
        sha: getJson.sha,
        branch: GITHUB_BRANCH,
      }),
    });
    if (!putRes.ok) {
      const errBody = await safeJson(putRes);
      return respond(502, { error: "Couldn't update data/signoffs.json on GitHub.", detail: errBody });
    }

    return respond(200, { ok: true, entry });
  } catch (err) {
    return respond(500, { error: "Unexpected error.", detail: String(err) });
  }
};

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
