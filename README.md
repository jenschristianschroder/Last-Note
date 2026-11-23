# The Last Note

A musical strategy game about keeping one tuning fork ringing. Start the transport, earn resonance on a short circuit, and place a glass bell to keep a longer circuit alive. Record eight stable bars to turn your first phrase into a voice in the next movement.

## Play locally

Run `python3 -m http.server 8000 --directory game` from the repository root and open http://localhost:8000. The game synthesizes its instruments in the browser and saves progress on the current device. Space controls playback and M toggles sound.

## Test and deploy

Run `node --test` to check timing, payouts, recording, and save recovery. The Pages workflow runs the same checks and publishes the contents of `game/` on pushes to `main`.
