import sys
import os

sys.path.append(r"E:\control elite\control\control\omr_engine")

import generator_nafs
print("Imported generator_nafs")

def test():
    student_dicts = [
        {"id": "111", "name": "أحمد حمد", "class_name": "الصف الأول", "subject": "Math", "date": "2024", "day": "", "seat_number": "", "committee_number": "", "num_questions": 30}
    ]
    
    print("Testing generate_personalized_sheet directly...")
    try:
        img = generator_nafs.generate_personalized_sheet(student_dicts[0])
        print("Generated img size:", img.size)
    except Exception as e:
        print("Error generating sheet:", e)
        return
        
    print("Testing BytesIO saving...")
    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    print("BytesIO saved, size:", len(buf.getvalue()))
    
    print("Testing FPDF...")
    from fpdf import FPDF
    pdf = FPDF(unit="pt", format=(generator_nafs.WIDTH, generator_nafs.HEIGHT))
    pdf.add_page()
    print("Page added, adding image to pdf...")
    try:
        pdf.image(buf, 0, 0, generator_nafs.WIDTH, generator_nafs.HEIGHT)
        print("Image added.")
    except Exception as e:
        print("Error adding to PDF:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test()
