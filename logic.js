// logic.js — Higgsfield solo deploy stub (contract L).
//
// Lineage II: Thrones of Aden is a SOLO, fully client-side game: all real
// game logic (engine/combat/ai) lives in src/** and runs in the browser. The
// deploy engine still requires this rules module with the six exports. For a
// solo title it is a thin shell: one seat, the client owns the simulation and
// only mirrors a result here so isGameOver can report completion.
//
// Constraints (enforced statically by the deploy tool): NO imports, NO timers,
// standard JS built-ins only. State must survive JSON.parse(JSON.stringify):
// plain objects/arrays/numbers/strings/booleans/null only.

export const meta = { game: "Lineage II: Thrones of Aden", minPlayers: 1, maxPlayers: 1 };

// Called once when the (single) player joins. The client engine seeds itself
// from `seed`; we keep a tiny mirror so the engine contract is satisfied.
export function setup(players) {
  const seed = (Math.floor(Math.random() * 0x7fffffff) >>> 0) || 1;
  return {
    player: players[0],
    seed,
    turn: 1,
    started: true,
    // Mirror of the client's authoritative result; null while playing.
    result: null,
  };
}

// Solo game: the client drives the simulation and reports back via actions.
// Accepted actions:
//   { type: "sync", turn }            -> advance the mirrored turn counter
//   { type: "result", outcome }       -> outcome: "win" | "lose"
export function validateAction(state, playerId, action) {
  if (state.player !== playerId) {
    return { ok: false, error: "Not your game." };
  }
  if (!action || typeof action.type !== "string") {
    return { ok: false, error: "Malformed action." };
  }
  if (action.type === "sync") {
    if (!Number.isInteger(action.turn) || action.turn < 1) {
      return { ok: false, error: "Invalid turn." };
    }
    return { ok: true };
  }
  if (action.type === "result") {
    if (action.outcome !== "win" && action.outcome !== "lose") {
      return { ok: false, error: "Invalid outcome." };
    }
    return { ok: true };
  }
  return { ok: false, error: "Unknown action." };
}

// Apply a validated action. Treat `state` as immutable: copy, don't mutate.
export function applyAction(state, playerId, action) {
  if (action.type === "sync") {
    return Object.assign({}, state, { turn: action.turn });
  }
  if (action.type === "result") {
    return Object.assign({}, state, { result: { outcome: action.outcome } });
  }
  return state;
}

// Checked after every applyAction. Solo: over once the client reports a result.
export function isGameOver(state) {
  if (state.result && state.result.outcome === "win") {
    return { over: true, winner: state.player };
  }
  if (state.result && state.result.outcome === "lose") {
    return { over: true, draw: true, outcome: "lose" };
  }
  return { over: false };
}

// Solo game has no hidden information at this layer.
export function viewFor(state, _playerId) {
  return state;
}
