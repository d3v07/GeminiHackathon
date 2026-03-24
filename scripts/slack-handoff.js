const { IncomingWebhook } = require('@slack/webhook');
require('dotenv').config({ path: __dirname + '/../.env' });

async function sendSlackHandoff() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  let payload;
  try {
    payload = JSON.parse(process.argv[2]);
  } catch(e) {
    payload = { completed: process.argv[2] || "Task completed." };
  }

  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/services/')) {
    console.error("Error: SLACK_WEBHOOK_URL is missing or invalid in .env");
    process.exit(1);
  }

  const webhook = new IncomingWebhook(webhookUrl);

  const assignee = payload.assignee || "@kushyarwar";
  const issue = payload.issue || "General";
  const completed = payload.completed || "Task completed.";
  const task = payload.task || "Review the pull request.";
  const link = payload.link || "https://github.com/d3v07/GeminiHackathon";

  const blocks = [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🎯 HANDOFF",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `*To:* ${assignee}\n*Issue:* ${issue}`
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `✅ *Completed:*\n${completed}`
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `📋 *Your task:*\n${task}`
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View on GitHub",
            "emoji": true
          },
          "url": link
        }
      ]
    }
  ];

  try {
    await webhook.send({
      text: "Handoff ready",
      blocks: blocks
    });
    console.log('Successfully sent Slack handoff message.');
  } catch (err) {
    console.error('Error sending Slack message:', err);
  }
}

sendSlackHandoff();
