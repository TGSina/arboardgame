# URL Options

Query options are case-sensitive. Add them after the page name with `?`, and join multiple options with `&`.

## Main app (`index.html`)

| Option | Effect |
| --- | --- |
| `debug=1` | Starts the debug HUD and debug visual layers. The Debug button can toggle them while the app is running. Enables the debug-only `fen` loader. |
| `selectionDebug=1` | Highlights selected squares in yellow and logs the tapped square and its occupant. Also starts the debug HUD/layers and enables `fen`. |
| `fen=<position>` | Loads a chess position in FEN notation for testing end conditions and board positions. It is read only when `debug=1` or `selectionDebug=1` is also present. Invalid FEN is logged and the standard starting position is used. Encode spaces and reserved URL characters. |
| `xrlayers=1` | A/B test for the WebXR projection-layers path. It disables the Android Chrome compatibility workaround that otherwise removes projection-layer APIs when available. Use the default (omit this option) for the workaround path. |

Examples:

```text
index.html?debug=1
index.html?selectionDebug=1
index.html?debug=1&fen=7k%2F5Q2%2F6K1%2F8%2F8%2F8%2F8%2F8%20b%20-%20-%200%201
index.html?debug=1&xrlayers=1
```

The FEN example loads a stalemate position. For a different test position, replace its value with URL-encoded FEN.

## AR smoke test (`ar-test.html`)

| Option | Effect |
| --- | --- |
| `overlay=1` | Requests and displays the DOM overlay for this standalone smoke test. It does not configure `index.html`; the main app requests the optional DOM overlay automatically. |
| `aa=1` | Enables WebGL antialiasing for the smoke test renderer. The default is off. |
| `xrlayers=1` | Has the same compatibility-workaround effect as on the main app. |

Example:

```text
ar-test.html?overlay=1&aa=1
```

## Interface controls

Board mode is not a query option. Once the board is placed, use **Edit** to enable one-finger translation and two-finger scale/rotation; use **Play** to return to chess taps and pinch-to-scale. **Reset transform** restores the board's placement-relative position, facing, and scale without changing the AR anchor.

Options such as `models=procedural` appear in the development plan but are not implemented URL options yet.
