/* Confirmed from Dirty Marbles Directions KWK_V6. Display only — not the move engine. */
window.RULES = {
  players: [2, 3, 4, 5, 6],
  cardsPerHand: 5,
  deck: "Two decks with jokers (108 cards)",
  turn: "Play one card, then the turn passes.",
  enter: "Your marble comes out of your bank onto your start hole.",
  passStart: "Passing your start hole is illegal.",
  home: "To enter your home, you need an exact count from your current hole to land on home 1, 2, 3, or 4. You cannot pass your own marbles in the home holes.",
  startBlock: "A marble on start cannot be jumped. It blocks marbles behind it. It can be sent back to the bank.",
  jack: "A Jack allows swapping any track marble, including a partner. Never a marble in home.",
  seven: "A Seven can move one marble 7 spaces, or be split between your own two marbles. Split with a partner only when moving your last marble home.",
  partnerHelp: "Jack is the only other way to help a partner.",
  joker: "A joker copies the last card actually played by anyone, not a discarded card.",
  partners: { Red: "Blue", Green: "Yellow", Black: "White", Blue: "Red", Yellow: "Green", White: "Black" },
};

window.COLORS = {
  Red: "#d3262b",
  Green: "#1f8f45",
  Blue: "#1f63c9",
  Yellow: "#e2b31a",
  Black: "#2a2a2a",
  White: "#f4f1ea",
};
