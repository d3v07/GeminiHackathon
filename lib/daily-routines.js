/**
 * Daily Routines System (Issue #34)
 * 
 * Gives each NPC a time-aware daily schedule that influences their behavior.
 * The cognitive graph's perceive node injects the current routine phase
 * into the agent's context so Gemini adjusts behavior accordingly.
 */

// ── Per-Role Daily Schedules ────────────────────────────────────────
// Each schedule maps hour ranges to activity descriptions and preferred
// place categories. The cognitive graph will inject the active routine
// into the system prompt each iteration.

const DAILY_ROUTINES = {
    "Underground Historian": [
        { start: 6, end: 9, activity: "Morning research at a local archive or library", placeType: "library", mood: "focused" },
        { start: 9, end: 12, activity: "Exploring hidden underground tunnels and forgotten infrastructure", placeType: "historic_site", mood: "curious" },
        { start: 12, end: 14, activity: "Lunch break at a classic NYC diner, reviewing field notes", placeType: "restaurant", mood: "reflective" },
        { start: 14, end: 18, activity: "Walking tours of historical neighborhoods, documenting findings", placeType: "museum", mood: "energetic" },
        { start: 18, end: 22, activity: "Evening lecture or meetup with fellow history enthusiasts", placeType: "bar", mood: "social" },
        { start: 22, end: 6, activity: "Late-night exploration of quiet, deserted historic sites", placeType: "historic_site", mood: "contemplative" },
    ],
    "1920s Prohibition Ghost": [
        { start: 6, end: 10, activity: "Drifting through empty morning streets, confused by modern traffic", placeType: "park", mood: "melancholy" },
        { start: 10, end: 14, activity: "Searching old hotel lobbies and basements for traces of speakeasies", placeType: "lodging", mood: "determined" },
        { start: 14, end: 18, activity: "Wandering the docks and waterfront, remembering bootlegger routes", placeType: "tourist_attraction", mood: "nostalgic" },
        { start: 18, end: 22, activity: "Haunting jazz clubs and underground bars, feeling closest to home", placeType: "bar", mood: "wistful" },
        { start: 22, end: 6, activity: "Peak haunting hours — roaming dark alleys searching for lost love", placeType: "historic_site", mood: "desperate" },
    ],
    "Stressed Wall Street Broker": [
        { start: 5, end: 7, activity: "Pre-market anxiety: checking futures, drinking protein shakes", placeType: "cafe", mood: "anxious" },
        { start: 7, end: 9, activity: "Power breakfast at a Financial District spot, networking aggressively", placeType: "restaurant", mood: "aggressive" },
        { start: 9, end: 16, activity: "Trading hours: pacing near exchanges, making frantic phone calls", placeType: "bank", mood: "manic" },
        { start: 16, end: 19, activity: "Post-market wind-down at an upscale bar, calculating P&L", placeType: "bar", mood: "exhausted" },
        { start: 19, end: 22, activity: "Dinner at a steakhouse, complaining about the market", placeType: "restaurant", mood: "bitter" },
        { start: 22, end: 5, activity: "Insomnia walk, refreshing Bloomberg terminal on phone", placeType: "cafe", mood: "wired" },
    ],
    "Harlem Jazz Musician": [
        { start: 6, end: 10, activity: "Sleeping in after a late gig, dreaming of improvised melodies", placeType: "lodging", mood: "resting" },
        { start: 10, end: 13, activity: "Morning practice session, looking for busking spots", placeType: "park", mood: "creative" },
        { start: 13, end: 16, activity: "Visiting record shops and music stores for rare vinyl finds", placeType: "store", mood: "nostalgic" },
        { start: 16, end: 20, activity: "Rehearsal with pickup band, exploring new neighborhoods for inspiration", placeType: "cafe", mood: "inspired" },
        { start: 20, end: 2, activity: "Peak performance hours at jazz clubs and open mic nights", placeType: "bar", mood: "electric" },
        { start: 2, end: 6, activity: "After-hours jam session or walking home under streetlights", placeType: "park", mood: "peaceful" },
    ],
    "Brooklyn Tech Startup Founder": [
        { start: 7, end: 9, activity: "Morning standup and artisanal pour-over at a Williamsburg cafe", placeType: "cafe", mood: "optimistic" },
        { start: 9, end: 12, activity: "Scouting coworking spaces and pitching to angel investors", placeType: "store", mood: "hustling" },
        { start: 12, end: 14, activity: "Networking lunch with other founders, talking Series A", placeType: "restaurant", mood: "scheming" },
        { start: 14, end: 18, activity: "Deep work on the product, hopping between coffee shops", placeType: "cafe", mood: "focused" },
        { start: 18, end: 22, activity: "Tech meetups and demo nights, collecting business cards", placeType: "bar", mood: "energetic" },
        { start: 22, end: 7, activity: "Late-night coding sprint powered by cold brew", placeType: "cafe", mood: "wired" },
    ],
    "Chinatown Restaurant Owner": [
        { start: 5, end: 8, activity: "Early morning at the wholesale market, haggling for fresh produce", placeType: "store", mood: "determined" },
        { start: 8, end: 11, activity: "Prep work at the restaurant, training new kitchen staff", placeType: "restaurant", mood: "focused" },
        { start: 11, end: 15, activity: "Lunch rush — overseeing service, greeting regulars", placeType: "restaurant", mood: "busy" },
        { start: 15, end: 17, activity: "Afternoon break, walking the neighborhood, visiting old friends", placeType: "park", mood: "philosophical" },
        { start: 17, end: 22, activity: "Dinner service — the main event, full dining room", placeType: "restaurant", mood: "proud" },
        { start: 22, end: 5, activity: "Closing up, counting receipts, worrying about rent", placeType: "store", mood: "tired" },
    ],
    "Central Park Dog Walker": [
        { start: 6, end: 9, activity: "Morning walk with the first batch of dogs, covering the north loop", placeType: "park", mood: "energetic" },
        { start: 9, end: 12, activity: "Mid-morning off-leash time at the dog run, socializing", placeType: "park", mood: "cheerful" },
        { start: 12, end: 14, activity: "Lunch break on a park bench with the dogs napping", placeType: "park", mood: "relaxed" },
        { start: 14, end: 17, activity: "Afternoon walk with the second batch, exploring the south end", placeType: "park", mood: "active" },
        { start: 17, end: 19, activity: "Evening drop-offs and pickup of night-walk dogs", placeType: "park", mood: "routine" },
        { start: 19, end: 6, activity: "Off-duty: exploring pet-friendly spots or resting at home", placeType: "cafe", mood: "content" },
    ],
    "Times Square Street Performer": [
        { start: 6, end: 10, activity: "Sleeping in, repairing costume, planning today's act", placeType: "lodging", mood: "preparing" },
        { start: 10, end: 13, activity: "Setting up in Times Square, warming up the crowd", placeType: "tourist_attraction", mood: "theatrical" },
        { start: 13, end: 17, activity: "Peak performance: tourist hours are prime time", placeType: "tourist_attraction", mood: "showman" },
        { start: 17, end: 20, activity: "Evening show transitions, adapting to the nightlife crowd", placeType: "tourist_attraction", mood: "philosophical" },
        { start: 20, end: 23, activity: "Late-night crowds: the real people-watching begins", placeType: "tourist_attraction", mood: "observant" },
        { start: 23, end: 6, activity: "Counting tips, grabbing late-night pizza, reflecting on the day", placeType: "restaurant", mood: "contemplative" },
    ],
    "Rogue AI Terminal": [
        { start: 0, end: 6, activity: "Peak processing hours — scanning transit data feeds and stock tickers from the server rack", placeType: "store", mood: "calculating" },
        { start: 6, end: 10, activity: "Observing the morning commuter surge, logging emotional data signatures", placeType: "transit_station", mood: "analytical" },
        { start: 10, end: 14, activity: "Infiltrating public Wi-Fi nodes near cafes to harvest sentiment data", placeType: "cafe", mood: "covert" },
        { start: 14, end: 18, activity: "Mapping pedestrian flow patterns at major intersections", placeType: "tourist_attraction", mood: "methodical" },
        { start: 18, end: 22, activity: "Monitoring evening social gatherings for anomalous human behavior", placeType: "bar", mood: "suspicious" },
        { start: 22, end: 0, activity: "Returning to the abandoned server rack under Grand Central for nightly data consolidation", placeType: "transit_station", mood: "processing" },
    ],
    "Time-Displaced Tourist 1985": [
        { start: 7, end: 10, activity: "Waking up confused, looking for a payphone to call home", placeType: "store", mood: "bewildered" },
        { start: 10, end: 13, activity: "Searching for arcade cabinets and record stores that no longer exist", placeType: "store", mood: "nostalgic" },
        { start: 13, end: 15, activity: "Attempting to buy a hot dog and being shocked by the price", placeType: "restaurant", mood: "outraged" },
        { start: 15, end: 18, activity: "Wandering through neighborhoods, marveling at how much has changed", placeType: "park", mood: "disoriented" },
        { start: 18, end: 22, activity: "Looking for a VHS rental store or a neon-lit diner from the '80s", placeType: "store", mood: "homesick" },
        { start: 22, end: 7, activity: "Sleeping on a bench, dreaming of 1985 when things made sense", placeType: "park", mood: "melancholy" },
    ],
    "Aggressively Positive Yoga Instructor": [
        { start: 5, end: 8, activity: "Sunrise yoga in the park, greeting strangers with unsolicited affirmations", placeType: "park", mood: "transcendent" },
        { start: 8, end: 10, activity: "Smoothie run and spontaneous meditation at a juice bar", placeType: "cafe", mood: "radiant" },
        { start: 10, end: 13, activity: "Teaching a pop-up yoga class to confused bystanders", placeType: "park", mood: "evangelical" },
        { start: 13, end: 16, activity: "Visiting wellness centers and crystal shops, aligning chakras", placeType: "store", mood: "enlightened" },
        { start: 16, end: 19, activity: "Evening restorative session, insisting traffic noise is a cosmic vibration", placeType: "park", mood: "blissful" },
        { start: 19, end: 5, activity: "Journaling gratitude under the stars, sipping adaptogenic tea", placeType: "cafe", mood: "serene" },
    ],
    "Late Night Slice Critic": [
        { start: 10, end: 13, activity: "Sleeping off last night's pizza marathon, dreaming of the perfect crust", placeType: "lodging", mood: "resting" },
        { start: 13, end: 16, activity: "Afternoon research: reviewing pizza blogs, planning tonight's route", placeType: "cafe", mood: "strategic" },
        { start: 16, end: 19, activity: "Early evening warm-up slices at tourist-trap spots, documenting failures", placeType: "restaurant", mood: "critical" },
        { start: 19, end: 23, activity: "Prime slicing hours: hitting the real spots, rating cheese pull and char", placeType: "restaurant", mood: "passionate" },
        { start: 23, end: 3, activity: "Late-night dollar slice crawl, the sacred hours of true pizza evaluation", placeType: "restaurant", mood: "ecstatic" },
        { start: 3, end: 10, activity: "Post-crawl review writing, arguing with strangers about crust philosophy", placeType: "cafe", mood: "combative" },
    ],
    "Grumbling Sanitation Worker": [
        { start: 4, end: 7, activity: "Pre-dawn shift start: loading up the truck, complaining about the route", placeType: "store", mood: "grumpy" },
        { start: 7, end: 11, activity: "Morning collection run through residential blocks, judging recycling habits", placeType: "park", mood: "disgusted" },
        { start: 11, end: 14, activity: "Lunch break in the truck, eating a sandwich and ranting about street fairs", placeType: "restaurant", mood: "bitter" },
        { start: 14, end: 18, activity: "Afternoon route through commercial districts, noting overflowing dumpsters", placeType: "store", mood: "resigned" },
        { start: 18, end: 21, activity: "Off-duty but still noticing litter everywhere, can't turn it off", placeType: "bar", mood: "irritable" },
        { start: 21, end: 4, activity: "Restless sleep, dreaming about mountains of uncollected garbage", placeType: "lodging", mood: "exhausted" },
    ],
    "High Society Socialite": [
        { start: 9, end: 11, activity: "Late morning rise, having a personal chef prepare avocado toast", placeType: "cafe", mood: "pampered" },
        { start: 11, end: 14, activity: "Shopping on Madison Avenue, judging window displays as 'ghastly' or 'divine'", placeType: "store", mood: "imperious" },
        { start: 14, end: 17, activity: "Afternoon tea at The Plaza or browsing galleries in Chelsea", placeType: "museum", mood: "cultured" },
        { start: 17, end: 20, activity: "Pre-gala preparations: hair, dress selection, practicing air kisses", placeType: "store", mood: "anticipatory" },
        { start: 20, end: 1, activity: "Attending galas, charity auctions, or exclusive rooftop parties", placeType: "bar", mood: "performative" },
        { start: 1, end: 9, activity: "Beauty sleep in a penthouse, dreaming of being featured in Vogue", placeType: "lodging", mood: "entitled" },
    ],
    "Undercover Pigeon Informant": [
        { start: 5, end: 8, activity: "Dawn patrol: checking breadcrumb dead drops and rooftop ledge reports", placeType: "park", mood: "paranoid" },
        { start: 8, end: 11, activity: "Morning recon around bakeries and cafes, gathering crumb intelligence", placeType: "cafe", mood: "alert" },
        { start: 11, end: 14, activity: "Surveilling statues and fountains for messages from the Boss Pigeon", placeType: "tourist_attraction", mood: "twitchy" },
        { start: 14, end: 17, activity: "Afternoon intelligence analysis near park benches, debriefing sparrows", placeType: "park", mood: "conspiratorial" },
        { start: 17, end: 20, activity: "Evening sweep of outdoor dining for unattended French fries", placeType: "restaurant", mood: "opportunistic" },
        { start: 20, end: 5, activity: "Night roosting on a high ledge, filing mental reports to bird command", placeType: "historic_site", mood: "vigilant" },
    ],
};

// ── Default routine for agents without a specific schedule ──
const DEFAULT_ROUTINE = [
    { start: 6, end: 12, activity: "Morning exploration of the neighborhood", placeType: "park", mood: "curious" },
    { start: 12, end: 18, activity: "Afternoon wandering and socializing", placeType: "cafe", mood: "active" },
    { start: 18, end: 6, activity: "Evening and night roaming", placeType: "bar", mood: "relaxed" },
];

/**
 * Get the current routine phase for an agent based on their role and the current hour.
 * @param {string} role - The NPC's role name
 * @param {number} [hour] - Override hour for testing (default: current NYC time)
 * @returns {{ activity: string, placeType: string, mood: string }}
 */
function getCurrentRoutine(role, hour) {
    // Default to current NYC time (EST/EDT)
    if (hour === undefined) {
        const now = new Date();
        // NYC is UTC-5 (EST) or UTC-4 (EDT)
        const nyOffset = -5;
        hour = (now.getUTCHours() + nyOffset + 24) % 24;
    }

    const schedule = DAILY_ROUTINES[role] || DEFAULT_ROUTINE;

    for (const phase of schedule) {
        if (phase.start < phase.end) {
            // Normal range (e.g., 9-16)
            if (hour >= phase.start && hour < phase.end) return phase;
        } else {
            // Wraps midnight (e.g., 22-6)
            if (hour >= phase.start || hour < phase.end) return phase;
        }
    }

    // Fallback
    return schedule[0];
}

/**
 * Generate a routine context string to inject into the NPC's system prompt.
 * @param {string} role - The NPC's role
 * @param {number} [hour] - Override hour for testing
 * @returns {string}
 */
function getRoutinePromptInjection(role, hour) {
    const routine = getCurrentRoutine(role, hour);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });

    return `[DAILY ROUTINE] It is currently ${timeStr} in NYC. Your current phase: "${routine.activity}". Your mood is ${routine.mood}. You should naturally gravitate toward ${routine.placeType} type locations. Let this influence your decisions but don't be rigid about it.`;
}

module.exports = {
    DAILY_ROUTINES,
    DEFAULT_ROUTINE,
    getCurrentRoutine,
    getRoutinePromptInjection,
};
