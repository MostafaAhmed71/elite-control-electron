import sys
import io
sys.path.append(r"E:\control elite\control\control\omr_engine")

import generator_nafs
from fpdf import FPDF

def test():
    student_info = {"id": "111", "name": "أحمد حمد", "class_name": "الصف الأول", "num_questions": 30}
    img = generator_nafs.generate_personalized_sheet(student_info)
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    buf.name = "sheet.jpg"  # Simulate a file name so fpdf detects JPEG
    buf.seek(0)
    
    pdf = FPDF(unit="pt", format=(generator_nafs.WIDTH, generator_nafs.HEIGHT))
    pdf.add_page()
    pdf.image(buf, 0, 0, generator_nafs.WIDTH, generator_nafs.HEIGHT)
    print("Success adding to pdf!")

if __name__ == "__main__":
    test()
