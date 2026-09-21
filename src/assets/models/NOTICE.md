# Rigged player models — third-party, GPL-3.0-only

`classic-player.gltf` and `slim-player.gltf` (geometry + the `idle`, `idle_sub_1`,
`idle_sub_2`, `idle_sub_3` and `interact` animation clips) are derived from
Modrinth's launcher:

- Source: https://github.com/modrinth/code — `packages/assets/models/`
  (`classic-player.gltf`, `slim-player.gltf`)
- License: **GNU General Public License v3.0 only** — see `LICENSE-GPL-3.0.txt`
- Copyright: © Modrinth contributors

## What we changed

Ran offline through a small transform (see the conversation that added this):

- removed the `images` / `textures` / root `samplers` blocks and the
  `baseColorTexture` reference from both materials — the skin and cape textures
  are supplied at runtime by `src/components/skin-viewer-animated.tsx`, so the
  baked `steve.png` / `sunny.png` / `cape` references were dead weight and caused
  404s on load;
- dropped the unused editor camera and its node;
- set `metallicFactor: 0`, `roughnessFactor: 1` (the renderer forces these anyway);
- removed the empty leftover `CINEMA_4D_Main` clip.

The node hierarchy, geometry, UVs and every real animation track are untouched.

## License implication

These files are GPL-3.0-only. Bundling them into ALaunchi means the distributed
build is a combined work and the corresponding source must be offered to anyone
who receives the binary. For our private group that means: keep the ALaunchi
source available to the group and ship this notice + `LICENSE-GPL-3.0.txt` with
it. If ALaunchi ever needs to be distributed under different terms, replace these
two files with a model whose license allows it (a self-made Blockbench export, or
a CC0/CC-BY rig) — the component code does not otherwise depend on Modrinth.
