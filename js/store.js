const STORAGE_KEY = 'disc_golf_vibe_state';

export const GameTypes = {
    STANDARD: 'standard',
    WOLF: 'wolf',
    BIRDIE_OR_DIE: 'birdie_or_die',
    BINGO_BANGO_BONGO: 'bingo_bango_bongo',
    MATCH_PLAY: 'match_play',
    ELIMINATION: 'elimination',
    BEST_SHOT_DOUBLES: 'best_shot_doubles',
    WORST_SHOT_DOUBLES: 'worst_shot_doubles',
    ALTERNATE_SHOT_DOUBLES: 'alternate_shot_doubles',
    DISC_DICE: 'disc_dice'
};

export const GameTypeDetails = {
    [GameTypes.STANDARD]: { label: 'Standard', icon: '⛳', description: 'Classic stroke play' },
    [GameTypes.WOLF]: { label: 'Wolf', icon: '🐺', description: 'Choose partners each hole' },
    [GameTypes.BIRDIE_OR_DIE]: { label: 'Birdie or Die', icon: '💀', description: 'Birdie or lose a life' },
    [GameTypes.BINGO_BANGO_BONGO]: { label: 'Bingo Bango Bongo', icon: '🎯', description: '3 points per hole' },
    [GameTypes.MATCH_PLAY]: { label: 'Match Play', icon: '⚔️', description: 'Win holes, not strokes' },
    [GameTypes.ELIMINATION]: { label: 'Elimination', icon: '🚫', description: 'Worst score is out' },
    [GameTypes.BEST_SHOT_DOUBLES]: { label: 'Best Shot', icon: '🏆', description: 'Play best throw (doubles)' },
    [GameTypes.WORST_SHOT_DOUBLES]: { label: 'Worst Shot', icon: '😈', description: 'Play worst throw (doubles)' },
    [GameTypes.ALTERNATE_SHOT_DOUBLES]: { label: 'Alternate Shot', icon: '🔄', description: 'Switch throwers (doubles)' },
    [GameTypes.DISC_DICE]: { label: 'Disc Dice', icon: '🎲', description: 'Random disc selection' }
};

export const createInitialState = () => ({
    gameType: GameTypes.STANDARD,
    players: [], // { id: timestamp, name: string }
    config: {
        holeCount: 18,
        defaultPar: 3,
        pars: {} // holeIndex -> par (if different from default)
    },
    scores: {}, // Key: `${holeIndex}_${playerId}` -> score
    currentHole: 1, // 1-based index
    isActive: true,
    isFinished: false,
    wolfData: {
        history: {}, // holeIndex -> { wolfId, partnerId, betType, winningTeam, potValue }
        pot: 0
    }
});

export const saveGame = (state) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Save failed", e);
    }
};

export const loadGame = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error("Load failed", e);
        return null;
    }
};

export const clearGame = () => {
    localStorage.removeItem(STORAGE_KEY);
};

export const removePlayer = (state, playerId) => {
    // 1. Remove from players list
    state.players = state.players.filter(p => p.id !== playerId);

    // 2. Remove associated scores
    Object.keys(state.scores).forEach(key => {
        if (key.endsWith(`_${playerId}`)) {
            delete state.scores[key];
        }
    });

    return state;
};

/**
 * Soft-remove a player for Wolf mode.
 * Marks the player as removed from a specific hole onward.
 * Player retains scores for holes before removal.
 */
export const softRemovePlayer = (state, playerId, currentHole) => {
    const player = state.players.find(p => p.id === playerId);
    if (player) {
        player.removedAtHole = currentHole;
    }
    return state;
};

/**
 * Get active players for a specific hole.
 * Filters out players who were removed before the given hole.
 */
export const getActivePlayers = (players, holeNumber) => {
    return players.filter(p =>
        !p.removedAtHole || p.removedAtHole > holeNumber
    );
};
