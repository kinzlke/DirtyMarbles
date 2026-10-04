const svg = document.querySelector("#board");
const count = document.querySelector("#count");
const handSize = document.querySelector("#hand-size");
const noJokers = document.querySelector("#no-jokers");
const safeStart = document.querySelector("#safe-start");
const status = document.querySelector("#status");
const turn = document.querySelector("#turn");
const seats = document.querySelector("#seats");
const rules = document.querySelector("#rules");
const hand = document.querySelector("#hand");
const restart = document.querySelector("#restart");
const confirmNew = document.querySelector("#confirm");

let state = null;
let pick = null;

rules.innerHTML = [
  RULES.turn, RULES.enter, RULES.passStart, RULES.home, RULES.startBlock,
  RULES.jack, RULES.seven, RULES.partnerHelp, RULES.joker,
].map((line) => `<li>${line}</li>`).join("");

function show() {
  const highlights = new Set(nextTargets());
  renderBoard(svg, state.layout, state, highlights);
  const color = currentColor(state);
  const partner = state.layout.partners.length ? `Partners: ${state.layout.partners.join(", ")}.` : "No partners.";
  turn.textContent = state.winner ? `${state.winner} wins` : `${color}'s turn`;
  turn.dataset.color = state.winner ? "" : color;
  status.textContent = state.winner ? "New game to play again." : `${state.message} ${partner}`;
  seats.innerHTML = state.colors.map((item) => {
    const home = state.marbles[item].filter(isHome).length;
    const active = item === color && !state.winner ? " current" : "";
    return `<li class="${active}"><span class="swatch" data-color="${item}"></span>${item}${active ? " · playing" : ""} · home ${home}/4</li>`;
  }).join("");
  drawHand();
}

function drawHand() {
  const color = currentColor(state);
  if (state.winner) {
    hand.innerHTML = `<button id="again" type="button">New game</button>`;
    hand.querySelector("#again").addEventListener("click", start);
    return;
  }
  const cards = state.hands[color].map((card, index) => {
    const playable = legalUses(state, color, card).length > 0;
    const selected = pick && pick.cardIndex === index ? " selected" : "";
    return `<button type="button" class="${selected}" data-card="${index}" ${playable ? "" : "disabled"}>${cardLabel(card)}</button>`;
  }).join("");
  const stuck = !hasAnyPlay(state, color);
  hand.innerHTML = cards + (stuck ? `<button id="dump" type="button">Discard hand</button>` : "") + choiceButtons();
  hand.querySelectorAll("[data-card]").forEach((button) => button.addEventListener("click", () => chooseCard(Number(button.dataset.card))));
  const dump = hand.querySelector("#dump");
  if (dump) dump.addEventListener("click", () => { discardHand(state); pick = null; show(); });
  hand.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => chooseSplit(Number(button.dataset.choice))));
}

function nextTargets() {
  if (!pick || !pick.targets) return [];
  if (pick.rank === "7" && pick.stepsA && pick.stepsA !== 7) {
    if (!pick.from) return pick.targets.map((item) => item.a);
    if (!pick.first) return pick.targets.map((item) => item.destA);
    if (!pick.second) return pick.targets.map((item) => item.b);
    return pick.targets.map((item) => item.destB);
  }
  if (!pick.from) return pick.targets.map((item) => item.from);
  return pick.targets.map((item) => item.dest || item.other);
}

function choiceButtons() {
  if (!pick || !pick.splits) return "";
  return pick.splits.map((steps) => `<button type="button" data-choice="${steps}">${steps === 7 ? "Move 7" : steps}</button>`).join("");
}

function chooseCard(index) {
  const color = currentColor(state);
  const card = state.hands[color][index];
  const uses = legalUses(state, color, card);
  const rank = effectiveRank(state, card);
  pick = { cardIndex: index, rank, uses };
  if (rank === "J") {
    pick.targets = uses;
    state.message = "Tap your marble, then the track marble to swap.";
  } else if (rank === "A" || rank === "K") {
    pick.targets = uses.filter((use) => use.kind === "move");
    state.message = rank === "K" ? "Tap a bank marble to enter." : "Tap a bank marble to enter, or a marble to move 1.";
  } else if (rank === "7") {
    const splitSteps = [...new Set(uses.filter((use) => use.kind === "split").map((use) => use.stepsA))].sort();
    pick.splits = uses.some((use) => use.kind === "move") ? [7, ...splitSteps] : splitSteps;
    state.message = "Move one marble 7, or choose a split.";
  } else {
    pick.targets = uses;
    state.message = "Tap a marble, then a highlighted hole.";
  }
  show();
}

function chooseSplit(steps) {
  if (steps === 7) {
    pick.stepsA = 7;
    pick.targets = pick.uses.filter((use) => use.kind === "move");
    pick.splits = null;
    state.message = "Tap a marble, then its hole, for 7.";
    show();
    return;
  }
  pick.stepsA = steps;
  pick.targets = pick.uses.filter((use) => use.stepsA === steps);
  pick.splits = null;
  state.message = `Tap the first marble, then its hole, for ${steps}.`;
  show();
}

svg.addEventListener("click", (event) => {
  const hole = event.target.closest(".hole");
  const marble = event.target.closest(".marble");
  const holeId = marble ? marble.dataset.hole : hole && hole.dataset.id;
  if (!holeId || !pick || state.winner) return;
  const color = currentColor(state);
  if (pick.rank === "J") return playSwap(holeId);
  if ((pick.rank === "A" || pick.rank === "K") && isBank(holeId)) {
    playCard(state, pick.cardIndex, { kind: "enter" });
    pick = null;
    show();
    return;
  }
  if (pick.rank === "7" && pick.stepsA !== 7) return playSplit(holeId);
  const use = (pick.targets || []).find((item) => item.from === holeId) || (pick.targets || []).find((item) => item.dest === holeId && item.from === pick.from);
  if (use && use.from === holeId) {
    pick.from = holeId;
    pick.targets = pick.uses.filter((item) => item.from === holeId);
    state.message = "Tap a highlighted hole.";
    show();
    return;
  }
  if (use && use.dest === holeId) {
    playCard(state, pick.cardIndex, use);
    pick = null;
    show();
  }
});

function playSwap(holeId) {
  const color = currentColor(state);
  const mine = findMarble(state, holeId);
  if (!pick.from && mine && mine.color === color && !isHome(holeId) && !isBank(holeId)) {
    pick.from = holeId;
    pick.targets = pick.uses.filter((item) => item.from === holeId);
    state.message = "Tap the other track marble.";
    show();
    return;
  }
  const use = pick.uses.find((item) => item.from === pick.from && item.other === holeId);
  if (!use) return;
  playCard(state, pick.cardIndex, use);
  pick = null;
  show();
}

function playSplit(holeId) {
  if (!pick.stepsA) return;
  if (!pick.from) {
    const use = pick.uses.find((item) => item.a === holeId && item.stepsA === pick.stepsA);
    if (!use) return;
    pick.from = holeId;
    pick.targets = pick.uses.filter((item) => item.a === holeId && item.stepsA === pick.stepsA);
    state.message = "Tap the highlighted hole for the first marble.";
    show();
    return;
  }
  if (!pick.first) {
    const use = pick.targets.find((item) => item.destA === holeId);
    if (!use) return;
    pick.first = use;
    pick.targets = pick.uses.filter((item) => item.a === pick.from && item.destA === holeId);
    state.message = "Tap the highlighted second marble.";
    show();
    return;
  }
  if (!pick.second) {
    const use = pick.targets.find((item) => item.b === holeId);
    if (!use) return;
    pick.second = holeId;
    pick.targets = pick.targets.filter((item) => item.b === holeId);
    state.message = "Tap the highlighted hole for the second marble.";
    show();
    return;
  }
  const chosen = pick.targets.find((item) => item.destB === holeId);
  if (!chosen) return;
  playCard(state, pick.cardIndex, chosen);
  pick = null;
  show();
}

function start() {
  pick = null;
  if (confirmNew) confirmNew.hidden = true;
  state = newGame(window.LAYOUTS[count.value], {
    handSize: handSize ? handSize.value : 5,
    useJokers: !(noJokers && noJokers.checked),
    safeStart: Boolean(safeStart && safeStart.checked),
  });
  show();
}

function requestNewGame() {
  if (!state || state.winner) {
    start();
    return;
  }
  if (confirmNew) confirmNew.hidden = false;
}

if (confirmNew) {
  document.querySelector("#confirm-yes").addEventListener("click", start);
  document.querySelector("#confirm-no").addEventListener("click", () => {
    confirmNew.hidden = true;
    count.value = state.layout.players;
    if (handSize) handSize.value = state.handSize;
    if (noJokers) noJokers.checked = !state.useJokers;
    if (safeStart) safeStart.checked = state.safeStart;
  });
}
count.addEventListener("change", requestNewGame);
if (handSize) handSize.addEventListener("change", requestNewGame);
if (noJokers) noJokers.addEventListener("change", requestNewGame);
if (safeStart) safeStart.addEventListener("change", requestNewGame);
restart.addEventListener("click", requestNewGame);
if (!window.LAYOUTS) status.textContent = "Board data did not load.";
else start();
