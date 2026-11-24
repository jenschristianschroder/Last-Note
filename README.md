# The Last Note

A musical strategy game about keeping one tuning fork ringing. Start the transport, earn resonance on a short circuit, and place a glass bell to keep a longer circuit alive. Meet each movement’s goals and record eight stable bars to turn your phrase into a voice in the next movement. The 28 authored movements build from four- to twelve-beat circuits with echo harps, pulse drums, choirs, and the conductor’s rest. Later challenges include sparse ensembles, arrangements without drums, staggered phrases, and ×16 or ×32 rests. Encores revisit the twenty advanced arrangements after movement 28, with growing costs and returns.

## Play locally

Run `python3 -m http.server 8000 --directory game` from the repository root and open http://localhost:8000. The game synthesizes its instruments in the browser and saves progress on the current device. Space controls playback and M toggles sound. Use Enable sound to activate audio, or open Field guide for a test chime, output meter, and volume control.

## Test and deploy

Run `node --test` to check timing, payouts, recording, and save recovery. The Pages workflow runs the same checks and publishes the contents of `game/` on pushes to `main`.
