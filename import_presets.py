"""
Read seedance-prompts.xlsx and regenerate presets.json.

Run from the seedance-studio folder. This script:
  1. Loads the existing presets.json to know the canonical category structure
  2. Reads the workbook
  3. Matches rows back to categories by ID
  4. Writes a backup (presets.json.bak) before overwriting
  5. Writes the updated presets.json

Safe to run repeatedly. Designed to be invoked from import-presets.bat.
"""

import json
import sys
import shutil
from pathlib import Path
from datetime import datetime

try:
    from openpyxl import load_workbook
except ImportError:
    print('\n[ERROR] openpyxl is not installed.')
    print('Install it with:  pip install openpyxl')
    sys.exit(1)


# Resolve paths relative to this script's location (parent = project root)
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR
PRESETS_PATH = ROOT / 'presets.json'
WORKBOOK_PATH = ROOT / 'seedance-prompts.xlsx'

CATEGORY_TITLES = {
    'LENS': 'lens',
    'CAMERA BODY': 'camera',
    'CAMERA MOTION': 'cameraMotion',
    'COLOR GRADING': 'colorGrading',
    'GENRE / MOOD': 'genre',
    'ASPECT RATIO': 'aspectRatio',
    'RESOLUTION': 'resolution',
}

# These categories carry "value" instead of "prompt"
TECHNICAL = {'aspectRatio', 'resolution'}


def fail(msg):
    print(f'\n[ERROR] {msg}')
    sys.exit(1)


def main():
    if not PRESETS_PATH.exists():
        fail(f'presets.json not found next to this script: {PRESETS_PATH}')
    if not WORKBOOK_PATH.exists():
        fail(f'seedance-prompts.xlsx not found next to this script: {WORKBOOK_PATH}')

    # Load current presets to preserve _comment and structure
    with open(PRESETS_PATH, 'r', encoding='utf-8') as f:
        original = json.load(f)

    wb = load_workbook(WORKBOOK_PATH, data_only=True)
    ws = wb.active

    # ─── Walk through rows, picking up section markers and their items ──
    new_data = {k: [] for k in original.keys() if not k.startswith('_')}
    current_category = None

    for row_idx in range(1, ws.max_row + 1):
        col_a = ws.cell(row=row_idx, column=1).value
        col_b = ws.cell(row=row_idx, column=2).value
        col_c = ws.cell(row=row_idx, column=3).value
        if col_a is None:
            continue

        col_a_str = str(col_a).strip()

        # Detect section title rows (e.g. "  ▸  LENS" or "  ▸  ASPECT RATIO  ·  technical params...")
        if '▸' in col_a_str:
            # Extract the part after ▸ and before any "·"
            after_arrow = col_a_str.split('▸', 1)[1].strip()
            title_clean = after_arrow.split('·')[0].strip()
            if title_clean in CATEGORY_TITLES:
                current_category = CATEGORY_TITLES[title_clean]
            else:
                current_category = None
            continue

        # Skip header / instruction / banner rows
        if col_a_str in ('ID (do not edit)', 'ID', 'SEEDANCE STUDIO  ·  PROMPT LIBRARY',
                        'HOW TO USE THIS WORKBOOK'):
            continue
        if col_a_str.startswith(('1.', '2.', '3.', '4.', '5.', '   ')):
            continue

        # Item row: needs a category context AND non-empty ID + label
        if current_category is None:
            continue
        if not col_b:
            continue

        id_val = col_a_str
        label_val = str(col_b).strip()
        prompt_val = str(col_c).strip() if col_c else ''

        if current_category in TECHNICAL:
            new_data[current_category].append({
                'id': id_val,
                'label': label_val,
                'value': prompt_val,
            })
        else:
            new_data[current_category].append({
                'id': id_val,
                'label': label_val,
                'prompt': prompt_val,
            })

    # ─── Sanity checks before writing ────────────────────────
    issues = []
    for cat, items in new_data.items():
        if not items:
            issues.append(f'  · category "{cat}" has 0 items — did the Excel structure change?')
            continue
        for item in items:
            if not item.get('id'):
                issues.append(f'  · {cat} has an item with empty ID')
            value_field = 'value' if cat in TECHNICAL else 'prompt'
            if not item.get(value_field):
                issues.append(f'  · {cat}/{item.get("id","?")} has empty {value_field}')

    if issues:
        print('\n[WARN] Found potential issues:')
        for i in issues:
            print(i)
        print('\nProceeding anyway. Inspect the new presets.json after import.\n')

    # ─── Backup the old presets.json ─────────────────────────
    backup_path = PRESETS_PATH.with_suffix(
        f'.json.bak-{datetime.now().strftime("%Y%m%d-%H%M%S")}'
    )
    shutil.copy(PRESETS_PATH, backup_path)
    print(f'✓ backup saved: {backup_path.name}')

    # ─── Write new presets.json ──────────────────────────────
    output = {}
    if '_comment' in original:
        output['_comment'] = original['_comment']
    for cat in original.keys():
        if cat == '_comment':
            continue
        output[cat] = new_data.get(cat, original[cat])

    with open(PRESETS_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # ─── Summary ─────────────────────────────────────────────
    print(f'✓ presets.json updated\n')
    print('Category counts:')
    for cat in output.keys():
        if cat == '_comment':
            continue
        n = len(output[cat])
        print(f'  · {cat:18s} {n} item(s)')
    print('\n→ Reload the app in your browser (Ctrl+Shift+R) to see your new prompts live.')


if __name__ == '__main__':
    main()
