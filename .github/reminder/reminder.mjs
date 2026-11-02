// Sends the daily "Time for your pages" notification.
//   node reminder.mjs check  -> works out whether it's time, for her time zone
//   node reminder.mjs send   -> sends it
// Her set-up code (notification address, time, time zone) is the PUSH_SETUP secret.
// The private notification key is the VAPID_PRIVATE_KEY secret. Neither is ever printed.

import { appendFileSync } from 'node:fs';

const PUBLIC_KEY = 'BJmDWuk7R1xZnyaAynmtU0N9lSqX3NKL0SompFFCBLH-e_9OfbKjAErZn6OVuh69MYCFAO-jEQT_KIWKJ0pGDVQ';
const SUBJECT = 'https://tcbalmer90.github.io/forest-apothecary/';
const LATEST_HOURS = 3; // if the job runs very late, skip rather than nudge at midnight

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

function readSetup() {
  const raw = (process.env.PUSH_SETUP || '').trim();
  if (!raw) return null;
  // Accept the whole shared message, or just the code part
  return JSON.parse(raw.slice(raw.indexOf('{')));
}

// Local date and minutes past midnight in her time zone
function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

async function check() {
  const setup = readSetup();
  if (!setup || !process.env.VAPID_PRIVATE_KEY) {
    console.log('Reminders are not set up yet (missing secrets).');
    output('due', 'false');
    return;
  }
  if (process.env.FORCE === 'true') {
    output('due', 'true');
    output('day', `test-${Date.now()}`);
    return;
  }
  const [h, m] = setup.time.split(':').map(Number);
  const target = h * 60 + m;
  const now = localNow(setup.tz);
  const due = now.minutes >= target && now.minutes < target + LATEST_HOURS * 60;
  output('due', String(due));
  output('day', now.day);
}

async function send() {
  const { default: webpush } = await import('web-push');
  const setup = readSetup();
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY.trim());
  try {
    await webpush.sendNotification({ endpoint: setup.endpoint, keys: setup.keys }, '', { TTL: 3600 });
    console.log('Reminder sent.');
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.log('The phone no longer accepts reminders. Ask for a new set-up code from the app.');
    } else {
      console.log(`Sending failed with status ${e.statusCode ?? 'unknown'}.`);
    }
    process.exit(1);
  }
}

await (process.argv[2] === 'send' ? send() : check());
