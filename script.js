// ==========================================
// 1. 상수 및 버저닝 설정
// ==========================================
const DATA_VERSION = 2; // 데이터 스키마 버전
const STORAGE_KEY = 'yacht_play_history';

const CATEGORIES = [
    'aces', 'deuces', 'threes', 'fours', 'fives', 'sixes',
    'choice', 'fourKind', 'fullHouse', 'sStraight', 'lStraight', 'yacht'
];

const LOWER_CATEGORIES = ['choice', 'fourKind', 'fullHouse', 'sStraight', 'lStraight', 'yacht'];

const ALL_SKILLS = [
    { id: 'bonus_plus5', title: '🎯 추가점수 (+5)', desc: '하단 2곳에 +5점 보너스 부여 (1점 이상 등록 시 적용)' },
    { id: 'rewrite_score', title: '🔄 점수 재입력권 (1회)', desc: '이미 작성된 칸 1개를 지우고 현 주사위로 다시 입력' },
    { id: 'lower_bonus_req', title: '✨ 상단 보너스 완화', desc: '상단 보너스(+35점) 기준을 63점에서 55점으로 완화' },
    { id: 'dice_6_roll', title: '🎲 주사위 추가 찬스 (1회)', desc: '원하는 1턴 동안 주사위 6개로 굴려 플레이' },
    { id: 'extra_roll', title: '⚡ 기회 추가 (총 2회)', desc: '3회 굴림 후 턴당 최대 1회 더 굴림 (판당 총 2회 사용 가능)' },
    { id: 'free_10_pts', title: '🛡️ 프리 10점 (1회)', desc: '비어있는 원하는 칸 1곳에 무조건 10점을 확정 입력' }
];

// ==========================================
// 2. 게임 상태 변수
// ==========================================
let selectedDifficulty = 'medium';
let isActionLocked = false;

let timerInterval = null;
let timeLeft = 30;
let isPaused = false;

let p1Skill = null;
let aiSkill = null;
let p1BonusCategories = [];
let aiBonusCategories = [];
let p1SkillUsedCount = 0;
let aiSkillUsedCount = 0;

let p1UsedExtraRollThisTurn = false;
let is6DiceTurn = false;
let isFree10Mode = false;

let dice = [1, 1, 1, 1, 1];
let held = [false, false, false, false, false];
let rollsLeft = 3;
let isPlayerTurn = true;
let isRolling = false;
let currentRound = 1;

let p1Scores = {};
let aiScores = {};

let isMuted = false;
let isReduceMotion = false;

// ==========================================
// 3. 포커스 이탈/복귀 및 기본 이벤트
// ==========================================
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (timerInterval) stopTimer();
    } else {
        if (!isPaused && timerInterval === null && document.getElementById('diff-screen').style.display === 'none') {
            startTimer();
        }
    }
});

function togglePause(pauseState) {
    isPaused = pauseState;
    const pauseScreen = document.getElementById('pause-screen');
    if (isPaused) {
        stopTimer();
        pauseScreen.style.display = 'flex';
    } else {
        pauseScreen.style.display = 'none';
        startTimer();
    }
}

function selectDifficulty(diff) {
    selectedDifficulty = diff;
    document.getElementById('diff-screen').style.display = 'none';
    showSkillSelection();
}

function showSkillSelection() {
    const container = document.getElementById('skill-options-container');
    container.innerHTML = '';
    
    const shuffled = [...ALL_SKILLS].sort(() => 0.5 - Math.random());
    const options = shuffled.slice(0, 3);

    options.forEach(skill => {
        const btn = document.createElement('button');
        btn.className = 'skill-btn float-effect';
        btn.innerHTML = `<span class="skill-title">${skill.title}</span><span class="skill-desc">${skill.desc}</span>`;
        btn.onclick = () => chooseSkill(skill);
        container.appendChild(btn);
    });

    document.getElementById('skill-screen').style.display = 'flex';
}

function chooseSkill(skill) {
    p1Skill = skill;
    aiSkill = ALL_SKILLS[Math.floor(Math.random() * ALL_SKILLS.length)];

    document.getElementById('skill-screen').style.display = 'none';
    initGame();
}

function resetGame() {
    stopTimer();
    isPaused = false;
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('result-modal').style.display = 'none';
    document.getElementById('diff-screen').style.display = 'flex';
    document.getElementById('skill-screen').style.display = 'none';
}

function pauseTimer() {
    stopTimer();
}

function resumeTimer() {
    if (!isPaused && isPlayerTurn && timerInterval === null && timeLeft > 0) {
        timerInterval = setInterval(() => {
            if (isPaused) return;
            timeLeft--;
            updateTimerUI();

            if (timeLeft <= 0) {
                stopTimer();
                gameOver(true);
            }
        }, 1000);
    }
}

function startTimer() {
    stopTimer();
    timeLeft = 30;
    updateTimerUI();

    timerInterval = setInterval(() => {
        if (isPaused) return;
        timeLeft--;
        updateTimerUI();

        if (timeLeft <= 0) {
            stopTimer();
            gameOver(true);
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerUI() {
    const timerEl = document.getElementById('timer-text');
    if (timerEl) {
        timerEl.innerText = `⏱️ ${timeLeft}s`;
    }
}

// ==========================================
// 4. 게임 초기화 및 제어
// ==========================================
function initGame() {
    p1Scores = {};
    aiScores = {};
    dice = [1, 1, 1, 1, 1];
    held = [false, false, false, false, false];
    rollsLeft = 3;
    isPlayerTurn = true;
    isRolling = false;
    isActionLocked = false;
    currentRound = 1;
    
    p1SkillUsedCount = 0;
    aiSkillUsedCount = 0;
    p1UsedExtraRollThisTurn = false;
    is6DiceTurn = false;
    isFree10Mode = false;
    
    p1BonusCategories = [];
    aiBonusCategories = [];

    LOWER_CATEGORIES.forEach(cat => {
        const label = document.getElementById(`label-${cat}`);
        if (label) {
            const baseText = cat === 'choice' ? 'Choice' :
                             cat === 'fourKind' ? '4 of a Kind' :
                             cat === 'fullHouse' ? 'Full House' :
                             cat === 'sStraight' ? 'S. Straight' :
                             cat === 'lStraight' ? 'L. Straight' : 'Yacht';
            label.innerHTML = baseText;
        }
    });

    const skillBtn = document.getElementById('skill-use-btn');
    skillBtn.style.display = 'none';
    skillBtn.disabled = false;

    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) rollBtn.classList.add('float-effect');
    if (skillBtn) skillBtn.classList.add('float-effect');

    if (p1Skill) {
        document.getElementById('p1-skill-info').innerText = `P: ${p1Skill.title}`;
        if (p1Skill.id === 'bonus_plus5') {
            p1BonusCategories = [...LOWER_CATEGORIES].sort(() => 0.5 - Math.random()).slice(0, 2);
            p1BonusCategories.forEach(cat => {
                const label = document.getElementById(`label-${cat}`);
                if (label) label.innerHTML += `<span class="bonus-tag-p1">(P+5)</span>`;
            });
        } else if (['rewrite_score', 'dice_6_roll', 'extra_roll', 'free_10_pts'].includes(p1Skill.id)) {
            skillBtn.style.display = 'inline-block';
            updateSkillButtonUI();
        }
    }

    if (aiSkill) {
        document.getElementById('ai-skill-info').innerText = `AI: ${aiSkill.title}`;
        if (aiSkill.id === 'bonus_plus5') {
            aiBonusCategories = [...LOWER_CATEGORIES].sort(() => 0.5 - Math.random()).slice(0, 2);
            aiBonusCategories.forEach(cat => {
                const label = document.getElementById(`label-${cat}`);
                if (label) label.innerHTML += `<span class="bonus-tag-ai">(AI+5)</span>`;
            });
        }
    }

    createDiceUI(5);
    resetScoreSheet();
    updateTurnUI();

    document.getElementById('roll-btn').disabled = false;
    document.getElementById('rolls-left-text').innerText = `🎲 ${rollsLeft} left`;

    startTimer();
}

function updateSkillButtonUI() {
    const skillBtn = document.getElementById('skill-use-btn');
    if (!p1Skill) return;

    if (p1Skill.id === 'extra_roll') {
        skillBtn.innerText = `기회 추가 (${2 - p1SkillUsedCount}/2)`;
        skillBtn.disabled = (p1SkillUsedCount >= 2 || p1UsedExtraRollThisTurn || rollsLeft > 0);
    } else if (p1Skill.id === 'rewrite_score') {
        skillBtn.innerText = '점수 재입력';
        skillBtn.disabled = (p1SkillUsedCount >= 1);
    } else if (p1Skill.id === 'dice_6_roll') {
        skillBtn.innerText = '주사위 추가 찬스';
        skillBtn.disabled = (p1SkillUsedCount >= 1);
    } else if (p1Skill.id === 'free_10_pts') {
        skillBtn.innerText = '프리 10점';
        skillBtn.disabled = (p1SkillUsedCount >= 1);
    }
}

function createDiceUI(count) {
    const container = document.getElementById('dice-container');
    container.innerHTML = '';
    dice = Array(count).fill(1);
    held = Array(count).fill(false);

    for (let i = 0; i < count; i++) {
        const diceEl = document.createElement('div');
        diceEl.className = 'dice-2d float-effect';
        diceEl.id = `dice-${i}`;
        diceEl.setAttribute('data-val', dice[i]);
        diceEl.onclick = () => toggleHold(i);

        for (let d = 1; d <= 9; d++) {
            const dot = document.createElement('div');
            dot.className = `dot d${d}`;
            diceEl.appendChild(dot);
        }
        container.appendChild(diceEl);
    }
}

function toggleHold(index) {
    if (isPlayerTurn && rollsLeft < 3 && !isRolling && !isActionLocked) {
        held[index] = !held[index];
        const diceEl = document.getElementById(`dice-${index}`);
        if (diceEl) diceEl.classList.toggle('held', held[index]);
    }
}

function rollDice(callback) {
    if (rollsLeft <= 0 || isRolling || isActionLocked) return;
    isRolling = true;
    isActionLocked = true;

    playDiceSound();

    const duration = 500;
    const intervalTime = 50;
    let elapsedTime = 0;

    const rollTimer = setInterval(() => {
        elapsedTime += intervalTime;

        for (let i = 0; i < dice.length; i++) {
            if (!held[i]) {
                const tempVal = Math.floor(Math.random() * 6) + 1;
                const diceEl = document.getElementById(`dice-${i}`);
                if (diceEl) diceEl.setAttribute('data-val', tempVal);
            }
        }

        if (elapsedTime >= duration) {
            clearInterval(rollTimer);

            for (let i = 0; i < dice.length; i++) {
                if (!held[i]) dice[i] = Math.floor(Math.random() * 6) + 1;
            }

            sortDiceWithHold();

            for (let i = 0; i < dice.length; i++) {
                const diceEl = document.getElementById(`dice-${i}`);
                if (diceEl) diceEl.setAttribute('data-val', dice[i]);
            }

            rollsLeft--;
            isRolling = false;
            
            setTimeout(() => { isActionLocked = false; }, 50);

            if (isPlayerTurn) {
                updatePreviews();
                updateSkillButtonUI();
            }

            document.getElementById('rolls-left-text').innerText = `🎲 ${rollsLeft} left`;
            if (callback) callback();
        }
    }, intervalTime);
}

function sortDiceWithHold() {
    let paired = dice.map((v, i) => ({ val: v, held: held[i] }));
    paired.sort((a, b) => a.val - b.val);
    
    for (let i = 0; i < dice.length; i++) {
        dice[i] = paired[i].val;
        held[i] = paired[i].held;
        const diceEl = document.getElementById(`dice-${i}`);
        if (diceEl) diceEl.classList.toggle('held', held[i]);
    }
}

function playerRoll() {
    if (!isPlayerTurn || isActionLocked) return;
    rollDice();
}

function useActiveSkill() {
    if (!isPlayerTurn || isRolling || isActionLocked || !p1Skill) return;

    if (p1Skill.id === 'extra_roll') {
        if (rollsLeft > 0 || p1SkillUsedCount >= 2 || p1UsedExtraRollThisTurn) return;
        p1SkillUsedCount++;
        p1UsedExtraRollThisTurn = true;
        rollsLeft++;
        document.getElementById('rolls-left-text').innerText = `🎲 ${rollsLeft} left`;
        updateSkillButtonUI();

    } else if (p1Skill.id === 'dice_6_roll') {
        if (rollsLeft !== 3) {
            alert('주사위 추가 찬스는 턴 시작 직후에만 사용할 수 있습니다.');
            return;
        }
        p1SkillUsedCount = 1;
        is6DiceTurn = true;
        createDiceUI(6);
        updateSkillButtonUI();

    } else if (p1Skill.id === 'rewrite_score') {
        if (rollsLeft === 3) {
            alert('주사위를 먼저 굴린 후 재입력할 수 있습니다.');
            return;
        }
        alert('지우고 현 눈금으로 새로 입력할 점수칸을 선택하세요.');
        highlightRewritableCells();

    } else if (p1Skill.id === 'free_10_pts') {
        isFree10Mode = true;
        alert('무조건 10점을 채워 넣을 점수칸을 선택하세요.');
        updatePreviews();
    }
}

function highlightRewritableCells() {
    CATEGORIES.forEach(cat => {
        if (p1Scores[cat] !== undefined) {
            const cell = document.getElementById(`p1-${cat}`);
            if (cell) {
                cell.style.backgroundColor = '#fca5a5';
                cell.onclick = () => rewriteCategoryScore(cat);
            }
        }
    });
}

function rewriteCategoryScore(catId) {
    delete p1Scores[catId];
    p1SkillUsedCount = 1;
    resetCellStyles();
    selectScoreCategory(catId);
}

function resetCellStyles() {
    CATEGORIES.forEach(cat => {
        const cell = document.getElementById(`p1-${cat}`);
        if (cell) {
            cell.style.backgroundColor = '';
            if (p1Scores[cat] === undefined) {
                cell.onclick = () => selectScoreCategory(cat);
            } else {
                cell.onclick = null;
            }
        }
    });
}

function resetScoreSheet() {
    CATEGORIES.forEach(cat => {
        const p1Cell = document.getElementById(`p1-${cat}`);
        const aiCell = document.getElementById(`ai-${cat}`);
        
        if (p1Cell && aiCell) {
            p1Cell.innerText = '';
            aiCell.innerText = '';
            p1Cell.className = 'cell-score p1-col selectable';
            aiCell.className = 'cell-score ai-col';
            p1Cell.onclick = () => selectScoreCategory(cat);
        }
    });
    updateTotals('p1');
    updateTotals('ai');
}

function updatePreviews() {
    if (!isPlayerTurn) return;
    CATEGORIES.forEach(cat => {
        if (p1Scores[cat] === undefined) {
            const cell = document.getElementById(`p1-${cat}`);
            if (cell) {
                if (isFree10Mode) {
                    cell.innerText = '10';
                } else {
                    const scoreObj = calculateScore(cat, dice, 'p1');
                    if (scoreObj.bonus > 0) {
                        cell.innerHTML = `${scoreObj.base}<span class="extra-pts-p1">(+${scoreObj.bonus})</span>`;
                    } else {
                        cell.innerText = scoreObj.total;
                    }
                }
                cell.classList.add('preview');
            }
        }
    });
}

function clearPreviews() {
    CATEGORIES.forEach(cat => {
        if (p1Scores[cat] === undefined) {
            const cell = document.getElementById(`p1-${cat}`);
            if (cell) {
                cell.innerText = '';
                cell.classList.remove('preview');
            }
        }
    });
}

function selectScoreCategory(catId) {
    if (!isPlayerTurn || isRolling || isActionLocked) return;
    if (rollsLeft === 3 && !isFree10Mode) return;

    isActionLocked = true;

    let base = 0;
    let bonus = 0;

    if (isFree10Mode) {
        base = 10;
        bonus = 0;
        p1SkillUsedCount = 1;
        isFree10Mode = false;
    } else {
        const scoreObj = calculateScore(catId, dice, 'p1');
        base = scoreObj.base;
        bonus = scoreObj.bonus;
    }

    p1Scores[catId] = { base, bonus, total: base + bonus };

    const cell = document.getElementById(`p1-${catId}`);
    if (cell) {
        if (bonus > 0) {
            cell.innerHTML = `${base}<span class="extra-pts-p1">(+${bonus})</span>`;
        } else {
            cell.innerText = base;
        }
        cell.classList.remove('preview', 'selectable');
        cell.onclick = null;
    }

    resetCellStyles();
    clearPreviews();
    updateTotals('p1');
    endTurn();
}

function endTurn() {
    if (is6DiceTurn || dice.length !== 5) {
        is6DiceTurn = false;
        createDiceUI(5);
    } else {
        held = Array(dice.length).fill(false);
        document.querySelectorAll('.dice-2d').forEach(w => w.classList.remove('held'));
    }

    rollsLeft = 3;
    p1UsedExtraRollThisTurn = false;
    document.getElementById('rolls-left-text').innerText = `🎲 3 left`;

    isPlayerTurn = !isPlayerTurn;
    updateTurnUI();

    if (!isPlayerTurn) {
        stopTimer();
        document.getElementById('roll-btn').disabled = true;
        document.getElementById('skill-use-btn').disabled = true;
        
        setTimeout(playAITurn, 300);
    } else {
        document.getElementById('roll-btn').disabled = false;
        isActionLocked = false;
        updateSkillButtonUI();
        
        if (Object.keys(p1Scores).length === Object.keys(aiScores).length) {
            currentRound++;
            if (currentRound > 12) {
                gameOver(false);
                return;
            }
        }
        startTimer();
    }
    document.getElementById('turn-text').innerText = `${currentRound}/12`;
}

function updateTurnUI() {
    const rollBtn = document.getElementById('roll-btn');
    rollBtn.innerText = isPlayerTurn ? 'ROLL' : 'AI TURN...';
}

// ==========================================
// 5. AI 로직
// ==========================================
function playAITurn() {
    isActionLocked = false;

    if (aiSkill && aiSkill.id === 'dice_6_roll' && aiSkillUsedCount === 0) {
        aiSkillUsedCount = 1;
        is6DiceTurn = true;
        createDiceUI(6);
    }

    rollDice(() => {
        setTimeout(() => {
            decideAIHold();
            rollDice(() => {
                setTimeout(() => {
                    decideAIHold();
                    rollDice(() => {
                        setTimeout(() => {
                            if (aiSkill && aiSkill.id === 'extra_roll' && aiSkillUsedCount < 2) {
                                let bestPossibleScore = getAIBestScore();
                                if (bestPossibleScore < 15) { 
                                    aiSkillUsedCount++;
                                    rollsLeft++;
                                    document.getElementById('rolls-left-text').innerText = `🎲 ${rollsLeft} left`;
                                    decideAIHold();
                                    rollDice(() => {
                                        setTimeout(selectAIScoreCategory, 300);
                                    });
                                    return;
                                }
                            }
                            selectAIScoreCategory();
                        }, 300);
                    });
                }, 300);
            });
        }, 300);
    });
}

function getAIBestScore() {
    const available = CATEGORIES.filter(c => aiScores[c] === undefined);
    let maxS = 0;
    available.forEach(c => {
        let scoreObj = calculateScore(c, dice, 'ai');
        if (scoreObj.total > maxS) maxS = scoreObj.total;
    });
    return maxS;
}

function selectAIScoreCategory() {
    const available = CATEGORIES.filter(c => aiScores[c] === undefined);
    let chosen = available[0];
    let maxS = -1;

    available.forEach(c => {
        let scoreObj = calculateScore(c, dice, 'ai');
        if (scoreObj.total > maxS) { maxS = scoreObj.total; chosen = c; }
    });

    const scoreObj = calculateScore(chosen, dice, 'ai');
    aiScores[chosen] = { base: scoreObj.base, bonus: scoreObj.bonus, total: scoreObj.total };

    const cell = document.getElementById(`ai-${chosen}`);
    if (cell) {
        if (scoreObj.bonus > 0) {
            cell.innerHTML = `${scoreObj.base}<span class="extra-pts-ai">(+${scoreObj.bonus})</span>`;
        } else {
            cell.innerText = scoreObj.total;
        }
    }

    updateTotals('ai');
    endTurn();
}

function calculateScore(catId, diceArr, player = 'p1') {
    let base = 0;
    if (diceArr.length === 6) {
        const combos = getCombinations(diceArr, 5);
        combos.forEach(combo => {
            const s = computeBaseScore(catId, combo);
            if (s > base) base = s;
        });
    } else {
        base = computeBaseScore(catId, diceArr);
    }

    let bonus = 0;
    if (player === 'p1' && p1Skill && p1Skill.id === 'bonus_plus5') {
        if (p1BonusCategories.includes(catId) && base >= 1) bonus = 5;
    } else if (player === 'ai' && aiSkill && aiSkill.id === 'bonus_plus5') {
        if (aiBonusCategories.includes(catId) && base >= 1) bonus = 5;
    }

    return { base: base, bonus: bonus, total: base + bonus };
}

function computeBaseScore(catId, diceArr) {
    const counts = getCounts(diceArr);
    const sum = diceArr.reduce((a, b) => a + b, 0);

    switch (catId) {
        case 'aces': return counts[1] * 1;
        case 'deuces': return counts[2] * 2;
        case 'threes': return counts[3] * 3;
        case 'fours': return counts[4] * 4;
        case 'fives': return counts[5] * 5;
        case 'sixes': return counts[6] * 6;
        case 'choice': return sum;
        case 'fourKind': return Object.values(counts).some(c => c >= 4) ? sum : 0;
        case 'fullHouse':
            const has3 = Object.values(counts).some(c => c === 3);
            const has2 = Object.values(counts).some(c => c === 2);
            const has5 = Object.values(counts).some(c => c === 5);
            return (has3 && has2) || has5 ? sum : 0;
        case 'sStraight': return checkStraight(diceArr, 4) ? 15 : 0;
        case 'lStraight': return checkStraight(diceArr, 5) ? 30 : 0;
        case 'yacht': return Object.values(counts).some(c => c === 5) ? 50 : 0;
        default: return 0;
    }
}

function getCombinations(arr, k) {
    if (k === 0 || arr.length < k) return [[]];
    if (arr.length === k) return [arr];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

function getCounts(diceArr) {
    const counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    diceArr.forEach(d => counts[d]++);
    return counts;
}

function checkStraight(diceArr, len) {
    const unique = [...new Set(diceArr)].sort((a,b) => a - b);
    let count = 1, maxCount = 1;
    for (let i = 0; i < unique.length - 1; i++) {
        if (unique[i+1] === unique[i] + 1) {
            count++;
            maxCount = Math.max(maxCount, count);
        } else count = 1;
    }
    return maxCount >= len;
}

function updateTotals(player) {
    const scores = player === 'p1' ? p1Scores : aiScores;
    const activeSkill = player === 'p1' ? p1Skill : aiSkill;
    const upperKeys = ['aces', 'deuces', 'threes', 'fours', 'fives', 'sixes'];
    
    let subtotal = 0;
    upperKeys.forEach(k => {
        if (scores[k] !== undefined) subtotal += scores[k].total;
    });

    const targetBonus = (activeSkill && activeSkill.id === 'lower_bonus_req') ? 55 : 63;
    const bonus = subtotal >= targetBonus ? 35 : 0;

    const subtotalCell = document.getElementById(`${player}-subtotal`);
    if (subtotalCell) {
        const bonusColorClass = player === 'p1' ? 'extra-pts-p1' : 'extra-pts-ai';
        subtotalCell.innerHTML = `<span class="subtotal-val">${subtotal}/${targetBonus}</span>${bonus > 0 ? `<span class="${bonusColorClass}">(+35)</span>` : ''}`;
    }

    let total = subtotal + bonus;
    CATEGORIES.forEach(c => {
        if (!upperKeys.includes(c) && scores[c] !== undefined) {
            total += scores[c].total;
        }
    });

    const totalCell = document.getElementById(`${player}-total`);
    if (totalCell) totalCell.innerText = total;
}

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();

        if (isPaused) return;
        
        const diffScreen = document.getElementById('diff-screen');
        const skillScreen = document.getElementById('skill-screen');
        const resultModal = document.getElementById('result-modal');
        const historyModal = document.getElementById('history-modal');
        
        if (
            (diffScreen && diffScreen.style.display !== 'none') ||
            (skillScreen && skillScreen.style.display !== 'none') ||
            (resultModal && resultModal.style.display === 'flex') ||
            (historyModal && historyModal.style.display === 'flex')
        ) {
            return;
        }

        if (isPlayerTurn && !isActionLocked && !isRolling && rollsLeft > 0) {
            playerRoll();
        }
    }
});

function decideAIHold() {
    if (selectedDifficulty === 'easy') {
        held = dice.map(() => Math.random() < 0.3);
    } else if (selectedDifficulty === 'hard') {
        decideAIHoldHard();
    } else {
        decideAIHoldMedium();
    }

    held.forEach((h, i) => {
        const diceEl = document.getElementById(`dice-${i}`);
        if (diceEl) diceEl.classList.toggle('held', h);
    });
}

function decideAIHoldMedium() {
    const counts = getCounts(dice);
    let maxNum = 1, maxC = 0;
    for (let n = 1; n <= 6; n++) {
        if (counts[n] >= maxC) { maxC = counts[n]; maxNum = n; }
    }
    held = maxC >= 2 ? dice.map(v => v === maxNum) : Array(dice.length).fill(false);
}

function decideAIHoldHard() {
    const counts = getCounts(dice);
    const unique = [...new Set(dice)].sort((a, b) => a - b);
    
    for (let n = 6; n >= 1; n--) {
        if (counts[n] >= 3) {
            held = dice.map(v => v === n);
            return;
        }
    }

    if (aiScores['lStraight'] === undefined || aiScores['sStraight'] === undefined) {
        let maxSeq = [];
        let currentSeq = [];

        for (let i = 0; i < unique.length; i++) {
            if (i === 0 || unique[i] === unique[i - 1] + 1) {
                currentSeq.push(unique[i]);
            } else {
                if (currentSeq.length > maxSeq.length) maxSeq = [...currentSeq];
                currentSeq = [unique[i]];
            }
        }
        if (currentSeq.length > maxSeq.length) maxSeq = [...currentSeq];

        if (maxSeq.length >= 3) {
            held = dice.map(v => maxSeq.includes(v));
            return;
        }
    }

    decideAIHoldMedium();
}

// ==========================================
// 6. 히스토리 버저닝, 마이그레이션, 누적 저장 및 JSON 파일 다운로드
// ==========================================

/**
 * 저장된 데이터 불러오기 및 스키마 검증 / 자동 마이그레이션
 */
function getPlayHistory() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const defaultData = {
        version: DATA_VERSION,
        easy: [],
        medium: [],
        hard: []
    };

    if (!saved) return defaultData;

    try {
        const parsed = JSON.parse(saved);

        if (!parsed || typeof parsed !== 'object') return defaultData;

        const storedVersion = Number(parsed.version) || 1;

        // 버전에 맞추어 마이그레이션 처리
        if (storedVersion < DATA_VERSION) {
            return migrateHistoryData(parsed, defaultData);
        }

        return {
            version: Math.max(storedVersion, DATA_VERSION),
            easy: Array.isArray(parsed.easy) ? parsed.easy : [],
            medium: Array.isArray(parsed.medium) ? parsed.medium : [],
            hard: Array.isArray(parsed.hard) ? parsed.hard : []
        };
    } catch (e) {
        console.error('기록 로드 실패: 데이터를 초기화합니다.', e);
        return defaultData;
    }
}

/**
 * 이전 버전(v1) 데이터를 최신 버전(v2) 스키마 구조로 마이그레이션
 */
function migrateHistoryData(oldData, defaultData) {
    const migrated = { ...defaultData, version: DATA_VERSION };
    
    ['easy', 'medium', 'hard'].forEach(diff => {
        if (Array.isArray(oldData[diff])) {
            migrated[diff] = oldData[diff];
        }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
}

/**
 * 게임 종료 시 매 판 플레이 이력을 누적 배열에 push 저장 (saveGameHistory)
 */
function saveGameHistory(diff, p1Score, aiScore, isVictory, failReason) {
    const historyData = getPlayHistory();
    if (!historyData[diff]) historyData[diff] = [];

    const record = {
        id: Date.now(),
        date: new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        difficulty: diff,
        p1Score: p1Score || 0,
        aiScore: aiScore || 0,
        p1ScoresDetail: p1Scores,
        aiScoresDetail: aiScores,
        result: isVictory ? '승' : '패',
        failReason: isVictory ? '-' : failReason
    };

    // 최신 기록을 배열 맨 앞에 누적
    historyData[diff].unshift(record);

    // 각 난이도별 최대 10개까지 보존
    if (historyData[diff].length > 10) {
        historyData[diff] = historyData[diff].slice(0, 10);
    }

    historyData.version = DATA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyData));
    renderHistoryTable(diff);
}

/**
 * [기록 파일 저장하기] 버튼 클릭 시 누적된 전체 이력을 JSON 파일로 다운로드 (downloadHistoryFile)
 */
function downloadHistoryFile() {
    const historyData = getPlayHistory();
    
    const exportPayload = {
        version: DATA_VERSION,
        exportedAt: new Date().toISOString(),
        history: historyData
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `yacht_history_v${DATA_VERSION}.json`;
    
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
}

function renderHistoryTable(diff) {
    const historyData = getPlayHistory();
    const records = historyData[diff] || [];
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-diff') === diff);
    });

    tbody.innerHTML = '';

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 15px; color:#888;">저장된 플레이 기록이 없습니다. (0/10)</td></tr>`;
        return;
    }

    records.forEach((rec, idx) => {
        const tr = document.createElement('tr');
        const resultColor = rec.result === '승' ? '#2563eb' : '#dc2626';
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${rec.p1Score} vs ${rec.aiScore}</td>
            <td style="color: ${resultColor}; font-weight: bold;">${rec.result}</td>
            <td style="font-size: 0.75rem; color: #666;">${rec.failReason}</td>
            <td style="font-size: 0.7rem; color: #888;">${rec.date}</td>
        `;
        tbody.appendChild(tr);
    });
}

function clearHistory(diff) {
    const targetDiff = diff || selectedDifficulty;
    if (!confirm(`${targetDiff.toUpperCase()} 난이도 기록을 모두 삭제하시겠습니까?`)) return;
    const historyData = getPlayHistory();
    historyData[targetDiff] = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyData));
    renderHistoryTable(targetDiff);
}

// ==========================================
// 7. 게임 종료 및 모달
// ==========================================
function gameOver(isTimeout = false) {
    stopTimer();

    const p1Total = parseInt(document.getElementById('p1-total').innerText) || 0;
    const aiTotal = parseInt(document.getElementById('ai-total').innerText) || 0;

    const modal = document.getElementById('result-modal');
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');

    let isVictory = false;
    let failReason = '-';

    if (isTimeout) {
        title.innerText = '⏰ TIME OUT (실패)';
        desc.innerText = `제한시간 30초가 경과했습니다.\n최종 점수 - Player: ${p1Total}점 vs AI: ${aiTotal}점`;
        failReason = '제한시간 30초 초과';
    } else if (p1Total > aiTotal) {
        title.innerText = '🏆 VICTORY (성공)';
        desc.innerText = `축하합니다! AI를 이겼습니다.\nPlayer: ${p1Total}점 vs AI: ${aiTotal}점`;
        isVictory = true;
    } else if (p1Total < aiTotal) {
        title.innerText = '📢 DEFEAT (실패)';
        desc.innerText = `AI에게 패배했습니다.\nPlayer: ${p1Total}점 vs AI: ${aiTotal}점`;
        
        if (p1Total < 180) failReason = '상단 보너스 또는 고득점 족보 달성 실패';
        else failReason = 'AI의 고득점 족보(Yacht/Straight) 역전';
    } else {
        title.innerText = '🤝 DRAW (무승부)';
        desc.innerText = `동점입니다! (${p1Total}점)`;
        failReason = '동점 무승부';
    }

    // 게임 종료 시 누적 이력 저장
    saveGameHistory(selectedDifficulty, p1Total, aiTotal, isVictory, failReason);

    if (modal) modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('result-modal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    renderHistoryTable(selectedDifficulty);
});

// ==========================================
// 8. 사운드 및 모션 효과 토글
// ==========================================
function toggleSound() {
    isMuted = !isMuted;
    const btn = document.getElementById('sound-toggle-btn');
    const audio = document.getElementById('dice-sound');

    if (isMuted) {
        btn.innerText = '🔇 Sound Off';
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    } else {
        btn.innerText = '🔊 Sound On';
    }
}

function toggleMotion() {
    isReduceMotion = !isReduceMotion;
    const btn = document.getElementById('motion-toggle-btn');

    if (isReduceMotion) {
        btn.innerText = '🛑 효과 Off';
        document.body.classList.add('reduce-motion');
    } else {
        btn.innerText = '✨ 효과 On';
        document.body.classList.remove('reduce-motion');
    }
}

function playDiceSound() {
    if (isMuted) return;
    
    const audio = document.getElementById('dice-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Sound play error:", e));
    }
}