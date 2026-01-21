export class WolfGame {
    constructor() { }

    /**
     * Determines who is the Wolf for a given hole.
     * @param {number} holeIndex - 1-based hole index
     * @param {Array} players - Array of player objects {id, name, removedAtHole?}
     * @param {Object} scores - Current game scores map
     * @param {Object} config - Game config (pars, wolfData, etc)
     * @returns {string} Player ID of the Wolf
     */
    static getWolf(holeIndex, players, scores, config) {
        // Check for manual wolf override first
        const override = config.wolfData?.wolfOverrides?.[holeIndex];
        if (override) {
            // Verify the override player is still active
            const overridePlayer = players.find(p => p.id === override);
            if (overridePlayer && (!overridePlayer.removedAtHole || overridePlayer.removedAtHole > holeIndex)) {
                return override;
            }
        }

        // Filter to active players only (not removed before this hole)
        const activePlayers = players.filter(p =>
            !p.removedAtHole || p.removedAtHole > holeIndex
        );

        if (!activePlayers || activePlayers.length === 0) return null;

        const totalHoles = config.holeCount;
        const isCatchUpHole = holeIndex > totalHoles - 2; // Last 2 holes (e.g. 17, 18)

        // Catch-up Rule: Last place player is Wolf
        if (isCatchUpHole && activePlayers.length > 1) {
            return this.getLastPlacePlayer(activePlayers, scores, config);
        }

        // Get random offset from wolfData (set at game start)
        const randomOffset = config.wolfData?.startingWolfIndex || 0;

        // Standard Rotation with random offset
        const playerIndex = (holeIndex - 1 + randomOffset) % activePlayers.length;
        return activePlayers[playerIndex].id;
    }

    static getLastPlacePlayer(players, scores, config) {
        // Calculate total scores (points or strokes?)
        // Wolf uses points. But early in the game, might be 0.
        // Wait, standard Wolf uses POINTS to determine winner.
        // So "Last Place" means fewest points.

        let minPoints = Number.MAX_SAFE_INTEGER;
        let lastPlaceIds = [];

        players.forEach(p => {
            const points = this.calculateTotalPoints(p.id, scores);
            if (points < minPoints) {
                minPoints = points;
                lastPlaceIds = [p.id];
            } else if (points === minPoints) {
                lastPlaceIds.push(p.id);
            }
        });

        // Tie-breaker for last place?
        // Usually rotating if tie. Or random?
        // Let's pick the one who hasn't been Wolf recently?
        // Simple: Pick the first one in the list for now (or random).
        // Let's use the standard rotation index as a deterministic tie breaker?
        // Or just return the first one.
        if (lastPlaceIds.length > 0) return lastPlaceIds[0];

        return players[0].id; // Fallback
    }

    static calculateTotalPoints(playerId, scores) {
        // TODO: This assumes 'scores' contains points. 
        // In Wolf, 'scores' will track POINTS earned per hole.
        let total = 0;
        Object.keys(scores).forEach(key => {
            if (key.endsWith(`_${playerId}`)) {
                total += (scores[key] || 0);
            }
        });
        return total;
    }

    /**
     * Calculates points distribution for a hole.
     * @param {string} winner - 'wolf' | 'pack' | 'tie'
     * @param {string} betType - 'blind' | 'lone' | 'partner'
     * @param {number} currentPot - Points in the pot
     * @param {Array} players - All players
     * @param {string} wolfId - Wolf's ID
     * @param {string|null} partnerId - Partner's ID (if any)
     * @returns {Object} { pointsMap: {playerId: scoreDelta}, newPot: number }
     */
    static calculatePoints(winner, betType, currentPot, players, wolfId, partnerId) {
        const pointsMap = {};
        players.forEach(p => pointsMap[p.id] = 0);

        let newPot = 0; // Usually 0 unless tie

        if (winner === 'tie') {
            // Carry over everything to pot
            // How much? "The value adds to a Pot".
            // Value depends on the bet type.
            let holeValue = 0;
            if (betType === 'partner') holeValue = 2; // Wolf/Partner would have won 2 each. Pack 3.
            // Usually the "Pot" is the "Base Value" of the hole.
            // Let's generalize:
            // Partner Game: Pot accumulates +2? Or +3?
            // "Tie... value adds to a Pot".
            // Let's simplify: +2 for standard, +4 for Lone, +6 for Blind?
            // "The winners of the next hole get their standard points plus the accumulated pot"
            // Let's conservatively add the Wolf's potential win to the pot.
            // Partner: 2 pts. Lone: 4 pts. Blind: 6 pts.

            if (betType === 'blind') holeValue = 6;
            else if (betType === 'lone') holeValue = 4;
            else holeValue = 2; // Partnered

            return { pointsMap, newPot: currentPot + holeValue };
        }

        // Determine Payout
        const payout = currentPot; // Whole pot goes to winners

        if (winner === 'wolf') {
            // Wolf Team Wins
            if (betType === 'blind') {
                // Blind Wolf: 4 pts + 2 bonus = 6 pts
                // Plus Pot
                pointsMap[wolfId] = 6 + payout;
            } else if (betType === 'lone') {
                // Lone Wolf: 4 pts
                // Plus Pot
                pointsMap[wolfId] = 4 + payout;
            } else {
                // Partnered: 2 pts each
                // Plus Pot (Split? Usually shared) -> "Winners get standard points plus pot"
                // Usually pot is per-player or total?
                // Let's assume each winner gets Pot/NumWinners or Pot is "Points per player"?
                // "The value adds to a Pot... winners get standard points + pot".
                // If Pot is 2 points... does everyone get +2? Or +1 each?
                // Standard Wolf skins: Pot is usually just a number added to the winner's score.
                // Let's give FULL pot to EACH winner for simplicity? No that inflates scores.
                // Let's split pot among winners.
                // Actually, usually "Skins" means the hole is worth X.
                // If Pot is 4 points.
                // Partnered Win: Wolf gets 2+4? Partner gets 2+4?
                // Let's assume Pot is "Points per Player".

                pointsMap[wolfId] = 2 + payout;
                if (partnerId) pointsMap[partnerId] = 2 + payout;
            }
        } else if (winner === 'pack') {
            // Pack Wins
            // Identify pack members
            const packMembers = players.filter(p => p.id !== wolfId && p.id !== partnerId);

            let winAmount = 0;
            if (betType === 'partner') winAmount = 3; // Pack beats Partnered Wolf
            else winAmount = 1; // Pack beats Lone/Blind Wolf

            packMembers.forEach(p => {
                pointsMap[p.id] = winAmount + payout;
            });
        }

        return { pointsMap, newPot: 0 }; // Pot claimed
    }
}
