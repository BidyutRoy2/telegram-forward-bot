/* ───────── ESM IMPORTS (TOP LEVEL ONLY) ───────── */
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import boxen from "boxen";
import chalk from "chalk";
import gradient from "gradient-string";
import ora from "ora";
import cliProgress from "cli-progress";

/* ───────── CONFIG FROM .env ───────── */
const BOT_TOKEN = process.env.BOT_TOKEN;
const MAIN_CHANNEL_ID = Number(process.env.MAIN_CHANNEL_ID);
const TARGET_CHANNELS = process.env.TARGET_CHANNELS
  .split(",")
  .map(id => Number(id.trim()));
const DELAY_MS = Number(process.env.FORWARD_DELAY || 10000);

if (!BOT_TOKEN || !MAIN_CHANNEL_ID || !TARGET_CHANNELS.length) {
  console.error("❌ Missing .env configuration");
  process.exit(1);
}

const LOG_FILE = "forward.log";

/* ───────── UI INTRO ───────── */
async function progressIntro() {
  const bar = new cliProgress.SingleBar({
    format:
      chalk.cyan("⏳ Initializing HiddenGem ") +
      chalk.magenta("█{bar}█ {percentage}%"),
    hideCursor: true
  });

  bar.start(100, 0);
  for (let i = 0; i <= 100; i += 5) {
    bar.update(i);
    await new Promise(r => setTimeout(r, 40));
  }
  bar.stop();
}

async function pulseLogo() {
  const logo = `
██╗  ██╗██╗██████╗ ██████╗ ███████╗███╗   ██╗     ██████╗ ███████╗███╗   ███╗
██║  ██║██║██╔══██╗██╔══██╗██╔════╝████╗  ██║    ██╔════╝ ██╔════╝████╗ ████║
███████║██║██║  ██║██║  ██║█████╗  ██╔██╗ ██║    ██║  ███╗█████╗  ██╔████╔██║
██╔══██║██║██║  ██║██║  ██║██╔══╝  ██║╚██╗██║    ██║   ██║██╔══╝  ██║╚██╔╝██║
██║  ██║██║██████╔╝██████╔╝███████╗██║ ╚████║    ╚██████╔╝███████╗██║ ╚═╝ ██║
╚═╝  ╚═╝╚═╝╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝     ╚═════╝ ╚══════╝╚═╝HiddenGem
`;

  const aurora = gradient([
    "#00ffd5",
    "#00e5ff",
    "#8a2be2",
    "#ff4fd8"
  ]);

  let typed = "";
  for (const ch of "HiddenGem") {
    typed += ch;
    console.clear();
    console.log(
      boxen(
        aurora.multiline(`${logo}\n\n🌌 ${typed}_`),
        { padding: 1, borderStyle: "double", borderColor: "cyan" }
      )
    );
    await new Promise(r => setTimeout(r, 120));
  }

  for (let i = 0; i < 3; i++) {
    console.clear();
    console.log(
      boxen(
        aurora.multiline(`${logo}\n\n🌌 HiddenGem`),
        { padding: 1, borderStyle: "double", borderColor: "magenta" }
      )
    );
    await new Promise(r => setTimeout(r, 350));
  }
}

function showDashboard() {
  console.clear();
  console.log(
    boxen(
      gradient.rainbow.multiline(
`💎 HIDDENGEM TG POST AUTO FORWARD BOT 💎

🔒 Status : Active
📡 Main Channel ID   : ${MAIN_CHANNEL_ID}
🎯 Target Channel ID : ${TARGET_CHANNELS.join(", ")}
⏱ Post Delay  : ${DELAY_MS / 1000}s
⚙ MODE   : QUEUE • SAFE`
      ),
      { padding: 1, borderStyle: "double", borderColor: "magenta" }
    )
  );
}

/* ───────── BOT LOGIC ───────── */
async function main() {
  await progressIntro();
  await pulseLogo();
  showDashboard();

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

  const queue = [];
  const deleted = new Set();
  let processing = false;
  const spinner = ora();

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const log = msg =>
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);

  async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    const msgId = queue.shift();
    spinner.start(`⏳ Waiting ${DELAY_MS / 1000}s → ${msgId}`);
    await delay(DELAY_MS);

    if (deleted.has(msgId)) {
      spinner.fail(`🧹 Canceled → ${msgId}`);
      deleted.delete(msgId);
      processing = false;
      return processQueue();
    }

    for (const ch of TARGET_CHANNELS) {
      try {
        await bot.copyMessage(ch, MAIN_CHANNEL_ID, msgId);
        log(`FORWARDED ${msgId} → ${ch}`);
      } catch (e) {
        log(`FAILED ${msgId} → ${ch} | ${e.message}`);
      }
    }

    spinner.succeed(`✅ Forwarded Done → ${msgId}`);
    processing = false;
    processQueue();
  }

  bot.on("channel_post", msg => {
    if (msg.chat.id === MAIN_CHANNEL_ID) {
      queue.push(msg.message_id);
      processQueue();
    }
  });

  bot.on("edited_channel_post", msg => {
    if (
      msg.chat.id === MAIN_CHANNEL_ID &&
      !msg.text &&
      !msg.caption &&
      !msg.photo &&
      !msg.video
    ) {
      deleted.add(msg.message_id);
    }
  });
}

/* ───────── START ───────── */
main().catch(err => {
  console.error("❌ Bot crashed:", err);
  process.exit(1);
});
