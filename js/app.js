import { loadGame, saveGame, clearGame, createInitialState, GameTypes, GameTypeDetails, removePlayer } from './store.js';

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
    let total = 0;
    Object.keys(appState.scores).forEach(key => {
        if (key.endsWith(`_${playerId}`)) {
            const holeIndex = parseInt(key.split('_')[0]);
            const score = appState.scores[key];
            const par = appState.config.pars?.[holeIndex] || appState.config.defaultPar;
            total += (score - par);
        }
    });
    return total;
}

function calculateTotalStrokes(playerId) {
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

    // Left Pane (Fixed): Player Name & Total
    const leftRows = players.map(p => {
        let currentTotal = calculateTotal(p.id);
        const sign = currentTotal > 0 ? '+' : '';
        return `
            <tr>
                <td class="sc-cell-player">${p.name}</td>
                <td class="sc-cell-total">${currentTotal === 0 ? 'E' : (currentTotal > 0 ? sign + currentTotal : currentTotal)}</td>
            </tr>
        `;
    }).join('');

    const leftTable = `
        <table class="sc-table">
            <thead>
                <tr>
                    <th class="sc-cell-player" rowspan="2" style="height: 70px; vertical-align: middle;">Player</th>
                    <th class="sc-cell-total" rowspan="2" style="height: 70px; vertical-align: middle;">Total</th>
                </tr>
                <tr></tr>
            </thead>
            <tbody>${leftRows}</tbody>
        </table>
    `;

    // Right Pane (Scrollable): Holes
    const rightRows = players.map(p => {
        const scoreCells = holes.map(h => {
            const key = `${h}_${p.id}`;
            const val = scores[key];
            if (val !== undefined && val !== null) {
                const par = config.pars?.[h] || config.defaultPar;
                let colorClass = '';
                if (val < par) colorClass = 'text-success';
                if (val > par) colorClass = 'text-danger';
                return `<td class="${colorClass}">${val}</td>`;
            }
            return '<td style="color: var(--text-muted); font-weight: 300;">-</td>';
        }).join('');
        return `<tr>${scoreCells}</tr>`;
    }).join('');

    const rightTable = `
        <table class="sc-table">
            <thead>
                <tr>
                    ${holes.map(h => `<th style="min-width: 36px; height: 30px; line-height: 30px; font-size: 0.75rem; padding: 2px;">${h}</th>`).join('')}
                </tr>
                <tr>
                    ${holes.map(h => {
        const holePar = config.pars?.[h] || config.defaultPar;
        return `<th style="min-width: 36px; height: 30px; line-height: 30px; font-size: 0.65rem; padding: 2px; color: var(--text-muted); font-weight: 400;">P${holePar}</th>`;
    }).join('')}
                </tr>
            </thead>
            <tbody>${rightRows}</tbody>
        </table>
    `;

    return `
        <div class="scoreboard-container">
            <div class="scoreboard-fixed-side">
                ${leftTable}
            </div>
            <div class="scoreboard-scroll-side">
                ${rightTable}
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

        appState = newState;
        saveGame(appState);
        render();
    }
}

class ScorecardView {
    constructor(container) {
        this.container = container;
    }

    render() {
        const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
        const isLastHole = appState.currentHole === appState.config.holeCount;

        this.container.innerHTML = `
            <div class="scorecard-container fade-in">
                <!-- Header -->
                <header class="glass-panel" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <button id="menu-btn" class="btn btn-icon" style="width: 32px; height: 32px;">☰</button>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; line-height: 1;">Hole ${appState.currentHole}</h2>
                            <span class="subtitle" style="font-size: 0.75rem;">of ${appState.config.holeCount}</span>
                        </div>
                    </div>
                    <div style="text-align: right; cursor: pointer;" id="header-par-display">
                        <h2 style="margin: 0; font-size: 1.5rem; line-height: 1; color: var(--accent-primary); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 4px;">Par ${par}</h2>
                        <span class="subtitle" style="font-size: 0.75rem;">${GameTypeDetails[appState.gameType].label}</span>
                    </div>
                </header>

                <!-- Players -->
                <div class="player-scores" style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg);">
                    ${appState.players.map(p => this.renderPlayerRow(p)).join('')}
                </div>

                <!-- Navigation -->
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
            </div>
        `;

        this.attachEvents();
    }

    renderPlayerRow(player) {
        const scoreKey = `${appState.currentHole}_${player.id}`;
        const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
        // Explicitly get the score, allowing undefined
        const currentScore = appState.scores[scoreKey];

        // Use Global Helper
        const totalScore = calculateTotal(player.id);
        const totalStrokes = calculateTotalStrokes(player.id);

        let scoreColor = 'var(--text-main)';
        let displayScore = '-';

        if (currentScore !== undefined && currentScore !== null) {
            displayScore = currentScore;
            if (currentScore < par) scoreColor = 'var(--success)';
            if (currentScore > par) scoreColor = 'var(--danger)';
        } else {
            scoreColor = 'var(--text-muted)';
        }

        return `
            <div class="glass-panel" style="padding: var(--spacing-sm); display: flex; align-items: center; justify-content: space-between;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 1.1rem;">${player.name}</div>
                    <div class="subtitle" style="font-size: 0.8rem;">Score: ${totalScore > 0 ? '+' + totalScore : totalScore} (Total: ${totalStrokes})</div>
                </div>
                
                <div class="flex-center gap-sm">
                    <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="dec" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">−</button>
                    <div style="font-size: 1.5rem; font-weight: 800; width: 40px; text-align: center; color: ${scoreColor};">${displayScore}</div>
                    <button class="btn btn-icon score-btn" data-id="${player.id}" data-action="inc" style="background: rgba(255,255,255,0.1); width: 44px; height: 44px;">+</button>
                </div>
            </div>
        `;
    }

    attachEvents() {
        // Menu
        document.getElementById('menu-btn').addEventListener('click', () => {
            new MenuModal().open();
        });

        // Par Edit Modal
        document.getElementById('header-par-display').addEventListener('click', () => {
            new EditParModal().open();
        });

        // Scoring
        this.container.querySelectorAll('.score-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const playerId = btn.dataset.id;
                const action = btn.dataset.action;
                const scoreKey = `${appState.currentHole}_${playerId}`;
                const par = appState.config.pars?.[appState.currentHole] || appState.config.defaultPar;
                const currentScore = appState.scores[scoreKey];

                let newScore;

                if (currentScore === undefined || currentScore === null) {
                    // First click: + sets par, - sets birdie (par - 1)
                    if (action === 'inc') {
                        newScore = par;
                    } else {
                        newScore = par - 1;
                    }
                } else {
                    newScore = currentScore;
                    if (action === 'inc') newScore++;
                    if (action === 'dec') newScore--;
                }

                // Safety floor
                if (newScore < 1) newScore = 1;

                appState.scores[scoreKey] = newScore;
                saveGame(appState);

                // Update only the specific score display instead of full re-render
                const scoreDisplay = btn.parentElement.querySelector('div[style*="font-size: 1.5rem"]');
                if (scoreDisplay) {
                    scoreDisplay.textContent = newScore;
                    // Update color
                    if (newScore < par) {
                        scoreDisplay.style.color = 'var(--success)';
                    } else if (newScore > par) {
                        scoreDisplay.style.color = 'var(--danger)';
                    } else {
                        scoreDisplay.style.color = 'var(--text-main)';
                    }
                }

                // Update subtotals for this player
                const playerRow = btn.closest('.glass-panel');
                if (playerRow) {
                    const subtitleEl = playerRow.querySelector('.subtitle');
                    if (subtitleEl) {
                        const totalScore = calculateTotal(playerId);
                        const totalStrokes = calculateTotalStrokes(playerId);
                        subtitleEl.textContent = `Score: ${totalScore > 0 ? '+' + totalScore : totalScore} (Total: ${totalStrokes})`;
                    }
                }
            });
        });

        // Navigation
        const prevBtn = document.getElementById('prev-btn');
        if (prevBtn) prevBtn.addEventListener('click', () => {
            if (appState.currentHole > 1) {
                appState.currentHole--;
                saveGame(appState);
                this.render();
            }
        });

        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => {
            if (appState.currentHole < appState.config.holeCount) {
                appState.currentHole++;
                saveGame(appState);
                this.render();
            }
        });

        const finishBtn = document.getElementById('finish-round-btn');
        if (finishBtn) finishBtn.addEventListener('click', () => {
            appState.isFinished = true;
            saveGame(appState);
            render(); // Switch to Summary View
        });
    }
}

class RoundSummaryView {
    constructor(container) {
        this.container = container;
    }

    render() {
        const players = appState.players.map(p => ({
            ...p,
            totalScore: calculateTotal(p.id),
            totalStrokes: calculateTotalStrokes(p.id)
        })).sort((a, b) => a.totalScore - b.totalScore);

        // Find Ties
        const winningScore = players[0].totalScore;
        const winners = players.filter(p => p.totalScore === winningScore);
        const isTie = winners.length > 1;

        let winnerText = `Winner: <span style="color: var(--accent-primary)">${winners[0].name}</span>`;
        if (isTie) {
            const names = winners.map(w => w.name).join(' & ');
            winnerText = `Draw! <span style="font-size:1.5rem; display:block; margin-top:8px; color: var(--accent-primary)">${names}</span>`;
        }

        const scoreboardHTML = generateScoreboardHTML(appState.players, appState.config, appState.scores);

        this.container.innerHTML = `
            <div class="summary-container fade-in p-4" style="padding-bottom: 60px;">
                 <header style="text-align: center; margin-bottom: var(--spacing-lg)">
                    <h1>Round Complete!</h1>
                    <div style="font-size: 3rem; margin: var(--spacing-md) 0;">${isTie ? '🤝' : '🏆'}</div>
                    <h2>${winnerText}</h2>
                    <p class="subtitle">${winners[0].totalScore > 0 ? '+' : ''}${winners[0].totalScore} (${winners[0].totalStrokes} Strokes)</p>
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

            <div id="modal-player-list" style="display: flex; flex-direction: column; gap: var(--spacing-xs); margin-bottom: var(--spacing-md); max-height: 50vh; overflow-y: auto;">
                ${renderList()}
            </div>

            <button id="close-pm-btn" class="btn">Done</button>
        `);

        // Events
        const listEl = this.backdrop.querySelector('#modal-player-list');
        const inputEl = this.backdrop.querySelector('#new-player-name');

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
            const newState = removePlayer(appState, this.player.id);
            appState = newState;
            saveGame(appState);
            this.close();
            // Refresh parent modal list
            if (this.parentModal) {
                const listEl = this.parentModal.backdrop.querySelector('#modal-player-list');
                if (listEl) {
                    listEl.innerHTML = appState.players.map(p => `
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
        super(`
            <h2 style="margin-bottom: var(--spacing-md)">
                ${details.icon} ${details.label} Rules
            </h2>
            <div class="glass-panel" style="
                padding: var(--spacing-md);
                text-align: center;
                color: var(--text-muted);
            ">
                <p style="font-size: 1.25rem; margin-bottom: var(--spacing-sm);">🚧</p>
                <p>Rules for <strong style="color: var(--text-main)">${details.label}</strong> coming soon!</p>
                <p style="font-size: 0.8rem; margin-top: var(--spacing-sm);">${details.description}</p>
            </div>
            <button id="close-rules-btn" class="btn btn-primary" style="margin-top: var(--spacing-md)">Close</button>
        `);

        this.backdrop.querySelector('#close-rules-btn').addEventListener('click', () => this.close());
    }
}

/* Initial Render */
document.addEventListener('DOMContentLoaded', render);
