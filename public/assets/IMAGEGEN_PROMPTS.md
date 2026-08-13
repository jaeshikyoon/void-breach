# Imagegen asset manifest

이 문서는 `VOID//BREACH` 제작에 사용한 프롬프트를 재현 가능한 형태로 정규화한 기록입니다.

- 생성 방식: **Codex 내장 Imagegen (`built-in` mode)**
- 결과 형식: PNG 원본, UI/아이콘 분할본은 PNG 또는 WebP
- 공통 방향: 오리지널 다크 SF, 2D 아이소메트릭/3⁄4 탑다운, 선명한 실루엣, 작은 화면에서도 역할이 구분되는 고대비 색 체계
- 세력 색: 플레이어·방어망은 시안/청색, 적은 적색/자홍, 공허 에너지는 보라, 화염은 주황
- 금지 요소: 글자, 숫자, 로고, 워터마크, 기존 IP 캐릭터, 잘린 피사체, 셀 사이 요소 침범
- 후처리: 단색 키 배경을 알파로 변환하고 셀을 동일 크기로 분할했습니다. 게임에서 참조하는 최종 파일은 `public/assets/` 아래에 있습니다.

아래 문구는 생성 당시의 의도를 하나로 합친 **정규화 최종 프롬프트**입니다. 각 항목의 출력 규격과 셀 순서는 런타임 슬라이싱 규칙의 일부입니다.

## 1. 아이소메트릭 전투장

출력: `game/arena.png`

```text
Create an original 16:9 dark science-fiction industrial combat arena for a 2D isometric survivor game, viewed from a fixed three-quarter top-down camera. Graphite steel floor panels, cracks, grates, hazard stripes, cables and ruined machinery around the perimeter; small cyan defense consoles, restrained crimson warning lights and faint violet breach contamination. Keep the broad central and diagonal combat lanes open and readable for dozens of units. Rich hand-painted game art, crisp materials, dramatic but gameplay-safe lighting, darker edges and a clear center. Environment only: no characters, enemies, projectiles, UI, text, logos or watermark.
```

## 2. 플레이어 8방향 시트

출력: `game/player-sheet.png` — 4열 × 2행, 행 우선 8방향

```text
Create one consistent original sci-fi field operator as an 8-direction sprite sheet for a 2D isometric action game. Compact blue and gunmetal powered armor, cyan visor and accents, carrying the same white-and-black assault rifle in every cell. Show eight compass-facing poses in row-major order, N, NE, E, SE, S, SW, W, NW, with a fixed three-quarter top-down camera, identical scale and centered feet. Exactly 4 columns by 2 rows, generous clean separation, complete silhouettes. High-detail painted game sprite, readable at small size. Transparent background or a single removable chroma key; no floor, shadow, muzzle flash, text, borders, logo or watermark.
```

## 3. 적 12종 아틀라스

출력: `game/enemies-sheet.png` — 4열 × 3행

셀 순서:

1. infected, razor, brute, shieldbearer
2. marksman, flameCultist, frostCultist, lightningArcher
3. exploder, healer, summoner, ambusher

```text
Create an original enemy unit atlas for a dark sci-fi 2D isometric survivor game, exactly 4 columns by 3 rows. Every cell contains one complete, centered three-quarter top-down creature at a consistent gameplay scale and with clear margins. Row 1: basic infected mutant, lean blade-armed razor chaser, huge armored brute, tower-shield bearer. Row 2: long-range marksman, orange flame cultist, cyan frost cultist, violet-electric lightning archer. Row 3: volatile red-orange exploder, green biotech healer, purple portal summoner, low-profile clawed ambusher. Share a corrupted biomechanical design language while making role, weapon and color readable instantly. Transparent background or one removable chroma key. No cast shadows, effects crossing cells, labels, grid lines, logo or watermark.
```

## 4. 최종 보스

출력: `game/boss.png`

```text
Create a single original final boss sprite for a dark science-fiction 2D isometric arena game: the Void Executioner, a colossal black-gunmetal armored humanoid-abomination with a broad executioner silhouette, broken ceremonial plating, horn-like crown shapes and a violently glowing violet singularity core. Three-quarter top-down camera matching the unit sprites, symmetrical enough to read as a boss but visibly corrupted and asymmetrical in detail. Full body, centered, generous margin, crisp painted game art, readable at mobile scale. Transparent background or one removable chroma key; no floor, UI, text, logo, watermark or cropped limbs.
```

### 신규 적 8종 확장 아틀라스

출력: `game/enemies-expansion.png` — 4열 × 2행. 내장 Imagegen 생성 후 단색 키 제거 도구로 알파 변환했습니다. 생성 원본은 `game/enemies-expansion-chroma.png`입니다.

셀 순서: plagueHound, phaseStalker, toxicSpitter, voidPriest / shockTrooper, cryoSentinel, siegeCrawler, nullifier.

```text
Create a polished dark sci-fi biomechanical enemy sprite atlas, exactly four columns by two rows, fixed orthographic three-quarter isometric camera and complete centered silhouettes. Row one: toxic-canister plague hound; violet-bladed phase stalker; acid-sac toxic spitter; floating halo-equipped void priest. Row two: blue-electric shock trooper; ice-armored cryo sentinel; orange-furnace six-legged siege crawler; magenta-core nullifier construct. Match black gunmetal, scarred flesh and restrained emissive cyber-horror game art. Use one perfectly flat pure #00ff00 chroma-key background, no shadows, floor, text, borders, watermark, overlap or cropped limbs.
```

### 전선 보스 5종 아틀라스

출력: `game/bosses-sheet.png` — 5열 × 1행

셀 순서: ironColossus, plagueOvermind, stormWarden, voidMatriarch, riftSovereign.

```text
Create five distinct massive full-body bosses for a dark sci-fi biomechanical isometric survival game in exactly five equal columns: orange-furnace Iron Colossus; toxic brood Plague Overmind; blue lightning-and-ice Storm Warden; floating violet Void Matriarch; magenta-singularity Rift Sovereign. Consistent orthographic three-quarter top-down view, crisp small-screen silhouettes, contained emissive accents, transparent or clean removable background, no floor, cast shadows, text, borders, watermark, overlap or cropping.
```

## 5. 전투 VFX 아틀라스

출력: `game/vfx-atlas.png` — 4열 × 2행

프레임 순서: kinetic hit, explosion, frost burst, gravity void, flame burst, chain lightning, ice barrier, dash burst.

```text
Create an additive VFX atlas for a dark sci-fi isometric action game, exactly 4 columns by 2 rows on pure black. Eight isolated effects, one per cell, centered and fully contained: sharp white-yellow kinetic hit spark; orange-red circular explosion; cyan ice crystal burst; violet gravity singularity with a spiral rim; hot orange flame burst; branching blue-white chain lightning impact; pale-cyan ice barrier pulse; cyan directional dash shockwave. High-energy hand-painted particles with bright cores, soft falloff and clean silhouettes, designed for screen/additive blending. Equal cell size and empty gutters. No characters, objects, text, borders, logo or watermark.

### 스킬 전용 VFX 보조 아틀라스 v2

- 최종 파일: `public/assets/game/skill-vfx-atlas-v2-clean.webp` (배포 최적화 WebP)
- 셀 순서: 미사일 폭발 / 냉기 파편 / 화상 사망 폭발 / 체인 번개 강화 / 지뢰 연쇄 / 칼날 충격파 / 포탑 배치 / 드론 소환

```text
Create one 4-column by 2-row production sprite atlas for a dark sci-fi isometric survivor shooter on pure black for additive blending. Cell order, top row then bottom row: orange homing-missile detonation; cyan cryogenic three-shard burst; red-orange burning-enemy death ring; electric-blue reverse-lightning rebound node; amber top-down landmine chain shockwave; pale-cyan kinetic crescent blade slash; cyan holographic auto-turret deployment ring; gold-cyan attack-drone summon pulse. Equal cells, generous gutters, high-contrast emissive cores, readable at 64–160 px. No text, borders, characters, watermark, overlap, or cropping.
```
```

## 6. HUD 패널·버튼

출력: `ui/hud-atlas.png`, 분할본 `ui/frames/*.png`

```text
Create a cohesive transparent UI kit for an original dark sci-fi tactical survivor game. Arrange isolated components in a regular atlas with wide gutters: one wide beveled health/status frame, one medium information panel, an angular minimap frame, one large primary circular fire button, four smaller circular skill-button frames with cyan/violet/orange/lime accents, one large virtual joystick ring and one joystick thumb. Graphite metal, smoked glass, fine cyan emissive lines, restrained amber trim, worn industrial micro-detail. Components only, front-facing UI orthographic view, no baked labels, letters, numbers, icons, background scene, logo or watermark.
```

## 7. 시작·결과 화면 오퍼레이터 아트

출력: `ui/menu-operator.png`, `ui/result-backdrop.png`

```text
Create a cinematic key art panel for an original dark science-fiction defense game. A lone blue-and-gunmetal powered-armored rifle operator stands three-quarter view on the right side, cyan visor glowing, facing a distant violet dimensional breach and red hostile silhouettes inside a ruined industrial facility. Reserve generous dark negative space on the left for title and menu UI. Deep graphite palette, cyan rim light, violet fog, sparse orange sparks, premium painted game splash art, 16:9 composition. No text, logo, watermark, HUD, frame or recognizable existing franchise design.
```

## 8. 액티브 스킬 아이콘 10종

출력: `ui/skill-icons.png`, 분할본 `ui/icons/*.webp`

순서: homingMissiles, glacialGrenade, gravityWell, flameBeam, chainLightning, autoTurret, landmines, orbitingBlades, iceBarrier, attackDrone.

```text
Create ten original square ability icons in a clean 5-column by 2-row atlas for a dark sci-fi isometric action game. Row-major subjects: paired homing missiles; frost grenade and snowflake burst; violet gravity well; orange continuous flame beam; blue chain lightning; cyan automated gun turret; triangular landmine cluster; three orbiting energy blades; crystalline ice barrier; compact attack drone. Each icon uses one bold central silhouette, deep navy/black background, luminous elemental color, painted energy, high contrast and consistent graphite bevel treatment. Keep every effect inside its cell with equal gutters. No words, numbers, letters, logo, watermark or duplicated subject.
```

## 9. 패시브 강화 아이콘 16종

출력: `ui/upgrade-icons.png`, 분할본 `ui/upgrades/*.webp`

순서: reinforcedRounds, rapidFire, penetration, multishot, ricochet, precisionSight, largeCaliber, explosiveRounds, focusedFire, combatMobility, lightweightArmor, reinforcedArmor, coolantUnit, xpMagnet, emergencyRepair, enhancedDash.

```text
Create sixteen original passive-upgrade icons in an exact 4-column by 4-row atlas for a dark sci-fi action game. Row-major subjects: reinforced ammunition, rapid-fire mechanism, armor-piercing round, multishot spread; ricochet trajectory, precision optic, large-caliber cartridge, explosive ammunition; focused-fire reticle, combat mobility boot, lightweight armor, reinforced armor; coolant module, experience magnet, emergency repair kit, enhanced dash thruster. One centered readable object or symbol per square, consistent dark graphite frame, cyan allied glow with restrained orange highlights, premium painted game-icon finish. Equal gutters, no overlaps, text, letters, numbers, logo or watermark.
```

## 10. 투사체·설치물·결정 프롭

출력: `game/props-atlas.png`, 분할본 `game/props/*.png`

순서: bullet, missile, enemy-projectile, xp-crystal, elite-crystal, landmine, turret, drone.

```text
Create eight original transparent gameplay props in a precise 4-column by 2-row atlas for a dark sci-fi 2D isometric action game. Row-major subjects: bright cyan rifle bullet/tracer; compact white-red homing missile; hostile magenta energy projectile; small cyan experience crystal; larger faceted orange elite crystal; low circular proximity landmine; compact cyan automated turret; small blue attack drone. Fixed three-quarter top-down camera where applicable, consistent physical scale, strong small-screen silhouettes, graphite hard-surface detail and contained emissive glow. Center each complete object with empty gutters. Transparent background or one removable chroma key; no cast shadow, labels, grid lines, logo or watermark.
```

## 색 제거와 분할 기준

- 키 배경은 피사체의 반투명 발광 가장자리를 최대한 유지하도록 색 거리 기반으로 제거합니다.
- 시트는 캔버스 전체를 명시된 열·행으로 균등 분할하며 셀 순서를 바꾸지 않습니다.
- 아이콘 분할본은 정사각형으로 맞추고 UI에서는 `object-fit: cover` 또는 `contain`으로 사용합니다.
- 런타임 시트 규격: 플레이어 4×2, 적 4×3, VFX 4×2. 이 규격을 바꾸면 `src/game/runtime/assets.ts`의 슬라이싱 값도 함께 변경해야 합니다.
