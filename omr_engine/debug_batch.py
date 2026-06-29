import generator
import traceback

students = [
    {"id": "101", "name": "حمد الشمري", "grade": "الأول المتوسط"},
    {"id": "102", "name": "علي مكي", "grade": "الأول المتوسط"}
]

try:
    print("Testing bulk PDF generation...")
    generator.create_bulk_pdf(students, "لغتي", "debug_batch.pdf")
    print("Success! PDF saved to debug_batch.pdf")
except Exception as e:
    print("FAILED!")
    traceback.print_exc()
