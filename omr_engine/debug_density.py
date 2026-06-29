import cv2, numpy as np
from omr_constants import *
from scanner import get_bubble_density

img = cv2.imread('debug_scans/last_warped.png')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

R_XS = [1536, 1672, 1808, 1944]
L_XS = [396,  530,  666,  804]
BUBBLE_MAP = ['D','C','B','A']

R_ROW0, R_STEP = 889, 111
L_ROW0, L_STEP = 1362, 112

print('=== RIGHT COLUMN (Q1-10) ===')
for i in range(10):
    y = R_ROW0 + i * R_STEP
    dens = [get_bubble_density(gray, x, y, radius=35) for x in R_XS]
    bi = int(np.argmax(dens))
    print(f'Q{i+1:2d} y={y}  D={dens[0]:.3f} C={dens[1]:.3f} B={dens[2]:.3f} A={dens[3]:.3f}  -> {BUBBLE_MAP[bi] if max(dens)>0.08 else "blank"}')

print()
print('=== LEFT COLUMN (Q11-20) ===')
for i in range(10):
    y = L_ROW0 + i * L_STEP
    dens = [get_bubble_density(gray, x, y, radius=35) for x in L_XS]
    bi = int(np.argmax(dens))
    print(f'Q{i+11:2d} y={y}  D={dens[0]:.3f} C={dens[1]:.3f} B={dens[2]:.3f} A={dens[3]:.3f}  -> {BUBBLE_MAP[bi] if max(dens)>0.08 else "blank"}')
