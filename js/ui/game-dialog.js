const SIDE = { white: 'White', black: 'Black' };
const DRAW_REASON = {
  'insufficient-material': 'Draw by insufficient material.',
  'threefold-repetition': 'Draw by threefold repetition.',
  'fifty-move-rule': 'Draw by the fifty-move rule.'
};

export function createGameDialog({ element, title, message, primary, secondary, onNewGame, onResign }) {
  let mode = null;

  function close() {
    mode = null;
    element.hidden = true;
  }

  function showResult(status) {
    mode = 'result';
    if (status.state === 'checkmate') {
      title.textContent = 'Checkmate';
      message.textContent = `${SIDE[status.winner]} wins. ${SIDE[status.loser]} is checkmated.`;
    } else if (status.state === 'stalemate') {
      title.textContent = 'Stalemate';
      message.textContent = 'The game is a draw.';
    } else if (status.state === 'resigned') {
      title.textContent = 'Resignation';
      message.textContent = `${SIDE[status.loser]} resigned. ${SIDE[status.winner]} wins.`;
    } else {
      title.textContent = 'Draw';
      message.textContent = DRAW_REASON[status.reason] ?? 'The game is a draw.';
    }
    primary.textContent = 'New game';
    secondary.textContent = 'Dismiss';
    element.hidden = false;
    primary.focus();
  }

  function showResign() {
    mode = 'resign';
    title.textContent = 'Resign game?';
    message.textContent = 'The other side will win this game.';
    primary.textContent = 'Resign';
    secondary.textContent = 'Keep playing';
    element.hidden = false;
    secondary.focus();
  }

  primary.addEventListener('click', () => {
    const action = mode;
    close();
    if (action === 'result') onNewGame();
    if (action === 'resign') onResign();
  });
  secondary.addEventListener('click', close);
  element.addEventListener('beforexrselect', (event) => event.preventDefault());
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return { showResult, showResign, close, get open() { return mode !== null; } };
}
