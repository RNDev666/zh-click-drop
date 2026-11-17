import './style.css';

/**
 * Click-to-drop for crazyhouse on lichess.org.
 *
 * Lichess only lets you drag pocket pieces onto the board. This content script
 * lets you click (or tap) a pocket piece to select it, then click a square to
 * drop it there. The page's chessground state isn't reachable from an
 * extension, so the drop is performed by replaying a drag: a synthetic
 * mousedown on the pocket piece followed by a mouseup over the clicked square.
 * Lichess handles everything else (legality, predrops, sounds) as for a drag.
 */
export default defineContentScript({
  matches: ['*://lichess.org/*'],
  runAt: 'document_idle',
  main() {
    // Our own pocket, when the game is being played (not replaying history).
    const POCKET_PIECE = '.pocket.usable piece[data-role]:not([data-nb="0"])';

    let selected: { role: string; color: string } | undefined;
    let pressedPiece: HTMLElement | undefined;
    let synthesizing = false;

    const pointOf = (e: MouseEvent | TouchEvent): [number, number] | undefined => {
      if ('changedTouches' in e) {
        const t = e.changedTouches[0];
        return t ? [t.clientX, t.clientY] : undefined;
      }
      return [e.clientX, e.clientY];
    };

    const inside = (el: Element, [x, y]: [number, number]) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const pocketPiece = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>(POCKET_PIECE) : null;

    const board = (): HTMLElement | null => document.querySelector('.round__app cg-board');

    const setCursor = (on: boolean) => {
      document.body.classList.forEach(c => c.startsWith('zhcd-cursor-') && document.body.classList.remove(c));
      if (on && selected) document.body.classList.add(`zhcd-cursor-${selected.color}-${selected.role}`);
    };

    const select = (el: HTMLElement) => {
      selected = { role: el.dataset.role!, color: el.dataset.color! };
      document.documentElement.dataset.zhcdRole = selected.role;
      setCursor(true);
    };

    const deselect = () => {
      selected = undefined;
      delete document.documentElement.dataset.zhcdRole;
      setCursor(false);
    };

    /** Replay a drag from the selected pocket piece to the given point. */
    const dropAt = ([x, y]: [number, number]) => {
      const piece = selected && document.querySelector<HTMLElement>(
        `.pocket.usable piece[data-role="${selected.role}"]:not([data-nb="0"])`,
      );
      if (!piece) return;
      const r = piece.getBoundingClientRect();
      const from = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      const opts = { bubbles: true, cancelable: true, composed: true, button: 0 };
      synthesizing = true;
      try {
        piece.dispatchEvent(new MouseEvent('mousedown', { ...opts, ...from, buttons: 1 }));
        document.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: x, clientY: y, buttons: 1 }));
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: x, clientY: y }));
      } finally {
        synthesizing = false;
      }
    };

    const onPress = (e: MouseEvent | TouchEvent) => {
      if (synthesizing) return;
      if (e instanceof MouseEvent && e.button !== 0) return;
      pressedPiece = undefined;

      const piece = pocketPiece(e.target);
      if (piece) {
        // let lichess start its normal drag; decide on release if it was a click
        pressedPiece = piece;
        return;
      }

      if (!selected) return;
      const b = board();
      const pos = pointOf(e);
      if (b && pos && e.target instanceof Node && b.contains(e.target)) {
        // keep chessground from seeing this press; it gets the replayed drag instead
        e.preventDefault(); // on touch, also suppresses the emulated mouse events
        e.stopImmediatePropagation();
        dropAt(pos);
      }
      deselect();
    };

    const onRelease = (e: MouseEvent | TouchEvent) => {
      if (synthesizing || !pressedPiece) return;
      const piece = pressedPiece;
      pressedPiece = undefined;
      const pos = pointOf(e);
      if (!pos || !inside(piece, pos)) return deselect(); // it was a real drag
      if (selected?.role === piece.dataset.role) deselect();
      else select(piece);
    };

    const opts = { capture: true, passive: false } as const;
    window.addEventListener('mousedown', onPress, opts);
    window.addEventListener('touchstart', onPress, opts);
    window.addEventListener('mouseup', onRelease, opts);
    window.addEventListener('touchend', onRelease, opts);
    window.addEventListener('keydown', e => e.key === 'Escape' && deselect());
    window.addEventListener('blur', () => (pressedPiece = undefined));

    // Drop the selection if the piece runs out or the pocket stops being usable
    // (game over, browsing move history, ...).
    new MutationObserver(() => {
      if (selected && !document.querySelector(`${POCKET_PIECE}[data-role="${selected.role}"]`)) deselect();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-nb'] });
  },
});
