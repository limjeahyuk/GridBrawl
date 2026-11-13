# 유물 100종

> **유물 규칙의 기준 문서.** 유물의 목록 · 효과 · 얻는 곳 · 합치는 법은 여기 한 곳에만 적는다(다른 문서는 한 줄 요약 + 링크). 숫자는 코드(`src/game/relics.ts`)가 진실이다 — 다르면 코드가 이긴다.
> **0절 = 지금 코드**(2026-11-13에 코드와 한 줄씩 대조 — 0-7의 표는 `RELICS`에서 그대로 뽑았다). **1절 = 임시 · 미정**(사용자 결정 대기). **2절 = 경위**(167 → 100).
> 등급별 확률(보상표) · 가격처럼 "어디서 얼마나 나오나"의 숫자는 그 칸의 문서가 기준이다 — [RUN.md](RUN.md) ⑤ · [INN_SMITH.md](INN_SMITH.md) · [GOBLIN_MERCHANT.md](GOBLIN_MERCHANT.md) · [EVENTS.md](EVENTS.md).

## 0. 지금 코드

### 0-1. 한눈에

- **유물 100종**(`RELICS`) = 일반 22 · 희귀 29 · 영웅 24 · 전설 25. 그중 **보상 풀 98**(`REWARD_RELICS`) + **이벤트 전용 2**(`eventOnly`).
- 유물 하나 = 엔진 패시브 훅 묶음(`effect` — 전투 안) + 런 보정(`mods` — 전투 밖: 골드 % · 상점 할인 · 보상 칸 · 진열 칸 · 회복 % · 유물 확률).
- 런은 **유물 0개**로 시작한다. 가진 유물은 다시 안 나오고, 같은 유물은 겹쳐 붙지 않는다(`grantRelic`). 보유 한도는 없다.
- 유물로 최대 체력이 늘면 현재 체력도 그만큼 오른다. 유물을 잃어(`loseRelic` — 이벤트 거래 · 쇠 두들기기 · 사슬) 최대 체력이 줄면 현재 체력도 그 안으로 깎인다.

### 0-2. ⚠ 직업 패시브는 유물이 아니다 (2026-11-09 사용자 확정)

- 서약의 돌무덤(전사) · 독니 화살통(궁수) · 혼백의 마법서(마법사)는 **직업에 붙은 패시브**다. `RELICS` · `run.relicIds` · 유물 줄 · 도감 유물 탭 · 보상 · 상점 · 거래 어디에도 없고, `mergeRelics(ids, charId)`가 직업에서 직접 얹는다(`classPassive`). 그래서 얻을 수도 · 잃을 수도 · 거래할 수도 없다. 유물로 되돌리지 말 것.
- 수치는 [BATTLE.md](BATTLE.md) ⑤(런 직업 패시브 표)가 기준이다 — 여기 다시 적지 않는다.
- `sig-warrior` · `sig-archer` · `sig-mage`는 **아이콘 아틀라스 키로만** 남아 있다(영웅 선택 화면 등의 패시브 그림). 유물 id가 아니다. `npm run check`가 "유물 목록에 `sig-*`가 없다"를 지킨다.

### 0-3. 얻는 곳

| 곳 | 무엇이 나오나 | 뽑는 함수 | 확률 · 값의 기준 문서 |
| --- | --- | --- | --- |
| 일반 전투 보상 | 낮은 확률로 카드 한 칸이 **일반** 유물로 바뀐다(확률은 `relicChanceBonus` 유물로 오른다) | `rollRewards` → `rollRelicOf(COMBAT_RELIC_ODDS)` | [RUN.md](RUN.md) ⑤ |
| 엘리트 보상 | **희귀** 유물 1칸 확정(낮은 확률로 영웅) | `rollRelicOf(ELITE_RELIC_ODDS)` | [RUN.md](RUN.md) ⑤ |
| 1막 보스 보상 | **영웅** 유물 3개 중 1(칸마다 낮은 확률로 전설) | `rollRelicOf(BOSS_RELIC_ODDS)` | [RUN.md](RUN.md) ⑤ |
| 보물 칸 | 고르기 없이 하나(일반 · 희귀 · 드물게 영웅) — 빈 상자 없음 | `openTreasure` → `rollRelicOf(TREASURE_RELIC_ODDS)` | [RUN.md](RUN.md) ③ · ⑤ |
| 여관 상점 | 유물 2칸(`SHOP_RELIC_SLOTS`) — 전 등급, 깊이 가중 | `rollShop` → `rollRelicId` | [INN_SMITH.md](INN_SMITH.md) |
| 고블린 장사꾼 | 가난 0 · 중간 1(일반~희귀) · 부자 2(희귀 이상 · 전설 가중 최대). 덮쳐 이긴 부자 = 유물 1 확정 | `rollGoblinShop` · `applySpecialWin` | [GOBLIN_MERCHANT.md](GOBLIN_MERCHANT.md) |
| ? 이벤트 | 태그 풀(`iron` · `poison` · `heart` · `hand` · `foot`) 또는 `any`(깊이 가중 무작위) · 거래(카드 ↔ 유물 · 유물 ↔ 유물) · 정해진 유물(차가운 쇠 · 의문의 씨앗 · 타오르는 알) | `relicFromPool` · `rollRelicId` | [EVENTS.md](EVENTS.md) "유물 풀" |
| 이벤트 사슬의 끝 | **이벤트 전용 2종**(0-4) | `events.ts` | [EVENTS.md](EVENTS.md) "이벤트 사슬" |

- 위 곳은 **전부 `REWARD_RELICS`(98종 · 미보유)에서만** 뽑는다 — 이벤트 전용 2종은 사슬의 그 선택지로만 나온다.
- 등급을 정하고 뽑는 곳(`rollRelicOf` — 전투 · 엘리트 · 보스 · 보물)은 그 등급에 남은 유물이 없으면 그 표의 다른 등급 → 그래도 없으면 깊이 가중 아무 유물로 넘어간다.
- **대체 보상은 없다**(2026-11-13 사용자 지정). 꼭 줘야 하는 곳(보물 · 이벤트 · 거래)은 미보유가 하나도 없으면 아무 유물(`anyRewardRelicId` — 가진 유물이면 그대로다). 98종을 다 가질 일은 사실상 없다.

**깊이 가중**(`rarityWeightAt` — 상점 · 고블린 · 이벤트 `any`가 쓴다. "깊이"는 `runDepth` 1 ~ 15 — [RUN.md](RUN.md) ③):

| 등급 | 가중치 | 깊이 1 | 깊이 15 |
| --- | --- | --- | --- |
| 일반 | `max(4, 10 − 0.4 × 깊이)` | 9.6 | 4.0 |
| 희귀 | 6 | 6 | 6 |
| 영웅 | `3 × (1 + 깊이 / 10)` | 3.3 | 7.5 |
| 전설 | `1 + 깊이 / 6` | ≈1.2 | 3.5 |

유물 한 개의 가중치이고 풀에 남은 유물을 다 더해 뽑는다(전설 한 칸이 나올 확률 ≈ 깊이 1에서 6% · 15에서 17%). 부자 고블린은 늘 깊이 15로 뽑는다.

### 0-4. ⚠ 이벤트 전용 유물 — 보상 · 상점 · 고블린에 새면 안 된다

| 유물 | 얻는 길 |
| --- | --- |
| 세계수의 가지 (`worldtree`) | 세계수 이벤트 "영양분을 뿌린다" — 「의문의 씨앗」 + 「영양가루」를 잃고 받는다 |
| 불사조의 깃털 (`phoenixfeather`) | 불사조 이벤트 히든 선택지 — 「타오르는 알」을 건네고 받는다 |

- `Relic.eventOnly: true` → `REWARD_RELICS`에서 빠진다 → 보상 · 보물 · 상점 · 고블린 · 이벤트 무작위 · 거래 어디에도 안 나온다. 도감에는 "이벤트 전용" 표시로 나온다.
- `npm run check`가 지킨다 — "가지 · 깃털은 보상 풀에 없다" · "세계수의 가지는 보상 · 상점 · 고블린에 안 나온다"(직업마다 300번 굴려 본다).
- 사슬의 **재료**(의문의 씨앗 · 타오르는 알 · 영양가루)는 이벤트 전용이 **아니다** — 보상 풀에도 있다.
- 이벤트 전용 **카드**(「세계수의 가호」)는 [EVENTS.md](EVENTS.md).

### 0-5. 여러 유물을 합치는 법 (`mergeRelics` · `mergeRunMods`)

- **숫자 훅은 더하고, 켜짐 훅(`alwaysPierce` · `shieldBreak` · `burnImmune`)은 하나라도 있으면 켜진다.** 직업 패시브를 먼저 깔고 유물을 얹는다. 훅 이름을 나열하지 않고 `effect`의 키를 그대로 훑으므로 새 훅도 자동으로 붙는다.
- **누적 기력 트리거(`energyTriggers`)는 합치지 않고 이어 붙인다** — 주기가 다른 트리거가 각자 따로 터진다.
- 런 보정(`mods`)도 더한다. **상점 할인만 80%에서 멈춘다.** 할인은 상점 · 여관 휴식 · 대장간 값에 모두 걸린다.
- **전투당 횟수**(`stunCap` · `freezeCap`)도 숫자라 **더해진다**. 횟수를 안 적은 유물은 0을 보태고, 합이 비어 있을 때만 엔진 기본값(기절 1 · 빙결 2)을 쓴다 — 그래서 설명과 어긋나는 조합이 있다(1절 표).
- 기절 · 빙결 유물이 거는 봉인은 **늘 1턴**(다음 턴까지)이다 — 값이 더해져도 길어지지 않는다. 길이를 늘리는 건 연장 훅뿐([STATUS.md](STATUS.md) 0절).
- ⚠ **런 전용 훅**(`burnImmune` · `maxEnergyBonus` · `openingShield` · 연장 훅 `poisonRoundBonus` · `burnRoundBonus` · `bindRoundBonus` 등 다섯)은 유물 · 직업 패시브(런)에만 — `ROSTER.passive` · 몬스터에 넣지 말 것(`RULES_VERSION` 불변의 근거 · `npm run check`).
- ⚠ 훅 이름 `turnEnergy` · `turnShield` · `*RoundBonus`는 이름만 옛것이다 — 앞의 둘은 **라운드**마다, 봉인 연장(`bind` · `stun` · `freeze`)의 값은 **턴**이다.
- 상태이상 훅의 뜻(중독 · 화상 겹 더하기 · 위력 %는 중독 전용 · 회복량 %는 회복 카드에만)은 [STATUS.md](STATUS.md)가 기준이다.

### 0-6. 그림

- 아틀라스 `public/redesign/ui/relics/`(`atlas-full` 26px · `atlas-mini` 16px · 실루엣) · 좌표 `src/art/relicAtlas.ts`의 `RELIC_ATLAS` — 100칸 = 유물 97 + 직업 패시브 3(`sig-*`). 굽는 도구는 [docs/design/README.md](../design/README.md).
- **그림 없는 유물 3종**(이모지로 나온다): 타오르는 알 `fireegg` 🥚 · 영양가루 `nutrient` ✨ · 불사조의 깃털 `phoenixfeather` 🪶.
- 표의 "그림" 열 = 아틀라스의 **발동 방식**(유물 줄에서 어떻게 보이나): 발동 · 상시 · 조건 · 런 · 첫 라운드 · 누적 · 횟수. **"런"**은 전투 줄에 안 놓이고 지도에서만 보인다(`battleRelics`).
- 어떤 유물이 터졌는지는 엔진이 안 알려 준다 — `ui/relicFx.ts`가 스텝 결과에서 추정한다(연출 전용).

### 0-7. 유물 표 (100종 — 등급별 · id 순)

"효과"는 게임에 나오는 문구(`Relic.desc`) 그대로, "훅"은 실제 값(`effect` · `mods.*`)이다. "합쳐진" 열은 2026-11-12 정리 때 이 유물로 묶여 사라진 옛 유물(2절).

#### 일반 22종

| 유물 | 효과(게임 문구) | 훅 | 그림 | 합쳐진(빠진) 유물 |
| --- | --- | --- | --- | --- |
| 예비 배터리 (`battery`) | 매 라운드 기력 +4. 어느 세계에서 굴러떨어진 쇳덩이. 정체는 아무도 모른다. | `turnEnergy 4` | 발동 | 불티 부적 |
| 단단한 손잡이 (`buckler`) | 수비 카드의 흡수량 +35%. | `guardPowerPct 35` | 상시 |  |
| 차가운 쇠 (`coldiron`) | 상태이상에 걸린 상대에게 주는 피해 +3. | `bonusVsAfflicted 3` | 상시 |  |
| 궁지의 이빨 (`cornered`) | 체력이 절반 이하면 내 공격 피해 +20%. | `lowHpBonusPct 20` | 조건 |  |
| 상인의 인증패 (`coupon`) | 상점 가격 20% 할인. | `mods.shopDiscountPct 20` | 런 | 상인의 장부 |
| 수정 방벽 (`crystal`) | 매 라운드 보호막 +6. | `turnShield 6` | 발동 | 작은 화로, 명상의 룬 |
| 잉걸 낙인 (`emberbrand`) | 공격으로 피해를 주면 화상 1겹을 묻힌다. | `burnOnHit 1` | 발동 |  |
| 송곳니 (`fang`) | 공격으로 피해를 주면 체력 3 회복. | `lifesteal 3` | 발동 |  |
| 마무리 칼 (`finisher`) | 상대 체력이 절반 이하면 내 공격 피해 +25%. | `executeBonusPct 25` | 조건 |  |
| 선제 방벽 (`firstguard`) | 전투 첫 라운드에 보호막 +20. | `openingShield 20` | 첫 라운드 | 불씨 지피기, 전쟁 나팔 |
| 동상의 손 (`frostbite`) | 전투당 두 번, 피해를 주면 상대를 다음 턴 빙결. | `freezeOnHit 1` | 횟수 |  |
| 심장 강화 (`heart`) | 최대 체력 +15. | `maxHpBonus 15` | 상시 |  |
| 무쇠 신발 (`ironshoes`) | 구멍에 빠졌을 때 받는 피해 -4. | `collapseResist 4` | 상시 |  |
| 두꺼운 판금 (`plating`) | 받는 피해 -3. | `damageReduction 3` | 상시 |  |
| 약초 습포 (`poultice`) | 회복 카드 회복량 +40%. | `healPowerPct 40` | 상시 | 소금 주머니 |
| 점화약 (`primer`) | 전투 시작 기력 +13. | `startEnergyBonus 13` | 첫 라운드 | 마른 장작 |
| 두툼한 지갑 (`purse`) | 전투 승리 골드 +35%. | `mods.goldBonusPct 35` | 런 |  |
| 성급한 각성 (`quickcharge`) | 매 라운드 기력 +5, 내 공격 피해 +2. | `turnEnergy 5` `attackBonus 2` | 발동 |  |
| 안장 가방 (`saddlebag`) | 승리 보상 선택지 +1칸. | `mods.rewardOptions 1` | 런 | 확장 가방 |
| 부싯돌 (`sparkplug`) | 기력을 70 쓸 때마다 보호막 +13. | `기력 70마다 shield 13` | 누적 |  |
| 가시 갑옷 (`thorns`) | 피해를 입으면 공격자에게 4 반사. | `thorns 4` | 발동 | 가시철선 |
| 독약 플라스크 (`venomflask`) | 공격으로 피해를 주면 중독 1겹을 묻힌다. | `poisonOnHit 1` | 발동 |  |

#### 희귀 29종

| 유물 | 효과(게임 문구) | 훅 | 그림 | 합쳐진(빠진) 유물 |
| --- | --- | --- | --- | --- |
| 수호의 원석 (`aegis-core`) | 매 라운드 보호막 +9. | `turnShield 9` | 발동 | 방벽판, 균형의 저울, 달빛 샘 |
| 고정 말뚝 (`anchorstone`) | 구멍에 빠졌을 때 받는 피해 -7, 최대 체력 +8. | `collapseResist 7` `maxHpBonus 8` | 상시 |  |
| 치유 향유 (`balm`) | 모든 회복 효과 +50%(보상 포기·이벤트·상점). | `mods.healBonusPct 50` | 런 | 비약, 피의 잎사귀 |
| 뼈 발라내기 (`bonepicker`) | 상태이상에 걸린 상대에게 피해 +5. | `bonusVsAfflicted 5` | 상시 |  |
| 파쇄 날 (`breaker`) | 공격이 적중하면 상대 보호막을 전부 없앤다. | `shieldBreak` | 발동 | 면도날 파편 |
| 가시 방패 (`bulwark`) | 매 라운드 보호막 +4, 피격 시 3 반사. | `turnShield 4` `thorns 3` | 발동 | 대못 갑옷, 고슴도치 갑주 |
| 행상 마차 (`caravan`) | 상점 진열 +2칸. | `mods.shopExtraItems 2` | 런 |  |
| 잿불 인장 (`cinderbrand`) | 피해를 주면 화상 2겹을 묻힌다. | `burnOnHit 2` | 발동 |  |
| 순환의 매듭 (`circuit`) | 기력을 50 쓸 때마다 체력을 13 회복한다. | `기력 50마다 heal 13` | 누적 | 응결의 수정, 마비의 가시, 흡혈의 반지, 질풍의 고동 |
| 한파 (`coldsnap`) | 전투당 두 번 빙결을 걸고, 내가 거는 중독 위력 +25%. | `freezeOnHit 1` `statusPowerPct 25` | 횟수 | 빙하의 파편 |
| 탐색가의 나침반 (`compass`) | 승리 보상 선택지 +1칸. | `mods.rewardOptions 1` | 런 | 사서의 색인 |
| 잿불 심장 (`emberheart`) | 체력이 절반 이하면 내 공격 피해 +25%, 매 라운드 체력 +2. | `lowHpBonusPct 25` `regen 2` | 조건 | 고통의 제단 |
| 무덤의 약조 (`gravepact`) | 전투당 한 번 체력 18로 되살아난다. 받는 피해 -2. | `revive 18` `damageReduction 2` | 횟수 | 불씨 심지 |
| 망나니의 도끼 (`headsman`) | 상대 체력이 절반 이하면 내 공격 피해 +45%. | `executeBonusPct 45` | 조건 | 독수리 눈 |
| 강철 의지 (`ironwill`) | 받는 피해 -5. | `damageReduction 5` | 상시 |  |
| 출진의 북 (`jumpstart`) | 전투 시작 기력 +20. | `startEnergyBonus 20` | 첫 라운드 | 마력의 샘 |
| 흡성의 룬 (`leech-rune`) | 공격으로 피해를 주면 체력 5 회복. | `lifesteal 5` | 발동 | 수확자의 낫 |
| 행운의 편자 (`luckycharm`) | 일반 전투 보상에 유물이 섞일 확률 +8%p. | `mods.relicChanceBonus 0.08` | 런 |  |
| 황금손 (`midastouch`) | 전투 승리 골드 +55%. | `mods.goldBonusPct 55` | 런 |  |
| 영양가루 (`nutrient`) | 최대 체력 +10, 최대 기력 +10. | `maxHpBonus 10` `maxEnergyBonus 10` | ❌ 이모지 ✨ |  |
| 광휘의 각성 (`overdrive`) | 매 라운드 기력 +8. | `turnEnergy 8` | 발동 |  |
| 황소 심장 (`oxheart`) | 최대 체력 +19. | `maxHpBonus 19` | 상시 |  |
| 처벌자의 손 (`punisher`) | 전투당 두 번, 피해를 주면 상대를 다음 턴 기절시킨다. 받는 피해 -2. | `stunOnHit 1` `stunCap 2` `damageReduction 2` | 횟수 |  |
| 분노의 인장 (`rage`) | 내 공격 피해 +3. | `attackBonus 3` | 상시 | 괴력의 장갑 |
| 의문의 씨앗 (`seed`) | 매 라운드 체력 +5. | `regen 5` | 발동 | 재생의 씨앗, 생명꽃 |
| 탑 방패 (`towershield`) | 수비 카드의 흡수량 +60%. | `guardPowerPct 60` | 상시 | 가시 방패심 |
| 맹독 병 (`toxinvial`) | 피해를 주면 중독 2겹을 묻힌다. | `poisonOnHit 2` | 발동 | 역병 운반자 |
| 선봉대장 (`vanguard`) | 전투 첫 라운드에 보호막 +15. 내 공격 피해 +3. | `openingShield 15` `attackBonus 3` | 첫 라운드 |  |
| 사악한 절구 (`wickedmortar`) | 내가 거는 중독 위력 +40%. | `statusPowerPct 40` | 상시 |  |

#### 영웅 24종

| 유물 | 효과(게임 문구) | 훅 | 그림 | 합쳐진(빠진) 유물 |
| --- | --- | --- | --- | --- |
| 재의 폐 (`ashlung`) | 피해를 주면 화상 2겹·중독 1겹을 함께 묻힌다. | `burnOnHit 2` `poisonOnHit 1` | 발동 | 화형의 표식 |
| 암시장 통로 (`bazaar`) | 상점 진열 +3칸, 가격 25% 할인. | `mods.shopExtraItems 3` `mods.shopDiscountPct 25` | 런 | 암시장 카드, 만능 열쇠 |
| 개전의 봉화 (`bigbang`) | 전투 시작 기력 +28, 내 공격 피해 +3. | `startEnergyBonus 28` `attackBonus 3` | 첫 라운드 | 폭풍의 정수 |
| 넘치는 술잔 (`capacitor`) | 기력을 100 쓸 때마다 상대를 다음 턴 기절시킨다. | `기력 100마다 stun 1` | 누적 | 쉼 없는 물레, 집광 수정, 태양의 화로, 운명의 톱니, 동토의 숨결 |
| 연쇄 벼락 (`chainshock`) | 전투당 세 번, 내 공격이 피해를 주면 상대를 다음 턴 기절시킨다. | `stunOnHit 1` `stunCap 3` | 횟수 | 강타의 인장 |
| 결투가의 검 (`duelist`) | 내 공격 피해 +8. | `attackBonus 8` | 상시 | 광기의 낙인, 유리 심장, 파성추 |
| 불꽃 깃털 (`feather`) | 전투당 한 번, 체력 20으로 되살아난다. | `revive 20` | 횟수 | 재의 부적, 영원의 불씨, 두 번째 숨 |
| 타오르는 알 (`fireegg`) | 화상에 걸리지 않는다. | `burnImmune` | ❌ 이모지 🥚 |  |
| 성배 조각 (`grailshard`) | 모든 회복 효과 +80%, 회복 카드 회복량 +30%. | `healPowerPct 30` `mods.healBonusPct 80` | 런 | 생명의 우물 |
| 대송곳니 (`greatfang`) | 공격으로 피해를 주면 체력 6 회복. | `lifesteal 6` | 발동 |  |
| 단두대 (`guillotine`) | 상대 체력이 절반 이하면 내 공격 피해 +70%. | `executeBonusPct 70` | 조건 | 숨통 |
| 사냥꾼의 앙심 (`hunterspite`) | 상태이상에 걸린 상대에게 피해 +7. 보호막을 무시한다. | `bonusVsAfflicted 7` `alwaysPierce` | 상시 |  |
| 벼랑의 각오 (`lastditch`) | 체력이 절반 이하면 내 공격 피해 +50%. | `lowHpBonusPct 50` | 조건 | 배수진, 격노의 낙인 |
| 만년설 (`permafrost`) | 전투당 네 번, 피해를 주면 상대를 다음 턴 빙결. 내 공격 피해 +3. | `freezeOnHit 1` `freezeCap 4` `attackBonus 3` | 횟수 |  |
| 꿰뚫는 송곳 (`piercecore`) | 내 모든 공격이 상대 보호막을 관통한다. 최대 체력 -12. | `alwaysPierce` `maxHpBonus -12` | 상시 | 파쇄 송곳니 |
| 성벽의 맹세 (`rampart`) | 수비 카드의 흡수량 +80%, 최대 체력 +13. | `guardPowerPct 80` `maxHpBonus 13` | 상시 |  |
| 까마귀의 전조 (`ravenomen`) | 일반 전투 보상에 유물이 섞일 확률 +18%p. | `mods.relicChanceBonus 0.18` | 런 |  |
| 성역의 문장 (`sanctuary`) | 매 라운드 보호막 +7, 체력 +3. | `turnShield 7` `regen 3` | 발동 |  |
| 재생의 성소 (`sanctum`) | 매 라운드 체력 +6. | `regen 6` | 발동 | 활력의 정수 |
| 허공 걸음 (`skywalk`) | 구멍에 빠졌을 때 받는 피해 -12. | `collapseResist 12` | 상시 |  |
| 돌갗 (`stoneskin`) | 받는 피해 -7. | `damageReduction 7` | 상시 | 성채의 주춧돌 |
| 가시 왕관 (`thorncrown`) | 피해를 입으면 공격자에게 8 반사. | `thorns 8` | 발동 | 순교자의 못 |
| 거인의 심장 (`titanheart`) | 최대 체력 +30. | `maxHpBonus 30` | 상시 |  |
| 마녀의 탕약 (`witchbrew`) | 내가 거는 중독 위력 +65%. | `statusPowerPct 65` | 상시 |  |

#### 전설 25종

| 유물 | 효과(게임 문구) | 훅 | 그림 | 합쳐진(빠진) 유물 |
| --- | --- | --- | --- | --- |
| 금강석 갑주 (`adamant`) | 받는 피해 -9, 최대 체력 +13. | `damageReduction 9` `maxHpBonus 13` | 상시 |  |
| 불괴의 서약 (`aegisoath`) | 수비 카드의 흡수량 +120%, 첫 라운드 보호막 +20, 받는 피해 -3. | `guardPowerPct 120` `openingShield 20` `damageReduction 3` | 첫 라운드 |  |
| 피의 계약 (`bloodpact-relic`) | 내 공격 피해 +6. 공격으로 피해를 주면 체력 4 회복. 최대 체력 -7. | `attackBonus 6` `lifesteal 4` `maxHpBonus -7` | 발동 | 탐식의 이빨 |
| 뇌운의 고리 (`coil`) | 기력을 60 쓸 때마다 상대를 다음 턴 기절시키고 13 고정 피해를 준다. | `기력 60마다 stun 1 · damage 13` | 누적 |  |
| 거상의 뼈 (`colossus`) | 최대 체력 +35, 받는 피해 -3. 대신 내 공격 피해 -2. | `maxHpBonus 35` `damageReduction 3` `attackBonus -2` | 상시 | 거인 혈청 |
| 사경의 광기 (`deathwish`) | 체력이 절반 이하면 내 공격 피해 +100%. 최대 체력 -12. | `lowHpBonusPct 100` `maxHpBonus -12` | 조건 |  |
| 종말의 모래시계 (`doomclock`) | 기력을 38 쓸 때마다 상대에게 20 고정 피해. | `기력 38마다 damage 20` | 누적 |  |
| 여명의 불꽃 (`firstlight`) | 전투 시작 기력 +35, 첫 라운드 보호막 +23, 매 라운드 기력 +4. | `startEnergyBonus 35` `openingShield 23` `turnEnergy 4` | 첫 라운드 |  |
| 동사의 저주 (`freezerot`) | 전투당 세 번 빙결을 걸고, 피해를 주면 중독 2겹·화상 2겹을 묻힌다. | `freezeOnHit 1` `freezeCap 3` `poisonOnHit 2` `burnOnHit 2` | 횟수 |  |
| 신살자의 창 (`godslayer`) | 내 공격 피해 +10, 보호막을 무시한다. 최대 체력 -10. | `attackBonus 10` `alwaysPierce` `maxHpBonus -10` | 상시 |  |
| 얽매는 뿌리 (`grasproot`) | 내가 거는 속박이 2턴 더 간다. 받는 피해 -3. | `bindRoundBonus 2` `damageReduction 3` | 상시 |  |
| 왕의 봉인 (`kingsseal`) | 승리 보상 선택지 +2칸, 골드 +60%, 상점 진열 +2칸. | `mods.rewardOptions 2` `mods.goldBonusPct 60` `mods.shopExtraItems 2` | 런 | 점술 수정구 |
| 망각의 종 (`oblivion`) | 전투당 다섯 번, 피해를 주면 상대를 다음 턴 기절시킨다. | `stunOnHit 1` `stunCap 5` | 횟수 | 침묵의 종 |
| 영원의 수레바퀴 (`perpetual`) | 매 라운드 기력 +12, 보호막 +5. | `turnEnergy 12` `turnShield 5` | 발동 |  |
| 불사조의 깃털 (`phoenixfeather`) · **이벤트 전용** | 전투당 한 번, 체력 40으로 되살아난다. 화상에 걸리지 않는다. | `revive 40` `burnImmune` | ❌ 이모지 🪶 |  |
| 잿불의 격정 (`phoenixrage`) | 체력이 절반 이하면 피해 +80%. 전투당 한 번 체력 15으로 되살아난다. | `lowHpBonusPct 80` `revive 15` | 횟수 |  |
| 사신의 장막 (`reaperveil`) | 상대 체력이 절반 이하면 내 공격 피해 +100%. 보호막을 무시한다. | `executeBonusPct 100` `alwaysPierce` | 조건 | 공허의 왕관 |
| 심층 저수조 (`reservoir`) | 기력을 30 쓸 때마다 체력 +6, 보호막 +6, 기력 +10. | `기력 30마다 heal 6 · shield 6 · energy 10` | 누적 |  |
| 응보의 문장 (`retribution`) | 피격 시 11 반사, 받는 피해 -2. | `thorns 11` `damageReduction 2` | 발동 |  |
| 서릿발 심장 (`rimeheart`) | 전투당 여섯 번, 피해를 주면 상대를 다음 턴 빙결. 상태이상 상대에게 피해 +6. | `freezeOnHit 1` `freezeCap 6` `bonusVsAfflicted 6` | 횟수 | 빙하의 관 |
| 부패의 왕관 (`rotcrown`) | 피해를 주면 중독 2겹·화상 2겹을 함께 묻히고, 중독 위력 +50%, 상태이상 상대에게 피해 +5. | `poisonOnHit 2` `burnOnHit 2` `statusPowerPct 50` `bonusVsAfflicted 5` | 발동 | 역병군주의 인장 |
| 마녀의 안식일 (`sabbath`) | 내가 중독 · 화상을 걸 때 각각 1겹 더. | `poisonRoundBonus 1` `burnRoundBonus 1` | 상시 | 썩어드는 모래시계, 꺼지지 않는 잉걸 |
| 공허의 날 (`voidedge`) | 내 모든 공격이 상대 보호막을 무시하고 관통한다. | `alwaysPierce` | 상시 |  |
| 세계의 기둥 (`worldpillar`) | 구멍에 빠져도 피해가 없고, 매 라운드 보호막 +6. | `collapseResist 99` `turnShield 6` | 발동 |  |
| 세계수의 가지 (`worldtree`) · **이벤트 전용** | 회복 카드 회복량 +200%, 매 라운드 체력 +10, 최대 체력 +15, 최대 기력 +15. | `healPowerPct 200` `regen 10` `maxHpBonus 15` `maxEnergyBonus 15` | 발동 |  |

### 0-8. 보스 유물 · 적 능력 아이콘 (유물이 아니다 — 표시용)

플레이어가 얻는 유물이 아니라 **몬스터 패시브를 유물 모양 아이콘으로 보여 주는 것**이다(`relicAtlas.ts`의 `FOE_ATLAS` · `relicFx.ts`의 `foeAbilities`). 값은 `monsters.ts`의 `passive`가 진실이고 설명은 그 값에서 만든다.

| 보스 | 아이콘 id | 이름 | 효과(`passive`) |
| --- | --- | --- | --- |
| 수호기사 `warden` | `boss-w-wall` | 수호의 방벽 | 매 라운드 보호막 +6 |
| 수호기사 | `boss-w-plate` | 흑철 판금 | 받는 피해 -4 |
| 수호기사 | `boss-w-pulse` | 서약의 맥동 | 매 라운드 기력 +4 |
| 화염군주 `pyrelord` | `boss-p-fist` | 용암 주먹 | 공격 피해 +4 |
| 화염군주 | `boss-p-core` | 재 속의 핵 | 전투당 한 번, 체력 25로 되살아난다 |
| 화염군주 | `boss-p-ember` | 불씨 모으기 | 매 라운드 기력 +5 |
| 오버로드 `overlord` | `boss-o-crown` | 마왕의 관 | 매 라운드 기력 +8 |
| 오버로드 | `boss-o-veil` | 심연의 장막 | 매 라운드 보호막 +5 |
| 오버로드 | `boss-o-scale` | 검은 비늘 | 받는 피해 -3 |
| 오버로드 | `boss-o-second` | 두 번째 형상 | 전투당 한 번, 체력 30으로 되살아나 2페이즈 |

나머지 몬스터는 훅마다 공용 아이콘을 쓴다:

| id | 이름 | 뜻 |
| --- | --- | --- |
| `enemy-turnEnergy` | 기력 충전 | 매 라운드 기력 +N |
| `enemy-turnShield` | 방벽 | 매 라운드 보호막 +N |
| `enemy-damageReduction` | 단단한 몸 | 받는 피해 -N |
| `enemy-attackBonus` | 흉포 | 공격 피해 +N |
| `enemy-lifesteal` | 흡혈 | 피해를 주면 체력 N 회복 |
| `enemy-regen` | 재생 | 매 라운드 체력 +N |
| `enemy-revive` | 분열 · 부활 | 쓰러지면 체력 N으로 한 번 되살아난다 |
| `unknown` · `unknown-foe` | ??? | 아직 드러나지 않은 능력(내 것 · 적 것) |

## 1. 임시 · 미정 (사용자 결정 대기 — 지금 코드에는 아래 "지금" 값이 들어 있다)

| 무엇 | 지금 | 남은 결정 |
| --- | --- | --- |
| 발판 4종 — 무쇠 신발 · 고정 말뚝 · 허공 걸음 · 세계의 기둥(`collapseResist`) | 구멍에 빠진 피해 -4 · -7 · -12 · 무시(2026-11-13 임시 — 전장 붕괴를 없애며 돌림) | 사용자가 추후 재정의 — [HAZARDS.md](HAZARDS.md) |
| 얽매는 뿌리 (`grasproot`) | 속박 +2턴(2026-11-13 임시) | 추후 조정 |
| 불사조의 깃털 (`phoenixfeather`) | 부활 40 + 화상 면역 — 기획서에 없어 정한 값 | 확정 필요 |
| 마법사 직업 패시브(유물 아님) | 화상 2를 뺀 자리가 비어 있다 | 다른 효과는 사용자가 추후 정한다 — [BATTLE.md](BATTLE.md) ⑤ |
| 빙결 횟수 표시 — 동상의 손 · 한파 | 설명 · 엔진은 "전투당 두 번", 유물 줄의 점은 1개만 그린다 | 표시 버그 — [PROGRESS.md](../PROGRESS.md) 2-ter-b |
| 빙결 · 기절 횟수 합산(0-5) | 동상의 손 + 만년설 = 4번(설명을 더하면 6번) | 결정 필요 — [PROGRESS.md](../PROGRESS.md) 2-ter-b |
| 치유 향유 · 성배 조각 문구 | "모든 회복 효과(보상 포기 · 이벤트 · 상점)" — 실제로 붙는 곳은 여관 휴식 · 떠날 때 회복 · 이벤트 회복 · 고블린 물약(`healHp`) | 문구를 고칠지 |
| 그림 없는 3종(0-6) | 이모지 | 그림 필요 |
| 출혈 유물 | 없다(훅도 없다) | 사용자가 추후 넣는다 — [STATUS.md](STATUS.md) 3절 |

## 2. 경위 — 167 → 100 (지금 규칙 아님)

- 원래 167종(직업 "시그니처 유물" 3 포함)이었다. 같은 그림 + 같은 등급이 겹치던 것을 하나로 묶어 **67종을 지웠다**(2026-11-12 코드 반영 · 사용자 지정) — 남긴 유물의 효과는 그대로다. 묶인 이름은 0-7 표의 "합쳐진" 열. 원본 목록은 `docs/design/relics-source.json` · `relics-100.json`.
- 2026-11-09 — 직업 패시브 3종(`sig-*`)을 유물에서 뺐다(0-2). 「치유의 이끼」(`nanobot`)를 지우고 그 자리(그림도)를 「의문의 씨앗」(`seed`)이 이었다. 이벤트 사슬 유물(타오르는 알 · 영양가루 · 불사조의 깃털)을 더했다.
- 2026-11-10 — 덱 상한 유물을 없애며 안장 가방을 "보상 선택지 +1칸"으로 바꿨다. 시작 보호막 유물 7종 값 ÷2.
- 2026-11-12 — 정리안의 「세계수 가지」와 사슬 끝 「세계수의 가지」를 **한 유물**로(이벤트 전용 · 같은 날 사용자 버프). 회복량 %(`healPowerPct`)는 회복 카드에만. 중독 개편으로 문구 정리 · 가격 상향.
- 2026-11-13 — 화상 · 이동불가 개편으로 문구 정리(위력 % = 중독 전용 · 봉인 1턴), 발판 4종을 구멍 피해 감소로(임시).
- 그래서 지금 100종 = 정리안에서 남은 97(직업 패시브 3을 뺀 수) + 사슬 3. 더 옛 경위 · 밸런스 측정은 [HISTORY.md](../HISTORY.md).
