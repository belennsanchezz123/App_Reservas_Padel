// ==========================================
// TORNEOS (Fase 1)
// ==========================================
// Motor de generación de cuadros + UI dentro del panel de Recepción.
// Depende de funciones globales de app.js (appState, escapeHtml, showToast,
// openModal, closeModal, getStudentById, formatLevel) y de la capa db (db.js).
// Drag & drop de colocación manual = Fase 2 (pendiente).

// Estado de torneos colgado de appState (estado global compartido).
appState.tournaments = appState.tournaments || [];      // lista (resumen)
appState.currentTournament = null;                       // { ...t, pairs, matches }
appState.tournamentDraft = null;                         // borrador al crear

// ==========================================
// MOTOR — cálculos
// ==========================================

function isPowerOfTwo(n) {
    return n >= 1 && (n & (n - 1)) === 0;
}

// Calcula cuántos grupos y clasificados por grupo hacen falta para desembocar
// en un cuadro de eliminatoria de tamaño potencia de 2.
// Regla: 2 clasificados por grupo y grupos de >= 3 parejas; se elige el mayor
// cuadro (potencia de 2 <= n) que cumpla ambas condiciones.
function computeGroupPlan(n, format) {
    if (format === 'round_robin') {
        return { numGroups: 1, qualifiersPerGroup: 0, bracketSize: 0 };
    }
    // Eliminatoria directa solo si n es potencia de 2 (no hace falta fase de grupos).
    if (format === 'elimination' && isPowerOfTwo(n)) {
        return { numGroups: 0, qualifiersPerGroup: 0, bracketSize: n };
    }
    // Resto de casos -> fase de grupos previa con 2 clasificados por grupo.
    const Q = 2;
    for (const P of [32, 16, 8, 4, 2]) {     // tamaños de cuadro candidatos (desc)
        if (P > n) continue;
        const G = P / Q;                      // nº de grupos
        if (G < 1) continue;
        const minGroupSize = Math.floor(n / G);
        if (minGroupSize >= 3) {              // cada grupo con al menos 3 parejas
            return { numGroups: G, qualifiersPerGroup: Q, bracketSize: P };
        }
    }
    // Fallback (pocas parejas): 1 grupo y clasifican las que formen el mayor
    // cuadro potencia de 2 menor que n.
    let P = 1;
    while (P * 2 <= n) P *= 2;
    if (P >= n) P = n >= 2 ? 2 : 0;
    return { numGroups: 1, qualifiersPerGroup: P, bracketSize: P };
}

// Orden de siembra estándar de un cuadro de tamaño n (potencia de 2).
// Devuelve los números de cabeza de serie (1..n) en orden de posición/slot,
// de forma que 1 y 2 solo puedan cruzarse en la final.
function bracketSeedOrder(n) {
    let seeds = [1, 2];
    while (seeds.length < n) {
        const len = seeds.length * 2 + 1;
        const next = [];
        for (const s of seeds) { next.push(s); next.push(len - s); }
        seeds = next;
    }
    return seeds;
}

// Nivel de una pareja = suma de los niveles individuales de sus 2 jugadores.
function pairLevel(pair) {
    const lv = id => {
        const s = getStudentById(id);
        const n = s ? Number(s.level) : NaN;
        return isNaN(n) ? 0 : n;
    };
    return lv(pair.player1Id) + lv(pair.player2Id);
}

// Nombre de un jugador: alumno real o invitado temporal (ID "guest_…").
function getPlayerDisplayName(id) {
    const draft = appState.tournamentDraft;
    if (draft && draft.guestNames && draft.guestNames[id]) return draft.guestNames[id];
    const s = getStudentById(id);
    return s ? s.name.split(' ')[0] : 'Invitado';
}

// Etiqueta legible de una pareja.
function pairLabel(pair) {
    if (!pair) return '—';
    if (pair.name) return pair.name;
    return `${getPlayerDisplayName(pair.player1Id)} / ${getPlayerDisplayName(pair.player2Id)}`;
}

// Letra de grupo a partir del índice (0 -> A, 1 -> B ...).
function groupLetter(idx) {
    return String.fromCharCode(65 + idx);
}

// Ordena/siembra las parejas según el método elegido y les asigna seed (1..n).
// Devuelve un nuevo array ordenado (seed 1 = mejor / primer cruce).
function seedPairs(pairs, method) {
    let ordered = [...pairs];
    if (method === 'level') {
        ordered.sort((a, b) => pairLevel(b) - pairLevel(a));   // mayor nivel primero
    } else if (method === 'random') {
        for (let i = ordered.length - 1; i > 0; i--) {          // Fisher-Yates
            const j = Math.floor(Math.random() * (i + 1));
            [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        }
    }
    // 'manual' (Fase 1): se respeta el orden de inscripción.
    ordered.forEach((p, i) => { p.seed = i + 1; });
    return ordered;
}

// Reparte las parejas (ya sembradas) en G grupos en serpentina, para equilibrar
// el nivel: grupo 0,1,...,G-1,G-1,...,1,0,0,1,...
function assignGroups(seededPairs, numGroups) {
    seededPairs.forEach((p, i) => {
        const cycle = Math.floor(i / numGroups);
        const pos = i % numGroups;
        p.groupIndex = (cycle % 2 === 0) ? pos : (numGroups - 1 - pos);
    });
}

// ==========================================
// MOTOR — generación de partidos
// ==========================================

// Genera todos los partidos (grupos + cuadro) de un torneo a partir de las
// parejas ya sembradas/agrupadas. Devuelve un array listo para insertar en BD.
function buildMatches(tournament, seededPairs) {
    const matches = [];
    const { format, numGroups, bracketSize } = tournament;

    // --- Fase de grupos (round_robin dentro de cada grupo) ---
    if (numGroups > 0) {
        for (let g = 0; g < numGroups; g++) {
            const groupPairs = seededPairs.filter(p => p.groupIndex === g);
            let slot = 0;
            for (let i = 0; i < groupPairs.length; i++) {
                for (let j = i + 1; j < groupPairs.length; j++) {
                    matches.push({
                        tournamentId: tournament.id,
                        phase: 'group',
                        groupIndex: g,
                        round: 0,
                        slot: slot++,
                        pairAId: groupPairs[i].id,
                        pairBId: groupPairs[j].id,
                    });
                }
            }
        }
    }

    // --- Cuadro de eliminatoria ---
    if (bracketSize >= 2) {
        const totalRounds = Math.round(Math.log2(bracketSize));
        const order = bracketSeedOrder(bracketSize); // seed nº por posición

        const isDirect = (numGroups === 0); // eliminatoria directa (sin grupos)

        // Ronda 0: con parejas (directa) o con etiquetas de clasificados (grupos).
        for (let i = 0; i < bracketSize / 2; i++) {
            const seedA = order[i * 2];
            const seedB = order[i * 2 + 1];
            const m = {
                tournamentId: tournament.id,
                phase: 'bracket',
                round: 0,
                slot: i,
                pairAId: null,
                pairBId: null,
                labelA: null,
                labelB: null,
            };
            if (isDirect) {
                m.pairAId = seededPairs.find(p => p.seed === seedA)?.id || null;
                m.pairBId = seededPairs.find(p => p.seed === seedB)?.id || null;
            } else {
                // Huecos por clasificar: seed k -> etiqueta de clasificado.
                m.labelA = qualifierLabel(seedA, tournament);
                m.labelB = qualifierLabel(seedB, tournament);
            }
            matches.push(m);
        }

        // Rondas siguientes: vacías (se rellenan al avanzar).
        for (let r = 1; r < totalRounds; r++) {
            const matchesInRound = bracketSize / Math.pow(2, r + 1);
            for (let s = 0; s < matchesInRound; s++) {
                matches.push({
                    tournamentId: tournament.id, phase: 'bracket',
                    round: r, slot: s, pairAId: null, pairBId: null,
                });
            }
        }
    }

    return matches;
}

// Etiqueta del clasificado que ocupará un seed del cuadro.
// Orden: ganadores de grupo (seeds 1..G por orden A,B,C..) y luego segundos
// (seeds G+1..2G por orden A,B,C..). Evita cruces del mismo grupo en 1ª ronda.
function qualifierLabel(seed, tournament) {
    const G = tournament.numGroups;
    if (seed <= G) {
        return `1º Grupo ${groupLetter(seed - 1)}`;
    }
    return `2º Grupo ${groupLetter(seed - G - 1)}`;
}

// ==========================================
// CARGA DE DATOS
// ==========================================

async function loadTournaments() {
    try {
        const data = await db.getTournaments();
        appState.tournaments = data.map(t => db.convertTournamentFromDB(t));
    } catch (e) {
        console.warn('No se pudieron cargar los torneos (¿falta ejecutar tournaments.sql?):', e);
        appState.tournaments = [];
    }
}

async function loadTournamentDetail(tournamentId) {
    const t = appState.tournaments.find(x => x.id === tournamentId);
    if (!t) return null;
    const [pairsData, matchesData] = await Promise.all([
        db.getTournamentPairs(tournamentId),
        db.getTournamentMatches(tournamentId),
    ]);
    appState.currentTournament = {
        ...t,
        pairs: pairsData.map(p => db.convertTournamentPairFromDB(p)),
        matches: matchesData.map(m => db.convertTournamentMatchFromDB(m)),
    };
    return appState.currentTournament;
}

function getPairById(id) {
    if (!id || !appState.currentTournament) return null;
    return appState.currentTournament.pairs.find(p => p.id === id) || null;
}

// ==========================================
// UI — listado y creación
// ==========================================

function renderTournamentsView() {
    appState.currentTournament = null;
    const container = document.getElementById('tournamentsList');
    if (!container) return;

    if (!appState.tournaments.length) {
        container.innerHTML = '<div class="recepcion-empty">No hay torneos. Pulsa "Nuevo torneo" para crear uno.</div>';
        container.onclick = null;
        return;
    }

    const formatLabel = f => ({ elimination: 'Eliminatoria', round_robin: 'Liguilla', groups_elim: 'Grupos + eliminatoria' }[f] || f);
    const statusLabel = s => ({ setup: 'Configuración', active: 'En juego', finished: 'Finalizado' }[s] || s);

    container.innerHTML = appState.tournaments.map(t => `
        <div class="tournament-card" data-tid="${escapeHtml(t.id)}">
            <div class="tournament-card-main">
                <div class="tournament-card-name">${escapeHtml(t.name)}</div>
                <div class="tournament-card-meta">
                    <span class="t-chip">${escapeHtml(formatLabel(t.format))}</span>
                    <span class="t-chip">${t.numPairs} parejas</span>
                    <span class="t-chip t-chip-status t-status-${escapeHtml(t.status)}">${escapeHtml(statusLabel(t.status))}</span>
                </div>
            </div>
            <div class="tournament-card-actions">
                <button class="btn btn-primary btn-sm" data-t-action="open" data-tid="${escapeHtml(t.id)}">Ver cuadro</button>
                <button class="btn-icon-sm" data-t-action="delete" data-tid="${escapeHtml(t.id)}" title="Eliminar torneo">🗑️</button>
            </div>
        </div>`).join('');

    container.onclick = (e) => {
        const btn = e.target.closest('button[data-t-action]');
        if (!btn) return;
        const { tAction, tid } = btn.dataset;
        if (tAction === 'open') openTournament(tid);
        else if (tAction === 'delete') confirmDeleteTournament(tid);
    };
}

function openCreateTournamentModal() {
    document.getElementById('tournamentForm').reset();
    appState.tournamentDraft = { pairs: [], buffer: [], guestNames: {} };
    renderTournamentPairsDraft();
    openModal('tournamentModal');
}

// Selector de parejas: se eligen 2 alumnos para formar cada pareja.
function renderTournamentPairsDraft(query = '') {
    const draft = appState.tournamentDraft;
    const container = document.getElementById('tournamentPairsSelector');
    if (!draft || !container) return;

    const usedIds = new Set(draft.pairs.flat().concat(draft.buffer));

    const pairsHtml = draft.pairs.map((pair, idx) => `
        <div class="t-pair-row">
            <span class="t-pair-idx">${idx + 1}</span>
            <span class="t-pair-names">${escapeHtml(pairLabel({ player1Id: pair[0], player2Id: pair[1] }))}</span>
            <button type="button" class="player-pill-remove" onclick="removeTournamentPair(${idx})">✕</button>
        </div>`).join('');

    const bufferHtml = draft.buffer.map(id => {
        const name = getPlayerDisplayName(id);
        return `<span class="player-pill">${escapeHtml(name)}
            <button type="button" class="player-pill-remove" onclick="removeTournamentBuffer('${escapeHtml(id)}')">✕</button></span>`;
    }).join('');

    const q = query.toLowerCase();
    const studentResults = appState.students
        .filter(s => s.active !== false && !usedIds.has(s.id) && s.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map(s => `<div class="player-result" onclick="addTournamentPlayer('${escapeHtml(s.id)}')">
            <span>${escapeHtml(s.name)}</span>
            <span class="match-level-badge sm">${escapeHtml(formatLevel(s.level))}</span></div>`).join('');

    const guestOption = query.trim()
        ? `<div class="player-result player-result-guest" onclick="addTournamentGuest('${escapeHtml(query.trim())}')">
            ➕ Añadir <strong>${escapeHtml(query.trim())}</strong> como invitado
           </div>`
        : '';

    container.innerHTML = `
        <div class="t-pairs-list">${pairsHtml || '<span class="players-hint">Aún no hay parejas.</span>'}</div>
        <div class="t-buffer">
            <span class="players-hint">Pareja en curso (${draft.buffer.length}/2):</span>
            <div class="player-pills">${bufferHtml || '<span class="players-hint">elige 2 jugadores…</span>'}</div>
        </div>
        <input type="text" class="player-search-input" placeholder="Buscar alumno o escribir invitado…" oninput="renderTournamentPairsDraft(this.value)" value="${escapeHtml(query)}">
        <div class="player-results">${studentResults || (!query.trim() ? '<div class="players-hint">Escribe un nombre para buscar.</div>' : '')}${guestOption}</div>
        <div class="t-pairs-count">${draft.pairs.length} parejas inscritas</div>`;

    const input = container.querySelector('.player-search-input');
    if (input && query) { input.focus(); input.setSelectionRange(query.length, query.length); }
}

function addTournamentPlayer(studentId) {
    const draft = appState.tournamentDraft;
    if (!draft) return;
    if (draft.buffer.includes(studentId)) return;
    draft.buffer.push(studentId);
    if (draft.buffer.length === 2) {          // pareja completa
        draft.pairs.push([draft.buffer[0], draft.buffer[1]]);
        draft.buffer = [];
    }
    renderTournamentPairsDraft();
}

function addTournamentGuest(name) {
    const draft = appState.tournamentDraft;
    if (!draft || !name.trim()) return;
    const id = 'guest_' + Date.now();
    draft.guestNames = draft.guestNames || {};
    draft.guestNames[id] = name.trim();
    draft.buffer.push(id);
    if (draft.buffer.length === 2) {          // pareja completa
        draft.pairs.push([draft.buffer[0], draft.buffer[1]]);
        draft.buffer = [];
    }
    renderTournamentPairsDraft();
}

function removeTournamentBuffer(studentId) {
    appState.tournamentDraft.buffer = appState.tournamentDraft.buffer.filter(id => id !== studentId);
    renderTournamentPairsDraft();
}

function removeTournamentPair(idx) {
    appState.tournamentDraft.pairs.splice(idx, 1);
    renderTournamentPairsDraft();
}

async function submitTournament() {
    const name = document.getElementById('tournamentName').value.trim();
    const format = document.getElementById('tournamentFormat').value;
    const seedByLevel = document.getElementById('tournamentSeedByLevel')?.checked;
    const seeding = seedByLevel ? 'level' : document.getElementById('tournamentSeeding').value;
    const draftPairs = appState.tournamentDraft.pairs;

    if (!name) { showToast('Indica un nombre para el torneo', 'error'); return; }
    if (draftPairs.length < 2) { showToast('Inscribe al menos 2 parejas', 'error'); return; }

    const n = draftPairs.length;
    const plan = computeGroupPlan(n, format);

    if (format !== 'round_robin' && plan.bracketSize < 2) {
        showToast('No hay parejas suficientes para generar un cuadro', 'error');
        return;
    }

    try {
        // 1. Crear torneo
        const created = db.convertTournamentFromDB(await db.createTournament({
            name, format, seeding, status: 'active',
            numPairs: n,
            numGroups: plan.numGroups,
            qualifiersPerGroup: plan.qualifiersPerGroup,
            bracketSize: plan.bracketSize,
        }));

        // 2. Crear parejas (siembra + agrupación) y recuperar sus ids
        let pairDrafts = draftPairs.map(([p1, p2]) => ({
            tournamentId: created.id, player1Id: p1, player2Id: p2,
            name: pairLabel({ player1Id: p1, player2Id: p2 }),
        }));
        pairDrafts = seedPairs(pairDrafts, seeding);
        if (plan.numGroups > 0) assignGroups(pairDrafts, plan.numGroups);

        const insertedPairs = (await db.createTournamentPairs(pairDrafts))
            .map(p => db.convertTournamentPairFromDB(p));

        // Reasociar seed/groupIndex (BD devuelve sin orden garantizado).
        insertedPairs.forEach(ip => {
            const src = pairDrafts.find(d => d.player1Id === ip.player1Id && d.player2Id === ip.player2Id);
            if (src) { ip.seed = src.seed; ip.groupIndex = src.groupIndex; }
        });

        // 3. Generar y crear partidos
        const matchDrafts = buildMatches(created, insertedPairs);
        if (matchDrafts.length) await db.createTournamentMatches(matchDrafts);

        // 4. Refrescar y abrir
        await loadTournaments();
        closeModal('tournamentModal');
        showToast('Torneo creado', 'success');
        openTournament(created.id);
    } catch (e) {
        console.error('Error creando torneo:', e);
        showToast('Error al crear el torneo', 'error');
    }
}

async function confirmDeleteTournament(id) {
    const t = appState.tournaments.find(x => x.id === id);
    if (!t) return;
    if (!(await showConfirm(`¿Eliminar el torneo "${t.name}" y todos sus partidos?`,
        { title: 'Eliminar torneo', confirmText: 'Eliminar', danger: true }))) return;
    db.deleteTournament(id)
        .then(async () => {
            await loadTournaments();
            renderTournamentsView();
            showToast('Torneo eliminado', 'success');
        })
        .catch(() => showToast('Error al eliminar el torneo', 'error'));
}

// ==========================================
// UI — detalle (grupos + cuadro)
// ==========================================

async function openTournament(id) {
    try {
        showLoading('Cargando torneo...');
        await loadTournamentDetail(id);
        hideLoading();
        // Navegación tipo pila listado → detalle (anima solo en móvil)
        withViewTransition(() => renderTournamentDetail());
    } catch (e) {
        hideLoading();
        showToast('Error al cargar el torneo', 'error');
    }
}

function renderTournamentDetail() {
    const ct = appState.currentTournament;
    const listView = document.getElementById('tournamentsListView');
    const detailView = document.getElementById('tournamentDetailView');
    if (!ct || !detailView) return;

    listView.style.display = 'none';
    detailView.style.display = '';

    const winner = ct.winnerPairId ? getPairById(ct.winnerPairId) : null;

    detailView.innerHTML = `
        <div class="t-detail-header">
            <button class="day-back-btn" type="button" onclick="backToTournamentsList()" aria-label="Volver al listado de torneos">
                <span class="day-back-chevron">‹</span> Torneos
            </button>
            <h3 class="t-detail-title">${escapeHtml(ct.name)}</h3>
            ${winner ? `<span class="t-champion">🏆 Campeón: ${escapeHtml(pairLabel(winner))}</span>` : ''}
        </div>
        ${ct.numGroups > 0 ? `<div class="t-section-title">Fase de grupos</div><div id="tGroups"></div>` : ''}
        ${ct.bracketSize >= 2 ? `<div class="t-section-title">Cuadro de eliminatoria</div><div id="tBracket" class="t-bracket"></div>` : ''}
        ${ct.format === 'round_robin' ? `<div class="t-section-title">Clasificación</div><div id="tGroups"></div>` : ''}
    `;

    if (ct.numGroups > 0 || ct.format === 'round_robin') renderGroups();
    if (ct.bracketSize >= 2) renderBracket();

    // Listener delegado para registrar resultados.
    detailView.querySelectorAll('[data-result-match]').forEach(btn => {
        btn.onclick = () => openTournamentResult(btn.dataset.resultMatch);
    });
}

function backToTournamentsList() {
    appState.currentTournament = null;
    withViewTransition(() => {
        document.getElementById('tournamentDetailView').style.display = 'none';
        document.getElementById('tournamentsListView').style.display = '';
        renderTournamentsView();
    });
}

// Calcula la clasificación de un grupo: nº de victorias, desempate por seed.
function groupStandings(groupIndex) {
    const ct = appState.currentTournament;
    const pairs = ct.pairs.filter(p => p.groupIndex === groupIndex);
    const wins = {};
    pairs.forEach(p => { wins[p.id] = 0; });
    ct.matches.filter(m => m.phase === 'group' && m.groupIndex === groupIndex && m.winnerPairId)
        .forEach(m => { wins[m.winnerPairId] = (wins[m.winnerPairId] || 0) + 1; });
    return pairs.slice().sort((a, b) => (wins[b.id] - wins[a.id]) || (a.seed - b.seed))
        .map(p => ({ pair: p, wins: wins[p.id] }));
}

function renderGroups() {
    const ct = appState.currentTournament;
    const host = document.getElementById('tGroups');
    if (!host) return;
    const numGroups = ct.format === 'round_robin' ? 1 : ct.numGroups;

    let html = '';
    for (let g = 0; g < numGroups; g++) {
        const standings = groupStandings(g);
        const qualifyN = ct.qualifiersPerGroup;
        const rows = standings.map((row, i) => `
            <tr class="${qualifyN && i < qualifyN ? 't-qualified' : ''}">
                <td>${i + 1}</td>
                <td>${escapeHtml(pairLabel(row.pair))}</td>
                <td style="text-align:center">${row.wins}</td>
            </tr>`).join('');

        const groupMatches = ct.matches
            .filter(m => m.phase === 'group' && m.groupIndex === g)
            .map(m => renderMatchRow(m)).join('');

        html += `
        <div class="t-group">
            <div class="t-group-title">${ct.format === 'round_robin' ? 'Liguilla' : 'Grupo ' + groupLetter(g)}</div>
            <table class="t-standings">
                <thead><tr><th>#</th><th>Pareja</th><th>V</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="t-group-matches">${groupMatches}</div>
        </div>`;
    }
    host.innerHTML = html;
}

// Fila de un partido (grupo o cuadro) con botón de resultado.
function renderMatchRow(m) {
    const a = getPairById(m.pairAId);
    const b = getPairById(m.pairBId);
    const nameA = a ? pairLabel(a) : (m.labelA || '—');
    const nameB = b ? pairLabel(b) : (m.labelB || '—');
    const playable = a && b && !m.winnerPairId;
    const winA = m.winnerPairId && m.winnerPairId === m.pairAId;
    const winB = m.winnerPairId && m.winnerPairId === m.pairBId;

    return `
    <div class="t-match">
        <span class="t-match-pair ${winA ? 't-match-win' : ''}">${escapeHtml(nameA)}</span>
        <span class="t-match-vs">vs</span>
        <span class="t-match-pair ${winB ? 't-match-win' : ''}">${escapeHtml(nameB)}</span>
        ${playable
            ? `<button class="btn btn-primary btn-xs" data-result-match="${escapeHtml(m.id)}">Resultado</button>`
            : (m.winnerPairId ? '<span class="t-match-done">✓</span>' : '<span class="t-match-pending">—</span>')}
    </div>`;
}

function renderBracket() {
    const ct = appState.currentTournament;
    const host = document.getElementById('tBracket');
    if (!host) return;
    const totalRounds = Math.round(Math.log2(ct.bracketSize));
    const roundName = (r) => {
        const remaining = ct.bracketSize / Math.pow(2, r);
        if (remaining === 2) return 'Final';
        if (remaining === 4) return 'Semifinales';
        if (remaining === 8) return 'Cuartos';
        if (remaining === 16) return 'Octavos';
        return `Ronda de ${remaining}`;
    };

    let html = '';
    for (let r = 0; r < totalRounds; r++) {
        const roundMatches = ct.matches
            .filter(m => m.phase === 'bracket' && m.round === r)
            .sort((a, b) => a.slot - b.slot)
            .map(m => renderMatchRow(m)).join('');
        html += `<div class="t-round"><div class="t-round-title">${roundName(r)}</div>${roundMatches}</div>`;
    }
    host.innerHTML = html;
}

// ==========================================
// REGISTRO DE RESULTADOS + AVANCE
// ==========================================

function openTournamentResult(matchId) {
    const ct = appState.currentTournament;
    const m = ct.matches.find(x => x.id === matchId);
    if (!m) return;
    const a = getPairById(m.pairAId);
    const b = getPairById(m.pairBId);
    if (!a || !b) return;

    document.getElementById('tournamentResultTeams').innerHTML = [a, b].map(p => `
        <button class="match-result-team-btn" onclick="recordTournamentResult('${escapeHtml(matchId)}','${escapeHtml(p.id)}')">
            <span class="match-result-team-label">${escapeHtml(pairLabel(p))}</span>
            <span class="match-result-win">Ganó esta pareja →</span>
        </button>`).join('');
    openModal('tournamentResultModal');
}

async function recordTournamentResult(matchId, winnerPairId) {
    const ct = appState.currentTournament;
    const m = ct.matches.find(x => x.id === matchId);
    if (!m) return;

    try {
        await db.updateTournamentMatch(matchId, { winnerPairId });
        m.winnerPairId = winnerPairId;

        if (m.phase === 'bracket') {
            await advanceBracketWinner(m, winnerPairId);
        } else if (m.phase === 'group') {
            await tryResolveGroups();
        }

        closeModal('tournamentResultModal');
        renderTournamentDetail();
        showToast('Resultado registrado', 'success');
    } catch (e) {
        console.error('Error registrando resultado de torneo:', e);
        showToast('Error al registrar el resultado', 'error');
    }
}

// Propaga el ganador de un cruce al siguiente, o marca campeón si es la final.
async function advanceBracketWinner(match, winnerPairId) {
    const ct = appState.currentTournament;
    const totalRounds = Math.round(Math.log2(ct.bracketSize));

    if (match.round >= totalRounds - 1) {       // era la final
        await db.updateTournament(ct.id, { winnerPairId, status: 'finished' });
        ct.winnerPairId = winnerPairId;
        ct.status = 'finished';
        const summary = appState.tournaments.find(t => t.id === ct.id);
        if (summary) { summary.status = 'finished'; summary.winnerPairId = winnerPairId; }
        return;
    }

    const nextRound = match.round + 1;
    const nextSlot = Math.floor(match.slot / 2);
    const side = (match.slot % 2 === 0) ? 'a' : 'b';
    const next = ct.matches.find(x => x.phase === 'bracket' && x.round === nextRound && x.slot === nextSlot);
    if (!next) return;

    const upd = side === 'a' ? { pairAId: winnerPairId } : { pairBId: winnerPairId };
    await db.updateTournamentMatch(next.id, upd);
    if (side === 'a') next.pairAId = winnerPairId; else next.pairBId = winnerPairId;
}

// Si todos los partidos de grupos tienen ganador, rellena la 1ª ronda del cuadro
// con los clasificados (mapeo seed -> etiqueta "1º/2º Grupo X").
async function tryResolveGroups() {
    const ct = appState.currentTournament;
    if (ct.numGroups <= 0 || ct.bracketSize < 2) return;

    const groupMatches = ct.matches.filter(m => m.phase === 'group');
    const allDone = groupMatches.length > 0 && groupMatches.every(m => m.winnerPairId);
    if (!allDone) return;

    // ¿Ya se rellenó el cuadro? (round 0 sin etiquetas pendientes)
    const round0 = ct.matches.filter(m => m.phase === 'bracket' && m.round === 0);
    const alreadyFilled = round0.every(m => m.pairAId && m.pairBId);
    if (alreadyFilled) return;

    // Construir lista de clasificados indexada por seed (1..bracketSize):
    //   seed 1..G  -> 1º de cada grupo (A,B,C..)
    //   seed G+1.. -> 2º de cada grupo (A,B,C..)
    const G = ct.numGroups;
    const Q = ct.qualifiersPerGroup;
    const qualifierBySeed = {};
    for (let g = 0; g < G; g++) {
        const standings = groupStandings(g);
        for (let q = 0; q < Q; q++) {
            const seed = q * G + g + 1;       // 1ºs primero, luego 2ºs
            qualifierBySeed[seed] = standings[q] ? standings[q].pair.id : null;
        }
    }

    // Rellenar cada cruce de ronda 0 según las etiquetas que pusimos al generar.
    const labelToSeed = {};
    for (let seed = 1; seed <= ct.bracketSize; seed++) {
        labelToSeed[qualifierLabel(seed, ct)] = seed;
    }

    for (const m of round0) {
        const seedA = labelToSeed[m.labelA];
        const seedB = labelToSeed[m.labelB];
        const pairAId = qualifierBySeed[seedA] || null;
        const pairBId = qualifierBySeed[seedB] || null;
        await db.updateTournamentMatch(m.id, { pairAId, pairBId });
        m.pairAId = pairAId; m.pairBId = pairBId;
    }
}
