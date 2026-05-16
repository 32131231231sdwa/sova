export type FeatherGameState = {
  feathers: (boolean | null)[];
  currentTurn: number;
  challenger: number;
  challenged: number;
  picked: number[];
};

export type TicTacToeState = {
  board: (string | null)[];
  challenger: number;
  challenged: number;
  xPlayer: number; // immutable role — plays ❌
  oPlayer: number; // immutable role — plays ⭕
};

export type BattleState = {
  challenger: number;
  challenged: number;
  challengerHp: number;
  challengedHp: number;
  currentTurn: number;
  log: string[];
};

// ── Feather Game ──────────────────────────────────────────────────────────────

export function initFeatherGame(
  challengerId: number,
  challengedId: number,
): FeatherGameState {
  const poisonedIndex = Math.floor(Math.random() * 5);
  const feathers: (boolean | null)[] = [false, false, false, false, false];
  feathers[poisonedIndex] = true;
  return {
    feathers,
    currentTurn: challengerId,
    challenger: challengerId,
    challenged: challengedId,
    picked: [],
  };
}

export function pickFeather(
  state: FeatherGameState,
  userId: number,
  index: number,
): { poisoned: boolean; loser: number; nextTurn: number; state: FeatherGameState } {
  const newFeathers = [...state.feathers] as (boolean | null)[];
  const poisoned = newFeathers[index] === true;
  newFeathers[index] = null;
  const newPicked = [...state.picked, index];
  const nextTurn = userId === state.challenger ? state.challenged : state.challenger;

  const newState: FeatherGameState = {
    ...state,
    feathers: newFeathers,
    picked: newPicked,
    currentTurn: nextTurn,
  };

  return { poisoned, loser: poisoned ? userId : -1, nextTurn, state: newState };
}

export function renderFeatherBoard(state: FeatherGameState): string {
  return Array.from({ length: 5 }, (_, i) =>
    state.picked.includes(i) ? "✂️" : "🪶",
  ).join("  ");
}

// ── Tic-Tac-Toe ───────────────────────────────────────────────────────────────

export function initTicTacToe(
  challengerId: number,
  challengedId: number,
): TicTacToeState {
  // Randomly decide who is X (goes first)
  const xFirst = Math.random() < 0.5;
  return {
    board: Array(9).fill(null) as (string | null)[],
    challenger: challengerId,
    challenged: challengedId,
    xPlayer: xFirst ? challengerId : challengedId,
    oPlayer: xFirst ? challengedId : challengerId,
  };
}

/**
 * Make a tic-tac-toe move.
 * xPlayer and oPlayer are IMMUTABLE role assignments — they NEVER change.
 * currentTurn is tracked externally in the duel record.
 */
export function makeTicTacToeMove(
  state: TicTacToeState,
  userId: number,
  index: number,
): {
  valid: boolean;
  winner: number | null;
  draw: boolean;
  nextTurn: number;
  state: TicTacToeState;
} {
  if (state.board[index] !== null) {
    const nextTurn = userId === state.xPlayer ? state.oPlayer : state.xPlayer;
    return { valid: false, winner: null, draw: false, nextTurn, state };
  }

  const symbol = userId === state.xPlayer ? "❌" : "⭕";
  const newBoard = [...state.board] as (string | null)[];
  newBoard[index] = symbol;

  // xPlayer/oPlayer are never modified — they're permanent role assignments
  const newState: TicTacToeState = { ...state, board: newBoard };
  const nextTurn = userId === state.xPlayer ? state.oPlayer : state.xPlayer;

  const winnerSymbol = checkWinner(newBoard);
  if (winnerSymbol) {
    const winner = winnerSymbol === "❌" ? state.xPlayer : state.oPlayer;
    return { valid: true, winner, draw: false, nextTurn, state: newState };
  }

  if (newBoard.every((c) => c !== null)) {
    return { valid: true, winner: null, draw: true, nextTurn, state: newState };
  }

  return { valid: true, winner: null, draw: false, nextTurn, state: newState };
}

function checkWinner(board: (string | null)[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a!] && board[a!] === board[b!] && board[a!] === board[c!]) {
      return board[a!] as string;
    }
  }
  return null;
}

export function renderTicTacToe(board: (string | null)[]): string {
  const cell = (v: string | null, i: number) => v ?? (i + 1).toString();
  return (
    `${cell(board[0], 0)} ${cell(board[1], 1)} ${cell(board[2], 2)}\n` +
    `${cell(board[3], 3)} ${cell(board[4], 4)} ${cell(board[5], 5)}\n` +
    `${cell(board[6], 6)} ${cell(board[7], 7)} ${cell(board[8], 8)}`
  );
}

// ── Battle ───────────────────────────────────────────────────────────────────

export function initBattle(
  challengerId: number,
  challengedId: number,
): BattleState {
  const first = Math.random() < 0.5 ? challengerId : challengedId;
  return {
    challenger: challengerId,
    challenged: challengedId,
    challengerHp: 2,
    challengedHp: 2,
    currentTurn: first,
    log: [],
  };
}

export function battleAction(
  state: BattleState,
  userId: number,
  action: "attack" | "dodge",
): { result: string; winner: number | null; state: BattleState } {
  const isChallenger = userId === state.challenger;
  const opponentId = isChallenger ? state.challenged : state.challenger;

  let resultText = "";
  const newState = {
    ...state,
    challengerHp: state.challengerHp,
    challengedHp: state.challengedHp,
    log: [...state.log],
  };

  if (action === "attack") {
    const hit = Math.random() < 0.65;
    if (hit) {
      if (isChallenger) newState.challengedHp -= 1;
      else newState.challengerHp -= 1;
      resultText = "💥 Удар достиг цели!";
    } else {
      resultText = "😤 Удар не попал!";
    }
  } else {
    if (Math.random() < 0.75) {
      resultText = "🌀 Уклонение удалось!";
    } else {
      resultText = "😵 Не удалось уклониться!";
    }
  }

  newState.log.push(resultText);
  newState.currentTurn = opponentId;

  const winner =
    newState.challengerHp <= 0
      ? state.challenged
      : newState.challengedHp <= 0
        ? state.challenger
        : null;

  return { result: resultText, winner, state: newState };
}
