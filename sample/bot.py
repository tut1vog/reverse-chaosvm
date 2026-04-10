import json
import random
import time
from typing import Optional, Dict

import cv2
import numpy as np
from DrissionPage import ChromiumPage, ChromiumOptions

TOOL_URL = 'https://urlsec.qq.com/check.html'


def solve_slider(bg_img, tp_img):
    """Calculates the raw pixel offset using Canny edge detection for better accuracy."""
    bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
    tp_gray = cv2.cvtColor(tp_img, cv2.COLOR_BGR2GRAY)
    bg_edge = cv2.Canny(bg_gray, 100, 200)
    tp_edge = cv2.Canny(tp_gray, 100, 200)
    res = cv2.matchTemplate(bg_edge, tp_edge, cv2.TM_CCOEFF_NORMED)
    _, _, _, max_loc = cv2.minMaxLoc(res)
    return max_loc[0]


def extract_result(text: str) -> Dict:
    l, r = text.index("("), text.rindex(")")
    return json.loads(text[l+1:r])["data"]["results"]


def query_qq_urlsec(page: ChromiumPage, target_url: str, max_solves=3) -> Optional[Dict]:
    """Performs a single query, solves captcha with automatic retries, and returns the result."""
    print(f"\n--- Processing: {target_url} ---")
    if page.url != TOOL_URL:
        page.get(TOOL_URL)
        
    page.ele('#check-input').clear().input(target_url)
    page.listen.set_targets(["t.captcha.qq.com/hycdn?index=1", "t.captcha.qq.com/hycdn?index=2"])
    page.listen.clear()

    print("Submitting query...")
    page.ele('#check-btn').click()
    
    packets = page.listen.wait(count=2, timeout=5)
    if not packets:
        print("Failed to load slide box challenge.")
        return None
    
    bg_data, slice_data = None, None
    for packet in packets:
        print(packet.url)
        if 'index=1' in packet.url:
            bg_data = packet.response.body
        elif 'index=2' in packet.url:
            slice_data = packet.response.body
    
    solve_attempts = 0
    while solve_attempts < max_solves:
        if not (bg_data and slice_data):
            raise Exception("Failed to Load background or slice image.")
        solve_attempts += 1
        
        print(f"Captcha detected. Solving attempt {solve_attempts}/{max_solves}...")
        page.listen.set_targets(["cgi.urlsec.qq.com/index.php", "t.captcha.qq.com/cap_union_new_getcapbysig"])
        page.listen.clear()
        
        bg_path, slice_path = "assets/bg.jpg", "assets/slice.jpg"
        
        with open("assets/bg.jpg", "wb") as f: f.write(bg_data)
        with open("assets/slice.jpg", "wb") as f: f.write(slice_data)

        bg_img = cv2.imread(bg_path)
        slice_img = cv2.imread(slice_path)
        
        natural_width = bg_img.shape[1]
        raw_offset = solve_slider(bg_img, slice_img)
        
        iframe = page.get_frame('@src^https://t.captcha.qq.com')
        if iframe:
            bg_element = iframe.ele('#slideBg')
            ratio = bg_element.rect.size[0] / natural_width 
            calibration = -25 + random.randint(-5, 5)
            final_distance = (raw_offset * ratio) + calibration

            # The JavaScript listeners might be loading slower than you think !
            time.sleep(1.5)
                
            thumb = iframe.ele('#tcaptcha_drag_thumb')
            thumb.drag(final_distance, 0, duration=0.5)
            print(f"Slider dragged {final_distance:.2f}px. Waiting for validation...")
        
        bg_data, slice_data = None, None
        for packet in page.listen.steps(timeout=5):
            print(packet.url)
            if "cgi.urlsec.qq.com" in packet.url:
                return packet.response.body
            if "img_index=1" in packet.url:
                bg_data = packet.response.body
            elif "img_index=2" in packet.url:
                slice_data = packet.response.body
            if bg_data and slice_data:
                break
        
    return None


if __name__ == '__main__':
    try:
        with open("domain.lst", "r") as f:
            domains = [line.strip() for line in f if line.strip()]
        print(f"Found {len(domains)} domains to test.")

        co = ChromiumOptions().set_local_port(9222).existing_only(True)
        page = ChromiumPage(co)
        page.listen.start()

        results = []
        for domain in domains:
            content = query_qq_urlsec(page, domain)
            if content:
                results.append(extract_result(content))
        
        page.listen.stop()
        with open('query_results.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=4)
        print(f"\nAll domains processed. Results saved to query_results.json")
    except Exception as e:
        print("Task failed with Exception:", e)