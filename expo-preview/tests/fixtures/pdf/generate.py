"""Synthetic, non-personal fixtures. Requires reportlab, PyMuPDF and DejaVu Sans.

The Unicode fixture emits Arabic glyphs in visual content-stream order, as PDF
producers commonly do. PDF.js reconstructs the logical text through bidi.
The second order fixture deliberately documents ambiguous producer ordering.
"""
from pathlib import Path
import fitz
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

folder = Path(__file__).parent
pdfmetrics.registerFont(TTFont('Arabic', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))

def make_text(filename, visual_order):
    canvas = Canvas(str(folder / filename), pagesize=(600, 300), invariant=1)
    canvas.setFont('Arabic', 18)
    for y, text in [(220, 'المراجعة المتباعدة تثبت المعرفة.'), (180, 'تعلم نشط')]:
        canvas.drawString(20, y, text[::-1] if visual_order else text)
    canvas.showPage()
    canvas.setFont('Arabic', 18)
    text = 'العلم نور'
    canvas.drawString(20, 220, text[::-1] if visual_order else text)
    canvas.drawString(20, 180, 'English 123')
    canvas.save()

make_text('arabic-visual-order.pdf', True)
make_text('arabic-standard.pdf', False)
doc = fitz.open(folder / 'arabic-visual-order.pdf')
scanned = fitz.open()
page = scanned.new_page(width=600, height=300)
page.insert_image(page.rect, pixmap=doc[0].get_pixmap(colorspace=fitz.csGRAY))
scanned.save(folder / 'scanned-page.pdf', deflate=True)
mixed = fitz.open()
mixed.insert_pdf(doc, from_page=0, to_page=0)
mixed.insert_pdf(scanned)
mixed.save(folder / 'mixed-text-image.pdf', deflate=True)
doc.save(folder / 'encrypted.pdf', encryption=fitz.PDF_ENCRYPT_AES_256,
         owner_pw='fixture-owner', user_pw='fixture-only', deflate=True)
many = fitz.open()
for _ in range(51): many.new_page()
many.save(folder / 'too-many-pages.pdf', deflate=True)
