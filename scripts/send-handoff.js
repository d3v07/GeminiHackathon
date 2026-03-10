#!/usr/bin/env node
/**
 * Send a rich handoff message to Slack
 * Usage: node scripts/send-handoff.js [options]
 *
 * Examples:
 *   node scripts/send-handoff.js --to kushyarwar --issue 97
 *   node scripts/send-handoff.js --to d3v07 --issue 91 --completed "Sprint 5 - Observability"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opts = {};

for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace('--', '')] = args[i + 1];
}

if (!opts.to || !opts.issue) {
  console.error('Usage: node scripts/send-handoff.js --to <username> --issue <number> [--completed <text>]');
  console.error('Example: node scripts/send-handoff.js --to kushyarwar --issue 97 --completed "Sprint 5 Observability"');
  process.exit(1);
}

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('Error: SLACK_WEBHOOK_URL environment variable not set');
  process.exit(1);
}

async function sendHandoff() {
  const to = opts.to;
  const issueNum = opts.issue;
  const completed = opts.completed || 'Previous sprint work';
  const details = opts.details || '';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎯 HANDOFF',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*To: @${to}*\n*Issue: #${issueNum}*`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Completed:*\n${completed}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📋 *Your task:*\nOpen GitHub issue #${issueNum} for full details.${details ? '\n\n' + details : ''}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View on GitHub'
            },
            url: `https://github.com/d3v07/GeminiHackathon/issues/${issueNum}`,
            action_id: 'view_issue'
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✓ Handoff sent to Slack for @${to} — Issue #${issueNum}`);
    } else {
      console.error(`✗ Failed: ${response.status} ${response.statusText}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`✗ Error: ${e.message}`);
    process.exit(1);
  }
}

sendHandoff();
