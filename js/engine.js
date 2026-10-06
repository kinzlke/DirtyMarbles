/* Local hot-seat rules. One card per turn. */
window.RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "Joker"];

function cardLabel(card) {
  if (card === "Joker") return "Joker";
  if (card === "A") return "A";
  if (card === "J") return "J";
  if (card === "Q") return "Q";
  if (card === "K") return "K";
  return card;
};

function makeDeck(useJokers) {
  const deck = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (let suit = 0; suit < 4; suit += 1) {
      ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].forEach((rank) => deck.push(rank));
    }
    if (useJokers) deck.push("Joker", "Joker");
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

function effectiveRank(state, card) {
  if (card !== "Joker") return card;
  return state.lastRank || null;
};

function newGame(layout, options) {
  const settings = options || {};
  const colors = layout.seats.map((seat) => seat.color);
  const marbles = {};
  const hands = {};
  const skipped = {};
  layout.seats.forEach((seat) => {
    marbles[seat.color] = seat.bank.map((hole) => hole.id);
    hands[seat.color] = [];
    skipped[seat.color] = false;
  });
  const state = {
    layout,
    colors,
    marbles,
    hands,
    skipped,
    handSize: Number(settings.handSize) || 5,
    useJokers: settings.useJokers !== false,
    safeStart: Boolean(settings.safeStart),
    partners: Boolean(settings.partners) && (colors.length === 4 || colors.length === 6),
    deck: makeDeck(settings.useJokers !== false),
    discard: [],
    turn: 0,
    lastRank: null,
    winner: null,
    message: "",
  };
  dealHands(state);
  state.message = `${colors[0]} deals. Play one card.`;
  return state;
};

function dealHands(state) {
  const size = state.handSize || 5;
  const need = state.colors.length * size;
  if (state.deck.length < need) {
    state.deck = shuffle(state.deck.concat(state.discard));
    state.discard = [];
    state.lastRank = null;
    state.message = "New shuffle. The Joker has no card until one is played.";
  }
  state.colors.forEach((color) => {
    state.hands[color] = state.deck.splice(0, size);
    state.skipped[color] = false;
  });
}

function shuffle(cards) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function seat(state, color) {
  return state.layout.seats.find((item) => item.color === color);
};

function currentColor(state) {
  return state.colors[state.turn];
};

function partnerOf(state, color) {
  if (!state.partners) return null;
  return window.RULES.partners[color] || null;
}

function actingColor(state, color) {
  const partner = partnerOf(state, color);
  if (partner && state.marbles[color].every(isHome) && !state.marbles[partner].every(isHome)) return partner;
  return color;
}

function findMarble(state, holeId) {
  for (const color of state.colors) {
    const index = state.marbles[color].indexOf(holeId);
    if (index >= 0) return { color, index, holeId };
  }
  return null;
};

function homeNumber(holeId) {
  const match = /-home-(\d)$/.exec(holeId);
  return match ? Number(match[1]) : 0;
};

function isHome(holeId) {
  return holeId.includes("-home-");
};

function isBank(holeId) {
  return holeId.includes("-bank-");
};

function trackId(index) {
  return `track-${index}`;
}

function forwardDest(state, color, fromId, steps) {
  if (steps < 1 || isBank(fromId)) return null;
  const mine = seat(state, color);
  const n = state.layout.trackHoles;
  const start = mine.start.trackIndex;
  const entrance = mine.homeEntranceTrackIndex;
  if (isHome(fromId)) {
    if (!fromId.startsWith(`p${mine.index}-home-`)) return null;
    const dest = homeNumber(fromId) + steps;
    if (dest > 4) return null;
    for (let hole = homeNumber(fromId) + 1; hole <= dest; hole += 1) {
      if (findMarble(state, `p${mine.index}-home-${hole}`)) return null;
    }
    return `p${mine.index}-home-${dest}`;
  }
  const from = Number(fromId.split("-")[1]);
  const toEntrance = (entrance - from + n) % n;
  if (steps > toEntrance) {
    const homeStep = steps - toEntrance;
    if (homeStep > 4) return null;
    for (let hole = 1; hole <= homeStep; hole += 1) {
      if (findMarble(state, `p${mine.index}-home-${hole}`)) return null;
    }
    if (blockedByStart(state, from, entrance)) return null;
    return `p${mine.index}-home-${homeStep}`;
  }
  const dest = (from + steps) % n;
  if (dest === start) return null;
  if (blockedByStart(state, from, dest)) return null;
  if (safeStartBlocks(state, dest)) return null;
  return trackId(dest);
};

function blockedByStart(state, from, dest) {
  const n = state.layout.trackHoles;
  const starts = new Set(state.layout.seats.map((item) => item.start.trackIndex));
  let cursor = (from + 1) % n;
  while (cursor !== dest) {
    if (starts.has(cursor) && findMarble(state, trackId(cursor))) return true;
    cursor = (cursor + 1) % n;
  }
  return false;
}

function backDest(state, color, fromId) {
  if (isHome(fromId) || isBank(fromId)) return null;
  const n = state.layout.trackHoles;
  const from = Number(fromId.split("-")[1]);
  const dest = (from - 4 + n) % n;
  if (safeStartBlocks(state, dest)) return null;
  return trackId(dest);
};

function canEnter(state, color) {
  if (!state.marbles[color].some(isBank)) return false;
  return !safeStartBlocks(state, seat(state, color).start.trackIndex);
};

function safeStartBlocks(state, trackIndex) {
  return state.safeStart && Boolean(findMarble(state, trackId(trackIndex)));
}

function legalCards(state, color) {
  return state.hands[color].filter((card, index) => legalUses(state, color, card).length > 0 && unique(state.hands[color], card, index));
};

function unique(hand, card, index) {
  return hand.indexOf(card) === index;
}

function legalUses(state, color, card) {
  const rank = effectiveRank(state, card);
  if (!rank) return [];
  const actor = actingColor(state, color);
  const uses = [];
  if (rank === "A" || rank === "K") {
    if (canEnter(state, actor)) uses.push({ kind: "enter", actor });
  }
  if (rank === "K") return uses;
  if (rank === "J") {
    swaps(state, actor).forEach((swap) => uses.push({ kind: "swap", actor, ...swap }));
    return uses;
  }
  if (rank === "4") {
    state.marbles[actor].forEach((holeId) => {
      const dest = backDest(state, actor, holeId);
      if (dest) uses.push({ kind: "move", actor, from: holeId, dest, steps: 4 });
    });
    return uses;
  }
  const steps = rank === "A" ? 1 : rank === "Q" ? 12 : Number(rank);
  if (rank === "7") {
    state.marbles[actor].forEach((holeId) => {
      const dest = forwardDest(state, actor, holeId, 7);
      if (dest) uses.push({ kind: "move", actor, from: holeId, dest, steps: 7 });
    });
    splits(state, actor).forEach((split) => uses.push({ kind: "split", actor, ...split }));
    return uses;
  }
  state.marbles[actor].forEach((holeId) => {
    const dest = forwardDest(state, actor, holeId, steps);
    if (dest) uses.push({ kind: "move", actor, from: holeId, dest, steps });
  });
  return uses;
};

function swaps(state, color) {
  const mine = state.marbles[color].filter((holeId) => !isHome(holeId) && !isBank(holeId));
  const others = [];
  state.colors.forEach((other) => {
    if (other === color) return;
    state.marbles[other].forEach((holeId) => {
      if (!isHome(holeId) && !isBank(holeId)) others.push({ color: other, holeId });
    });
  });
  const pairs = [];
  mine.forEach((from) => others.forEach((other) => pairs.push({ from, other: other.holeId, otherColor: other.color })));
  return pairs;
}

function splits(state, color) {
  const partner = partnerOf(state, color);
  const own = state.marbles[color].filter((holeId) => !isBank(holeId));
  const found = [];
  for (let first = 1; first <= 6; first += 1) {
    const second = 7 - first;
    own.forEach((a) => {
      const destA = forwardDest(state, color, a, first);
      if (!destA) return;
      const after = preview(state, color, a, destA);
      own.forEach((b) => {
        if (a === b) return;
        const destB = forwardDest(after, color, b === a ? destA : b, second);
        if (destB) found.push({ a, stepsA: first, destA, b, stepsB: second, destB, partner: false });
      });
      if (partner && lastMarbleHomes(state, color, a, destA)) {
        state.marbles[partner].filter((holeId) => !isBank(holeId)).forEach((b) => {
          const destB = forwardDest(after, partner, b, second);
          if (destB) found.push({ a, stepsA: first, destA, b, stepsB: second, destB, partner: true });
        });
      }
    });
  }
  return found;
}

function lastMarbleHomes(state, color, from, dest) {
  const outside = state.marbles[color].filter((holeId) => !isHome(holeId));
  return outside.length === 1 && outside[0] === from && isHome(dest);
}

function preview(state, color, from, dest) {
  const copy = {
    layout: state.layout,
    colors: state.colors,
    safeStart: state.safeStart,
    marbles: Object.fromEntries(state.colors.map((item) => [item, state.marbles[item].slice()])),
  };
  applyMove(copy, color, from, dest);
  return copy;
}

function applyMove(state, color, from, dest) {
  const moving = state.marbles[color].indexOf(from);
  const victim = findMarble(state, dest);
  if (victim) {
    const bank = seat(state, victim.color).bank.find((hole) => !state.marbles[victim.color].includes(hole.id));
    state.marbles[victim.color][victim.index] = bank.id;
  }
  state.marbles[color][moving] = dest;
}

function playCard(state, cardIndex, use) {
  const color = currentColor(state);
  const actor = use.actor || actingColor(state, color);
  const card = state.hands[color][cardIndex];
  const rank = effectiveRank(state, card);
  state.hands[color].splice(cardIndex, 1);
  state.discard.push(card);
  state.lastRank = rank;
  const forWhom = actor === color ? "" : ` for ${actor}`;
  if (use.kind === "enter") {
    const from = state.marbles[actor].find(isBank);
    applyMove(state, actor, from, trackId(seat(state, actor).start.trackIndex));
    state.message = `${color} plays ${cardLabel(card)}${forWhom} and enters on start.`;
  } else if (use.kind === "swap") {
    const mine = state.marbles[actor].indexOf(use.from);
    const other = findMarble(state, use.other);
    state.marbles[actor][mine] = use.other;
    state.marbles[other.color][other.index] = use.from;
    state.message = `${color} plays Jack${forWhom} and swaps with ${other.color}.`;
  } else if (use.kind === "split") {
    applyMove(state, actor, use.a, use.destA);
    const secondColor = use.partner ? partnerOf(state, actor) : actor;
    const secondFrom = use.b === use.a ? use.destA : use.b;
    applyMove(state, secondColor, secondFrom, use.destB);
    state.message = `${color} splits a 7${forWhom}.`;
  } else {
    applyMove(state, actor, use.from, use.dest);
    state.message = `${color} plays ${cardLabel(card)}${forWhom}.`;
  }
  finishTurn(state);
};

function discardHand(state) {
  const color = currentColor(state);
  state.discard.push(...state.hands[color]);
  state.hands[color] = [];
  state.skipped[color] = true;
  state.message = `${color} cannot play and discards the hand.`;
  finishTurn(state);
};

function finishTurn(state) {
  const winner = winnerOf(state);
  if (winner) {
    state.winner = winner;
    state.message = `${winner} wins.`;
    return;
  }
  if (state.colors.every((color) => state.hands[color].length === 0)) dealHands(state);
  do {
    state.turn = (state.turn + 1) % state.colors.length;
  } while (state.skipped[currentColor(state)] || state.hands[currentColor(state)].length === 0);
}

function winnerOf(state) {
  if (state.partners) {
    const seen = new Set();
    for (const color of state.colors) {
      const partner = window.RULES.partners[color];
      if (!partner || seen.has(color)) continue;
      seen.add(color);
      seen.add(partner);
      if (state.marbles[color].every(isHome) && state.marbles[partner].every(isHome)) return `${color} and ${partner}`;
    }
    return null;
  }
  return state.colors.find((color) => state.marbles[color].every(isHome)) || null;
}

function hasAnyPlay(state, color) {
  return state.hands[color].some((card) => legalUses(state, color, card).length > 0);
};

window.makeDeck = makeDeck;
window.effectiveRank = effectiveRank;
window.newGame = newGame;
window.seat = seat;
window.currentColor = currentColor;
window.partnerOf = partnerOf;
window.actingColor = actingColor;
window.findMarble = findMarble;
window.homeNumber = homeNumber;
window.isHome = isHome;
window.isBank = isBank;
window.forwardDest = forwardDest;
window.backDest = backDest;
window.canEnter = canEnter;
window.legalUses = legalUses;
window.playCard = playCard;
window.discardHand = discardHand;
window.hasAnyPlay = hasAnyPlay;
window.cardLabel = cardLabel;
