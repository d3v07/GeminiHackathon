#!/usr/bin/env node
/**
 * Send a rich handoff message to Slack with full queue context
 * Usage: node scripts/send-handoff.js [options]
 *
 * Examples:
 *   node scripts/send-handoff.js --to kushyarwar --issue 97 --queue "91:Frontend live data,92:End-to-end chat,101:Social graph viz"
 *   node scripts/send-handoff.js --to d3v07 --issue 91 --completed "Frontend MVP" --queue "92:Chat,101:Social graph"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opts = {};

for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace('--', '')] = args[i + 1];
}

if (!opts.to || !opts.issue) {
  console.error('Usage: node scripts/send-handoff.js --to <username> --issue <number> [--queue <items>] [--completed <text>]');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/send-handoff.js --to kushyarwar --issue 97 \\');
  console.error('    --queue "91:Frontend live data,92:End-to-end chat,101:Social graph viz,102:Explore mode" \\');
  console.error('    --completed "Sprint 5 Observability backend"');
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
  const queueStr = opts.queue || '';

  // Parse queue items: "91:Title,92:Title,..." → [{num, title}, ...]
  const queueItems = queueStr
    .split(',')
    .filter(s => s.trim())
    .map(item => {
      const [num, title] = item.split(':').map(s => s.trim());
      return { num, title };
    });

  // Build queue section
  let queueSection = '';
  if (queueItems.length > 0) {
    queueSection = '📋 *Next in queue:*\n';
    queueItems.forEach((item, idx) => {
      queueSection += `${idx + 1}. #${item.num} — ${item.title}\n`;
    });
  }

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
          text: `*To: @${to}*\n*Start with: Issue #${issueNum}*`
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
          text: `📌 *Your immediate task:*\nOpen GitHub issue #${issueNum} for full details.${details ? '\n' + details : ''}`
        }
      }
    ]
  };

  if (queueSection) {
    payload.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: queueSection
      }
    });
  }

  payload.blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Issue #' + issueNum
        },
        url: `https://github.com/d3v07/GeminiHackathon/issues/${issueNum}`,
        action_id: 'view_issue'
      }
    ]
  });

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✓ Handoff sent to Slack for @${to}`);
      console.log(`  Start: Issue #${issueNum}`);
      if (queueItems.length > 0) {
        console.log(`  Queue: ${queueItems.length} items`);
      }
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
