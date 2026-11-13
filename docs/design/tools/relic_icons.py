"""Relic icons for all relics in src/game/relics.ts.
Each relic = family glyph (14×14, picked from its defining effect) + secondary-effect badge + rarity frame.
  full  26×26  (reward / tooltip / codex, shown ×3)
  mini  16×16  (status-bar row, shown ×2)
"""
import json, math, os, colorsys
import numpy as np
from PIL import Image
from pix import sprite, outline, blend_over, over, Layer, hx
from rig import glow

PAL = dict(
    W='#ffffff', w='#e8e4f0', s='#a8b0c0', S='#5a6274', k='#2a2438',
    y='#f4d470', Y='#c9952f', u='#7a5418', f='#fff0a8',
    r='#e0485a', R='#8a1a2a', p='#ff9aa8',
    o='#ff8a3a', O='#a8401a',
    l='#b0ec70', g='#5ab040', d='#24602a',
    b='#5aa8ff', B='#2a4a9a', c='#b8f0ff',
    v='#b48cff', V='#5a2aa0', m='#e8c8ff',
    n='#9a6a40', N='#5a3820', t='#d0a878',
    e='#ece0c4', E='#a8987a', x='#3a3448', h='#7a7488',
    j='#454057', J='#6e6886',
)
from legend_glyphs import LEGEND, LEGEND_BY_NAME, BOSS, BOSS_META, ENEMY, UNKNOWN

G = {}
G['heart'] = '''
..rrr....rrr..
.rpprr..rrrrr.
rppprrrrrrrrrR
rpprrrrrrrrrrR
rprrrrrrrrrrrR
rrrrrrrrrrrrrR
.rrrrrrrrrrrR.
..rrrrrrrrrR..
...rrrrrrrR...
....rrrrrR....
.....rrrR.....
......rR......
'''
G['sword'] = '''
...........Ww.
..........Wws.
.........WwsS.
........WwsS..
.......WwsS...
......WwsS....
..y..WwsS.....
..yyyWsS......
...yYYS.......
...uYyy.......
..nNu.yy......
.nNu..........
.NN...........
'''
G['armor'] = '''
.sss......sss.
swwss....sswss
swsssSssSsssSS
.sswssSSssssS.
..swsssSsssS..
..swsssSsssS..
..sssssSssSS..
..swssyyysSS..
...sssSSssS...
...swssSssS...
....ssSSsS....
.....SSSS.....
'''
G['gem'] = '''
......cc......
.....cwbc.....
....cwbbbc....
...cwcbbbBc...
..cwcbbbbbBc..
.cwcbbbbbbbBc.
.cbbbbbbbbBBc.
..cbbbbbbBBc..
...cbbbbBBc...
....cbbBBc....
.....cBBc.....
......cc......
'''
G['bolt'] = '''
........yyyy..
.......yffy...
......yffy....
.....yffy.....
....yffyyyyy..
...yfffffffy..
...yyyyyffy...
......yffy....
.....yffy.....
....yffy......
...yfy........
...yy.........
'''
G['leaf'] = '''
..........ggg.
........gglgg.
......gglllgg.
.....glllllgg.
....glllldlg..
...gllldllgg..
...glldllgg...
..glldllgg....
..gldlggg.....
..gdggg.......
.ddgg.........
.d............
d.............
'''
G['fang'] = '''
...eeeeeeee...
..eeeeeeeeeE..
..eeeeeeeeeE..
...eeeeeeeE...
...eeeeeeeE...
....eeeeeE....
....eeeeeE....
.....eeeE.....
.....eeeE..r..
......eE..rr..
......eE..rR..
.......E...R..
'''
G['thorn'] = '''
......w.......
..w...s...w...
...s..s..s....
....sSSSSs....
.wssSkkkkSssw.
....SkxxkS....
.wssSkxxkSssw.
....SkkkkS....
....sSSSSs....
...s..s..s....
..w...s...w...
......w.......
'''
G['drop'] = '''
......r.......
.....rrr......
.....rrr......
....rprrr.....
....prrrr.....
...rprrrrr....
...rrrrrrR....
..rrrrrrrRR...
..rrrrrrrRR...
...rrrrrRR....
....rrrRR.....
.....RRR......
'''
G['feather'] = '''
...........fo.
.........ffoo.
........foooO.
.......fooooO.
......foooOO..
.....fooofO...
....fooffO....
...fooffO.....
...fofO.......
..ffoO........
..fO..........
.nO...........
.n............
'''
G['cog'] = '''
.....yy.yy....
..yy.yyyyy.yy.
..yyyyYYYyyyy.
...yyY...Yyy..
.yyyY.....Yyyy
.yyY...b...Yy.
..yY..bcb..Yy.
.yyY...b...Yy.
.yyyY.....Yyyy
...yyY...Yyy..
..yyyyYYYyyyy.
..yy.yyyyy.yy.
.....yy.yy....
'''
G['bag'] = '''
.....NNNN.....
......NN......
.....nttn.....
....nttttn....
...nttyyttn...
..nttyYYyttn..
..ntyYuuYytn..
.ntttyYYytttn.
.nttttyytttnn.
.Nnttttttttn..
..NNnnnnnnNN..
'''
G['tag'] = '''
......yyyyyyy.
.....yfffffYy.
....yfffffffy.
...yfffffffYy.
..yffffkkfffy.
.yffffk..kffy.
..yfffkkkffY..
...yfffffffy..
....yffffffY..
.....yfffYy...
......yyyy....
'''
G['compass'] = '''
....yyyyyy....
...yYuuuuYy...
..yYu.r..uYy..
.yYu..rr..uYy.
.yu...rRr..uy.
.yu...rR...uy.
.yu...sS...uy.
.yu..sSs...uy.
.yYu..ss..uYy.
..yYu.s..uYy..
...yYuuuuYy...
....yyyyyy....
'''
G['clover'] = '''
...gg...gg....
..glgg.glgg...
..gllgggllg...
...gllgllg....
.ggggldlgggg..
glllldddllllg.
.ggggldlgggg..
...gllgllg....
..gllggglg....
..glgg.dgg....
...gg..d......
.......d......
'''
G['pack'] = '''
.....nnnn.....
....n....n....
...NnnnnnnN...
..Nnttttttnn..
..ntyyttttnn..
..ntyYtttttn..
..nttttttttn..
..nNNNNNNNNn..
..nttttytttn..
..nttttYtttn..
..NnnnnnnnnN..
'''
G['jar'] = '''
.....NNNN.....
....nttttn....
.....ssss.....
....sssssS....
...swpppppS...
..swpppppppS..
..swrrrrrrrS..
..sprrrrrrrS..
..spRrrrrrRS..
...sRRRRRRS...
....SSSSSS....
'''
G['snow'] = '''
......c.......
....c.c.c.....
.....ccc......
.c...bcb...c..
..c..bcb..c...
...cbbcbbc....
cccccccccccc..
...cbbcbbc....
..c..bcb..c...
.c...bcb...c..
.....ccc......
....c.c.c.....
......c.......
'''
G['flask'] = '''
.....ssss.....
.....SnnS.....
......sS......
......sS......
.....sgdS.....
....sgllgS....
...sglllgdS...
..sglwlgggdS..
..sgllgggddS..
..sgggggdddS..
...sddddddS...
....SSSSSS....
'''
G['flame'] = '''
......o.......
.....oo.......
....oof...o...
...oofo..oo...
..oofffo.oo...
..offffooofo..
.oofffwffffo..
.offfwwwfffo..
.offwwwwwffo..
.ooffwwwffoo..
..oofffffoO...
...OOooooO....
'''
G['mortar'] = '''
...........n..
..........nN..
.........nN...
..v.l...nN.v..
...vlgvnN.....
.ssssssssssss.
.swssssssssS..
..swssssssS...
...sssssssS...
....sSSSSS....
....ss..SS....
...ssssSSSS...
'''
G['target'] = '''
.....rrrr.....
...rrwwwwrr...
..rww....wwr..
.rw..rrrr..wr.
.rw.rw..wr.wr.
rw.rw.yy.wr.wr
rw.rw.yy.wr.wr
.rw.rw..wr.wr.
.rw..rrrr..wr.
..rww....wwr..
...rrwwwwrr...
.....rrrr.....
'''
G['fist'] = '''
..ssssssss....
.swwwwwwwsS...
.swssssssSS...
.sssssssSSS...
..SSSSSSSS....
.....nN.......
.....nN.......
.....nN.....y.
.....nN....yy.
.....nN...yy..
.....nN..yy...
.....NN.......
'''
G['axe'] = '''
......ssss....
.....swwsss...
....swssssss..
....wsssssss..
....sss.nnSs..
....ss..n.SS..
.......n......
......n.......
.....n........
....n.........
...N..........
..N...........
'''
G['needle'] = '''
............W.
...........Ww.
..........Wws.
.........Wws..
........Wws...
.......Wws....
......Wws.....
.....Wws......
....yYs.......
...yYu........
..yYu.........
..Yu..........
'''
G['boot'] = '''
....NNNNNN....
....nnnnnN....
....ntnnnN....
....nnnnnN....
....ntnnnN....
....nnnnnN....
....nnnnnnN...
....nnnnnnnNN.
...nntnnnnnnn.
...nnnnnnnnnn.
...ssssssssss.
...SSSSSSSSSS.
'''
G['tower'] = '''
..s.s.s.s.s...
..sssssssss...
..swssssssS...
..swsSSssSS...
..swsBBssSS...
..swssssssS...
..swsssBssS...
..swssBBBsS...
..swssssssS...
..swsssssSS...
..ssssssssS...
..SSSSSSSSS...
'''
G['drum'] = '''
...........n..
..........n...
...rrrrrrrn...
..ryyyyyyyyr..
..rRRRRRRRRr..
..rewwewwewr..
..rewweewwer..
..rwewweewer..
..rewwewwewr..
..rRRRRRRRRr..
...rrrrrrrr...
'''
G['banner'] = '''
..n...........
..nyyyyyyyy...
..nyrrrrrrry..
..nyrwwwwrry..
..nyrwrrwrry..
..nyrwwwwrry..
..nyrrwwrrry..
..nyrrrrrry...
..nyrrr.rry...
..nyyy...yy...
..n...........
..n...........
'''
# signature relics
G['sig-warrior'] = '''
.....SSSS.....
....SsssSS....
....SswsSS....
...SSswsSSS...
...SsswssSS...
...SsswssSS...
...SssyssSS...
...SssyssSS...
...SssyssSS...
..SSsssssSSS..
.ggggggggggggg
.dgdgdgdgdgdgd
'''
G['sig-archer'] = '''
...W..W..W....
...s..s..s....
...o..o..o....
..nnnnnnnnnn..
..NnttttttnN..
..Nntyytttn...
..NnttttttnN..
..NnttttttnN..
..NnttttttnN..
..NnttttttnN..
..NNNNNNNNNN..
'''
G['sig-mage'] = '''
......yy......
.....y..y.....
....yYYYYy....
....Y.vv.Y....
...Y.vmmv.Y...
...Y.vmWv.Y...
...Y.vmmv.Y...
...Y..vv..Y...
....YYYYYY....
.....YuuY.....
......YY......
'''

BADGE = {
    'sword': '''
....W
...Ws
.yWs.
..ys.
.n.y.
''',
    'armor': '''
s...s
sswss
.sss.
.sSs.
..s..
''',
    'heart': '''
rr.rr
rprrr
rrrrR
.rrR.
..R..
''',
    'leaf': '''
...gg
.glgg
glgg.
gdg..
d....
''',
    'bolt': '''
...yy
..yy.
.yyyy
..yy.
.yy..
''',
    'thorn': '''
s.s.s
.nnn.
snNns
.nnn.
s.s.s
''',
    'fang': '''
eeeee
eeeeE
.eeE.
.eE..
..E..
''',
    'drop': '''
..r..
.rrr.
rprrr
rrrrR
.RRR.
''',
    'snow': '''
c.c.c
.ccc.
ccccc
.ccc.
c.c.c
''',
    'poison': '''
..g..
.glg.
glllg
glgdg
.ggd.
''',
    'flame': '''
..o..
.oo.o
offoo
ofwfo
.ooo.
''',
    'gem': '''
..c..
.cbc.
cwbbc
.cbB.
..c..
''',
    'down': '''
rrrrr
.rrr.
..r..
.....
.....
''',
    'pierce': '''
....W
...Ws
..Ws.
.yW..
y....
''',
}

FAMILY_COLOR = {}

RARITY = {
    'common': dict(base='#3a3644', light='#6a6478', dark='#1e1a26', rim='#8a849a', label='일반'),
    'rare': dict(base='#183a5a', light='#3a78b0', dark='#0c1e34', rim='#6ab8ff', label='희귀'),
    'epic': dict(base='#2e1650', light='#7040b8', dark='#170a2a', rim='#c48aff', label='영웅'),
    'legend': dict(base='#4a2a08', light='#c98a2a', dark='#241404', rim='#ffd86a', label='전설'),
    'boss': dict(base='#3a0a12', light='#a8202e', dark='#160408', rim='#ff4a3a', label='보스'),
    'enemy': dict(base='#2a1618', light='#5e2e2c', dark='#140a0a', rim='#c8604a', label='적'),
    'void': dict(base='#16131e', light='#2a2634', dark='#08070c', rim='#3a3448', label='미발견'),
}


def classify(r):
    e, m = r['effect'], r['mods']
    if r['id'].startswith('sig-'):
        return r['id']
    if e.get('energyTriggers'):
        return 'cog'
    if e.get('revive'):
        return 'feather'
    if m.get('goldBonusPct') and not m.get('shopDiscountPct'):
        return 'bag'
    if m.get('shopDiscountPct') or m.get('shopExtraItems'):
        return 'tag'
    if m.get('rewardOptions'):
        return 'compass'
    if m.get('relicChanceBonus'):
        return 'clover'
    if m.get('deckCapBonus'):
        return 'pack'
    if m.get('healBonusPct') or e.get('healPowerPct'):
        return 'jar'
    if e.get('freezeOnHit'):
        return 'snow'
    if e.get('poisonOnHit') and not e.get('burnOnHit'):
        return 'flask'
    if e.get('burnOnHit'):
        return 'flame'
    if e.get('statusPowerPct') or any(k.endswith('RoundBonus') for k in e):
        return 'mortar'
    if e.get('bonusVsAfflicted'):
        return 'target'
    if e.get('stunOnHit'):
        return 'fist'
    if e.get('executeBonusPct'):
        return 'axe'
    if e.get('lowHpBonusPct'):
        return 'drop'
    if e.get('alwaysPierce') or e.get('shieldBreak'):
        return 'needle'
    if e.get('collapseResist'):
        return 'boot'
    if e.get('guardPowerPct'):
        return 'tower'
    if e.get('startEnergyBonus'):
        return 'drum'
    if e.get('openingShield'):
        return 'banner'
    if e.get('lifesteal'):
        return 'fang'
    if e.get('thorns'):
        return 'thorn'
    if e.get('attackBonus', 0) > 0:
        return 'sword'
    if e.get('damageReduction'):
        return 'armor'
    if e.get('turnShield'):
        return 'gem'
    if e.get('turnEnergy'):
        return 'bolt'
    if e.get('regen'):
        return 'leaf'
    if e.get('maxHpBonus'):
        return 'heart'
    return 'gem'


BADGE_ORDER = [  # effect key → badge, first one that differs from the family wins
    ('attackBonus', 'sword'), ('damageReduction', 'armor'), ('lifesteal', 'fang'), ('thorns', 'thorn'),
    ('regen', 'leaf'), ('turnShield', 'gem'), ('turnEnergy', 'bolt'), ('poisonOnHit', 'poison'),
    ('burnOnHit', 'flame'), ('freezeOnHit', 'snow'), ('alwaysPierce', 'pierce'), ('shieldBreak', 'pierce'),
    ('maxHpBonus', 'heart'), ('lowHpBonusPct', 'drop'),
]
FAMILY_TO_BADGE = {'sword': 'sword', 'armor': 'armor', 'fang': 'fang', 'thorn': 'thorn', 'leaf': 'leaf', 'gem': 'gem',
                   'bolt': 'bolt', 'flask': 'poison', 'flame': 'flame', 'snow': 'snow', 'needle': 'pierce', 'heart': 'heart', 'drop': 'drop'}


def badge_for(r, fam):
    e = r['effect']
    if fam.startswith('sig-'):
        return None
    if fam == 'cog':
        t = e['energyTriggers'][0]
        for k, b in (('stun', 'bolt'), ('damage', 'sword'), ('heal', 'heart'), ('shield', 'gem'), ('energy', 'bolt')):
            if t.get(k):
                return b
    own = FAMILY_TO_BADGE.get(fam)
    for k, b in BADGE_ORDER:
        v = e.get(k)
        if v and b != own:
            if k == 'maxHpBonus' and v < 0:
                return 'down'
            if k == 'attackBonus' and v < 0:
                continue
            return b
    if e.get('maxHpBonus', 0) < 0:
        return 'down'
    return None


def behavior(r):
    e = r['effect']
    if e.get('energyTriggers'):
        t = e['energyTriggers'][0]
        return dict(kind='counter', per=t['per'], label=t.get('label', ''))
    caps = []
    if e.get('revive'):
        return dict(kind='limited', uses=1, label='부활')
    if e.get('stunOnHit'):
        return dict(kind='limited', uses=e.get('stunCap', 1), label='기절')
    if e.get('freezeOnHit'):
        return dict(kind='limited', uses=e.get('freezeCap', 2), label='빙결')
    if e.get('lowHpBonusPct') or e.get('executeBonusPct'):
        return dict(kind='cond', label='내 반피' if e.get('lowHpBonusPct') and not e.get('executeBonusPct') else '상대 반피')
    if e.get('openingShield') or e.get('startEnergyBonus'):
        return dict(kind='opening', label='첫 라운드')
    if any(e.get(k) for k in ('lifesteal', 'thorns', 'poisonOnHit', 'burnOnHit', 'shieldBreak', 'regen', 'turnShield', 'turnEnergy')):
        return dict(kind='proc', label='발동')
    if r['mods']:
        return dict(kind='run', label='런 효과')
    return dict(kind='passive', label='상시')


def glyph(fam):
    if fam in LEGEND:
        return sprite(LEGEND[fam], PAL)
    if fam in BOSS:
        return sprite(BOSS[fam], PAL)
    if fam == '?':
        return sprite(UNKNOWN, PAL)
    return sprite(G[fam], PAL)


def art_key(r):
    if r['rarity'] == 'legend' and r['name'] in LEGEND_BY_NAME:
        return LEGEND_BY_NAME[r['name']]
    return classify(r)


def frame_full(rar):
    R = RARITY[rar]
    S = 26
    a = np.zeros((S, S, 4), np.uint8)
    l = Layer(S, S)
    # bevelled square
    for y in range(S):
        for x in range(S):
            if (x in (0, S - 1) and y in (0, 1, S - 2, S - 1)) or (y in (0, S - 1) and x in (0, 1, S - 2, S - 1)):
                continue
            edge = x == 0 or y == 0 or x == S - 1 or y == S - 1
            if edge:
                c = R['dark']
            elif x == 1 or y == 1:
                c = R['light']
            elif x == S - 2 or y == S - 2:
                c = R['dark']
            else:
                c = R['base']
            a[y, x] = hx(c)
    # inner well
    for y in range(4, S - 4):
        for x in range(4, S - 4):
            a[y, x] = hx(R['dark']) if (y == 4 or x == 4) else hx(R['base'])
    if rar == 'legend':
        for (x, y) in ((2, 2), (S - 3, 2), (2, S - 3), (S - 3, S - 3)):
            a[y, x] = hx('#fff0a8')
        for x in range(8, S - 8):
            a[1, x] = hx('#ffd86a')
    if rar == 'boss':
        for (x, y) in ((2, 2), (S - 3, 2)):
            a[y, x] = hx('#ff8a6a'); a[y + 1, x] = hx('#ff8a6a')
        for x in range(9, S - 9):
            a[S - 2, x] = hx('#ff4a3a')
    if rar == 'epic':
        for (x, y) in ((2, 2), (S - 3, 2), (2, S - 3), (S - 3, S - 3)):
            a[y, x] = hx('#e8c8ff')
    return a


def hue(a, deg):
    if not deg:
        return a
    out = a.copy()
    m = a[..., 3] > 0
    for y, x in zip(*np.nonzero(m)):
        r_, g_, b_ = a[y, x, :3] / 255
        h_, l_, s_ = colorsys.rgb_to_hls(r_, g_, b_)
        if s_ < 0.18:
            continue
        rr, gg, bb = colorsys.hls_to_rgb((h_ + deg / 360) % 1, l_, s_)
        out[y, x, :3] = (int(rr * 255), int(gg * 255), int(bb * 255))
    return out


def compose_full(r, variant=0):
    fam = art_key(r)
    if fam in LEGEND:
        variant = 0
    a = frame_full(r['rarity'])
    g = outline(hue(glyph(fam), [0, 40, -40, 80, -80, 120][variant % 6]), hx('#120e18'))
    h, w = g.shape[:2]
    l = Layer(26, 26); l.paste(g, 13 - w // 2, 13 - h // 2)
    a = over(a, l.a)
    b = None if (fam in LEGEND or fam in BOSS or fam == '?') else badge_for(r, fam)
    if b:
        bb = sprite(BADGE[b], PAL)
        bg = Layer(26, 26)
        bg.ellipse(20.5, 20.5, 4.2, 4.2, [hx('#120e18')] * 3, False)
        bg.paste(bb, 18, 18)
        a = over(a, bg.a)
    return a, fam, b


def compose_mini(r, variant=0):
    fam = art_key(r)
    if fam in LEGEND:
        variant = 0
    R = RARITY[r['rarity']]
    S = 16
    a = np.zeros((S, S, 4), np.uint8)
    for y in range(S):
        for x in range(S):
            if (x in (0, S - 1)) and (y in (0, S - 1)):
                continue
            edge = x in (0, S - 1) or y in (0, S - 1)
            a[y, x] = hx(R['rim']) if edge else hx(R['base'])
    g = hue(glyph(fam), [0, 40, -40, 80, -80, 120][variant % 6])
    gh, gw = g.shape[:2]
    # glyph is 14×14 max → fits inside the 1px rim
    l = Layer(S, S); l.paste(g, 8 - gw // 2, 8 - gh // 2)
    a = over(a, l.a)
    return a


def silhouette_full(r):
    fam = art_key(r)
    a = frame_full('void')
    g = glyph(fam)
    m = (g[..., 3] > 0)
    sil = np.zeros_like(g); sil[m] = hx('#050408')
    sil = outline(sil, hx('#4a4458'))
    h, w = g.shape[:2]
    l = Layer(26, 26); l.paste(sil, 13 - w // 2, 13 - h // 2)
    return over(a, l.a)


def silhouette_mini(r):
    fam = art_key(r)
    S = 16
    R = RARITY['void']
    a = np.zeros((S, S, 4), np.uint8)
    for y in range(S):
        for x in range(S):
            if (x in (0, S - 1)) and (y in (0, S - 1)):
                continue
            a[y, x] = hx(R['rim']) if (x in (0, S - 1) or y in (0, S - 1)) else hx(R['base'])
    g = glyph(fam)
    sil = np.zeros_like(g); sil[g[..., 3] > 0] = hx('#050408')
    gh, gw = g.shape[:2]
    l = Layer(S, S); l.paste(sil, 8 - gw // 2, 8 - gh // 2)
    return over(a, l.a)


def proc_burst(rar, n=6, S=32):
    col = hx(RARITY[rar]['rim'])
    out = []
    for i in range(n):
        u = (i + 1) / n
        l = Layer(S, S)
        r0 = 6 + u * 9
        k = 40
        for j in range(k):
            ang = j / k * 2 * math.pi
            for dr in (0, 1) if u < 0.7 else (0,):
                l.px(16 + math.cos(ang) * (r0 + dr), 16 + math.sin(ang) * (r0 + dr), col if dr == 0 else hx('#ffffff'))
        for j in range(8):
            ang = j / 8 * 2 * math.pi + 0.3
            p0 = 4 + u * 10; p1 = p0 + 3
            l.line((16 + math.cos(ang) * p0, 16 + math.sin(ang) * p0), (16 + math.cos(ang) * p1, 16 + math.sin(ang) * p1), hx('#ffffff'))
        a = blend_over(glow(S, S, (16, 16), 10 * (1 - u) + 4, col, 0.7 * (1 - u)), l.a)
        a[..., 3] = (a[..., 3].astype(float) * (1 - u * 0.75)).astype(np.uint8)
        out.append(a)
    return out


def build(relics_json, outdir, keep=None, COLS=16):
    rel = json.load(open(relics_json))
    if keep:
        rel = [r for r in rel if r['id'] in set(keep)]
    order = {'common': 0, 'rare': 1, 'epic': 2, 'legend': 3}
    sig = [r for r in rel if r['id'].startswith('sig-')]
    rest = sorted([r for r in rel if not r['id'].startswith('sig-')], key=lambda r: (order[r['rarity']], classify(r), r['id']))
    rel = sig + rest
    d = os.path.join(outdir, 'ui', 'relics')
    os.makedirs(os.path.join(d, 'full'), exist_ok=True); os.makedirs(os.path.join(d, 'mini'), exist_ok=True)
    rows = (len(rel) + COLS - 1) // COLS
    atlas = np.zeros((rows * 26, COLS * 26, 4), np.uint8)
    atlas_m = np.zeros((rows * 16, COLS * 16, 4), np.uint8)
    index = []
    seen = {}
    for i, r in enumerate(rel):
        key = (classify(r), r['rarity'], badge_for(r, classify(r)))
        v = seen.get(key, 0); seen[key] = v + 1
        a, fam, b = compose_full(r, v)
        m = compose_mini(r, v)
        Image.fromarray(a).save(os.path.join(d, 'full', f"{r['id']}.png"))
        Image.fromarray(m).save(os.path.join(d, 'mini', f"{r['id']}.png"))
        cx, cy = i % COLS, i // COLS
        atlas[cy * 26:(cy + 1) * 26, cx * 26:(cx + 1) * 26] = a
        atlas_m[cy * 16:(cy + 1) * 16, cx * 16:(cx + 1) * 16] = m
        index.append(dict(id=r['id'], name=r['name'], rarity=r['rarity'], desc=r['desc'], family=fam, badge=b,
                          col=cx, row=cy, variant=v, behavior=behavior(r)))
    Image.fromarray(atlas).save(os.path.join(d, 'atlas-full.png'))
    Image.fromarray(atlas_m).save(os.path.join(d, 'atlas-mini.png'))
    for rar in RARITY:
        Image.fromarray(np.concatenate(proc_burst(rar), 1)).save(os.path.join(d, f'proc-{rar}.png'))
    # silhouettes (codex, undiscovered)
    sil = np.zeros_like(atlas); sil_m = np.zeros_like(atlas_m)
    for i, r in enumerate(rel):
        cx, cy = i % COLS, i // COLS
        sil[cy * 26:(cy + 1) * 26, cx * 26:(cx + 1) * 26] = silhouette_full(r)
        sil_m[cy * 16:(cy + 1) * 16, cx * 16:(cx + 1) * 16] = silhouette_mini(r)
    Image.fromarray(sil).save(os.path.join(d, 'atlas-silhouette-full.png'))
    Image.fromarray(sil_m).save(os.path.join(d, 'atlas-silhouette-mini.png'))
    # foes: boss relics, enemy abilities, unknown slots
    foes = [dict(id=i, glyph=g, rarity='boss', name=n, desc=ds, boss=b, effect={}, mods={}) for i, g, b, n, ds in BOSS_META]
    foes += [dict(id=i, glyph=g, rarity='enemy', name=n, desc=ds, effect={}, mods={}) for i, g, n, ds in ENEMY]
    foes += [dict(id='unknown', glyph='?', rarity='void', name='???', desc='아직 드러나지 않은 능력', effect={}, mods={}),
             dict(id='unknown-foe', glyph='?', rarity='enemy', name='???', desc='아직 드러나지 않은 적 능력', effect={}, mods={})]
    fa = np.zeros((26, 26 * len(foes), 4), np.uint8); fm = np.zeros((16, 16 * len(foes), 4), np.uint8)
    fsil = np.zeros_like(fa)
    foe_index = []
    for i, f in enumerate(foes):
        art = f['glyph']
        a = frame_full(f['rarity'])
        g = outline(glyph(art), hx('#120e18'))
        h, w = g.shape[:2]
        l = Layer(26, 26); l.paste(g, 13 - w // 2, 13 - h // 2)
        a = over(a, l.a)
        fa[:, i * 26:(i + 1) * 26] = a
        R = RARITY[f['rarity']]
        m = np.zeros((16, 16, 4), np.uint8)
        for y in range(16):
            for x in range(16):
                if (x in (0, 15)) and (y in (0, 15)):
                    continue
                m[y, x] = hx(R['rim']) if (x in (0, 15) or y in (0, 15)) else hx(R['base'])
        gg = glyph(art); gh, gw = gg.shape[:2]
        l2 = Layer(16, 16); l2.paste(gg, 8 - gw // 2, 8 - gh // 2)
        fm[:, i * 16:(i + 1) * 16] = over(m, l2.a)
        fx = dict(f); fx['name'] = f['name']
        foe_index.append(dict(id=f['id'], name=f['name'], rarity=f['rarity'], desc=f['desc'], boss=f.get('boss'), col=i))
    Image.fromarray(fa).save(os.path.join(d, 'atlas-foe-full.png'))
    Image.fromarray(fm).save(os.path.join(d, 'atlas-foe-mini.png'))
    json.dump(foe_index, open(os.path.join(d, 'foes.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(dict(cols=COLS, full=26, mini=16, relics=index), open(os.path.join(d, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    return index, atlas


if __name__ == '__main__':
    import shutil
    shutil.rmtree('/home/claude/gb/out/ui/relics', ignore_errors=True)
    k = json.load(open('/home/claude/gb/relics100.json'))
    idx, atlas = build('/home/claude/rx/relics.json', '/home/claude/gb/out', keep=k['keep'], COLS=10)
    ix = json.load(open('/home/claude/gb/out/ui/relics/index.json'))
    for r in ix['relics']:
        r['merged'] = k['merged'].get(r['id'], [])
    json.dump(ix, open('/home/claude/gb/out/ui/relics/index.json', 'w'), ensure_ascii=False, indent=1)
    Image.fromarray(atlas).resize((atlas.shape[1] * 3, atlas.shape[0] * 3), Image.NEAREST).save('/home/claude/gb/prev_relics.png')
    from collections import Counter
    print(len(idx), Counter(x['family'] for x in idx).most_common())
    print(Counter(x['behavior']['kind'] for x in idx))
