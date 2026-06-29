import sys
sys.path.append(r"E:\control elite\control\control\omr_engine")

import generator_nafs
from PIL import Image, ImageDraw

def test():
    student_info = {"id": "111", "name": "أحمد حمد", "class_name": "الصف الأول", "num_questions": 30}
    img  = Image.new("RGB", (generator_nafs.WIDTH, generator_nafs.HEIGHT), generator_nafs.WHITE)
    draw = ImageDraw.Draw(img)
    
    print("Testing draw_corner_markers...")
    generator_nafs.draw_corner_markers(draw)
    print("Done corner markers.")
    
    print("Testing draw_header...")
    generator_nafs.draw_header(img, draw, student_info)
    print("Done header.")
    
    print("Testing draw_qr_code...")
    qr_payload = generator_nafs.build_qr_payload(student_info, num_questions=30, template="nafs")
    generator_nafs.draw_qr_code(img, qr_payload)
    print("Done QR code.")
    
    print("Testing draw_questions_section...")
    generator_nafs.draw_questions_section(draw, generator_nafs.QS_START_Y, num_questions=30)
    print("Done questions.")

if __name__ == "__main__":
    test()
