import { setTimeout as delay } from "node:timers/promises";
import type { IngestItem } from "@gamepulse/shared";
import { insertIngestItems } from "./repository.js";

export interface SteamFetchInput {
  projectId: string;
  appId: string;
  language?: string;
  maxPages?: number;
}

export interface RedditFetchInput {
  projectId: string;
  query: string;
  subreddit?: string;
  limit?: number;
}

export async function fetchSteamReviews(input: SteamFetchInput): Promise<{ accepted: number; inserted: number }> {
  const maxPages = Math.min(Math.max(input.maxPages ?? 1, 1), 10);
  let cursor = "*";
  let accepted = 0;
  let inserted = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const pageItems: IngestItem[] = [];
    const url = new URL(`https://store.steampowered.com/appreviews/${input.appId}`);
    url.searchParams.set("json", "1");
    url.searchParams.set("filter", "recent");
    url.searchParams.set("num_per_page", "100");
    url.searchParams.set("cursor", cursor);

    if (input.language) {
      url.searchParams.set("language", input.language);
    }

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Steam reviews request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      cursor?: string;
      reviews?: Array<{
        recommendationid?: string;
        review?: string;
        timestamp_created?: number;
        voted_up?: boolean;
        votes_up?: number;
        comment_count?: number;
      }>;
    };

    for (const review of payload.reviews ?? []) {
      if (!review.review) {
        continue;
      }

      pageItems.push({
        platform: "steam",
        externalId: review.recommendationid,
        sourceUrl: `https://steamcommunity.com/app/${input.appId}/reviews/`,
        body: review.review,
        postedAt: review.timestamp_created ? new Date(review.timestamp_created * 1000).toISOString() : undefined,
        upvotes: review.votes_up,
        replies: review.comment_count,
        metadata: {
          votedUp: review.voted_up
        }
      });
    }

    const pageResult = await insertIngestItems(input.projectId, pageItems);
    accepted += pageResult.accepted;
    inserted += pageResult.inserted;
    if (!payload.cursor || payload.cursor === cursor) break;
    cursor = payload.cursor;
  }
  return { accepted, inserted };
}

export async function fetchRedditPosts(input: RedditFetchInput): Promise<{ accepted: number; inserted: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const base = input.subreddit ? `https://www.reddit.com/r/${encodeURIComponent(input.subreddit)}/search.json` : "https://www.reddit.com/search.json";
  const url = new URL(base);
  url.searchParams.set("q", input.query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "new");

  if (input.subreddit) {
    url.searchParams.set("restrict_sr", "1");
  }

  const response = await fetchWithRetry(url, {
    headers: {
      "user-agent": "GamePulse/0.1 local-first community analysis"
    }
  });

  if (!response.ok) {
    throw new Error(`Reddit request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      children?: Array<{
        data?: {
          id?: string;
          title?: string;
          selftext?: string;
          permalink?: string;
          author?: string;
          created_utc?: number;
          score?: number;
          num_comments?: number;
        };
      }>;
    };
  };

  const items: IngestItem[] = (payload.data?.children ?? [])
    .map((child) => child.data)
    .filter((post): post is NonNullable<typeof post> => Boolean(post?.title))
    .map((post) => ({
      platform: "reddit",
      externalId: post.id,
      sourceTitle: post.title,
      sourceUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
      body: [post.title, post.selftext].filter(Boolean).join("\n\n"),
      authorName: post.author,
      postedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
      upvotes: post.score,
      replies: post.num_comments
    }));

  return insertIngestItems(input.projectId, items);
}


async function fetchWithRetry(url: URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`Request failed with ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await delay(500 * 2 ** attempt + Math.floor(Math.random() * 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}