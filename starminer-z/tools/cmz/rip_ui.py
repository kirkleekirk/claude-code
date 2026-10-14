# Exports CastleMiner Z's interface art from your own copy of the game: the sprite sheet its
# screens are drawn from (the inventory and crafting panel, the grid squares, the selector, the
# sniper scope, the missile lock). The ripped files are DigitalDNA's: they stay in local-assets/,
# which git ignores.
#
#   python3 tools/cmz/rip_ui.py <extracted Content folder> <out folder>
#
# Writes <out>/ui/sheet.png and <out>/ui/sprites.json (each sprite's [x, y, width, height] on the
# sheet, and the sheet's size).
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xnb


def main(content, out):
    p = xnb.parse(xnb.read_xnb(os.path.join(content, 'SpriteSheet.xnb')))
    if 'errors' in p: raise ValueError(f'SpriteSheet: {p["errors"]}')
    o = p['object']
    t = o['texture']
    folder = os.path.join(out, 'ui')
    os.makedirs(folder, exist_ok=True)
    # (the Xbox keeps a Color texture's words byte-swapped, as the models' textures)
    xnb.write_png(os.path.join(folder, 'sheet.png'), t['w'], t['h'], xnb.texture_rgba(t, False, True))
    json.dump({'w': t['w'], 'h': t['h'], 'sprites': o['sprites']}, open(os.path.join(folder, 'sprites.json'), 'w'), indent=1)
    print(f'sheet {t["w"]} x {t["h"]};', len(o['sprites']), 'sprites:', ', '.join(sorted(o['sprites'])))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
