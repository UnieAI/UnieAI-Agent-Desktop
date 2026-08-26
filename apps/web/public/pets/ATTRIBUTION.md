# Pet assets — attribution

The switchable pet sprites under `public/pets/<id>/` (everything except
`runbunny`, which is our own `/system/*.gif` bunny) are sourced from the
**OpenPets** project and ship under the MIT License.

- Project: https://github.com/alvinunreal/openpets
- Catalog: https://openpets.dev
- License: MIT (https://github.com/alvinunreal/openpets/blob/master/LICENSE)

Each pet is an OpenPets "Codex" spritesheet — a 1536×1872 PNG/WebP laid out as
an 8-column × 9-row grid of 192×208 frames. Row order and timing are fixed by
the OpenPets `@open-pets/core` package and mirrored in
`lib/agent-next/pet-codex.ts`.

The bundled set is the list of pets in `lib/agent-next/pets.ts` (the single
source of truth). To add more, drop a `spritesheet.webp` (1536×1872) +
`preview.webp` into a new `public/pets/<id>/` folder and append an entry there.
