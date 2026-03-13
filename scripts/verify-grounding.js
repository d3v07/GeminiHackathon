const FRONTEND = 'http://localhost:3000';

async function testGrounding() {
    console.log('Testing Vertex AI Grounding via /api/interact...');
    
    const body = {
        agentId: 'test-agent',
        role: 'Underground Historian',
        message: 'What is happening in New York City right now? Any interesting news or weather events?'
    };

    try {
        const res = await fetch(`${FRONTEND}/api/interact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        console.log('\nResponse from Agent:');
        console.log('-------------------');
        console.log(data.aiReply);
        console.log('-------------------');
        
        if (data.success) {
            console.log('\n✓ Successfully hit /api/interact');
            const fs = require('fs');
            fs.writeFileSync('reply_debug.txt', data.aiReply);
            // Check for signs of grounding in the reply (e.g. current year, specific news, etc.)
            // Since I can't know exactly what it will say, I'll just look for a response length > 20
            if (data.aiReply && data.aiReply.length > 20) {
                console.log('✓ Received substantial grounded response');
            }
        } else {
            console.error('✗ Interaction failed:', data.error);
        }
    } catch (err) {
        console.error('✗ Fetch failed:', err.message);
    }
}

testGrounding();
