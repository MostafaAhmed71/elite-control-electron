from PIL import Image, ImageDraw
import scanner
import json

def shade_circle(draw, center_x, center_y, radius=18):
    """Draw a dark shaded circle over an option."""
    draw.ellipse([center_x - radius, center_y - radius, center_x + radius, center_y + radius], fill="black")

def test_new_template():
    # 1. Load the empty 20-question template
    img = Image.open("omr_template_20.png")
    draw = ImageDraw.Draw(img)
    
    WIDTH = 2481
    MARGIN = 150
    
    # Shade Student ID: 1234567890
    id_start_y = MARGIN + 50 + 150 + 100
    id_spacing_x, id_spacing_y = 75, 65
    id_start_x = WIDTH // 2 - (10 * id_spacing_x) // 2
    
    for col in range(10):
        # Digit 1-9 then 0
        digit = (col + 1) % 10
        shade_circle(draw, id_start_x + col * id_spacing_x, id_start_y + digit * id_spacing_y)

    # Shade Questions (20 Qs)
    num_questions = 20
    rows_per_col = (num_questions + 1) // 2
    q_start_y = id_start_y + 10 * id_spacing_y + 100 + 50
    q_spacing_x, q_spacing_y = 90, 80
    col_width = (WIDTH - 2 * MARGIN) // 2
    
    # Q1: أ (A)
    shade_circle(draw, MARGIN + 250 + 0 * col_width + 0 * q_spacing_x, q_start_y + 0 * q_spacing_y)
    
    # Q2: ب (B)
    shade_circle(draw, MARGIN + 250 + 0 * col_width + 1 * q_spacing_x, q_start_y + 1 * q_spacing_y)
    
    # Q11: ج (C) (First q in 2nd column)
    shade_circle(draw, MARGIN + 250 + 1 * col_width + 2 * q_spacing_x, q_start_y + 0 * q_spacing_y)

    img.save("filled_template_20.png")
    print("Simulated 20-q filled template saved as filled_template_20.png")
    
    # Scan it
    res = scanner.scan_omr("filled_template_20.png")
    print(json.dumps(res, indent=4))

if __name__ == "__main__":
    test_new_template()
