import json, os
from pix import save_sheet, preview
import mon_merchant, npc_trader
OUT = 'out'
SHEETS = [
    ('trader', npc_trader.clips, 3, 'npc', None, None),
    ('goblin-poor', mon_merchant.poor_clips, 3, 'merchant', None, None),
    ('goblin-mid', mon_merchant.mid_clips, 3, 'merchant', None, None),
    ('goblin-rich', mon_merchant.rich_clips, 3, 'merchant', None, None),
]
ip = os.path.join(OUT, 'sprites', 'index.json')
index = json.load(open(ip))
for sid, fn, scale, kind, region, gid in SHEETS:
    clips = fn()
    H, W = clips['idle'][0][0].shape[:2]
    meta = save_sheet(OUT, sid, W, H, clips, scale, extra={'kind': kind, 'region': region, 'replaces': gid})
    index[sid] = meta
    preview([c[0] for c in clips.values()], os.path.join(OUT, 'sprites', sid, '_preview.png'), scale=2)
    print(sid, W, H, {k: v['frames'] for k, v in meta['clips'].items()}, meta['footY'], meta['anchorX'])
json.dump(index, open(ip, 'w'), indent=1, ensure_ascii=False)
