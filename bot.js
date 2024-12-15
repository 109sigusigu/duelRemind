import dotenv from 'dotenv';  // dotenvをインポート
dotenv.config();  // 環境変数を設定

import axios from 'axios';  // axiosをインポート
import csv from 'csv-parser';  // csv-parserをインポート
import moment from 'moment-timezone';  // moment-timezoneをインポート
import fs from 'fs';  // fsをインポート
import simpleGit from 'simple-git';  // simple-gitをインポート
import { Octokit } from '@octokit/rest';  // Octokitをインポート
import fetch from 'node-fetch';  // node-fetchをインポート

const git = simpleGit({
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 6,
  trimmed: false
});

const githubToken = process.env.MY_GITHUB_TOKEN;
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

// CSVファイルパス
const csvFilePath = './DuelsSchedule.csv';

// イベントを読み込む関数
function readEvents() {
  const events = [];
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
      events.push({
        subject: row['Subject'],
        startDate: row['Start Date'],
        startTime: row['Start Time'],
        endDate: row['End Date'],
        endTime: row['End Time'],
        description: row['Description'],
        cupId: row['CupId'],
        cupRarity: row['CupRarity'],
      });
    })
    .on('end', () => {
      console.log('イベントの読み込みが完了しました: ', events);
      scheduleEvents(events);
    });
}

function scheduleEvents(events) {
  const now = moment.utc()
  console.log(now)
  const futureEvents = [];

  // 未来のイベントのみをフィルター
  events.forEach((event) => {
    const startDateTime = moment.tz(`${event.startDate} ${event.startTime}`, 'YYYY/MM/DD HH:mm', 'Asia/Tokyo').utc();
    console.log(startDateTime)

    // 現在時刻より過去のイベントをスキップ
    if (startDateTime.isBefore(now)) {
      console.log(`イベント "${event.subject}" は過去のものです。スキップします。`);
      return;
    }

    futureEvents.push({
      ...event,
      startDateTime: startDateTime
    });
  });

  // 未来のイベントを開始日時でソート
  futureEvents.sort((a, b) => a.startDateTime - b.startDateTime);

  if (futureEvents.length >= 1) {
    // 二番目に近い未来のイベントを取得
    const nextEvent = futureEvents[0];
    const nextRunEvent = futureEvents[1];

    const delay = nextEvent.startDateTime.diff(now);
    console.log(`"${delay}"後、通知されます。`);

    // 通知スケジュール
    setTimeout(() => sendToDiscord(nextEvent), delay);
    console.log(`イベント "${nextEvent.subject}" の通知を待機しています。`);

    // 次回実行時間を保存
    saveNextRunTime(nextRunEvent);
    console.log(`次回のイベント "${nextRunEvent.subject}" を ${nextRunEvent.startDateTime.format('YYYY/MM/DD HH:mm')} に通知するため、次回の起動時間を設定しました。`);
  } else {
    console.log('二番目のイベントが存在しません。');
  }
}

// Discordに通知を送信する関数
function sendToDiscord(event) {
  const message = {
    content: `@everyone\n${event.subject}が近いのだよ。\n${event.endDate} ${event.endTime}まで。`,
  };

  axios.post(webhookUrl, message)
    .then(() => console.log(`通知を送信しました: ${event.subject}`))
    .catch((err) => console.error(`通知の送信中にエラーが発生しました: ${err}`));
}

async function saveNextRunTime(event) {
  const startDateTime = moment.tz(`${event.startDate} ${event.startTime}`, 'YYYY/MM/DD HH:mm', 'Asia/Tokyo').utc();
  const nextRunTime = startDateTime.subtract(3, 'minutes'); // 3分前に起動する設定

  updateCronInYmlFile(nextRunTime.utc().format('m H D M *'));
}

// GitHubアクセストークンを直接指定
const octokit = new Octokit({
  auth: githubToken,
  request: { fetch }  // fetchを設定
});

async function updateCronInYmlFile(newCron) {
  const repoOwner = '109sigusigu'; // リポジトリのオーナー
  const repoName = 'duelRemind';   // リポジトリ名
  const filePath = '.github/workflows/schedule-notification.yml'; // 更新対象のファイルパス

  try {
    // リポジトリのコンテンツを取得
    const { data: file } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: filePath,
    });

    // 現在のファイルの内容をデコードして取得
    const fileContent = Buffer.from(file.content, 'base64').toString('utf-8');

    // cron部分を動的に置換
    const updatedContent = fileContent.replace(
      /cron: '.*'/,
      `cron: '${newCron}'`
    );

    // ファイルを更新
    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: filePath,
      message: `Update cron schedule to ${newCron}`,  // コミットメッセージ
      content: Buffer.from(updatedContent, 'utf-8').toString('base64'), // base64エンコードされた新しいファイル内容
      sha: file.sha,  // 既存ファイルのSHA（競合防止）
    });

    console.log(`ymlファイルを更新しました: ${newCron}`);
  } catch (err) {
    console.error('GitHub API操作中にエラーが発生しました:', err);
  }
}
// 実行
readEvents();
