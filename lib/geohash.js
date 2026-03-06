/**
 * GeoHash Spatial Indexing (Issue #39)
 *
 * Provides O(1) average-case proximity queries by partitioning agent
 * positions into GeoHash cells. Queries scan only the target cell
 * and its 8 neighbors instead of the full agents collection.
 *
 * Precision 7 (~153m × 153m cells) is used for 50m encounter detection.
 */
const admin = require('firebase-admin');

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode lat/lng to a geohash string at the given precision.
 */
function encode(lat, lng, precision = 7) {
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isLng = true;

    while (hash.length < precision) {
        if (isLng) {
            const mid = (lngMin + lngMax) / 2;
            if (lng >= mid) {
                ch |= (1 << (4 - bit));
                lngMin = mid;
            } else {
                lngMax = mid;
            }
        } else {
            const mid = (latMin + latMax) / 2;
            if (lat >= mid) {
                ch |= (1 << (4 - bit));
                latMin = mid;
            } else {
                latMax = mid;
            }
        }
        isLng = !isLng;
        bit++;
        if (bit === 5) {
            hash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return hash;
}

/**
 * Decode a geohash to its center lat/lng.
 */
function decode(hash) {
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let isLng = true;

    for (const c of hash) {
        const idx = BASE32.indexOf(c);
        for (let bit = 4; bit >= 0; bit--) {
            if (isLng) {
                const mid = (lngMin + lngMax) / 2;
                if (idx & (1 << bit)) lngMin = mid;
                else lngMax = mid;
            } else {
                const mid = (latMin + latMax) / 2;
                if (idx & (1 << bit)) latMin = mid;
                else latMax = mid;
            }
            isLng = !isLng;
        }
    }
    return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 };
}

/**
 * Get the 8 neighboring geohashes plus the center cell itself.
 */
function neighbors(hash) {
    const { lat, lng } = decode(hash);
    const precision = hash.length;

    // Approximate cell dimensions at this precision
    const latBits = Math.floor((precision * 5) / 2);
    const lngBits = Math.ceil((precision * 5) / 2);
    const latStep = 180 / Math.pow(2, latBits);
    const lngStep = 360 / Math.pow(2, lngBits);

    const offsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],  [0, 0],  [0, 1],
        [1, -1],  [1, 0],  [1, 1],
    ];

    return [...new Set(offsets.map(([dLat, dLng]) =>
        encode(lat + dLat * latStep, lng + dLng * lngStep, precision)
    ))];
}

/**
 * Haversine distance in meters between two coordinate pairs.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Query nearby agents using geohash prefix matching.
 * Only scans agents in the same or adjacent geohash cells.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} agentId - Current agent's ID (excluded from results)
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 * @param {number} radiusMeters - Search radius in meters
 * @returns {Promise<Array>} Nearby agents sorted by distance
 */
async function queryNearbyAgents(db, agentId, lat, lng, radiusMeters = 200) {
    const hash = encode(lat, lng, 7);
    const cells = neighbors(hash);

    // Firestore IN query supports up to 30 values — 9 cells fits easily
    const snapshot = await db.collection('agents')
        .where('geohash', 'in', cells)
        .get();

    const results = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (doc.id === agentId || !data.lat || !data.lng) return;
        const dist = haversineMeters(lat, lng, data.lat, data.lng);
        if (dist <= radiusMeters && dist > 10) {
            results.push({
                id: data.agentId || doc.id,
                role: data.role || 'Unknown Entity',
                distanceMeters: Math.round(dist),
                lat: data.lat,
                lng: data.lng,
                currentTask: data.defaultTask || 'Roaming',
            });
        }
    });

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results;
}

module.exports = { encode, decode, neighbors, haversineMeters, queryNearbyAgents };
