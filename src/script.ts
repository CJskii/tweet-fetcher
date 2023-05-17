import { GoogleSpreadsheet } from "google-spreadsheet";
import { CronJob } from "cron";
import * as ExcelJS from "exceljs";
import * as fs from "fs";
import { URLSearchParams } from "url";
import dotenv from "dotenv";
dotenv.config();
import needle from "needle";
import * as path from "path";

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const USER_LOOKUP_ENDPOINT = "https://api.twitter.com/2/users";
const SEARCH_TWEETS_ENDPOINT = "https://api.twitter.com/2/tweets/search/recent";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EXCEL_FILE = process.env.EXCEL_FILE;

// Ensure all required environment variables are set
if (!BEARER_TOKEN || !SPREADSHEET_ID || !EXCEL_FILE) {
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
  "Date Created": string;
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

async function getTweets(nextToken?: string) {
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
    next_token: nextToken,
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

  const data = response.body;
  const tweets = data.data;

  // Get the next batch of tweets
  if (data.meta && data.meta.next_token) {
    const nextBatch = await getTweets(data.meta.next_token);
    tweets.push(...nextBatch);
  }

  return tweets;
}

async function createDataFrames(authorsData: any, tweetData: any) {
  const authors: Record<string, string> = {};

  for (const author of authorsData.data) {
    authors[author.id] = author.username;
  }
  const date = `${yesterday.getDate()}/${
    yesterday.getMonth() + 1
  }/${yesterday.getFullYear()}`;

  const df: Tweet[] = [];
  for (const tweet of tweetData.data) {
    const authorName = authors[tweet.author_id];
    const url = `https://twitter.com/${authorName}/status/${tweet.id}`;

    if (!authorName.toLowerCase().includes("bot")) {
      const newTweet: Tweet = {
        "Date Created": date,
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

async function updateSpreadsheet(df: any): Promise<void> {
  console.log("updating spreadsheet");
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(require("../mdrive.json"));
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  const rows = await sheet.getRows();
  const existingUsers: { [key: string]: any } = {};
  rows.forEach((row) => {
    existingUsers[row.Username] = row;
  });

  for (const row of df) {
    const username = row.Username;
    if (username in existingUsers) {
      // increment day count
      existingUsers[username].DaysOfCoding++;
      // update date, tweets, link
      existingUsers[username]["Date Created"] = row["Date Created"];
      existingUsers[username].Tweets = row.Tweets;
      existingUsers[username].Link = row.Link;
      await existingUsers[username].save();
    } else {
      // add new user
      await sheet.addRow({
        "Date Created": row["Date Created"],
        Username: row.Username,
        Tweets: row.Tweets,
        Link: row.Link,
        DaysOfCoding: row.DaysOfCoding,
      });
    }
  }
}

async function updateExcel(tweets: Tweet[]) {
  console.log("Updating Excel...");
  const workbook = new ExcelJS.Workbook();
  let worksheet;

  if (!BEARER_TOKEN || !EXCEL_FILE) {
    console.error("BEARER_TOKEN and EXCEL_FILE must be set");
    process.exit(1);
  }

  const fullFilePath = path.join(__dirname, "..", `${EXCEL_FILE}`);

  if (fs.existsSync(fullFilePath)) {
    console.log("Reading existing file...");
    await workbook.xlsx.readFile(fullFilePath);
    worksheet = workbook.getWorksheet(1);
  } else {
    console.log("Creating new worksheet...");
    worksheet = workbook.addWorksheet("Sheet1");
    worksheet.columns = [
      { header: "Date Created", key: "date", width: 30 },
      { header: "Username", key: "username", width: 30 },
      { header: "Tweets", key: "tweets", width: 30 },
      { header: "Link", key: "link", width: 30 },
      { header: "DaysOfCoding", key: "daysofcoding", width: 15 },
    ];
  }

  for (const tweet of tweets) {
    let existingRow: ExcelJS.Row | undefined;

    worksheet.eachRow((excelRow: any, rowNumber: any) => {
      if (excelRow.getCell(2).text === tweet.Username) {
        existingRow = excelRow;
      }
    });
    if (existingRow) {
      existingRow.getCell(1).value = tweet["Date Created"];
      existingRow.getCell(3).value = tweet.Tweets;
      existingRow.getCell(4).value = tweet.Link;
      existingRow.getCell(5).value = existingRow.getCell(5).value ? +1 : 1;
    } else {
      worksheet.addRow({
        date: tweet["Date Created"],
        username: tweet.Username,
        tweets: tweet.Tweets,
        link: tweet.Link,
        daysofcoding: tweet.DaysOfCoding,
      });
    }
  }

  console.log("Writing to:", fullFilePath);
  await workbook.xlsx.writeFile(fullFilePath);
  console.log("Excel file has been updated successfully.");
}

async function processTweets() {
  const tweetData = await getTweets();
  const tweetIds = tweetData.data.map((tweet: any) => tweet.author_id);
  const authorsData = await getTweetAuthors(tweetIds);

  const df = await createDataFrames(authorsData, tweetData);

  await updateExcel(df);
  await updateSpreadsheet(df);
}

new CronJob(
  "1 0 * * *",
  async function () {
    try {
      await processTweets();
    } catch (err) {
      console.error(err);
    }
  },
  undefined,
  true,
  "GMT"
);

(async () => {
  console.log("running");
  try {
    await processTweets();
  } catch (err) {
    console.error("An error occurred:", err);
  }
})();
