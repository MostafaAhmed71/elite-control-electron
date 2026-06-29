# Shared OMR Constants

WIDTH, HEIGHT = 2481, 3507

MARGIN = 150

CORNER_MARKER_SIZE = 80

MARKER_CENTER_OFFSET = MARGIN + CORNER_MARKER_SIZE // 2



WHITE = (255, 255, 255)

BLACK = (0, 0, 0)



# School title block (~290px) then student info — kept high, away from corner squares

SCHOOL_HEADER_H = 290

CORNER_SAFE_PAD = CORNER_MARKER_SIZE + 20



# Professional Header Grid (inset from left corner marker)

HEADER_X = MARGIN + CORNER_SAFE_PAD

HEADER_START_Y = MARGIN + SCHOOL_HEADER_H + 12

HEADER_WIDTH = WIDTH - HEADER_X - MARGIN - 380

HEADER_ROW_H = 92

HEADER_END_Y = HEADER_START_Y + (HEADER_ROW_H * 4) + 24



# QR Identification (Top Right, aligned with student block)

QR_SIZE = 350

QR_X = WIDTH - MARGIN - QR_SIZE

QR_Y = HEADER_START_Y + 8



# Question Section — closer to header (raised)

QS_START_Y = HEADER_END_Y + 200

QS_ROW_SPACING = 115

QS_OPT_SPACING = 140

QS_ROW0_CENTER_Y = QS_START_Y + 150



# Question layout helpers

QS_COL_GAP = 200

QS_OPT_START = 80

QS_BUBBLE_R = 42

# Footer: raise manual-name box and principal above bottom corner markers
FOOTER_LIFT = 170


