const svg = document.querySelector("#board");
const count = document.querySelector("#count");
const handSize = document.querySelector("#hand-size");
const noJokers = document.querySelector("#no-jokers");
const safeStart = document.querySelector("#safe-start");
const partners = document.querySelector("#partners");
const solitaire = document.querySelector("#solitaire");
const win = document.querySelector("#win");
const status = document.querySelector("#status");
const turn = document.querySelector("#turn");
const seats = document.querySelector("#seats");
const rules = document.querySelector("#rules");
const hand = document.querySelector("#hand");
const restart = document.querySelector("#restart");
const confirmNew = document.querySelector("#confirm");

let state = null;
let pick = null;
let botTimer = null;

rules.innerHTML = [
  RULES.turn, RULES.enter, RULES.passStart, RULES.home, RULES.startBlock,
  RULES.jack, RULES.seven, RULES.partnerHelp, RULES.joker,
].map((line) => `<li>${line}</li>`).join("");

function show() {
  const highlights = new Set(nextTargets());
  renderBoard(svg, state.layout, state, highlights);
  const color = currentColor(state);
  const actor = actingColor(state, color);
  const partnerNote = state.partners ? `Partners: ${state.layout.partners.join(", ")}.` : "Everyone plays individually.";
  const helping = actor !== color ? ` Playing ${actor}'s marbles.` : "";
  const you = state.human === color ? " · you" : "";
  turn.textContent = state.winner ? `${state.winner} wins` : `${color}'s turn${you}`;
  turn.dataset.color = state.winner ? "" : color;
  const last = state.lastRank ? `Last card: ${state.lastRank}.` : "Last card: none yet.";
  const mode = room.active ? lobbyLine() : state.human ? `You are ${state.human}.` : "Hot-seat.";
  status.textContent = state.winner ? "The game is over." : `${state.message}${helping} ${last} ${partnerNote} ${mode}`;
  if (win) {
    win.hidden = !state.winner;
    win.textContent = state.winner
      ? (state.partners ? `${state.winner} win. All 8 marbles are home.` : `${state.winner} wins. All 4 marbles are home.`)
      : "";
  }
  seats.innerHTML = state.colors.map((item) => {
    const home = state.marbles[item].filter(isHome).length;
    const active = item === color && !state.winner ? " current" : "";
    const mate = state.partners ? ` · ${RULES.partners[item]}` : "";
    const who = room.active ? (item === room.you ? " · you" : "") : state.human ? (item === state.human ? " · you" : " · bot") : "";
    const name = room.names && room.names[item] ? ` · ${room.names[item]}` : "";
    return `<li class="${active}"><span class="swatch" data-color="${item}"></span>${item}${name}${mate}${who}${active ? " · playing" : ""} · home ${home}/4</li>`;
  }).join("");
  drawHand();
  maybeBot();
}

function drawHand() {
  const color = currentColor(state);
  if (state.winner) {
    hand.innerHTML = `<button id="again" type="button">New game</button>`;
    hand.querySelector("#again").addEventListener("click", start);
    return;
  }
  if (room.active && color !== room.you) {
    hand.innerHTML = `<p>Waiting for ${color}.</p>`;
    return;
  }
  if (state.human && color !== state.human) {
    hand.innerHTML = "<p>Computer is choosing a legal move.</p>";
    return;
  }
  const cards = state.hands[color].map((card, index) => {
    const playable = card !== "?" && legalUses(state, color, card).length > 0;
    const selected = pick && pick.cardIndex === index ? " selected" : "";
    const label = card === "Joker" ? `Joker (${state.lastRank || "no card yet"})` : card === "?" ? "?" : cardLabel(card);
    return `<button type="button" class="${selected}" data-card="${index}" ${playable ? "" : "disabled"}>${label}</button>`;
  }).join("");
  const stuck = !hasAnyPlay(state, color);
  hand.innerHTML = cards + (stuck ? `<button id="dump" type="button">Discard hand</button>` : "") + choiceButtons();
  hand.querySelectorAll("[data-card]").forEach((button) => button.addEventListener("click", () => chooseCard(Number(button.dataset.card))));
  const dump = hand.querySelector("#dump");
  if (dump) dump.addEventListener("click", () => {
    if (room.active && !room.host) {
      if (!room.send) {
        state.message = "Not connected to the host yet.";
        show();
        return;
      }
      room.send({ type: "discard" });
      state.message = "Discard sent. Waiting for the host.";
      show();
      return;
    }
    discardHand(state);
    if (room.active && room.host && window.roomBroadcast) roomBroadcast();
    pick = null;
    show();
  });
  hand.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => chooseSplit(Number(button.dataset.choice))));
}

function maybeBot() {
  clearTimeout(botTimer);
  if (!state || state.winner || room.active || !state.human || currentColor(state) === state.human) return;
  botTimer = setTimeout(botPlay, 700);
}

function botPlay() {
  if (!state || state.winner || currentColor(state) === state.human) return;
  const color = currentColor(state);
  const choices = [];
  state.hands[color].forEach((card, index) => {
    legalUses(state, color, card).forEach((use) => choices.push({ index, use }));
  });
  pick = null;
  if (!choices.length) discardHand(state);
  else {
    const choice = choices[Math.floor(Math.random() * choices.length)];
    playCard(state, choice.index, choice.use);
  }
  show();
}

function nextTargets() {
  if (!pick || !pick.targets) return [];
  if (pick.rank === "7" && pick.stepsA && pick.stepsA !== 7) {
    if (!pick.from) return pick.targets.flatMap((item) => [item.a, item.destA]);
    if (!pick.first) return pick.targets.map((item) => item.destA);
    if (!pick.second) return pick.targets.flatMap((item) => [item.b, item.destB]);
    return pick.targets.map((item) => item.destB);
  }
  if (!pick.from) return pick.targets.map((item) => item.from);
  return pick.targets.map((item) => item.dest || item.other);
}

function choiceButtons() {
  if (!pick || !pick.splits) return "";
  return pick.splits.map((steps) => `<button type="button" data-choice="${steps}">${steps === 7 ? "Move 7" : steps}</button>`).join("");
}

function commit(cardIndex, use) {
  if (room.active && !room.host) {
    sendPlay(cardIndex, use);
    pick = null;
    show();
    return;
  }
  playCard(state, cardIndex, use);
  pick = null;
  if (room.active && room.host && window.roomBroadcast) roomBroadcast();
  show();
}

function chooseCard(index) {
  const color = currentColor(state);
  const card = state.hands[color][index];
  const uses = legalUses(state, color, card);
  const rank = effectiveRank(state, card);
  pick = { cardIndex: index, rank, uses };
  if (rank === "J") {
    pick.targets = uses;
    state.message = actingColor(state, color) === color
      ? "Tap your marble, then the track marble to swap."
      : `Tap ${actingColor(state, color)}'s track marble, then the marble to swap.`;
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
  if (room.active && currentColor(state) !== room.you) return;
  if (pick.rank === "J") return playSwap(holeId);
  if ((pick.rank === "A" || pick.rank === "K") && isBank(holeId)) {
    commit(pick.cardIndex, { kind: "enter" });
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
  if (use && use.dest === holeId) commit(pick.cardIndex, use);
});

function playSwap(holeId) {
  const color = currentColor(state);
  const actor = actingColor(state, color);
  const mine = findMarble(state, holeId);
  if (!pick.from && mine && mine.color === actor && !isHome(holeId) && !isBank(holeId)) {
    pick.from = holeId;
    pick.targets = pick.uses.filter((item) => item.from === holeId);
    state.message = actor === color ? "Tap the other track marble." : `Tap the other track marble to swap with ${actor}.`;
    show();
    return;
  }
  const use = pick.uses.find((item) => item.from === pick.from && item.other === holeId);
  if (!use) return;
  commit(pick.cardIndex, use);
}

function playSplit(holeId) {
  if (!pick.stepsA) return;
  if (!pick.from) {
    const byMarble = pick.uses.find((item) => item.a === holeId && item.stepsA === pick.stepsA);
    const byDest = pick.uses.find((item) => item.destA === holeId && item.stepsA === pick.stepsA);
    const use = byMarble || byDest;
    if (!use) return;
    pick.from = use.a;
    pick.targets = pick.uses.filter((item) => item.a === use.a && item.stepsA === pick.stepsA);
    if (byDest) {
      pick.first = use;
      pick.targets = pick.targets.filter((item) => item.destA === holeId);
      state.message = "First marble goes there. Tap the second marble.";
    } else {
      state.message = "Tap the highlighted hole for the first marble.";
    }
    show();
    return;
  }
  if (!pick.first) {
    const use = pick.targets.find((item) => item.destA === holeId);
    if (!use) return;
    pick.first = use;
    pick.targets = pick.uses.filter((item) => item.a === pick.from && item.destA === holeId);
    state.message = "Tap the second marble, then its hole.";
    show();
    return;
  }
  if (!pick.second) {
    const byMarble = pick.targets.find((item) => item.b === holeId);
    const byDest = pick.targets.find((item) => item.destB === holeId);
    const use = byMarble || byDest;
    if (!use) return;
    pick.second = use.b;
    pick.targets = pick.targets.filter((item) => item.b === use.b);
    if (byDest && !byMarble) {
      commit(pick.cardIndex, use);
      return;
    }
    state.message = "Tap the highlighted hole for the second marble.";
    show();
    return;
  }
  const chosen = pick.targets.find((item) => item.destB === holeId);
  if (!chosen) return;
  commit(pick.cardIndex, chosen);
}

function start() {
  pick = null;
  clearTimeout(botTimer);
  if (confirmNew) confirmNew.hidden = true;
  const settings = room.active && room.host && room.settings ? room.settings : null;
  state = newGame(window.LAYOUTS[settings ? settings.players : count.value], {
    handSize: settings ? settings.handSize : handSize ? handSize.value : 5,
    useJokers: settings ? settings.useJokers : !(noJokers && noJokers.checked),
    safeStart: settings ? settings.safeStart : Boolean(safeStart && safeStart.checked),
    partners: settings ? settings.partners : Boolean(partners && partners.checked) && ["4", "6"].includes(count.value),
  });
  state.human = !room.active && solitaire && solitaire.checked
    ? state.colors[Math.floor(Math.random() * state.colors.length)]
    : null;
  if (room.active && room.host) {
    room.you = state.colors[0];
    state.human = null;
    if (window.roomBroadcast) roomBroadcast();
  }
  syncPartners();
  if (window.clearChat) clearChat();
  show();
}

function syncPartners() {
  const allowed = ["4", "6"].includes(count.value);
  if (!partners) return;
  partners.disabled = !allowed;
  partners.parentElement.hidden = !allowed;
  if (!allowed) partners.checked = false;
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
    if (partners) partners.checked = state.partners;
    if (solitaire) solitaire.checked = Boolean(state.human);
    syncPartners();
  });
}
count.addEventListener("change", requestNewGame);
if (handSize) handSize.addEventListener("change", requestNewGame);
if (noJokers) noJokers.addEventListener("change", requestNewGame);
if (safeStart) safeStart.addEventListener("change", requestNewGame);
if (partners) partners.addEventListener("change", requestNewGame);
if (solitaire) solitaire.addEventListener("change", requestNewGame);
count.addEventListener("change", syncPartners);
restart.addEventListener("click", requestNewGame);
document.querySelector("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#chat-text");
  if (!room.active) {
    status.textContent = "Join or create a room before chatting.";
    return;
  }
  sendChat(input.value);
  input.value = "";
});
document.querySelector("#create-room").addEventListener("click", () => createRoom());
document.querySelector("#join-room").addEventListener("click", () => joinRoom(document.querySelector("#join-code").value));
if (!window.LAYOUTS) status.textContent = "Board data did not load.";
else start();
const params = new URLSearchParams(location.search);
if (params.get("room")) {
  document.querySelector("#join-code").value = params.get("room");
  joinRoom(params.get("room"));
}
