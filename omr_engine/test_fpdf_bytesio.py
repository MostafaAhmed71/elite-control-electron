import io
from PIL import Image
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
img = Image.new('RGB', (100, 100), color='red')
buf = io.BytesIO()
img.save(buf, format="PNG")
buf.seek(0)
try:
    pdf.image(buf, 0, 0, 100, 100)
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
