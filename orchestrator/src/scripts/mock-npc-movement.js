const lat = 40.7128;
const lng = -74.0060;

const agentId = 'Mock_NPC_Agent_' + Math.floor(Math.random() * 1000);

async function simulateMovement() {
    console.log(`Starting mock simulation for agent: ${agentId}`);
    let currentLat = lat;
    let currentLng = lng;

    setInterval(async () => {
        // Random walk
        currentLat += (Math.random() - 0.5) * 0.001;
        currentLng += (Math.random() - 0.5) * 0.001;

        try {
            const res = await fetch('http://localhost:3000/api/orchestrator', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    agentId,
                    lat: currentLat,
                    lng: currentLng,
                    defaultTask: 'Walking around the financial district'
                })
            });
            const data = await res.json();
            console.log(`Positon updated. Lat: ${currentLat.toFixed(4)}, Lng: ${currentLng.toFixed(4)}`, data);
        } catch (e) {
            console.error('Failed to update orchestrator. Server might be offline (simulating durable kill).', e.message);
        }
    }, 3000); // Ping every 3 seconds
}

simulateMovement();
