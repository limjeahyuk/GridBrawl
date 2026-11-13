import json
from collections import defaultdict
import relic_icons as ri
rel = json.load(open('/home/claude/rx/relics.json'))
CUT_LEGEND = {'썩어드는 모래시계', '꺼지지 않는 잉걸', '역병군주의 인장', '거인 혈청', '공허의 왕관', '침묵의 종', '빙하의 관', '점술 수정구', '탐식의 이빨'}
PREFER = {'fang', 'thorns', 'crystal', 'rage', 'feather', 'punisher', 'lastditch', 'purse', 'compass', 'firstguard',
          'bulwark', 'leech-rune', 'greatfang', 'heart', 'coil'}
LEGEND_MERGE = {'썩어드는 모래시계': '마녀의 안식일', '꺼지지 않는 잉걸': '마녀의 안식일', '역병군주의 인장': '부패의 왕관',
                '거인 혈청': '거상의 뼈', '공허의 왕관': '사신의 장막', '침묵의 종': '망각의 종', '빙하의 관': '서릿발 심장',
                '점술 수정구': '왕의 봉인', '탐식의 이빨': '피의 계약'}
groups = defaultdict(list)
for r in rel:
    if r['rarity'] == 'legend':
        continue
    groups[(ri.art_key(r), r['rarity'])].append(r)
keep, merged = [], {}
for k, v in groups.items():
    pref = [x for x in v if x['id'] in PREFER]
    pick = pref[0] if pref else sorted(v, key=lambda x: (len(x['effect']) + len(x['mods']), x['id']))[0]
    keep.append(pick)
    merged[pick['id']] = [x['id'] for x in v if x is not pick]
byname = {r['name']: r for r in rel}
for r in rel:
    if r['rarity'] == 'legend' and r['name'] not in CUT_LEGEND:
        keep.append(r); merged[r['id']] = [byname[n]['id'] for n, t in LEGEND_MERGE.items() if t == r['name']]
print(len(keep))
ids = [r['id'] for r in keep]
json.dump(dict(keep=ids, merged=merged), open('/home/claude/gb/relics100.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(r['rarity'] for r in keep))
