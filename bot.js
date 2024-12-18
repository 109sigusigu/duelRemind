import dotenv from 'dotenv';  // dotenvをインポート
dotenv.config();  // 環境変数を設定

import axios from 'axios';  // axiosをインポート
import csv from 'csv-parser';  // csv-parserをインポート
import moment from 'moment-timezone';  // moment-timezoneをインポート
import fs from 'fs';  // fsをインポート

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

    // 次の通知が15分以上の場合、処理を終了
    if (delay > 900000) {
      console.log('次の通知までの時間が15分以上です。処理を終了します。');
      return;
    }

    // 通知スケジュール
    setTimeout(() => sendToDiscord(nextEvent), delay);
    console.log(`イベント "${nextEvent.subject}" の通知を待機しています。`);
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

// 実行
readEvents();
