# Shopify Changelog → Slack (Monthly)

Automatically fetches updates from https://changelog.shopify.com/, summarizes
them with Claude, and posts the summary to a Slack channel once a month.

## Setup (about 10 minutes, no server needed)

### 1. Create a Slack webhook
1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**.
2. Name it (e.g. "Shopify Updates Bot") and pick your workspace.
3. In the app settings, open **Incoming Webhooks** and toggle it **on**.
4. Click **Add New Webhook to Workspace**, choose the channel you want
   updates posted to, and copy the webhook URL (starts with
   `https://hooks.slack.com/services/...`).

### 2. Get an Anthropic API key
1. Go to https://console.anthropic.com/ → **API Keys** → create a new key.
2. Copy it (starts with `sk-ant-...`).

### 3. Create a GitHub repo
1. Create a new (can be private) repo on GitHub.
2. Upload/push everything in this `shopify-changelog-slack` folder to it,
   keeping the `.github/workflows/monthly-changelog.yml` file at the path
   `.github/workflows/monthly-changelog.yml` relative to the repo root
   (adjust the `working-directory` lines in the workflow if you restructure
   folders).

### 4. Add your secrets
In the repo: **Settings → Secrets and variables → Actions → New repository secret**
- `SLACK_WEBHOOK_URL` → the webhook URL from step 1
- `ANTHROPIC_API_KEY` → the API key from step 2

### 5. Test it
Go to the **Actions** tab → **Monthly Shopify Changelog Summary** →
**Run workflow** (this uses the `workflow_dispatch` trigger). Check your
Slack channel for the message. Check the run logs if anything fails.

### 6. Let it run
Once the manual test works, you're done — it will run automatically at
9:00 AM UTC on the 1st of every month via the `cron` schedule in the
workflow file. Edit the cron expression there if you want a different day/time.

## If the automation stops finding updates

The script first tries Shopify's RSS feed at `changelog.shopify.com/feed.xml`.
If Shopify changes their site and that feed disappears or moves, the script
falls back to scraping the HTML page directly (see `fetchViaScrape()` in
`index.js`). That fallback's CSS selectors (`article`, `h1/h2/h3`, `time`, `p`)
are a best guess at typical structure — if it starts returning 0 items,
open https://changelog.shopify.com/ in a browser, inspect the actual HTML,
and update the selectors in that function accordingly.

## Costs
- GitHub Actions: free for this usage level on public/private repos within
  the free tier minutes.
- Anthropic API: a few cents per run (one summarization call per month).
- Slack webhook: free.
