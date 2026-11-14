import json, os, shutil
import numpy as np
from PIL import Image
from pix import save_sheet, preview
import hero_cairn, hero_sable, hero_dirge, mon_field, mon_dungeon, mon_boss, mon_gladiator, bgs

OUT = 'out'
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)

SHEETS = [
    # id, builder, scale, kind, region, game id it replaces
    ('cairn', lambda: hero_cairn.build(OUT), 3, 'hero', None, 'warrior'),
    ('sable', lambda: hero_sable.build(OUT), 3, 'hero', None, 'archer'),
    ('dirge', lambda: hero_dirge.build(OUT), 3, 'hero', None, 'mage'),
    ('slime', mon_field.slime_clips, 3, 'monster', 'grassland', 'slime'),
    ('goblin', mon_field.goblin_clips, 3, 'monster', 'grassland', 'goblin'),
    ('ogre', mon_field.ogre_clips, 3, 'monster', 'grassland', 'ogre'),
    ('bat', mon_dungeon.bat_clips, 3, 'monster', 'dungeon', 'bat'),
    ('golem', mon_dungeon.golem_clips, 3, 'monster', 'dungeon', 'golem'),
    ('witch', mon_dungeon.witch_clips, 3, 'monster', 'dungeon', 'witch'),
    ('warden', mon_boss.warden_clips, 2, 'boss', 'grassland', 'warden'),
    ('pyrelord', mon_boss.pyre_clips, 2, 'boss', 'dungeon', 'pyrelord'),
    ('overlord', mon_boss.over_clips, 2, 'boss', 'dungeon', 'overlord'),
    ('gladiator', mon_gladiator.gladiator_clips, 3, 'monster', 'event', 'gladiator'),
]

index = {}
for sid, fn, scale, kind, region, gid in SHEETS:
    clips = fn()
    f0 = clips['idle'][0][0]
    H, W = f0.shape[:2]
    meta = save_sheet(OUT, sid, W, H, clips, scale, extra={'kind': kind, 'region': region, 'replaces': gid})
    index[sid] = meta
    preview([c[0] for c in clips.values()], os.path.join(OUT, 'sprites', sid, '_preview.png'), scale=2)
    print(sid, W, H, {k: v['frames'] for k, v in meta['clips'].items()}, 'footY', meta['footY'], 'anchorX', meta['anchorX'])

# projectiles
os.makedirs(os.path.join(OUT, 'sprites', 'fx'), exist_ok=True)
arrow, ember = hero_sable.projectile()
Image.fromarray(arrow).save(os.path.join(OUT, 'sprites', 'fx', 'arrow.png'))
Image.fromarray(np.concatenate(ember, 1)).save(os.path.join(OUT, 'sprites', 'fx', 'ember-arrow.png'))

bgs.save_all(OUT)
with open(os.path.join(OUT, 'sprites', 'index.json'), 'w') as f:
    json.dump(index, f, indent=1, ensure_ascii=False)
