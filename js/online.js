/* Host-authoritative rooms. The room code is the PeerJS id. */
window.room = { active: false, host: false, you: null, code: "", names: {} };

let peer = null;
let links = [];

function roomSettings() {
  return {
    players: count.value,
    handSize: handSize ? handSize.value : 5,
    useJokers: !(noJokers && noJokers.checked),
    safeStart: Boolean(safeStart && safeStart.checked),
    partners: Boolean(partners && partners.checked) && ["4", "6"].includes(count.value),
  };
}

function showRoomSettings(settings) {
  count.value = settings.players;
  if (handSize) handSize.value = settings.handSize;
  if (noJokers) noJokers.checked = !settings.useJokers;
  if (safeStart) safeStart.checked = Boolean(settings.safeStart);
  if (partners) partners.checked = Boolean(settings.partners);
  if (solitaire) solitaire.checked = false;
  [count, handSize, noJokers, safeStart, partners, solitaire].forEach((control) => {
    if (control) control.disabled = true;
  });
  const option = document.querySelector("#partners-option");
  if (option) option.hidden = !["4", "6"].includes(String(settings.players));
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function snapshot(forColor) {
  const hands = {};
  state.colors.forEach((color) => {
    hands[color] = color === forColor ? state.hands[color].slice() : state.hands[color].map(() => "?");
  });
  return {
    type: "state",
    you: forColor,
    players: state.layout.players,
    colors: state.colors,
    marbles: state.marbles,
    hands,
    skipped: state.skipped,
    turn: state.turn,
    lastRank: state.lastRank,
    winner: state.winner,
    message: state.message,
    partners: state.partners,
    safeStart: state.safeStart,
    handSize: state.handSize,
    useJokers: state.useJokers,
    names: room.names || {},
    seated: 1 + links.filter((link) => link.open && link.color).length,
    human: forColor,
  };
}

function applySnapshot(data) {
  const layout = window.LAYOUTS[String(data.players)];
  state = {
    layout,
    colors: data.colors,
    marbles: data.marbles,
    hands: data.hands,
    skipped: data.skipped,
    turn: data.turn,
    lastRank: data.lastRank,
    winner: data.winner,
    message: data.message,
    partners: data.partners,
    safeStart: data.safeStart,
    handSize: data.handSize,
    useJokers: data.useJokers,
    human: data.you,
    deck: [],
    discard: [],
  };
  room.you = data.you;
  room.names = data.names || {};
  room.seated = data.seated || 1;
  room.settings = room.settings || { players: data.players };
  showRoomSettings({
    players: data.players,
    handSize: data.handSize,
    useJokers: data.useJokers,
    safeStart: data.safeStart,
    partners: data.partners,
  });
  pick = null;
  show();
}

function broadcast() {
  links.forEach((link) => {
    if (link.open && link.color) link.conn.send(snapshot(link.color));
  });
}

window.roomBroadcast = broadcast;

function sameUse(left, right) {
  return left.kind === right.kind && left.from === right.from && left.dest === right.dest
    && left.other === right.other && left.a === right.a && left.destA === right.destA
    && left.b === right.b && left.destB === right.destB && left.stepsA === right.stepsA;
}

function clearChat() {
  const log = document.querySelector("#chat-log");
  if (log) log.replaceChildren();
}
window.clearChat = clearChat;

function nickName() {
  const input = document.querySelector("#nick");
  return (input && input.value.trim().slice(0, 12)) || "";
}

function lobbyLine() {
  if (!room.active) return "";
  const need = Number(room.settings && room.settings.players || 0);
  const seated = room.seated || 1;
  if (!need || seated >= need) return `All ${need || seated} players are in. Room ${room.code}.`;
  return `Waiting for player ${seated + 1} of ${need}. Room ${room.code}.`;
}
window.lobbyLine = lobbyLine;

function addChat(color, text) {
  const log = document.querySelector("#chat-log");
  if (!log) return;
  const line = document.createElement("p");
  const name = room.names && room.names[color] ? `${color} (${room.names[color]})` : color;
  line.textContent = `${name}: ${text}`;
  log.append(line);
  log.scrollTop = log.scrollHeight;
}

function postChat(color, text) {
  const clean = text.trim().slice(0, 200);
  if (!clean) return;
  addChat(color, clean);
  links.forEach((link) => {
    if (link.open) link.conn.send({ type: "chat", color, text: clean });
  });
}

window.sendChat = function sendChat(text) {
  const clean = text.trim().slice(0, 200);
  if (!clean) return;
  if (room.host) postChat(room.you || "Host", clean);
  else if (room.send) room.send({ type: "chat", text: clean });
};

function reply(color, text) {
  const link = links.find((item) => item.color === color && item.open);
  if (link) link.conn.send({ type: "notice", text });
}

function applyRemote(color, message) {
  if (!state || state.winner || currentColor(state) !== color) {
    reply(color, "The host did not accept that. It is not your turn.");
    return;
  }
  if (message.type === "discard") {
    if (hasAnyPlay(state, color)) {
      reply(color, "The host still sees a legal card, so the hand was not discarded.");
      broadcast();
      return;
    }
    discardHand(state);
  } else {
    const card = state.hands[color][message.cardIndex];
    const use = legalUses(state, color, card).find((item) => sameUse(item, message.use));
    if (!use) {
      reply(color, "The host did not accept that play.");
      broadcast();
      return;
    }
    playCard(state, message.cardIndex, use);
  }
  pick = null;
  show();
  broadcast();
}

window.createRoom = function createRoom() {
  const code = roomCode();
  peer = new Peer(code);
  peer.on("open", () => {
    room.active = true;
    room.host = true;
    room.code = code;
    room.you = window.LAYOUTS[count.value].colors[0];
    room.settings = roomSettings();
    room.names = {};
    room.names[room.you] = nickName();
    room.seated = 1;
    clearChat();
    const link = `${location.origin}${location.pathname}?room=${code}`;
    document.querySelector("#room-code").textContent = `${code}  ${link}`;
    start();
    status.textContent = lobbyLine();
  });
  peer.on("connection", (conn) => {
    const taken = new Set(links.map((link) => link.color).concat(room.you));
    const settings = room.settings || roomSettings();
    const color = window.LAYOUTS[settings.players].colors.find((item) => !taken.has(item));
    const link = { conn, color, open: false };
    links.push(link);
    conn.on("open", () => {
      link.open = true;
      if (!color) {
        conn.send({ type: "full" });
        return;
      }
      conn.send({ type: "seat", color, code, settings });
      if (state && state.layout.players === Number(settings.players)) conn.send(snapshot(color));
      room.seated = 1 + links.filter((item) => item.open && item.color).length;
      status.textContent = lobbyLine();
      broadcast();
    });
    conn.on("data", (message) => {
      if (message.type === "chat") {
        postChat(color, message.text);
        return;
      }
      if (message.type === "nick") {
        room.names[color] = String(message.text || "").trim().slice(0, 12);
        broadcast();
        status.textContent = lobbyLine();
        return;
      }
      applyRemote(color, message);
    });
    conn.on("close", () => {
      links = links.filter((item) => item !== link);
      status.textContent = `${color || "A player"} left the room.`;
    });
  });
  peer.on("error", (error) => { status.textContent = `Room error: ${error.type || error.message}`; });
};

window.joinRoom = function joinRoom(code) {
  peer = new Peer();
  peer.on("open", () => {
    const conn = peer.connect(code.trim().toUpperCase());
    const pending = [];
    let open = false;
    room.send = (message) => {
      if (open) conn.send(message);
      else pending.push(message);
    };
    conn.on("open", () => {
      open = true;
      room.active = true;
      room.host = false;
      room.code = code;
      pending.splice(0).forEach((message) => conn.send(message));
    });
    conn.on("data", (message) => {
      if (message.type === "seat") {
        room.you = message.color;
        room.settings = message.settings;
        showRoomSettings(message.settings);
        clearChat();
        state = newGame(window.LAYOUTS[message.settings.players], message.settings);
        state.human = message.color;
        state.message = `Joined as ${message.color}. Waiting for the host game.`;
        pick = null;
        if (room.send) room.send({ type: "nick", text: nickName() });
        show();
      } else if (message.type === "state") applySnapshot(message);
      else if (message.type === "chat") addChat(message.color, message.text);
      else if (message.type === "notice") {
        state.message = message.text;
        show();
      } else if (message.type === "full") status.textContent = "That room is full.";
    });
    conn.on("close", () => { status.textContent = "Disconnected from the room."; });
  });
  peer.on("error", (error) => { status.textContent = `Could not join: ${error.type || error.message}`; });
};

window.sendPlay = function sendPlay(cardIndex, use) {
  if (room.host) return false;
  room.send({ type: "play", cardIndex, use });
  state.message = "Move sent.";
  return true;
};
