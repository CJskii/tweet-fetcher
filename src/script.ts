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

interface Tweet {
  Date: string;
  Username: string;
  Tweets: string;
  Link: string;
  DaysOfCoding: number;
  tweetData?: any;
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

async function processTweets() {
  const tweetData = await getTweets();
  console.log(tweetData);
  const tweetIds = tweetData.data.map((tweet: any) => tweet.author_id);
}

(async () => {
  console.log("running");
  try {
    await processTweets();
  } catch (err) {
    console.error("An error occurred:", err);
  }
})();
