#!/usr/bin/env python3
"""
Slide Puzzle Solver — standalone CLI tool.

Matches bot.py's solve_slider() exactly:
  cv2.cvtColor(BGR2GRAY) -> cv2.Canny(gray, 100, 200) ->
  cv2.matchTemplate(TM_CCOEFF_NORMED) -> cv2.minMaxLoc()[3][0]

Usage:
  python3 slide-solver.py <bg_image_path> <slice_image_path>

Output:
  Prints a single integer (x-offset in pixels) to stdout.
  Exit code 0 on success, 1 on error (error message to stderr).
"""

import sys

def solve_slider(bg_path, slice_path):
    """Load two images, run Canny edge + NCC template match, return x-offset."""
    import cv2

    bg_img = cv2.imread(bg_path)
    if bg_img is None:
        raise ValueError(f"Cannot read background image: {bg_path}")

    tp_img = cv2.imread(slice_path)
    if tp_img is None:
        raise ValueError(f"Cannot read slice image: {slice_path}")

    bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
    tp_gray = cv2.cvtColor(tp_img, cv2.COLOR_BGR2GRAY)
    bg_edge = cv2.Canny(bg_gray, 100, 200)
    tp_edge = cv2.Canny(tp_gray, 100, 200)
    res = cv2.matchTemplate(bg_edge, tp_edge, cv2.TM_CCOEFF_NORMED)
    _, _, _, max_loc = cv2.minMaxLoc(res)
    return max_loc[0]


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <bg_image> <slice_image>", file=sys.stderr)
        sys.exit(1)

    try:
        offset = solve_slider(sys.argv[1], sys.argv[2])
        print(int(offset))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
