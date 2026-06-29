import sys
import io
sys.path.append(r"E:\control elite\control\control\omr_engine")

import generator_nafs
from fpdf import FPDF

def test():
    student_info = {"id": "111", "name": "أحمد حمد", "class_name": "الصف الأول", "num_questions": 30}
    print("Generating image...")
    img = generator_nafs.generate_personalized_sheet(student_info)
    print("Image generated. Saving to BytesIO as JPEG...")
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    buf.seek(0)
    print("Saved to BytesIO. Size:", len(buf.getvalue()))
    
    print("Initializing FPDF...")
    pdf = FPDF(unit="pt", format=(generator_nafs.WIDTH, generator_nafs.HEIGHT))
    pdf.add_page()
    
    print("Adding image to PDF (JPEG)...")
    try:
        pdf.image(buf, 0, 0, generator_nafs.WIDTH, generator_nafs.HEIGHT, type="JPEG")
        print("Success adding to pdf!")
    except Exception as e:
        print("Exception:", e)

if __name__ == "__main__":
    test()
