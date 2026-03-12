const { IncomingWebhook } = require('@slack/webhook');
require('dotenv').config({ path: __dirname + '/../.env' });

async function sendSlackHandoff() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const message = process.argv[2] || "Task completed. Handoff ready.";

  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/services/')) {
    console.error("Error: SLACK_WEBHOOK_URL is missing or invalid in .env");
    console.error("Make sure it looks like: https://hooks.slack.com/services/T000.../B000...");
    process.exit(1);
  }

  const webhook = new IncomingWebhook(webhookUrl);

  try {
    await webhook.send({
      text: `🤖 *Metropolis Agent Handoff*\n> ${message}`
    });
    console.log('Successfully sent Slack handoff message.');
  } catch (err) {
    console.error('Error sending Slack message:', err);
  }
}

sendSlackHandoff();
