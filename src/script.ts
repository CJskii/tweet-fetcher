import { URLSearchParams } from "url";
import dotenv from "dotenv";
dotenv.config();
import needle from "needle";

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const USER_LOOKUP_ENDPOINT = "https://api.twitter.com/2/users";
const SEARCH_TWEETS_ENDPOINT = "https://api.twitter.com/2/tweets/search/recent";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EXCEL_FILE_PATH = process.env.EXCEL_FILE_PATH;

// Ensure all required environment variables are set
if (!BEARER_TOKEN || !SPREADSHEET_ID || !EXCEL_FILE_PATH) {
  console.error("Missing one or more required environment variables");
  process.exit(1);
}

let now = new Date();
let yesterday = new Date(now);
yesterday.setDate(now.getDate() - 1);

interface Author {
  id: string;
  username: string;
}

interface Tweet {
  Date: string;
  Username: string;
  Tweets: string;
  Link: string;
  DaysOfCoding: number;
  tweetData?: any;
}

interface AuthorData {
  data: Author[];
}

interface TweetData {
  data: Tweet[];
}

interface Row {
  "Date Created": string | number;
  Username: string;
  Tweets: string;
  Link: string;
  DaysOfCoding: number;
}

async function handleErrors(response: Response) {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

async function getTweetAuthors(tweetIds: string[]): Promise<AuthorData> {
  console.log("getting tweet authors");
  const params = new URLSearchParams();
  params.append("ids", tweetIds.join(","));
  params.append("user.fields", "username");

  const response: Response = await fetch(
    `${USER_LOOKUP_ENDPOINT}?${params.toString()}`,
    {
      headers: new Headers({
        Authorization: `Bearer ${BEARER_TOKEN}`,
      }),
    }
  );

  await handleErrors(response);

  return await response.json();
}

async function getTweets() {
  console.log("getting tweets");

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const startDate = `${yesterday.toISOString().split("T")[0]}T00:00:01Z`;
  const endDate = `${yesterday.toISOString().split("T")[0]}T23:59:59Z`;

  const params = {
    query: "#30DaysofSolidityLW3 has:mentions -is:retweet",
    start_time: startDate,
    end_time: endDate,
    "tweet.fields": "author_id",
    "user.fields": "username",
    max_results: 100,
  };

  const response = await needle("get", SEARCH_TWEETS_ENDPOINT, params, {
    headers: {
      "User-Agent": "v2RecentSearchJS",
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
  });

  if (!response.body) {
    throw new Error("Unsuccessful request");
  }

  return response.body;
}

async function createDataFrames(authorsData: any, tweetData: any) {
  const authors: Record<string, string> = {};

  for (const author of authorsData.data) {
    authors[author.id] = author.username;
  }

  const df: Tweet[] = [];
  for (const tweet of tweetData.data) {
    const authorName = authors[tweet.author_id];
    const url = `https://twitter.com/${authorName}/status/${tweet.id}`;

    if (!authorName.toLowerCase().includes("bot")) {
      const newTweet: Tweet = {
        Date: tweet.created_at,
        Username: authorName,
        Tweets: tweet.text,
        Link: url,
        DaysOfCoding: 1,
      };
      df.push(newTweet);
    }
  }
  return df;
}

async function processTweets() {
  const tweetData = await getTweets();
  console.log(tweetData);
  const tweetIds = tweetData.data.map((tweet: any) => tweet.author_id);
  const authorsData = await getTweetAuthors(tweetIds);

  const df = await createDataFrames(authorsData, tweetData);
}

(async () => {
  console.log("running");
  try {
    await processTweets();
  } catch (err) {
    console.error("An error occurred:", err);
  }
})();
