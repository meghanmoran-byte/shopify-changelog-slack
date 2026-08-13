import Parser from "rss-parser";
import * as cheerio from "cheerio";
import OpenAI from "openai";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME || "shopify updates"; // just for the message header

if (!SLACK_WEBHOOK_URL) throw new Error("Missing SLACK_WEBHOOK_URL env var");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY env var");

const CHANGELOG_URL = "https://changelog.shopify.com/";
const FEED_URL = "https://changelog.shopify.com/feed.xml";

const oneMonthAgo = new Date();
oneMonthAgo.setDate(oneMonthAgo.getDate() - 31);

/**
 * Attempt 1: RSS/Atom feed (preferred - stable structure, includes dates)
 */
async function fetchViaFeed() {
  const parser = new Parser();
  const feed = await parser.parseURL(FEED_URL);
  const items = feed.items
    .filter((item) => {
      const pubDate = item.isoDate ? new Date(item.isoDate) : null;
      return !pubDate || pubDate >= oneMonthAgo;
    })
    .map((item) => ({
      title: item.title?.trim() || "Untitled update",
      link: item.link || CHANGELOG_URL,
      date: item.isoDate ? new Date(item.isoDate).toISOString().slice(0, 10) : "unknown date",
      body: (item.contentSnippet || item.content || "").trim(),
    }));
  return items;
}

/**
 * Attempt 2 (fallback): scrape the HTML changelog page directly.
 */
async function fetchViaScrape() {
  const res = await fetch(CHANGELOG_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ChangelogBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch changelog page: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $("article").each((_, el) => {
    const title = $(el).find("h1, h2, h3").first().text().trim();
    const link = $(el).find("a").first().attr("href");
    const dateText = $(el).find("time").first().attr("datetime") || $(el).find("time").first().text();
    const body = $(el).find("p").first().text().trim();

    if (!title) return;
    const date = dateText ? new Date(dateText) : null;
    if (date && date < oneMonthAgo) return;

    items.push({
      title,
      link: link ? new URL(link, CHANGELOG_URL).toString() : CHANGELOG_URL,
      date: date ? date.toISOString().slice(0, 10) : "unknown date",
      body,
    });
  });

  return items;
}

async function fetchRecentUpdates() {
  try {
    const items = await fetchViaFeed();
    if (items.length > 0) return items;
    console.warn("Feed returned 0 items in range, trying HTML scrape fallback...");
  } catch (err) {
    console.warn("Feed fetch failed, falling back to HTML scrape:", err.message);
  }
  return fetchViaScrape();
}

async function summarizeWithOpenAI(items) {
  if (items.length === 0) {
    return "No new Shopify changelog updates were found in the last month.";
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const rawList = items
    .map((item, i) => `${i + 1}. [${item.date}] ${item.title}\n${item.body}\nLink: ${item.link}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `Below are raw entries from the Shopify changelog for the past month. Write a concise Slack-ready summary for a team that runs a Shopify store/app.

Format requirements:
- Use Slack mrkdwn (not standard markdown): *bold*, _italic_, <url|link text> for links, and bullet points with "•"
- Group related updates under short bold category headers if there's a natural grouping (e.g. *Checkout*, *Admin*, *APIs*), otherwise just list them
- One or two lines per update: what changed and why it matters
- Keep the whole thing skimmable in under a minute
- Start with a one-line header like "*Shopify Changelog — <Month Year> Summary*"
- End with a link to the full changelog: <${CHANGELOG_URL}|View full changelog>

Raw entries:
${rawList}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content || "Could not generate summary.";
}

async function postToSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack post failed: ${res.status} ${body}`);
  }
}

async function main() {
  console.log("Fetching Shopify changelog updates...");
  const items = await fetchRecentUpdates();
  console.log(`Found ${items.length} update(s) in the last month.`);

  console.log("Summarizing with OpenAI...");
  const summary = await summarizeWithOpenAI(items);

  console.log("Posting to Slack...");
  await postToSlack(summary);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Automation failed:", err);
  process.exit(1);
});
