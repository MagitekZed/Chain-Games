import { loadGame, saveGame, clearGame, createInitialState, GameTypes, GameTypeDetails, removePlayer, softRemovePlayer, getActivePlayers } from './store.js';
import { WolfGame } from './game-rules.js';

/* Global State */
let appState = loadGame();

/* DOM Elements */
const main = document.getElementById('main-content');

/* Router / Renderer */
export function render() {
    main.innerHTML = '';

    // Cleanup any open modals
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

    if (!appState || !appState.isActive) {
        new SetupView(main).render();
    } else if (appState.isFinished) {
        new RoundSummaryView(main).render();
    } else {
        // Game Mode Specific Routing
        if (appState.gameType === GameTypes.WOLF) {
            const currentHole = appState.currentHole;
            // Ensure wolfData exists (for existing saves)
            if (!appState.config.wolfData) {
                appState.config.wolfData = { history: {}, pot: 0 };
            }

            // If no decision recorded for this hole, show Pick UI
            if (!appState.config.wolfData.history[currentHole]) {
                new WolfTurnView(main).render();
                return;
            }
        }

        new ScorecardView(main).render();
    }
}

/* --- Helpers --- */
class Modal {
    constructor(contentHTML) {
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'modal-backdrop';
        this.backdrop.innerHTML = `
            <div class="modal-content" onclick="event.stopPropagation()">
                ${contentHTML}
            </div>
        `;
        this.backdrop.addEventListener('click', () => this.close());
    }

    open() {
        document.body.appendChild(this.backdrop);
        requestAnimationFrame(() => this.backdrop.classList.add('open'));
    }

    close() {
        this.backdrop.classList.remove('open');
        setTimeout(() => this.backdrop.remove(), 300);
    }
}

function calculateTotal(playerId) {
    // Match Play: Count hole wins (requires special logic)
    if (appState.gameType === GameTypes.MATCH_PLAY) {
        const pairs = appState.config.matchPlayData?.pairs || [];
        const pair = pairs.find(p => p.player1Id === playerId || p.player2Id === playerId);
        if (!pair) return 0;

        let wins = 0;
        for (let h = 1; h <= appState.config.holeCount; h++) {
            const winner = getMatchPlayHoleWinner(pair, h);
            if (winner === playerId) wins++;
        }
        return wins;
    }

    let total = 0;
    Object.keys(appState.scores).forEach(key => {
        if (key.endsWith(`_${playerId}`)) {
            const holeIndex = parseInt(key.split('_')[0]);
            const score = appState.scores[key];
            const par = appState.config.pars?.[holeIndex] || appState.config.defaultPar;

            if (appState.gameType === GameTypes.WOLF) {
                total += score; // Points
            } else if (appState.gameType === GameTypes.BINGO_BANGO_BONGO) {
                // Score is a BITMASK: 1=Bingo, 2=Bango, 4=Bongo.
                // We need to count set bits to get point total.
                const p1 = score & 1;
                const p2 = (score >> 1) & 1;
                const p3 = (score >> 2) & 1;
                total += (p1 + p2 + p3);
            } else if (appState.gameType === GameTypes.BIRDIE_OR_DIE) {
                // Points only for under par: Birdie=1, Eagle=3, Albatross+=5
                const underPar = par - score;
                if (underPar >= 3) total += 5;      // Albatross or better
                else if (underPar === 2) total += 3; // Eagle
                else if (underPar === 1) total += 1; // Birdie
                // Par or worse = 0 points
            } else {
                total += (score - par); // Standard +/- par
            }
        }
    });
    return total;
}

function calculateTotalStrokes(playerId) {
    if (appState.gameType === GameTypes.WOLF || appState.gameType === GameTypes.BINGO_BANGO_BONGO) return 0; // Avg strokes doesn't apply cleanly

    let total = 0;
    Object.keys(appState.scores).forEach(key => {
        if (key.endsWith(`_${playerId}`)) {
            total += appState.scores[key];
        }
    });
    return total;
}

function generateScoreboardHTML(players, config, scores) {
    const holeCount = config.holeCount;
    const holes = Array.from({ length: holeCount }, (_, k) => k + 1);
    const isWolfMode = appState.gameType === GameTypes.WOLF;
    const isBirdieMode = appState.gameType === GameTypes.BIRDIE_OR_DIE;
    const isPointsMode = isWolfMode || isBirdieMode || appState.gameType === GameTypes.BINGO_BANGO_BONGO || appState.gameType === GameTypes.MATCH_PLAY;
    const hideParRow = isWolfMode;

    // Left Pane Data Rows
    const leftRows = players.map((p, playerIndex) => {
        let currentTotal = calculateTotal(p.id);
        let displayTotal;

        // Match Play: Show "X UP, Y left" notation
        if (appState.gameType === GameTypes.MATCH_PLAY) {
            const pairs = appState.config.matchPlayData?.pairs || [];
            const pair = pairs.find(pr => pr.player1Id === p.id || pr.player2Id === p.id);
            if (pair && pair.player2Id) {
                const status = getMatchPlayStatus(pair);
                const holesPlayed = Object.keys(scores).filter(k => {
                    const [hole, pid] = k.split('_');
                    return pid === pair.player1Id || pid === pair.player2Id;
                }).length / 2; // Approximate holes played
                const holesLeft = config.holeCount - Math.floor(holesPlayed);

                if (status.leaderId === p.id) {
                    displayTotal = `${status.status}`;
                } else if (status.leaderId === null) {
                    displayTotal = 'AS'; // All Square abbreviation
                } else {
                    // This player is down
                    const diff = status.status.replace(' UP', '');
                    displayTotal = `${diff} DN`;
                }
            } else {
                displayTotal = 'Bye';
            }
        } else if (isPointsMode) {
            displayTotal = currentTotal;
        } else {
            const sign = currentTotal > 0 ? '+' : '';
            displayTotal = currentTotal === 0 ? 'E' : (currentTotal > 0 ? sign + currentTotal : currentTotal);
        }

        // For Match Play, add spacer after every pair (every 2 players)
        const isMatchPlay = appState.gameType === GameTypes.MATCH_PLAY;
        const isEndOfPair = isMatchPlay && (playerIndex % 2 === 1) && (playerIndex < players.length - 1);

        const spacerRow = isEndOfPair
            ? `<tr class="sc-pair-spacer"><td colspan="2"></td></tr>`
            : '';

        return `
            <tr>
                <td class="sc-cell-player">${p.name}</td>
                <td class="sc-cell-total">${displayTotal}</td>
            </tr>
            ${spacerRow}
        `;
    }).join('');

    // Left Table Header Strategy:
    // To ensure perfect vertical alignment with the right table, we must MIRROR its row structure exactly.
    // If Right has 2 rows (Holes + Par), Left MUST have 2 explicit rows.
    // If Right has 1 row (Holes), Left MUST have 1 explicit row.

    let leftHeader;
    if (hideParRow) {
        // Wolf Mode: Right side has 1 row. Left side must have 1 row.
        leftHeader = `
            <tr style="height: 32px;"> <!-- Explicit height matching CSS -->
                <th class="sc-cell-player">Player</th>
                <th class="sc-cell-total">Pts</th>
            </tr>
         `;
    } else {
        // Standard/Birdie Mode: Right side has 2 rows. Left side must have 2 rows.
        // We simulate a merged cell by removing the bottom border of the top cell.
        // row 1: Player/Pts labels (no bottom border) + Vertical Offset for centering
        // row 2: Empty spacer cells (has bottom border)
        leftHeader = `
            <tr style="height: 32px;">
                <th class="sc-cell-player no-bottom-border sc-header-offset" style="vertical-align: bottom; padding-bottom: 0;">Player</th>
                <th class="sc-cell-total no-bottom-border sc-header-offset" style="vertical-align: bottom; padding-bottom: 0;">${isPointsMode ? 'Pts' : 'Total'}</th>
            </tr>
            <tr style="height: 32px;">
                <th class="sc-cell-player"></th>
                <th class="sc-cell-total"></th>
            </tr>
         `;
    }

    const leftTable = `
        <table class="sc-table">
            <thead>${leftHeader}</thead>
            <tbody>${leftRows}</tbody>
        </table>
    `;

    // Right Pane Data Rows
    const rightRows = players.map(p => {
        const scoreCells = holes.map(h => {
            const key = `${h}_${p.id}`;
            const val = scores[key];
            if (val !== undefined && val !== null) {
                if (isWolfMode) {
                    const colorStyle = val > 0 ? 'color: var(--accent-primary);' : 'color: var(--text-muted);';
                    return `<td style="${colorStyle}">${val}</td>`;
                } else if (isBirdieMode) {
                    const par = config.pars?.[h] || config.defaultPar;
                    const underPar = par - val;
                    let points = 0;
                    if (underPar >= 3) points = 5;
                    else if (underPar === 2) points = 3;
                    else if (underPar === 1) points = 1;
                    const colorStyle = points > 0 ? 'color: var(--accent-primary);' : 'color: var(--text-muted);';
                    return `<td style="${colorStyle}">${points}</td>`;
                } else if (appState.gameType === GameTypes.BINGO_BANGO_BONGO) {
                    // val is bitmask
                    const p1 = val & 1;
                    const p2 = (val >> 1) & 1;
                    const p3 = (val >> 2) & 1;
                    const points = p1 + p2 + p3;
                    const colorStyle = points > 0 ? 'color: var(--accent-primary);' : 'color: var(--text-muted);';
                    // Optional: tooltip or symbols to show WHICH points?
                    // For now, strict point total is cleanest for grid.
                    return `<td style="${colorStyle}">${points}</td>`;
                } else if (appState.gameType === GameTypes.MATCH_PLAY) {
                    // Show actual strokes: winner=green, loser=grey, tie=white
                    const pairs = appState.config.matchPlayData?.pairs || [];
                    const pair = pairs.find(pr => pr.player1Id === p.id || pr.player2Id === p.id);
                    if (pair && pair.player2Id) {
                        // Get opponent's score
                        const opponentId = pair.player1Id === p.id ? pair.player2Id : pair.player1Id;
                        const opponentScore = scores[`${h}_${opponentId}`];

                        let colorStyle = 'color: var(--text-main);'; // Default white for tie
                        if (opponentScore !== undefined) {
                            if (val < opponentScore) {
                                colorStyle = 'color: var(--success); font-weight: 700;'; // Winner - green
                            } else if (val > opponentScore) {
                                colorStyle = 'color: var(--text-muted);'; // Loser - grey
                            }
                            // Equal = white (default)
                        }
                        return `<td style="${colorStyle}">${val}</td>`;
                    }
                    // Solo/Bye player
                    return `<td style="color: var(--text-main);">${val}</td>`;
                } else {
                    const par = config.pars?.[h] || config.defaultPar;
                    let colorClass = '';
                    if (val < par) colorClass = 'text-success';
                    if (val > par) colorClass = 'text-danger';
                    return `<td class="${colorClass}">${val}</td>`;
                }
            }
            return '<td style="color: var(--text-muted); font-weight: 300;">-</td>';
        }).join('');

        // For Match Play, add spacer after every pair (every 2 players)
        const isMatchPlay = appState.gameType === GameTypes.MATCH_PLAY;
        const playerIndex = players.indexOf(p);
        const isEndOfPair = isMatchPlay && (playerIndex % 2 === 1) && (playerIndex < players.length - 1);

        const spacerRow = isEndOfPair
            ? `<tr class="sc-pair-spacer"><td colspan="${holes.length}"></td></tr>`
            : '';

        return `<tr>${scoreCells}</tr>${spacerRow}`;
    }).join('');

    // Right Table Header - Strictly 1 or 2 rows matching left side
    const rightHeader = hideParRow ?
        // 1 Row (Wolf)
        `<tr style="height: 32px;">
            ${holes.map(h => `<th class="sc-hole-header">${h}</th>`).join('')}
         </tr>` :
        // 2 Rows (Standard/Birdie)
        `<tr style="height: 32px;">
            ${holes.map(h => `<th class="sc-hole-header">${h}</th>`).join('')}
         </tr>
         <tr style="height: 32px;">
            ${holes.map(h => {
            const holePar = config.pars?.[h] || config.defaultPar;
            return `<th class="sc-par-header">P${holePar}</th>`;
        }).join('')}
         </tr>`;

    const finalLeftTable = leftTable; // leftTable is already the full table string

    const finalRightTable = `
        <table class="sc-table">
            <thead>${rightHeader}</thead>
            <tbody>${rightRows}</tbody>
        </table>
    `;

    return `
        <div class="scoreboard-container">
            <div class="scoreboard-fixed-side">
                ${finalLeftTable}
            </div>
            <div class="scoreboard-scroll-side">
                ${finalRightTable}
            </div>
        </div>
    `;
}


/* --- Views --- */

class SetupView {
    constructor(container) {
        this.container = container;
        this.state = {
            gameType: GameTypes.STANDARD,
            holeCount: 18,
            players: ['', '']
        };
    }

    render() {
        const selectedDetails = GameTypeDetails[this.state.gameType];
        this.container.innerHTML = `
            <div class="setup-container fade-in">
                <header style="margin-bottom: var(--spacing-lg)">
                    <h1>New Round</h1>
                </header>

                <section class="input-group" style="margin-bottom: var(--spacing-md);">
                    <label style="color: var(--accent-primary); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Game Mode</label>
                    <div class="game-type-grid" style="
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: var(--spacing-xs);
                        margin-top: var(--spacing-xs);
                    ">
                        ${Object.values(GameTypes).map(type => {
            const details = GameTypeDetails[type];
            const isActive = this.state.gameType === type;
            return `
                                <div class="glass-panel game-option ${isActive ? 'active' : ''}" 
                                     data-type="${type}"
                                     style="
                                        padding: var(--spacing-xs) 4px;
                                        min-height: 58px;
                                        text-align: center; 
                                        cursor: pointer; 
                                        border: 2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'};
                                        background: ${isActive ? 'rgba(163, 230, 53, 0.1)' : 'var(--card-bg)'};
                                        transition: var(--transition-fast);
                                        display: flex;
                                        flex-direction: column;
                                        align-items: center;
                                        justify-content: center;
                                     ">
                                    <div style="font-size: 1.1rem; margin-bottom: 3px;">${details.icon}</div>
                                    <div style="font-size: 0.55rem; font-weight: 600; line-height: 1.15; word-break: break-word;">${details.label}</div>
                                </div>
                            `;
        }).join('')}
                    </div>
                    <div id="game-mode-description" class="glass-panel" style="
                        margin-top: var(--spacing-sm);
                        padding: var(--spacing-sm);
                        text-align: center;
                    ">
                        <div style="margin-bottom: var(--spacing-xs);">
                            <span style="font-size: 1rem;">${selectedDetails.icon}</span>
                            <strong style="color: var(--text-main); margin-left: 4px;">${selectedDetails.label}</strong>
                            <span style="color: var(--text-muted);"> — ${selectedDetails.description}</span>
                        </div>
                        <button id="view-rules-btn" class="btn" style="
                            background: rgba(255,255,255,0.06);
                            border: 1px solid var(--card-border);
                            color: var(--text-muted);
                            padding: 4px 14px;
                            font-size: 0.7rem;
                            border-radius: 20px;
                        ">📖 View Rules</button>
                    </div>
                </section>

                <section class="input-group" style="margin-bottom: var(--spacing-md);">
                    <label style="color: var(--accent-primary); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Course Settings</label>
                    <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-xs);">
                        <div class="glass-panel flex-center gap-sm" style="flex: 1; padding: var(--spacing-xs);">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Holes</span>
                            <button class="btn btn-icon" id="dec-holes">−</button>
                            <span id="hole-count-display" style="font-weight: 700; min-width: 40px; text-align: center;">${this.state.holeCount}</span>
                            <button class="btn btn-icon" id="inc-holes">+</button>
                        </div>
                        <button id="customize-pars-btn" class="btn" style="background: rgba(255,255,255,0.08); border: 1px solid var(--card-border); color: var(--text-main); padding: var(--spacing-xs) var(--spacing-sm);">
                            ⚙️ Pars
                        </button>
                    </div>
                </section>

                <section class="input-group" style="margin-bottom: var(--spacing-md);">
                    <label style="color: var(--accent-primary); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Players</label>
                    <div id="player-list" style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-top: var(--spacing-xs);">
                        <!-- Players injected here -->
                    </div>
                    <button id="add-player-btn" class="btn" style="margin-top: var(--spacing-sm); background: rgba(255,255,255,0.08); border: 1px dashed var(--card-border); color: var(--text-main);">
                        + Add Player
                    </button>
                </section>

                <button id="start-game-btn" class="btn btn-primary" style="margin-top: var(--spacing-sm)">
                    Start Round
                </button>
            </div>
        `;

        this.attachEvents();
        this.renderPlayerList();
    }

    renderPlayerList() {
        const list = document.getElementById('player-list');
        list.innerHTML = this.state.players.map((name, index) => `
            <div class="flex-center gap-sm">
                <input type="text" placeholder="Player ${index + 1}" value="${name}" data-index="${index}" class="player-input">
                ${this.state.players.length > 1 ? `
                    <button class="btn btn-icon remove-player" data-index="${index}" style="width: 40px; height: 40px; background: rgba(248, 113, 113, 0.1); color: var(--danger);">
                        ✕
                    </button>
                ` : ''}
            </div>
        `).join('');
    }

    attachEvents() {
        this.container.querySelectorAll('.game-option').forEach(el => {
            el.addEventListener('click', () => {
                this.state.gameType = el.dataset.type;
                // Update active states without full re-render
                this.container.querySelectorAll('.game-option').forEach(opt => {
                    const isActive = opt.dataset.type === this.state.gameType;
                    opt.classList.toggle('active', isActive);
                    opt.style.border = `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`;
                    opt.style.background = isActive ? 'rgba(163, 230, 53, 0.1)' : 'var(--card-bg)';
                });
                // Update description
                const desc = document.getElementById('game-mode-description');
                if (desc) {
                    const details = GameTypeDetails[this.state.gameType];
                    const textDiv = desc.querySelector('div');
                    if (textDiv) {
                        textDiv.innerHTML = `
                            <span style="font-size: 1rem;">${details.icon}</span>
                            <strong style="color: var(--text-main); margin-left: 4px;">${details.label}</strong>
                            <span style="color: var(--text-muted);"> — ${details.description}</span>
                        `;
                    }
                }
            });
        });

        document.getElementById('dec-holes').addEventListener('click', () => {
            if (this.state.holeCount > 1) {
                this.state.holeCount--;
                document.getElementById('hole-count-display').innerText = this.state.holeCount;
            }
        });
        document.getElementById('inc-holes').addEventListener('click', () => {
            if (this.state.holeCount < 99) {
                this.state.holeCount++;
                document.getElementById('hole-count-display').innerText = this.state.holeCount;
            }
        });

        document.getElementById('customize-pars-btn').addEventListener('click', () => {
            new ParConfigModal(this.state).open();
        });

        document.getElementById('view-rules-btn').addEventListener('click', () => {
            new RulesModal(this.state.gameType).open();
        });

        document.getElementById('add-player-btn').addEventListener('click', () => {
            this.state.players.push('');
            this.render();
        });

        document.getElementById('player-list').addEventListener('input', (e) => {
            if (e.target.classList.contains('player-input')) {
                const index = parseInt(e.target.dataset.index);
                this.state.players[index] = e.target.value;
            }
        });

        document.getElementById('player-list').addEventListener('click', (e) => {
            if (e.target.closest('.remove-player')) {
                const index = parseInt(e.target.closest('.remove-player').dataset.index);
                this.state.players.splice(index, 1);
                this.render();
            }
        });

        document.getElementById('start-game-btn').addEventListener('click', () => {
            this.startGame();
        });
    }

    startGame() {
        const validPlayers = this.state.players.map(p => p.trim()).filter(p => p !== '');
        if (validPlayers.length === 0) {
            alert("Please add at least one player.");
            return;
        }

        const newState = createInitialState();
        newState.gameType = this.state.gameType;
        newState.config.holeCount = this.state.holeCount;

        // Transfer custom pars if they exist in setup state
        if (this.state.customPars) {
            newState.config.pars = { ...this.state.customPars };
        }

        newState.players = validPlayers.map(name => ({
            id: crypto.randomUUID(),
            name: name
        }));

        // Wolf mode: set random starting wolf
        if (newState.gameType === GameTypes.WOLF) {
            newState.config.wolfData = {
                history: {},
                pot: 0,
                startingWolfIndex: Math.floor(Math.random() * newState.players.length)
            };
        }

        // Bingo mode: Randomize start order
        if (newState.gameType === GameTypes.BINGO_BANGO_BONGO) {
            for (let i = newState.players.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newState.players[i], newState.players[j]] = [newState.players[j], newState.players[i]];
            }
        }

        // Match Play mode: Create pairs
        if (newState.gameType === GameTypes.MATCH_PLAY) {
            const pairs = [];
            for (let i = 0; i < newState.players.length; i += 2) {
                if (i + 1 < newState.players.length) {
                    pairs.push({
                        player1Id: newState.players[i].id,
                        player2Id: newState.players[i + 1].id
                    });
                } else {
                    // Odd player - solo (bye)
                    pairs.push({
                        player1Id: newState.players[i].id,
                        player2Id: null // No opponent
                    });
                }
            }
            newState.config.matchPlayData = { pairs };
        }

        appState = newState;
        saveGame(appState);
        render();
    }
}

class WolfTurnView {
    constructor(container) {
        this.container = container;
    }

    render() {
        const currentHole = appState.currentHole;
        const wolfId = WolfGame.getWolf(currentHole, appState.players, appState.scores, appState.config);
        const wolfPlayer = appState.players.find(p => p.id === wolfId);

        // Filter out wolf and removed players to get selectable partners
        const activePlayers = getActivePlayers(appState.players, currentHole);
        const potentialPartners = activePlayers.filter(p => p.id !== wolfId);

        // Check if we're editing a past hole
        const isEditing = appState.config.wolfData?.editingHole === currentHole;

        this.container.innerHTML = `
            <div class="turn-container fade-in" style="max-width: 600px; margin: 0 auto;">
                <header class="glass-panel" style="text-align: center; margin-bottom: var(--spacing-lg); padding: var(--spacing-md);">
                    <div class="subtitle" style="margin-bottom: var(--spacing-xs);">HOLE ${currentHole}</div>
                    <div style="font-size: 3rem; margin-bottom: var(--spacing-sm);">🐺</div>
                    <h1 style="font-size: 1.8rem; margin: 0; color: var(--accent-primary);">The Hunt</h1>
                    <p style="margin-top: var(--spacing-sm); font-size: 1.1rem;">
                        <strong style="color: var(--text-main);">${wolfPlayer.name}</strong> is the Wolf
                        <button id="change-wolf-btn" class="btn" style="margin-left: 8px; font-size: 0.7rem; padding: 4px 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);">
                            🔄 Change
                        </button>
                    </p>
                    ${isEditing ? `
                        <button id="cancel-edit-btn" class="btn" style="margin-top: var(--spacing-sm); font-size: 0.8rem; padding: 6px 16px; background: rgba(248, 113, 113, 0.2); border: 1px solid rgba(248, 113, 113, 0.4); color: var(--danger);">
                            ❌ Cancel Edit
                        </button>
                    ` : ''}
                </header>

                <div class="glass-panel" style="padding: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
                        <h3 style="margin: 0;">Make Your Choice</h3>
                        <label class="toggle-switch" style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                            <input type="checkbox" id="blind-wolf-toggle">
                            <span style="color: var(--accent-secondary);">🙈 Blind Wolf (+2 pts)</span>
                        </label>
                    </div>

                    <div id="partner-selection-area">
                        <p class="subtitle" style="margin-bottom: var(--spacing-sm);">Select a Partner:</p>
                        <div class="grid-list" style="display: grid; gap: var(--spacing-sm);">
                            ${potentialPartners.map(p => `
                                <button class="btn partner-btn" data-id="${p.id}" style="
                                    background: rgba(255,255,255,0.12); 
                                    border: 1px solid rgba(255,255,255,0.2);
                                    justify-content: space-between;
                                    padding: var(--spacing-sm) var(--spacing-md);
                                ">
                                    <span style="color: var(--text-main);">${p.name}</span>
                                    <span style="font-size: 0.8rem; color: var(--accent-secondary);">Select</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="glass-panel" style="padding: var(--spacing-md); text-align: center;">
                    <p class="subtitle" style="margin-bottom: var(--spacing-sm);">Or go it alone:</p>
                    <button id="lone-wolf-btn" class="btn btn-primary" style="width: 100%; background: var(--accent-primary); color: #000;">
                        🐺 Lone Wolf (1 vs All)
                    </button>
                    <p class="subtitle" style="font-size: 0.75rem; margin-top: 8px;">
                        Win: 4 pts | Pack Wins: 1 pt
                    </p>
                </div>
            </div>
        `;

        this.attachEvents(wolfId, activePlayers);
    }

    attachEvents(wolfId, activePlayers) {
        const blindToggle = document.getElementById('blind-wolf-toggle');
        const partnerArea = document.getElementById('partner-selection-area');
        const loneWolfBtn = document.getElementById('lone-wolf-btn');

        // Toggle Blind Wolf visibility
        blindToggle.addEventListener('change', (e) => {
            const isBlind = e.target.checked;
            if (isBlind) {
                // Hide partner selection, update Lone Wolf button text
                partnerArea.style.opacity = '0.3';
                partnerArea.style.pointerEvents = 'none';
                loneWolfBtn.innerHTML = '🙈 Confirm Blind Wolf';
            } else {
                partnerArea.style.opacity = '1';
                partnerArea.style.pointerEvents = 'auto';
                loneWolfBtn.innerHTML = '🐺 Lone Wolf (1 vs All)';
            }
        });

        // Partner Selection
        this.container.querySelectorAll('.partner-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const partnerId = btn.dataset.id;
                this.saveDecision(wolfId, partnerId, 'partner');
            });
        });

        // Lone / Blind Wolf
        loneWolfBtn.addEventListener('click', () => {
            if (blindToggle.checked) {
                this.saveDecision(wolfId, null, 'blind');
            } else {
                this.saveDecision(wolfId, null, 'lone');
            }
        });

        // Change Wolf button
        const changeWolfBtn = document.getElementById('change-wolf-btn');
        if (changeWolfBtn) {
            changeWolfBtn.addEventListener('click', () => {
                new ChangeWolfModal(activePlayers, wolfId).open();
            });
        }

        // Cancel Edit button
        const cancelEditBtn = document.getElementById('cancel-edit-btn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                const backup = appState.config.wolfData.editBackup;
                const hole = appState.config.wolfData.editingHole;

                if (backup && hole) {
                    // Restore history
                    appState.config.wolfData.history[hole] = backup.history;
                    // Restore scores
                    Object.assign(appState.scores, backup.scores);
                }

                // Clear edit state
                delete appState.config.wolfData.editingHole;
                delete appState.config.wolfData.editBackup;

                saveGame(appState);
                render();
            });
        }
    }

    saveDecision(wolfId, partnerId, betType) {
        // Clear edit state since we're committing a new decision
        delete appState.config.wolfData.editingHole;
        delete appState.config.wolfData.editBackup;

        // Init history for hole if not exists (handled in render, but good to be safe)
        if (!appState.config.wolfData.history[appState.currentHole]) {
            appState.config.wolfData.history[appState.currentHole] = {};
        }

        appState.config.wolfData.history[appState.currentHole] = {
            wolfId,
            partnerId, // null if lone/blind
            betType,
            winningTeam: null, // To be determined
            potValue: 0 // To be determined if tie
        };

        saveGame(appState);
        render(); // Route to ScorecardView
    }
}

class ScorecardView {
    constructor(container) {
        this.container = container;
    }

    render() {
        if (appState.gameType === GameTypes.WOLF) {
            this.renderWolfScoring();
        } else if (appState.gameType === GameTypes.MATCH_PLAY) {
            this.renderMatchPlayScoring();
        } else {
            this.renderStandardScoring();
        }
        this.attachEvents();
    }

    renderStandardScoring() {
        const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
        const isLastHole = appState.currentHole === appState.config.holeCount;

        this.container.innerHTML = `
            <div class="scorecard-container fade-in">
                ${this.renderHeader(par)}
                <div class="player-scores" style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg);">
                    ${appState.players.map(p => this.renderPlayerRow(p)).join('')}
                </div>
                ${this.renderNavigation(isLastHole)}
            </div>
        `;
    }

    renderWolfScoring() {
        const currentHole = appState.currentHole;
        const par = appState.config.pars?.[currentHole] || appState.config.defaultPar;
        const isLastHole = currentHole === appState.config.holeCount;
        const wolfData = appState.config.wolfData.history[currentHole];

        // Defend against missing data (e.g. if loaded from old save mid-hole without pick)
        if (!wolfData) {
            // Should have been caught by router, but just in case
            return;
        }

        // Init temp strokes if needed
        if (!wolfData.strokes) {
            wolfData.strokes = { wolf: par, pack: par };
        }

        // Identify Teams
        const wolfTeam = [appState.players.find(p => p.id === wolfData.wolfId)];
        if (wolfData.partnerId) {
            wolfTeam.push(appState.players.find(p => p.id === wolfData.partnerId));
        }
        const packTeam = appState.players.filter(p => p.id !== wolfData.wolfId && p.id !== wolfData.partnerId);

        const potDisplay = appState.config.wolfData.pot > 0
            ? `<div style="background: var(--accent-secondary); color: #000; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 0.9rem;">🍯 Pot: ${appState.config.wolfData.pot}</div>`
            : '';

        this.container.innerHTML = `
            <div class="scorecard-container fade-in">
                ${this.renderHeader(par, 'Wolf Scoring', potDisplay)}
                
                <div class="player-scores" style="display: flex; flex-direction: column; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <!-- Wolf Team -->
                    ${this.renderTeamRow('Wolf Team', wolfTeam, wolfData.strokes.wolf, 'wolf', wolfData.betType === 'blind' ? '🙈 Blind Wolf' : (wolfData.betType === 'lone' ? '🐺 Lone Wolf' : ''))}
                    
                    <!-- Pack Team -->
                    ${this.renderTeamRow('The Pack', packTeam, wolfData.strokes.pack, 'pack')}
                </div>
                
                <div style="text-align: center; margin-bottom: var(--spacing-md); display: flex; gap: var(--spacing-sm); justify-content: center; flex-wrap: wrap;">
                    <button id="edit-pick-btn" class="btn" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem; padding: 8px 16px; color: var(--text-main);">
                        ✏️ Edit Wolf Pick
                    </button>
                    ${currentHole > 1 ? `
                        <button id="edit-past-holes-btn" class="btn" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem; padding: 8px 16px; color: var(--text-main);">
                            📜 Edit Past Holes
                        </button>
                    ` : ''}
                </div>
                
                ${this.renderNavigation(isLastHole)}
            </div>
        `;
    }

    renderMatchPlayScoring() {
        const currentHole = appState.currentHole;
        const par = appState.config.pars?.[currentHole] || appState.config.defaultPar;
        const isLastHole = currentHole === appState.config.holeCount;
        const pairs = appState.config.matchPlayData?.pairs || [];

        // Generate pair cards
        const pairCardsHTML = pairs.map((pair, pairIndex) => {
            const p1 = appState.players.find(p => p.id === pair.player1Id);
            const p2 = pair.player2Id ? appState.players.find(p => p.id === pair.player2Id) : null;

            const s1 = appState.scores[`${currentHole}_${pair.player1Id}`];
            const s2 = pair.player2Id ? appState.scores[`${currentHole}_${pair.player2Id}`] : null;

            // Hole winner for this hole
            const holeWinner = getMatchPlayHoleWinner(pair, currentHole);

            // Match status with holes remaining
            const matchStatus = getMatchPlayStatus(pair);
            const holesRemaining = appState.config.holeCount - currentHole + 1;
            const leader = matchStatus.leaderId ? appState.players.find(p => p.id === matchStatus.leaderId)?.name : null;

            // Check if match is clinched (lead > remaining holes)
            const leadAmount = parseInt(matchStatus.status.replace(' UP', '')) || 0;
            const isClinched = matchStatus.leaderId && leadAmount > holesRemaining;

            let statusText;
            let statusColor = 'var(--accent-primary)';
            if (matchStatus.leaderId) {
                statusText = `${leader}: ${matchStatus.status}, ${holesRemaining} left`;
                if (isClinched) {
                    statusText = `${leader} WINS! 🏆`;
                    statusColor = 'var(--success)';
                }
            } else {
                statusText = `All Square, ${holesRemaining} left`;
            }

            // Render player row helper
            const renderMatchPlayerRow = (player, score, isWinner, opponentScore) => {
                if (!player) return '';

                let scoreColor = 'var(--text-main)';
                if (score !== undefined && opponentScore !== undefined) {
                    if (score < opponentScore) scoreColor = 'var(--success)';
                    if (score > opponentScore) scoreColor = 'var(--danger)';
                }

                const winnerBadge = isWinner === player.id
                    ? '<span style="color: var(--success); margin-left: 8px;">✓</span>'
                    : (isWinner === 'halved' ? '<span style="color: var(--text-muted); margin-left: 8px;">½</span>' : '');

                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600;">${player.name}</span>
                            ${winnerBadge}
                        </div>
                        <div class="flex-center gap-sm">
                            <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="dec" style="background: rgba(255,255,255,0.1); width: 40px; height: 40px;">−</button>
                            <div class="score-display" data-id="${player.id}" style="font-size: 1.4rem; font-weight: 800; width: 36px; text-align: center; color: ${scoreColor};">${score !== undefined ? score : '-'}</div>
                            <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="inc" style="background: rgba(255,255,255,0.1); width: 40px; height: 40px;">+</button>
                        </div>
                    </div>
                `;
            };

            return `
                <div class="glass-panel" style="padding: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">Match ${pairIndex + 1}</span>
                        <span style="font-size: 0.85rem; font-weight: 600; color: ${statusColor};">${statusText}</span>
                    </div>
                    ${renderMatchPlayerRow(p1, s1, holeWinner, s2)}
                    ${p2 ? renderMatchPlayerRow(p2, s2, holeWinner, s1) : '<div style="padding: 8px 0; color: var(--text-muted); font-style: italic;">Bye</div>'}
                </div>
            `;
        }).join('');

        this.container.innerHTML = `
            <div class="scorecard-container fade-in">
                ${this.renderHeader(par, 'Match Play')}
                <div class="player-scores" style="display: flex; flex-direction: column; gap: var(--spacing-xs); margin-bottom: var(--spacing-lg);">
                    ${pairCardsHTML}
                </div>
                ${this.renderNavigation(isLastHole)}
            </div>
        `;
    }

    renderHeader(par, subtitle = null, extra = '') {
        const subLabel = subtitle || GameTypeDetails[appState.gameType].label;
        return `
            <header class="glass-panel" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <button id="menu-btn" class="btn btn-icon" style="width: 32px; height: 32px;">☰</button>
                    <div>
                        <h2 style="margin: 0; font-size: 1.5rem; line-height: 1;">Hole ${appState.currentHole}</h2>
                        <span class="subtitle" style="font-size: 0.75rem;">of ${appState.config.holeCount}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    ${extra}
                    <div style="text-align: right; cursor: pointer;" id="header-par-display">
                        <h2 style="margin: 0; font-size: 1.5rem; line-height: 1; color: var(--accent-primary); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 4px;">Par ${par}</h2>
                        <span class="subtitle" style="font-size: 0.75rem;">${subLabel}</span>
                    </div>
                </div>
            </header>
        `;
    }

    renderNavigation(isLastHole) {
        return `
            <div class="glass-panel" style="padding: var(--spacing-sm); display: flex; gap: var(--spacing-sm);">
                <button id="prev-btn" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main);" ${appState.currentHole === 1 ? 'disabled' : ''}>
                    Prev
                </button>
                ${isLastHole ? `
                    <button id="finish-round-btn" class="btn btn-primary">Finish Round</button>
                ` : `
                    <button id="next-btn" class="btn btn-primary">Next Hole</button>
                `}
            </div>
        `;
    }

    renderTeamRow(teamName, members, score, teamKey, badge = '') {
        const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
        let scoreColor = 'var(--text-main)';
        if (score < par) scoreColor = 'var(--success)';
        if (score > par) scoreColor = 'var(--danger)';

        return `
            <div class="glass-panel" style="padding: var(--spacing-md); display: flex; align-items: center; justify-content: space-between; border-left: 4px solid ${teamKey === 'wolf' ? 'var(--accent-primary)' : 'var(--text-muted)'};">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="font-weight: 700; font-size: 1.1rem;">${teamName}</div>
                        ${badge ? `<span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${badge}</span>` : ''}
                    </div>
                    <div class="subtitle" style="font-size: 0.8rem; margin-top: 4px; line-height: 1.4;">
                        ${members.map(p => p.name).join(', ')}
                    </div>
                </div>
                
                <div class="flex-center gap-sm">
                    <button class="btn btn-icon team-score-btn" data-team="${teamKey}" data-action="dec" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">−</button>
                    <div style="font-size: 1.5rem; font-weight: 800; width: 40px; text-align: center; color: ${scoreColor};">${score}</div>
                    <button class="btn btn-icon team-score-btn" data-team="${teamKey}" data-action="inc" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">+</button>
                </div>
            </div>
        `;
    }

    renderPlayerRow(player) {
        const scoreKey = `${appState.currentHole}_${player.id}`;
        const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
        const currentScore = appState.scores[scoreKey]; // Can be undefined

        // Use Global Helper
        const totalScore = calculateTotal(player.id);

        // --- BINGO BANGO BONGO RENDERING ---
        if (appState.gameType === GameTypes.BINGO_BANGO_BONGO) {
            // currentScore is 0-3 int basically. 
            // We need to know WHICH points they have?
            // Ah, wait. If we just store a number '3', we don't know if it's Bingo+Bango+Bongo or just 3 points.
            // But the rules say: 1 pt for Bingo, 1 for Bango, 1 for Bongo.
            // User input requires knowing WHICH ones.
            // So `appState.scores` for this mode should probably be a bitmask or object?
            // OR, simplier: we rely on the specific points?
            // Let's use string keys in `appState.scores`? No, schema expects numbers usually.
            // BITMASK: 1=Bingo, 2=Bango, 4=Bongo.
            // Score = Total.
            // Wait, if I change the storage format, `calculateTotal` might break if it expects simple sum?
            // Actually, `calculateTotal` just sums the values.
            // If I store "7" (1+2+4), then the total score is 7. That's WRONG.
            // The total score should be 3.
            // So I can't store the bitmask directly as the score if I want `calculateTotal` to just work by summing.
            //
            // Pivot: Use a separate data structure for "Point Details" or encode it?
            // Standard Score: Just the INTEGER (0, 1, 2, 3).
            // BUT mapping toggles to that integer is lossy (Did they get Bingo or Bango?).
            // Does it matter? "Order of play matters...".
            // If I just store "1", I don't know IF it was Bingo.
            // Does the user care later? Maybe not.
            // BUT the user interface needs to show WHICH toggle is active.
            //
            // SOLUTION: Store the bitmask in `appState.scores` but update `calculateTotal` to count bits.
            // 1 (Bingo) -> 1 pt
            // 2 (Bango) -> 1 pt
            // 4 (Bongo) -> 1 pt
            // 3 (Bingo + Bango) -> 2 pts
            // 7 (All) -> 3 pts.

            // I need to update `calculateTotal` slightly to handle this bitmask or just use a helper "countSetBits".
            // Let's verify calculateTotal again. It just does `total += val`.
            // So if I store 7, user gets 7 points. BAD.

            // Okay, I will store the score as the proper INT (0-3).
            // AND I will store the *breakdown* in `wolfData` or a new `holeData`?
            // `wolfData` is specific name but generic structure? `history`?
            // Or just use `appState.scores` for the POINT TOTAL, and maybe local state for the UI?
            // No, persistence.

            // Let's use `appState.scores` to store the BITMASK (1, 2, 4).
            // And fixing `calculateTotal` is trivial. I'll do that in a follow-up step.

            const mask = currentScore || 0;
            const hasBingo = (mask & 1) !== 0; // 001
            const hasBango = (mask & 2) !== 0; // 010
            const hasBongo = (mask & 4) !== 0; // 100

            // Subtitle: Just Total Points (Raw Number)
            return `
                <div class="glass-panel" style="padding: var(--spacing-sm); display: flex; align-items: center; justify-content: space-between;">
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 1.1rem;">${player.name}</div>
                        <div class="subtitle" style="font-size: 0.8rem; height: 1.2em;" id="total-subtitle-${player.id}">
                            Points: ${totalScore}
                        </div>
                    </div>
                    
                    <div class="flex-center gap-xs">
                        <button class="btn btn-sm ${hasBingo ? 'btn-primary' : 'btn-ghost'} bingo-btn" 
                                data-id="${player.id}" data-type="1"
                                onclick="toggleBingoPoint('${player.id}', 1)"
                                style="width: auto; padding: 0 12px; border: 1px solid var(--card-border); font-size: 0.8rem;">
                            BINGO
                        </button>
                        <button class="btn btn-sm ${hasBango ? 'btn-primary' : 'btn-ghost'} bingo-btn" 
                                data-id="${player.id}" data-type="2"
                                onclick="toggleBingoPoint('${player.id}', 2)"
                                style="width: auto; padding: 0 12px; border: 1px solid var(--card-border); font-size: 0.8rem;">
                            BANGO
                        </button>
                        <button class="btn btn-sm ${hasBongo ? 'btn-primary' : 'btn-ghost'} bingo-btn" 
                                data-id="${player.id}" data-type="4"
                                onclick="toggleBingoPoint('${player.id}', 4)"
                                style="width: auto; padding: 0 12px; border: 1px solid var(--card-border); font-size: 0.8rem;">
                            BONGO
                        </button>
                    </div>
                </div>
            `;
        }

        const totalStrokes = calculateTotalStrokes(player.id);
        let scoreColor = 'var(--text-main)';
        let displayScore = '-';

        if (currentScore !== undefined && currentScore !== null) {
            displayScore = currentScore;
            if (currentScore < par) scoreColor = 'var(--success)';
            if (currentScore > par) scoreColor = 'var(--danger)';
        } else {
            scoreColor = 'var(--text-muted)'; // Default gray for unset
        }

        // FORMATTING: Check if we are in a Points Mode where strokes don't matter relative to par in the same way
        // Wolf, BirdieOrDie, BingoBangoBongo are Point games. Standard is Stroke game.
        // Actually BirdieOrDie is points, but derived from strokes. 
        // Wolf is points.
        // Bingo is points.
        // Standard is Relative to Par.

        const isPointsMode = appState.gameType === GameTypes.WOLF ||
            appState.gameType === GameTypes.BIRDIE_OR_DIE ||
            appState.gameType === GameTypes.BINGO_BANGO_BONGO;

        let totalDisplay = '';
        if (isPointsMode) {
            // Just show the raw number. No +/-
            totalDisplay = `${totalScore}`;
        } else {
            // Standard formatting
            if (totalScore > 0) totalDisplay = `+${totalScore}`;
            else if (totalScore === 0) totalDisplay = 'E';
            else totalDisplay = `${totalScore}`;
        }

        // Wolf/Bingo don't usually use this code path (they return Early), but BirdieOrDie DOES.
        // And standard falls through.

        return `
            <div class="glass-panel" style="padding: var(--spacing-sm); display: flex; align-items: center; justify-content: space-between;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 1.1rem;">${player.name}</div>
                    <div class="subtitle" style="font-size: 0.8rem;" id="total-subtitle-${player.id}">Score: ${totalDisplay} (Total: ${totalStrokes})</div>
                </div>
                
                <div class="flex-center gap-sm">
                    <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="dec" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">−</button>
                    <div class="score-display" data-id="${player.id}" style="font-size: 1.5rem; font-weight: 800; width: 40px; text-align: center; color: ${scoreColor};">${displayScore}</div>
                    <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="inc" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">+</button>
                </div>
            </div>
        `;
    }

    /**
     * Update just a player's score display without full re-render
     */
    updatePlayerScore(playerId, score, par) {
        // Find the player's row and update the score display
        const btn = this.container.querySelector(`.score-btn[data-id="${playerId}"]`);
        if (btn) {
            const scoreDisplay = btn.parentElement.querySelector('div[style*="font-size: 1.5rem"]');
            if (scoreDisplay) {
                let scoreColor = 'var(--text-main)';
                if (score < par) scoreColor = 'var(--success)';
                if (score > par) scoreColor = 'var(--danger)';
                scoreDisplay.textContent = score;
                scoreDisplay.style.color = scoreColor;
            }

            // Update the total score subtitle
            const totalScore = calculateTotal(playerId);
            const totalStrokes = calculateTotalStrokes(playerId);
            const subtitle = btn.closest('.glass-panel')?.querySelector('.subtitle');
            if (subtitle) {
                subtitle.textContent = `Score: ${totalScore > 0 ? '+' + totalScore : totalScore} (Total: ${totalStrokes})`;
            }
        }
    }

    /**
     * Update Match Play score display without full re-render
     */
    updateMatchPlayScore(playerId, score, par) {
        // Update the score display number
        const scoreDisplay = this.container.querySelector(`.score-display[data-id="${playerId}"]`);
        if (scoreDisplay) {
            scoreDisplay.textContent = score;

            // Find opponent and their score to determine color
            const pairs = appState.config.matchPlayData?.pairs || [];
            const pair = pairs.find(p => p.player1Id === playerId || p.player2Id === playerId);
            if (pair && pair.player2Id) {
                const opponentId = pair.player1Id === playerId ? pair.player2Id : pair.player1Id;
                const opponentScore = appState.scores[`${appState.currentHole}_${opponentId}`];

                let scoreColor = 'var(--text-main)';
                if (opponentScore !== undefined) {
                    if (score < opponentScore) scoreColor = 'var(--success)';
                    else if (score > opponentScore) scoreColor = 'var(--danger)';
                }
                scoreDisplay.style.color = scoreColor;

                // Update opponent's color too
                const opponentDisplay = this.container.querySelector(`.score-display[data-id="${opponentId}"]`);
                if (opponentDisplay) {
                    let oppColor = 'var(--text-main)';
                    if (opponentScore !== undefined) {
                        if (opponentScore < score) oppColor = 'var(--success)';
                        else if (opponentScore > score) oppColor = 'var(--danger)';
                    }
                    opponentDisplay.style.color = oppColor;
                }

                // Update winner indicators
                const holeWinner = getMatchPlayHoleWinner(pair, appState.currentHole);
                this.container.querySelectorAll('.mp-winner-badge').forEach(b => b.remove());

                if (holeWinner && holeWinner !== 'halved') {
                    const winnerRow = this.container.querySelector(`.score-btn[data-id="${holeWinner}"]`)?.closest('div[style*="border-bottom"]');
                    if (winnerRow) {
                        const nameSpan = winnerRow.querySelector('span[style*="font-weight: 600"]');
                        if (nameSpan && !nameSpan.querySelector('.mp-winner-badge')) {
                            nameSpan.insertAdjacentHTML('afterend', '<span class="mp-winner-badge" style="color: var(--success); margin-left: 8px;">✓</span>');
                        }
                    }
                } else if (holeWinner === 'halved') {
                    // Add halved indicator to both
                    [pair.player1Id, pair.player2Id].forEach(pid => {
                        const row = this.container.querySelector(`.score-btn[data-id="${pid}"]`)?.closest('div[style*="border-bottom"]');
                        if (row) {
                            const nameSpan = row.querySelector('span[style*="font-weight: 600"]');
                            if (nameSpan && !nameSpan.querySelector('.mp-winner-badge')) {
                                nameSpan.insertAdjacentHTML('afterend', '<span class="mp-winner-badge" style="color: var(--text-muted); margin-left: 8px;">½</span>');
                            }
                        }
                    });
                }

                // Update match status text
                const matchStatus = getMatchPlayStatus(pair);
                const p1 = appState.players.find(p => p.id === pair.player1Id);
                const leader = matchStatus.leaderId ? appState.players.find(p => p.id === matchStatus.leaderId)?.name : null;
                const statusText = matchStatus.leaderId
                    ? `${leader}: ${matchStatus.status}`
                    : matchStatus.status;

                const statusEl = this.container.querySelector(`.glass-panel`)?.querySelector('span[style*="color: var(--accent-primary)"]');
                if (statusEl) {
                    statusEl.textContent = statusText;
                }
            }
        }
    }

    attachEvents() {
        // Standard Score Inputs
        this.container.querySelectorAll('.score-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const playerId = btn.dataset.id;
                const action = btn.dataset.action;
                const scoreKey = `${appState.currentHole}_${playerId}`;
                const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;

                let currentScore = appState.scores[scoreKey];

                if (currentScore === undefined) {
                    if (action === 'dec') currentScore = par - 1;
                    else currentScore = par;
                } else {
                    if (action === 'inc') currentScore++;
                    if (action === 'dec' && currentScore > 1) currentScore--;
                }

                appState.scores[scoreKey] = currentScore;
                saveGame(appState);

                // Match Play: Update score display and status without full re-render
                if (appState.gameType === GameTypes.MATCH_PLAY) {
                    this.updateMatchPlayScore(playerId, currentScore, par);
                } else {
                    // Update just the player's row instead of full re-render
                    this.updatePlayerScore(playerId, currentScore, par);
                }
            });
        });

        // Wolf Team Score Inputs
        this.container.querySelectorAll('.team-score-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const currentHole = appState.currentHole;
                const team = btn.dataset.team; // 'wolf' or 'pack'
                const action = btn.dataset.action;
                const par = appState.config.pars?.[currentHole] || appState.config.defaultPar;

                const wolfData = appState.config.wolfData.history[currentHole];
                if (!wolfData || !wolfData.strokes) return;

                let currentStrokes = wolfData.strokes[team];

                if (action === 'inc') currentStrokes++;
                if (action === 'dec' && currentStrokes > 1) currentStrokes--;

                wolfData.strokes[team] = currentStrokes;

                // Re-render only the inputs if possible to avoid flicker, or full render
                // Just full render for now for safety
                this.render();
            });
        });

        document.getElementById('prev-btn').addEventListener('click', () => {
            if (appState.currentHole > 1) {
                // Wolf Mode: Calculate points before going back
                if (appState.gameType === GameTypes.WOLF) {
                    this.calculateWolfPoints();
                }
                appState.currentHole--;
                saveGame(appState);
                render();
            }
        });

        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                // Wolf Mode: Calculate points before advancing
                if (appState.gameType === GameTypes.WOLF) {
                    this.calculateWolfPoints();
                }

                // Bingo Mode: Rotate players (Round Robin)
                if (appState.gameType === GameTypes.BINGO_BANGO_BONGO) {
                    const first = appState.players.shift();
                    appState.players.push(first);
                }

                appState.currentHole++;
                saveGame(appState);
                render();
            });
        }

        const finishBtn = document.getElementById('finish-round-btn');
        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                // Wolf Mode: Calculate points for final hole
                if (appState.gameType === GameTypes.WOLF) {
                    this.calculateWolfPoints();
                }

                appState.isFinished = true;
                saveGame(appState);
                render();
            });
        }

        document.getElementById('menu-btn').addEventListener('click', () => {
            new MenuModal().open();
        });

        const headerPar = document.getElementById('header-par-display');
        if (headerPar) {
            headerPar.addEventListener('click', () => {
                new EditParModal().open();
            });
        }

        // Edit Pick button (Wolf mode only)
        const editPickBtn = document.getElementById('edit-pick-btn');
        if (editPickBtn) {
            editPickBtn.addEventListener('click', () => {
                // Clear the pick for current hole, re-render to WolfTurnView
                delete appState.config.wolfData.history[appState.currentHole];
                saveGame(appState);
                render();
            });
        }

        // Edit Past Holes button (Wolf mode only)
        const editPastHolesBtn = document.getElementById('edit-past-holes-btn');
        if (editPastHolesBtn) {
            editPastHolesBtn.addEventListener('click', () => {
                new WolfHistoryModal().open();
            });
        }
    }

    /**
     * Calculate and store Wolf points for the current hole.
     */
    calculateWolfPoints() {
        const currentHole = appState.currentHole;
        const wolfData = appState.config.wolfData.history[currentHole];
        if (!wolfData || !wolfData.strokes) return;

        const wolfStrokes = wolfData.strokes.wolf;
        const packStrokes = wolfData.strokes.pack;

        // Determine winner
        let winner = 'tie';
        if (wolfStrokes < packStrokes) winner = 'wolf';
        else if (packStrokes < wolfStrokes) winner = 'pack';

        // Calculate points
        const result = WolfGame.calculatePoints(
            winner,
            wolfData.betType,
            appState.config.wolfData.pot,
            appState.players,
            wolfData.wolfId,
            wolfData.partnerId
        );

        // Store points in scores
        for (const playerId of Object.keys(result.pointsMap)) {
            const scoreKey = `${currentHole}_${playerId}`;
            appState.scores[scoreKey] = result.pointsMap[playerId];
        }

        // Update pot
        appState.config.wolfData.pot = result.newPot;

        // Record result in history
        wolfData.winningTeam = winner;
    }
}

class RoundSummaryView {
    constructor(container) {
        this.container = container;
    }

    render() {
        const isWolfMode = appState.gameType === GameTypes.WOLF;
        const isMatchPlay = appState.gameType === GameTypes.MATCH_PLAY;

        let winnerText, subtitle, headerEmoji;

        if (isMatchPlay) {
            // Match Play: Show results for each pair
            const pairs = appState.config.matchPlayData?.pairs || [];
            const matchResults = pairs.map(pair => {
                const p1 = appState.players.find(p => p.id === pair.player1Id);
                const p2 = pair.player2Id ? appState.players.find(p => p.id === pair.player2Id) : null;
                const status = getMatchPlayStatus(pair);

                if (!p2) {
                    return { winner: p1, status: 'Bye', isTie: false };
                }

                if (status.leaderId) {
                    const winner = appState.players.find(p => p.id === status.leaderId);
                    return { winner, status: status.status, isTie: false, loser: status.leaderId === pair.player1Id ? p2 : p1 };
                }
                return { winner: null, status: 'All Square', isTie: true, p1, p2 };
            });

            // Generate summary
            const resultsHTML = matchResults.map((r, i) => {
                if (r.isTie) {
                    return `<div style="margin-bottom: 8px;"><strong>Match ${i + 1}:</strong> ${r.p1.name} & ${r.p2.name} - <span style="color: var(--text-muted);">Tied</span></div>`;
                } else if (r.status === 'Bye') {
                    return `<div style="margin-bottom: 8px;"><strong>Match ${i + 1}:</strong> ${r.winner.name} - <span style="color: var(--text-muted);">Bye</span></div>`;
                } else {
                    return `<div style="margin-bottom: 8px;"><strong>Match ${i + 1}:</strong> <span style="color: var(--accent-primary);">${r.winner.name}</span> wins ${r.status}</div>`;
                }
            }).join('');

            // Overall summary
            const matchWinners = matchResults.filter(r => r.winner && !r.isTie && r.status !== 'Bye');
            const ties = matchResults.filter(r => r.isTie);

            if (matchWinners.length === 0 && ties.length > 0) {
                headerEmoji = '🤝';
                winnerText = 'All Matches Tied!';
            } else if (matchWinners.length === 1) {
                headerEmoji = '🏆';
                winnerText = `<span style="color: var(--accent-primary)">${matchWinners[0].winner.name}</span> Wins!`;
            } else {
                headerEmoji = '🏆';
                winnerText = 'Match Results';
            }

            subtitle = resultsHTML;
        } else {
            // Standard/Wolf/Other modes
            const players = appState.players.map(p => ({
                ...p,
                totalScore: calculateTotal(p.id),
                totalStrokes: calculateTotalStrokes(p.id)
            })).sort((a, b) => {
                // Wolf: highest points wins. Standard: lowest score wins.
                return isWolfMode ? b.totalScore - a.totalScore : a.totalScore - b.totalScore;
            });

            // Find Ties
            const winningScore = players[0].totalScore;
            const winners = players.filter(p => p.totalScore === winningScore);
            const isTie = winners.length > 1;

            winnerText = `Winner: <span style="color: var(--accent-primary)">${winners[0].name}</span>`;
            if (isTie) {
                const names = winners.map(w => w.name).join(' & ');
                winnerText = `Draw! <span style="font-size:1.5rem; display:block; margin-top:8px; color: var(--accent-primary)">${names}</span>`;
            }

            headerEmoji = isTie ? '🤝' : '🏆';

            // Subtitle: Points for Wolf, +/- (Strokes) for standard
            if (isWolfMode) {
                subtitle = `${winners[0].totalScore} Points`;
            } else {
                subtitle = `${winners[0].totalScore > 0 ? '+' : ''}${winners[0].totalScore} (${winners[0].totalStrokes} Strokes)`;
            }
        }

        const scoreboardHTML = generateScoreboardHTML(appState.players, appState.config, appState.scores);

        this.container.innerHTML = `
            <div class="summary-container fade-in p-4" style="padding-bottom: 60px;">
                 <header style="text-align: center; margin-bottom: var(--spacing-lg)">
                    <h1>Round Complete!</h1>
                    <div style="font-size: 3rem; margin: var(--spacing-md) 0;">${headerEmoji}</div>
                    <h2>${winnerText}</h2>
                    <div class="subtitle" style="margin-top: 8px;">${subtitle}</div>
                </header>

                <div class="glass-panel" style="margin-bottom: var(--spacing-lg); padding: var(--spacing-sm);">
                    <h3 style="margin-bottom: var(--spacing-sm); text-align: center;">Round Scoreboard</h3>
                    ${scoreboardHTML}
                </div>

                <div style="display: flex; gap: var(--spacing-sm); flex-direction: column;">
                    <button id="edit-scores-btn" class="btn" style="background: rgba(255,255,255,0.1)">Back to Scorecard</button>
                    <button id="exit-btn" class="btn btn-primary">Exit to Main Menu</button>
                </div>
            </div>
        `;

        document.getElementById('edit-scores-btn').addEventListener('click', () => {
            appState.isFinished = false;
            saveGame(appState);
            render();
        });

        document.getElementById('exit-btn').addEventListener('click', () => {
            clearGame();
            appState = null;
            render();
        });
    }
}

/* --- Modals --- */

class MenuModal extends Modal {
    constructor() {
        super(`
            <h2 style="margin-bottom: var(--spacing-md)">Game Menu</h2>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                <button id="scoreboard-btn" class="btn btn-menu">
                    <span style="margin-right: 8px;">📊</span> Scoreboard
                </button>
                <button id="players-btn" class="btn btn-menu">
                    <span style="margin-right: 8px;">👥</span> Manage Players
                </button>
                <button id="customize-pars-menu-btn" class="btn btn-menu">
                    <span style="margin-right: 8px;">⛳</span> Customize Pars
                </button>
                <button id="view-rules-menu-btn" class="btn btn-menu">
                    <span style="margin-right: 8px;">📖</span> View Rules
                </button>
                <button id="exit-game-btn" class="btn btn-menu btn-danger-soft">
                    <span style="margin-right: 8px;">🚪</span> Exit Game
                </button>
                <button id="close-menu-btn" class="btn" style="margin-top: var(--spacing-sm)">Cancel</button>
            </div>
        `);

        this.backdrop.querySelector('#scoreboard-btn').addEventListener('click', () => {
            this.close();
            new ScoreboardModal().open();
        });

        this.backdrop.querySelector('#players-btn').addEventListener('click', () => {
            this.close();
            new PlayerManagerModal().open();
        });

        this.backdrop.querySelector('#customize-pars-menu-btn').addEventListener('click', () => {
            this.close();
            new EditAllParsModal().open();
        });

        this.backdrop.querySelector('#exit-game-btn').addEventListener('click', () => {
            this.close();
            new ExitConfirmationModal().open();
        });

        this.backdrop.querySelector('#view-rules-menu-btn').addEventListener('click', () => {
            this.close();
            new RulesModal(appState.gameType).open();
        });

        this.backdrop.querySelector('#close-menu-btn').addEventListener('click', () => this.close());
    }
}

class ScoreboardModal extends Modal {
    constructor() {
        const scoreboardHTML = generateScoreboardHTML(appState.players, appState.config, appState.scores);
        super(`
            <h2 style="margin-bottom: var(--spacing-md)">Scoreboard</h2>
            ${scoreboardHTML}
            <button id="close-score-btn" class="btn btn-primary" style="margin-top: var(--spacing-md)">Close</button>
        `);

        this.backdrop.querySelector('#close-score-btn').addEventListener('click', () => this.close());
    }
}

class WolfHistoryModal extends Modal {
    constructor() {
        const currentHole = appState.currentHole;
        const wolfData = appState.config.wolfData || { history: {}, pot: 0 };

        // Build list of completed holes
        let holesHTML = '';
        for (let h = 1; h < currentHole; h++) {
            const holeData = wolfData.history[h];
            if (holeData) {
                const wolfPlayer = appState.players.find(p => p.id === holeData.wolfId);
                const partnerPlayer = holeData.partnerId ? appState.players.find(p => p.id === holeData.partnerId) : null;

                let betLabel = '🐺 ' + (wolfPlayer?.name || 'Unknown');
                if (holeData.betType === 'blind') {
                    betLabel += ' (🙈 Blind)';
                } else if (holeData.betType === 'lone') {
                    betLabel += ' (Lone)';
                } else if (partnerPlayer) {
                    betLabel += ' + ' + partnerPlayer.name;
                }

                let resultIcon = '⚖️';
                let resultText = 'Tie';
                if (holeData.winningTeam === 'wolf') {
                    resultIcon = '🏆';
                    resultText = 'Wolf Wins';
                } else if (holeData.winningTeam === 'pack') {
                    resultIcon = '🐺❌';
                    resultText = 'Pack Wins';
                }

                holesHTML += `
                    <div class="wolf-history-item" data-hole="${h}" style="
                        display: flex; justify-content: space-between; align-items: center;
                        padding: var(--spacing-sm); background: rgba(255,255,255,0.05);
                        border-radius: var(--radius-sm); cursor: pointer;
                        border-left: 3px solid ${holeData.winningTeam === 'wolf' ? 'var(--accent-primary)' : (holeData.winningTeam === 'pack' ? 'var(--danger)' : 'var(--text-muted)')};
                    ">
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">Hole ${h}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${betLabel}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.2rem;">${resultIcon}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${holeData.strokes?.wolf || '-'} vs ${holeData.strokes?.pack || '-'}</div>
                        </div>
                    </div>
                `;
            }
        }

        if (!holesHTML) {
            holesHTML = '<p style="text-align: center; color: var(--text-muted);">No completed holes to edit yet.</p>';
        }

        super(`
            <h2 style="margin-bottom: var(--spacing-sm)">🐺 Wolf History</h2>
            <p class="subtitle" style="margin-bottom: var(--spacing-md); font-size: 0.85rem;">Tap a hole to edit its Wolf pick and scores.</p>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-xs); max-height: 50vh; overflow-y: auto; margin-bottom: var(--spacing-md);">
                ${holesHTML}
            </div>
            <button id="close-history-btn" class="btn" style="width: 100%;">Close</button>
        `);

        // Event listeners for hole selection
        this.backdrop.querySelectorAll('.wolf-history-item').forEach(item => {
            item.addEventListener('click', () => {
                const hole = parseInt(item.dataset.hole);
                this.editHole(hole);
            });
        });

        this.backdrop.querySelector('#close-history-btn').addEventListener('click', () => this.close());
    }

    editHole(holeNumber) {
        // Store backup for cancel functionality
        appState.config.wolfData.editingHole = holeNumber;
        appState.config.wolfData.editBackup = {
            history: { ...appState.config.wolfData.history[holeNumber] },
            scores: {}
        };

        // Backup scores for this hole
        appState.players.forEach(p => {
            const key = `${holeNumber}_${p.id}`;
            if (appState.scores[key] !== undefined) {
                appState.config.wolfData.editBackup.scores[key] = appState.scores[key];
            }
        });

        // Navigate to that hole and clear its pick to re-enter
        appState.currentHole = holeNumber;

        // Clear the pick so WolfTurnView shows again
        delete appState.config.wolfData.history[holeNumber];

        // Clear scores for that hole
        appState.players.forEach(p => {
            const scoreKey = `${holeNumber}_${p.id}`;
            delete appState.scores[scoreKey];
        });

        saveGame(appState);
        this.close();
        render();
    }
}

/**
 * Modal to change the Wolf to a different player
 */
class ChangeWolfModal extends Modal {
    constructor(activePlayers, currentWolfId) {
        const playerOptions = activePlayers.map(p => `
            <button class="btn wolf-option-btn" data-id="${p.id}" style="
                display: flex; justify-content: space-between; align-items: center;
                background: ${p.id === currentWolfId ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)'};
                color: ${p.id === currentWolfId ? '#000' : 'var(--text-main)'};
                border: 1px solid rgba(255,255,255,0.2);
                padding: var(--spacing-sm) var(--spacing-md);
            ">
                <span>${p.name}</span>
                ${p.id === currentWolfId ? '<span style="font-size: 0.8rem;">🐺 Current</span>' : '<span style="font-size: 0.8rem;">Select</span>'}
            </button>
        `).join('');

        super(`
            <h2 style="margin-bottom: var(--spacing-md)">🔄 Change Wolf</h2>
            <p class="subtitle" style="margin-bottom: var(--spacing-md);">Select who should be the Wolf for this hole:</p>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                ${playerOptions}
            </div>
            <button id="cancel-change-btn" class="btn" style="width: 100%;">Cancel</button>
        `);

        this.currentWolfId = currentWolfId;

        // Player selection
        this.backdrop.querySelectorAll('.wolf-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newWolfId = btn.dataset.id;
                if (newWolfId !== this.currentWolfId) {
                    // Override the starting wolf for this hole
                    this.setWolfOverride(newWolfId);
                }
                this.close();
            });
        });

        this.backdrop.querySelector('#cancel-change-btn').addEventListener('click', () => this.close());
    }

    setWolfOverride(newWolfId) {
        // Store override for current hole
        if (!appState.config.wolfData.wolfOverrides) {
            appState.config.wolfData.wolfOverrides = {};
        }
        appState.config.wolfData.wolfOverrides[appState.currentHole] = newWolfId;
        saveGame(appState);
        render();
    }
}

class PlayerManagerModal extends Modal {
    constructor() {
        const renderList = () => {
            return appState.players.map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs); background: rgba(0,0,0,0.2); border-radius: var(--radius-sm);">
                    <span style="flex-grow: 1; margin-right: 10px;">${p.name}</span>
                    <button class="btn btn-icon remove-p-btn" data-id="${p.id}" style="width: 32px; height: 32px; font-size: 0.8rem; background: rgba(248, 113, 113, 0.1); color: var(--danger); flex-shrink: 0;">✕</button>
                </div>
            `).join('');
        };

        super(`
            <h2 style="margin-bottom: var(--spacing-md)">Manage Players</h2>
            
            <div class="input-group">
                <div style="display: flex; gap: var(--spacing-xs);">
                    <input type="text" id="new-player-name" placeholder="New Player Name">
                    <button id="add-p-btn" class="btn btn-primary" style="width: auto;">Add</button>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-bottom: var(--spacing-xs);">
                 <button id="shuffle-p-btn" class="btn btn-sm btn-ghost" style="color: var(--accent-secondary); border: 1px solid var(--card-border);">🔀 Shuffle Order</button>
            </div>

            <div id="modal-player-list" style="display: flex; flex-direction: column; gap: var(--spacing-xs); margin-bottom: var(--spacing-md); max-height: 50vh; overflow-y: auto;">
                ${renderList()}
            </div>

            <button id="close-pm-btn" class="btn">Done</button>
        `);

        // Events
        const listEl = this.backdrop.querySelector('#modal-player-list');
        const inputEl = this.backdrop.querySelector('#new-player-name');

        // Shuffle Button
        this.backdrop.querySelector('#shuffle-p-btn').addEventListener('click', () => {
            if (window.randomizePlayerOrder) {
                window.randomizePlayerOrder(); // This saves and calls render()
                listEl.innerHTML = renderList(); // Re-render local list
            }
        });

        this.backdrop.querySelector('#add-p-btn').addEventListener('click', () => {
            const name = inputEl.value.trim();
            if (name) {
                appState.players.push({ id: crypto.randomUUID(), name });
                saveGame(appState);
                listEl.innerHTML = renderList(); // Re-render local list
                inputEl.value = '';
                render(); // Re-render main app in background
            }
        });

        // Event delegation for remove
        listEl.addEventListener('click', (e) => {
            // Traverse up to find button, in case 'X' icon (text) is clicked
            const btn = e.target.closest('.remove-p-btn');
            if (btn) {
                const id = btn.dataset.id;
                const player = appState.players.find(p => p.id === id);
                if (player) {
                    new ConfirmRemovePlayerModal(player, this).open();
                }
            }
        });

        this.backdrop.querySelector('#close-pm-btn').addEventListener('click', () => this.close());
    }
}

class ConfirmRemovePlayerModal extends Modal {
    constructor(player, parentModal) {
        const isLastPlayer = appState.players.length === 1;

        let title = "Remove Player?";
        let warning = `Remove <strong>${player.name}</strong>? All their scores will be deleted.`;
        let confirmBtnText = "Remove";
        let confirmBtnClass = "btn-danger"; // Assuming this class exists or will default to btn styles

        if (isLastPlayer) {
            title = "End Round?";
            warning = `Remove <strong>${player.name}</strong>? <br><br><span style="color: var(--danger)">Warning: Since this is the only player, the round will end.</span>`;
            confirmBtnText = "End Round";
        }

        super(`
            <h2 style="margin-bottom: var(--spacing-sm); color: var(--danger);">${title}</h2>
            <p style="margin-bottom: var(--spacing-lg); color: var(--text-muted); line-height: 1.5;">${warning}</p>
            <div style="display: flex; gap: var(--spacing-sm);">
                <button id="cancel-rm-btn" class="btn" style="background: rgba(255,255,255,0.05)">Cancel</button>
                <button id="confirm-rm-btn" class="btn" style="background: var(--danger); color: white;">${confirmBtnText}</button>
            </div>
        `);

        this.player = player;
        this.parentModal = parentModal;
        this.isLastPlayer = isLastPlayer;

        this.backdrop.querySelector('#cancel-rm-btn').addEventListener('click', () => this.close());
        this.backdrop.querySelector('#confirm-rm-btn').addEventListener('click', () => {
            this.confirmRemove();
        });
    }

    confirmRemove() {
        if (this.isLastPlayer) {
            clearGame();
            appState = null;
            this.close();
            if (this.parentModal) this.parentModal.close(); // Close manager too
            render(); // Return to setup
        } else {
            // Wolf mode: soft-remove to preserve historical scores
            if (appState.gameType === GameTypes.WOLF) {
                softRemovePlayer(appState, this.player.id, appState.currentHole);
            } else {
                removePlayer(appState, this.player.id);
            }
            saveGame(appState);
            this.close();
            // Refresh parent modal list (show active players only)
            if (this.parentModal) {
                const listEl = this.parentModal.backdrop.querySelector('#modal-player-list');
                if (listEl) {
                    const activePlayers = getActivePlayers(appState.players, appState.currentHole);
                    listEl.innerHTML = activePlayers.map(p => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs); background: rgba(0,0,0,0.2); border-radius: var(--radius-sm);">
                            <span style="flex-grow: 1; margin-right: 10px;">${p.name}</span>
                            <button class="btn btn-icon remove-p-btn" data-id="${p.id}" style="width: 32px; height: 32px; font-size: 0.8rem; background: rgba(248, 113, 113, 0.1); color: var(--danger); flex-shrink: 0;">✕</button>
                        </div>
                    `).join('');
                }
            }
            render(); // Update main view
        }
    }
}

class ParConfigModal extends Modal {
    constructor(setupState) {
        // Generate grid BEFORE super() call
        const holeCount = setupState.holeCount;
        const existingPars = setupState.customPars || {};
        let gridHTML = '';
        for (let i = 1; i <= holeCount; i++) {
            const currentPar = existingPars[i] || 3;
            gridHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                    <label style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Hole ${i}</label>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="btn btn-icon par-dec" data-hole="${i}" style="width: 24px; height: 24px; font-size: 0.8rem;">-</button>
                        <span id="par-val-${i}" style="font-weight: bold; width: 20px; text-align: center;">${currentPar}</span>
                        <button class="btn btn-icon par-inc" data-hole="${i}" style="width: 24px; height: 24px; font-size: 0.8rem;">+</button>
                    </div>
                </div>
            `;
        }

        super(`
            <h2 style="margin-bottom: var(--spacing-md)">Customize Pars</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: var(--spacing-md); padding-right: 4px;">
                ${gridHTML}
            </div>
            <div style="display: flex; justify-content: space-between;">
                <button id="reset-pars-btn" class="btn" style="background: rgba(255,255,255,0.05); width: auto; font-size: 0.8rem; color: var(--text-main);">Reset to 3</button>
                <button id="save-pars-btn" class="btn btn-primary" style="width: auto;">Save Pars</button>
            </div>
        `);

        // Now we can use 'this' after super()
        this.setupState = setupState;
        this.localPars = { ...existingPars };
        this.holeCount = holeCount;

        // Event Delegation for Inc/Dec (must be on modal-content, not backdrop)
        const content = this.backdrop.querySelector('.modal-content');
        content.addEventListener('click', (e) => {
            if (e.target.classList.contains('par-dec')) {
                const hole = parseInt(e.target.dataset.hole);
                let val = parseInt(this.backdrop.querySelector(`#par-val-${hole}`).innerText);
                if (val > 1) {
                    val--;
                    this.backdrop.querySelector(`#par-val-${hole}`).innerText = val;
                    this.localPars[hole] = val;
                }
            }
            if (e.target.classList.contains('par-inc')) {
                const hole = parseInt(e.target.dataset.hole);
                let val = parseInt(this.backdrop.querySelector(`#par-val-${hole}`).innerText);
                if (val < 9) {
                    val++;
                    this.backdrop.querySelector(`#par-val-${hole}`).innerText = val;
                    this.localPars[hole] = val;
                }
            }
        });

        this.backdrop.querySelector('#reset-pars-btn').addEventListener('click', () => {
            this.localPars = {};
            // Update UI
            for (let i = 1; i <= this.holeCount; i++) {
                this.backdrop.querySelector(`#par-val-${i}`).innerText = 3;
            }
        });

        this.backdrop.querySelector('#save-pars-btn').addEventListener('click', () => {
            this.setupState.customPars = this.localPars;
            this.close();
            // Update button visual in SetupView
            const customizeBtn = document.getElementById('customize-pars-btn');
            if (customizeBtn) {
                const count = Object.keys(this.localPars).length;
                customizeBtn.innerHTML = count > 0 ? `⚙️ Customize Pars (Custom)` : `⚙️ Customize Pars`;
                customizeBtn.style.borderColor = count > 0 ? 'var(--accent-primary)' : 'var(--card-border)';
            }
        });
    }
}

class EditParModal extends Modal {
    constructor() {
        const h = appState.currentHole;
        const currentPar = appState.config.pars?.[h] || appState.config.defaultPar;

        super(`
            <h2 style="margin-bottom: var(--spacing-sm)">Edit Par</h2>
            <p class="subtitle" style="margin-bottom: var(--spacing-md)">Hole ${h}</p>
            
            <div class="flex-center gap-md" style="margin-bottom: var(--spacing-lg);">
                <button id="modal-dec-par" class="btn btn-icon" style="width: 50px; height: 50px; font-size: 1.5rem;">−</button>
                <span id="modal-par-val" style="font-size: 3rem; font-weight: 800; width: 60px; text-align: center;">${currentPar}</span>
                <button id="modal-inc-par" class="btn btn-icon" style="width: 50px; height: 50px; font-size: 1.5rem;">+</button>
            </div>

            <button id="save-modal-par" class="btn btn-primary">Save Par</button>
        `);

        this.val = currentPar;

        this.backdrop.querySelector('#modal-dec-par').addEventListener('click', () => {
            if (this.val > 1) {
                this.val--;
                this.backdrop.querySelector('#modal-par-val').innerText = this.val;
            }
        });

        this.backdrop.querySelector('#modal-inc-par').addEventListener('click', () => {
            if (this.val < 9) {
                this.val++;
                this.backdrop.querySelector('#modal-par-val').innerText = this.val;
            }
        });

        this.backdrop.querySelector('#save-modal-par').addEventListener('click', () => {
            if (!appState.config.pars) appState.config.pars = {};
            appState.config.pars[h] = this.val;
            saveGame(appState);
            this.close();
            render();
        });
    }
}

class EditAllParsModal extends Modal {
    constructor() {
        // Generate grid for all holes
        const holeCount = appState.config.holeCount;
        const existingPars = appState.config.pars || {};
        let gridHTML = '';
        for (let i = 1; i <= holeCount; i++) {
            const currentPar = existingPars[i] || appState.config.defaultPar;
            gridHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                    <label style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Hole ${i}</label>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="btn btn-icon all-par-dec" data-hole="${i}" style="width: 24px; height: 24px; font-size: 0.8rem;">-</button>
                        <span id="all-par-val-${i}" style="font-weight: bold; width: 20px; text-align: center;">${currentPar}</span>
                        <button class="btn btn-icon all-par-inc" data-hole="${i}" style="width: 24px; height: 24px; font-size: 0.8rem;">+</button>
                    </div>
                </div>
            `;
        }

        super(`
            <h2 style="margin-bottom: var(--spacing-md)">Customize All Pars</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: var(--spacing-md); padding-right: 4px;">
                ${gridHTML}
            </div>
            <div style="display: flex; justify-content: space-between;">
                <button id="reset-all-pars-btn" class="btn" style="background: rgba(255,255,255,0.05); width: auto; font-size: 0.8rem; color: var(--text-main);">Reset to 3</button>
                <button id="save-all-pars-btn" class="btn btn-primary" style="width: auto;">Save Pars</button>
            </div>
        `);

        this.localPars = { ...existingPars };
        this.holeCount = holeCount;

        // Event Delegation for Inc/Dec (must be on modal-content, not backdrop)
        const content = this.backdrop.querySelector('.modal-content');
        content.addEventListener('click', (e) => {
            if (e.target.classList.contains('all-par-dec')) {
                const hole = parseInt(e.target.dataset.hole);
                let val = parseInt(this.backdrop.querySelector(`#all-par-val-${hole}`).innerText);
                if (val > 1) {
                    val--;
                    this.backdrop.querySelector(`#all-par-val-${hole}`).innerText = val;
                    this.localPars[hole] = val;
                }
            }
            if (e.target.classList.contains('all-par-inc')) {
                const hole = parseInt(e.target.dataset.hole);
                let val = parseInt(this.backdrop.querySelector(`#all-par-val-${hole}`).innerText);
                if (val < 9) {
                    val++;
                    this.backdrop.querySelector(`#all-par-val-${hole}`).innerText = val;
                    this.localPars[hole] = val;
                }
            }
        });

        this.backdrop.querySelector('#reset-all-pars-btn').addEventListener('click', () => {
            this.localPars = {};
            for (let i = 1; i <= this.holeCount; i++) {
                this.backdrop.querySelector(`#all-par-val-${i}`).innerText = 3;
            }
        });

        this.backdrop.querySelector('#save-all-pars-btn').addEventListener('click', () => {
            appState.config.pars = this.localPars;
            saveGame(appState);
            this.close();
            render();
        });
    }
}

class ExitConfirmationModal extends Modal {
    constructor() {
        super(`
            <h2 style="color: var(--danger); margin-bottom: var(--spacing-sm)">Exit Game?</h2>
            <p style="color: var(--text-muted); margin-bottom: var(--spacing-md)">Current progress will be lost permanently.</p>
            <div style="display: flex; gap: var(--spacing-sm);">
                <button id="cancel-exit-btn" class="btn" style="background: rgba(255,255,255,0.05)">Cancel</button>
                <button id="confirm-exit-btn" class="btn" style="background: var(--danger); color: white;">Exit Game</button>
            </div>
        `);

        this.backdrop.querySelector('#cancel-exit-btn').addEventListener('click', () => this.close());
        this.backdrop.querySelector('#confirm-exit-btn').addEventListener('click', () => {
            clearGame();
            appState = null;
            this.close();
            render();
        });
    }
}

class RulesModal extends Modal {
    constructor(gameType) {
        const details = GameTypeDetails[gameType];

        // Wolf rules content
        const wolfRules = `
            <div style="text-align: left; line-height: 1.6; font-size: 0.85rem; max-height: 60vh; overflow-y: auto;">
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🎯 Overview</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Wolf is a strategic team game where one player (the Wolf) picks teams each hole. 
                        The goal is to score the most points by the end of the round.
                    </p>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🐺 Choosing Teams</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        The Wolf throws first. After their drive:
                    </p>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li>If the Wolf loves their shot, they can immediately call <strong>"Wolf!"</strong> to go solo against everyone (Lone Wolf).</li>
                        <li>Otherwise, other players throw in order. <strong>The Wolf must decide immediately after each throw</strong> – pick that player as partner or pass.</li>
                        <li>Once the next player throws, you can't go back! If you wait until the last player, you're stuck with them.</li>
                        <li><strong>Blind Wolf:</strong> Call "Wolf" <em>before</em> anyone throws for bonus points!</li>
                    </ul>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🎮 Playing the Hole</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Teams play <strong>best shot</strong> until the hole is complete:
                    </p>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong>With Partner:</strong> Wolf & Partner play best shot together vs. The Pack (everyone else) playing their best shot.</li>
                        <li><strong>Lone Wolf:</strong> Wolf plays alone vs. The Pack playing best shot together.</li>
                    </ul>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🏆 Scoring</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">Lower score wins!</p>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong>Partner Win:</strong> Wolf & Partner each get 2 pts. <strong>Pack Wins:</strong> Pack members each get 3 pts.</li>
                        <li><strong>Lone Wolf Win:</strong> Wolf gets 4 pts. <strong>Pack Wins:</strong> Pack members each get 1 pt.</li>
                        <li><strong>Blind Wolf Win:</strong> Wolf gets 6 pts.</li>
                        <li><strong>Ties:</strong> Points go to the Pot – next winner takes all!</li>
                    </ul>
                </div>
                
                <div style="margin-bottom: 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <strong style="color: var(--accent-secondary);">💡 Tips</strong>
                    <ul style="margin: 4px 0 0 16px; padding: 0; color: var(--text-muted); font-size: 0.8rem;">
                        <li>Don't pass too quickly – you might miss a great partner throw!</li>
                        <li>Go Lone Wolf when you crushed your drive</li>
                        <li>Last 2 holes: lowest scorer becomes Wolf (catch-up rule)</li>
                    </ul>
                </div>
            </div>
        `;

        // Birdie or Die rules content
        const birdieRules = `
            <div style="text-align: left; line-height: 1.6; font-size: 0.9rem;">
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🎯 Goal</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Score as many points as possible by getting under par. Only birdies and better count!
                    </p>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🏆 Scoring</strong>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong>Birdie</strong> (1 under par): <strong style="color: var(--accent-primary);">1 point</strong></li>
                        <li><strong>Eagle</strong> (2 under par): <strong style="color: var(--accent-primary);">3 points</strong></li>
                        <li><strong>Albatross</strong> (3+ under par): <strong style="color: var(--accent-primary);">5 points</strong></li>
                        <li>Par or worse: <strong>0 points</strong></li>
                    </ul>
                </div>
                
                <div style="margin-bottom: 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <strong style="color: var(--accent-secondary);">💡 Strategy</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0; font-size: 0.85rem;">
                        High risk = high reward! Go for aggressive lines since par gives you nothing.
                    </p>
                </div>
            </div>
        `;

        // Default placeholder for other game types
        const defaultRules = `
            <div style="text-align: center; color: var(--text-muted);">
                <p style="font-size: 1.25rem; margin-bottom: var(--spacing-sm);">🚧</p>
                <p>Rules for <strong style="color: var(--text-main)">${details.label}</strong> coming soon!</p>
                <p style="font-size: 0.8rem; margin-top: var(--spacing-sm);">${details.description}</p>
            </div>
        `;

        // Bingo Bango Bongo rules content
        const bingoRules = `
            <div style="text-align: left; line-height: 1.6; font-size: 0.9rem;">
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🎯 Goal</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Earn points by achieving three specific goals on each hole.
                    </p>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">3 Points per Hole</strong>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong style="color: var(--accent-primary);">BINGO</strong>: Longest drive.</li>
                        <li><strong style="color: var(--accent-primary);">BANGO</strong>: Closest to the pin on the approach shot (usually the second shot).</li>
                        <li><strong style="color: var(--accent-primary);">BONGO</strong>: First player to hole out.</li>
                    </ul>
                </div>

                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">📜 Order of Play</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        <strong>Strict order matters!</strong> The player furthest from the hole always throws first.
                    </p>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong>Drive:</strong> Randomize order on first tee.</li>
                        <li><strong>Next Shots:</strong> Always furthest out. This gives everyone a fair chance at <em>Bongo</em>.</li>
                    </ul>
                </div>
                
                <div style="margin-bottom: 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <strong style="color: var(--accent-secondary);">💡 Bonus Points (Throw-ins)</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0; font-size: 0.85rem;">
                        A player who throws in from the field takes the <strong>remainder of the points</strong> for that hole:
                    </p>
                    <ul style="margin: 4px 0 0 16px; padding: 0; color: var(--text-muted); font-size: 0.85rem;">
                        <li><strong>Ace</strong>: Takes ALL 3 points (Bingo + Bango + Bongo).</li>
                        <li><strong>2nd Shot Throw-in</strong>: Takes 2 points (Bango + Bongo).</li>
                    </ul>
                </div>
            </div>
        `;

        // Match Play rules content
        const matchRules = `
            <div style="text-align: left; line-height: 1.6; font-size: 0.9rem;">
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">⚔️ Goal</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Compete head-to-head against your opponent. Win more holes to win the match!
                    </p>
                </div>
                
                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">🏆 Hole Scoring</strong>
                    <ul style="margin: 6px 0 0 16px; padding: 0; color: var(--text-muted);">
                        <li><strong>Lower strokes wins the hole</strong> → 1 point.</li>
                        <li><strong>Equal strokes</strong> → Hole is "Halved" (no points).</li>
                    </ul>
                </div>

                <div style="margin-bottom: 14px;">
                    <strong style="color: var(--accent-primary);">📊 Match Status</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0;">
                        Track who is ahead: <strong>"2 UP"</strong> means that player has won 2 more holes than their opponent.
                        <strong>"All Square"</strong> means tied.
                    </p>
                </div>
                
                <div style="margin-bottom: 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <strong style="color: var(--accent-secondary);">💡 Winning</strong>
                    <p style="color: var(--text-muted); margin: 4px 0 0 0; font-size: 0.85rem;">
                        A match is won when a player is "UP" more holes than remain to be played.
                    </p>
                </div>
            </div>
        `;

        // Select appropriate rules
        let rulesContent = defaultRules;
        if (gameType === GameTypes.WOLF) rulesContent = wolfRules;
        else if (gameType === GameTypes.BIRDIE_OR_DIE) rulesContent = birdieRules;
        else if (gameType === GameTypes.BINGO_BANGO_BONGO) rulesContent = bingoRules;
        else if (gameType === GameTypes.MATCH_PLAY) rulesContent = matchRules;

        super(`
            <h2 style="margin-bottom: var(--spacing-md)">
                ${details.icon} ${details.label} Rules
            </h2>
            <div class="glass-panel" style="padding: var(--spacing-md);">
                ${rulesContent}
            </div>
            <button id="close-rules-btn" class="btn btn-primary" style="margin-top: var(--spacing-md)">Close</button>
        `);

        this.backdrop.querySelector('#close-rules-btn').addEventListener('click', () => this.close());
    }
}

/* --- Bingo Bango Bongo Logic --- */
window.toggleBingoPoint = function (playerId, pointType) {
    // pointType values: 1 (Bingo), 2 (Bango), 4 (Bongo)

    // 1. Get current state
    const currentHole = appState.currentHole;
    const scoreKey = `${currentHole}_${playerId}`;
    let currentMask = appState.scores[scoreKey] || 0;

    // 2. Toggle the bit 
    // If the player already has this point, we are removing it (isAdding = false).
    // If they don't have it, we are adding it (isAdding = true).
    const isAdding = (currentMask & pointType) === 0;

    if (isAdding) {
        // Enforce Mutual Exclusivity: 
        // Iterate ALL players and remove this specific pointType if they have it.
        appState.players.forEach(p => {
            if (p.id === playerId) return;

            const pKey = `${currentHole}_${p.id}`;
            let pMask = appState.scores[pKey] || 0;

            if ((pMask & pointType) !== 0) {
                // Remove it from the other player
                pMask &= ~pointType;
                appState.scores[pKey] = pMask;

                // Update that player's specific row buttons if needed
                // But full render is safer to ensure consistency
            }
        });

        // Add to current player
        currentMask |= pointType;
    } else {
        // Just remove it from current player
        currentMask &= ~pointType;
    }

    // 3. Save
    appState.scores[scoreKey] = currentMask;
    saveGame(appState);

    // 4. Efficient Update (Targeted DOM)
    // We update all buttons because of mutual exclusivity (one player's toggle affects others).
    // Instead of full render(), we just update the specific elements.
    if (window.updateBingoDOM) {
        window.updateBingoDOM();
    } else {
        render(); // Fallback if helper missing
    }
};

window.updateBingoDOM = function () {
    const currentHole = appState.currentHole;

    appState.players.forEach(p => {
        // 1. Get Score/Mask
        const scoreKey = `${currentHole}_${p.id}`;
        const mask = appState.scores[scoreKey] || 0;

        // 2. Update Buttons
        const btnBingo = document.querySelector(`.bingo-btn[data-id="${p.id}"][data-type="1"]`);
        const btnBango = document.querySelector(`.bingo-btn[data-id="${p.id}"][data-type="2"]`);
        const btnBongo = document.querySelector(`.bingo-btn[data-id="${p.id}"][data-type="4"]`);

        const setBtnState = (btn, isSet) => {
            if (btn) {
                if (isSet) {
                    btn.classList.remove('btn-ghost');
                    btn.classList.add('btn-primary');
                } else {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-ghost');
                }
            }
        };

        setBtnState(btnBingo, (mask & 1) !== 0);
        setBtnState(btnBango, (mask & 2) !== 0);
        setBtnState(btnBongo, (mask & 4) !== 0);

        // 3. Update Subtitle Total Points
        const totalScore = calculateTotal(p.id);
        const subEl = document.getElementById(`total-subtitle-${p.id}`);
        if (subEl) {
            subEl.innerText = `Points: ${totalScore}`;
        }
    });
};

window.randomizePlayerOrder = function () {
    // Fisher-Yates Shuffle for the appState.players array
    for (let i = appState.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [appState.players[i], appState.players[j]] = [appState.players[j], appState.players[i]];
    }
    saveGame(appState);
    render();

    // Feedback
    // Ideally we'd show a toast, but restart is obvious enough.
};

/* --- Match Play Helpers --- */
/**
 * Get the winner of a specific hole for a pair.
 * @returns {string|null} player1Id, player2Id, 'halved', or null (incomplete)
 */
function getMatchPlayHoleWinner(pair, hole) {
    if (!pair.player2Id) return pair.player1Id; // Bye - P1 wins by default

    const s1 = appState.scores[`${hole}_${pair.player1Id}`];
    const s2 = appState.scores[`${hole}_${pair.player2Id}`];

    if (s1 === undefined || s2 === undefined) return null; // Incomplete
    if (s1 < s2) return pair.player1Id;
    if (s2 < s1) return pair.player2Id;
    return 'halved';
}

/**
 * Get the current match status for a pair.
 * @returns {{ status: string, leaderId: string|null, p1Wins: number, p2Wins: number }}
 */
function getMatchPlayStatus(pair) {
    let p1Wins = 0, p2Wins = 0;

    for (let h = 1; h <= appState.config.holeCount; h++) {
        const winner = getMatchPlayHoleWinner(pair, h);
        if (winner === pair.player1Id) p1Wins++;
        else if (winner === pair.player2Id) p2Wins++;
        // 'halved' and null don't affect count
    }

    const diff = p1Wins - p2Wins;
    if (diff === 0) return { status: 'All Square', leaderId: null, p1Wins, p2Wins };
    if (diff > 0) return { status: `${diff} UP`, leaderId: pair.player1Id, p1Wins, p2Wins };
    return { status: `${Math.abs(diff)} UP`, leaderId: pair.player2Id, p1Wins, p2Wins };
}

/* Initial Render */
document.addEventListener('DOMContentLoaded', render);
