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
  xPlayer: number;
  oPlayer: number;
};

export type BattleState = {
  challenger: number;
  challenged: number;
  challengerHp: number;
  challengedHp: number;
  currentTurn: number;
  log: string[];
};

export function initFeatherGame(
  challengerId: number,
  challengedId: number,
): FeatherGameState {
  const poisonedIndex = Math.floor(Math.random() * 5);
  const feathers = [false, false, false, false, false];
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
): { poisoned: boolean; loser: number; nextTurn?: number; state: FeatherGameState } {
  const newFeathers = [...state.feathers];
  const newPicked = [...state.picked, index];
  const poisoned = newFeathers[index] === true;
  newFeathers[index] = null;

  const nextTurn =
    userId === state.challenger ? state.challenged : state.challenger;

  const newState: FeatherGameState = {
    ...state,
    feathers: newFeathers as (boolean | null)[],
    picked: newPicked,
    currentTurn: nextTurn,
  };

  if (poisoned) {
    return { poisoned: true, loser: userId, state: newState };
  }

  return { poisoned: false, loser: -1, nextTurn, state: newState };
}

export function renderFeatherBoard(state: FeatherGameState): string {
  const buttons: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (state.picked.includes(i)) {
      buttons.push("✂️");
    } else {
      buttons.push("🪶");
    }
  }
  return buttons.join("  ");
}

export function initTicTacToe(
  challengerId: number,
  challengedId: number,
): TicTacToeState {
  const xFirst = Math.random() < 0.5;
  return {
    board: Array(9).fill(null),
    challenger: challengerId,
    challenged: challengedId,
    xPlayer: xFirst ? challengerId : challengedId,
    oPlayer: xFirst ? challengedId : challengerId,
  };
}

export function makeTicTacToeMove(
  state: TicTacToeState,
  userId: number,
  index: number,
): {
  valid: boolean;
  winner: number | null;
  draw: boolean;
  state: TicTacToeState;
} {
  if (state.board[index] !== null) {
    return { valid: false, winner: null, draw: false, state };
  }
  const symbol = userId === state.xPlayer ? "❌" : "⭕";
  const newBoard = [...state.board];
  newBoard[index] = symbol;

  const nextTurn =
    userId === state.xPlayer ? state.oPlayer : state.xPlayer;
  const newState: TicTacToeState = {
    ...state,
    board: newBoard,
    xPlayer:
      userId === state.xPlayer ? state.oPlayer : state.xPlayer,
    oPlayer:
      userId === state.oPlayer ? state.xPlayer : state.oPlayer,
  };
  newState.xPlayer = state.xPlayer;
  newState.oPlayer = state.oPlayer;

  const winnerSymbol = checkTicTacToeWinner(newBoard);
  if (winnerSymbol) {
    const winner = winnerSymbol === "❌" ? state.xPlayer : state.oPlayer;
    return { valid: true, winner, draw: false, state: newState };
  }
  if (newBoard.every((c) => c !== null)) {
    return { valid: true, winner: null, draw: true, state: newState };
  }

  newState.xPlayer =
    nextTurn === state.xPlayer ? state.xPlayer : state.oPlayer;
  newState.oPlayer =
    nextTurn === state.oPlayer ? state.oPlayer : state.xPlayer;

  return { valid: true, winner: null, draw: false, state: newState };
}

function checkTicTacToeWinner(board: (string | null)[]): string | null {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of wins) {
    if (board[a!] && board[a!] === board[b!] && board[a!] === board[c!]) {
      return board[a!] as string;
    }
  }
  return null;
}

export function renderTicTacToe(board: (string | null)[]): string {
  const cell = (v: string | null, i: number) => v ?? `${i + 1}`;
  return (
    `${cell(board[0], 0)} ${cell(board[1], 1)} ${cell(board[2], 2)}\n` +
    `${cell(board[3], 3)} ${cell(board[4], 4)} ${cell(board[5], 5)}\n` +
    `${cell(board[6], 6)} ${cell(board[7], 7)} ${cell(board[8], 8)}`
  );
}

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

  const hitChance = action === "attack" ? 0.65 : 0.0;
  const dodgeSuccess = action === "dodge" ? Math.random() < 0.75 : false;

  let resultText = "";
  let newState = {
    ...state,
    challengerHp: state.challengerHp,
    challengedHp: state.challengedHp,
    log: [...state.log],
  };

  if (action === "attack") {
    const hit = Math.random() < hitChance;
    if (hit) {
      if (isChallenger) {
        newState.challengedHp -= 1;
      } else {
        newState.challengerHp -= 1;
      }
      resultText = `💥 Удар достиг цели!`;
    } else {
      resultText = `😤 Удар не попал!`;
    }
  } else {
    if (dodgeSuccess) {
      resultText = `🌀 Уклонение удалось!`;
    } else {
      resultText = `😵 Не удалось уклониться, но атаки не было`;
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
