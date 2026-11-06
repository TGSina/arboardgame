export function createPromotionDialog({ element, onChoose }) {
  const title = element.querySelector('#promotion-title');
  const buttons = [...element.querySelectorAll('[data-promotion]')];
  let open = false;

  function close() {
    open = false;
    element.hidden = true;
  }

  function show(color) {
    const side = color[0].toUpperCase() + color.slice(1);
    title.textContent = `${side} pawn promotion`;
    element.hidden = false;
    open = true;
    buttons[0]?.focus();
  }

  element.addEventListener('beforexrselect', (event) => event.preventDefault());
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!open) return;
      const piece = button.dataset.promotion;
      close();
      onChoose(piece);
    });
  });

  return { show, close, get open() { return open; } };
}