from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import uvicorn
import scanner
import generator
import generator_elite
import generator_nafs
import generator_custom
import os
import json
import subprocess
import asyncio
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

def _merged_student_subject(student_subject: Optional[str], batch_subject: str) -> str:
    s = (student_subject or "").strip()
    if s:
        return s
    return (batch_subject or "").strip() or "عام"

# Shared thread pool for CPU-bound OMR processing
_omr_executor = ThreadPoolExecutor(max_workers=4)
DEBUG_SCANS_DIR = os.getenv("OMR_DEBUG_DIR", os.path.join(tempfile.gettempdir(), "omr_debug_scans"))

_PS_UTF8_PREFIX = (
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
    "$OutputEncoding = [System.Text.Encoding]::UTF8; "
)


def _run_powershell(command: str, timeout: int = 60):
    """Run PowerShell with UTF-8 stdout so Arabic messages stay readable."""
    return subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", _PS_UTF8_PREFIX + command],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


app = FastAPI(title="Smart OMR Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Student(BaseModel):
    id: str
    name: str
    class_name: str = "غير محدد"
    subject: Optional[str] = None
    date: str = "2024"
    day: str = ""
    seat_number: str = ""
    committee_number: str = ""

class BatchRequest(BaseModel):
    subject: str 
    students: List[Student]
    template: Optional[str] = "default"
    num_questions: int = 30

class CustomBatchRequest(BaseModel):
    subject: str
    students: List[Student]
    template_config: Optional[Dict[str, Any]] = None
    num_questions: int = 30

@app.get("/")
def read_root():
    return {"status": "OMR Engine is running (Professional Header mode)."}


@app.get("/engine-info")
def engine_info():
    """للتحقق من نشر scanner.py على السيرفر (بعد الرفع أعد تشغيل uvicorn)."""
    scanner_path = os.path.join(os.path.dirname(__file__), "scanner.py")
    try:
        with open(scanner_path, encoding="utf-8") as f:
            text = f.read()
        st = os.stat(scanner_path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {
        "scanner_size": st.st_size,
        "scanner_mtime_iso": __import__("datetime").datetime.fromtimestamp(st.st_mtime).isoformat(),
        "preview_align_fix": "rebuild_system_view_for_answers" in text,
        "merge_pick_fix": "pick = a1 if c1 >= c2 else a2" in text,
        "hint": "بعد scp لـ scanner.py نفّذ: pm2 restart omr أو pkill uvicorn ثم شغّل من جديد",
    }


@app.post("/scan")
async def scan_document(
    file: UploadFile = File(...),
    template: str = "default",
    num_questions: int = 30,
    scan_mode: str = "hybrid",
    from_scanner: bool = False,
):
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff')):
        raise HTTPException(status_code=400, detail="صيغة غير مدعومة — استخدم PNG أو JPG أو BMP.")
    try:
        content = await file.read()
        use_scanner_path = from_scanner
        if not use_scanner_path:
            import numpy as np
            import cv2
            nparr = np.frombuffer(content, np.uint8)
            probe = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if probe is not None and scanner.infer_flatbed_scan_image(probe):
                use_scanner_path = True
        result = scanner.scan_omr_with_mode(
            content,
            is_bytes=True,
            style=template,
            num_questions=num_questions,
            scan_mode=scan_mode,
            from_scanner=use_scanner_path,
        )
        out = dict(result)
        out["alignment_mode"] = "scanner" if use_scanner_path else "upload"
        return out
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scanning Error: {str(e)}")

@app.post("/calibrate-printer")
async def calibrate_printer(file: UploadFile = File(...)):
    """Analyze a printed blank sheet to verify scale/alignment accuracy."""
    try:
        content = await file.read()
        import numpy as np
        import cv2
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse(status_code=400, content={"detail": "الصورة غير صالحة"})
        gray = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR if len(img.shape)==3 else cv2.COLOR_BGR2GRAY)
        if len(gray.shape) == 3: gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        if w > h:
            gray = cv2.rotate(gray, cv2.ROTATE_90_COUNTERCLOCKWISE)
        report = scanner.calibrate_printer_geometry(gray)
        return report
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.post("/generate-batch")
async def generate_batch(request: BatchRequest):
    try:
        output_filename = f"batch_{request.subject}.pdf"
        student_dicts = [{"id": s.id, "name": s.name, "class": s.class_name,
                          "subject": _merged_student_subject(s.subject, request.subject),
                          "date": s.date, "day": s.day,
                          "seat_number": s.seat_number,
                          "committee_number": s.committee_number,
                          "num_questions": request.num_questions}
                         for s in request.students]
        loop = asyncio.get_event_loop()
        if request.template == "elite":
            await loop.run_in_executor(_omr_executor, lambda: generator_elite.create_bulk_pdf(student_dicts, output_pdf=output_filename))
        elif request.template == "nafs":
            await loop.run_in_executor(_omr_executor, lambda: generator_nafs.create_bulk_pdf(student_dicts, output_pdf=output_filename))
        else:
            await loop.run_in_executor(_omr_executor, lambda: generator.create_bulk_pdf(student_dicts, output_pdf=output_filename))
        return FileResponse(path=output_filename, filename=output_filename, media_type='application/pdf')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-batch-stream")
async def generate_batch_stream(request: BatchRequest):
    """Streaming version: sends NDJSON progress per sheet, then base64 PDF at the end.
    Runs the CPU-heavy generator in a thread to avoid blocking the event loop.
    """
    import base64 as _b64
    import queue as _queue
    import threading as _threading

    output_filename = f"batch_{request.subject}.pdf"
    student_dicts = [{"id": s.id, "name": s.name, "class": s.class_name,
                      "subject": _merged_student_subject(s.subject, request.subject),
                      "date": s.date, "day": s.day,
                      "seat_number": s.seat_number,
                      "committee_number": s.committee_number,
                      "num_questions": request.num_questions}
                     for s in request.students]

    if request.template == "nafs":
        gen_fn = generator_nafs.create_bulk_pdf_stream
    elif request.template == "elite":
        gen_fn = getattr(generator_elite, "create_bulk_pdf_stream", generator_elite.create_bulk_pdf)
    else:
        gen_fn = getattr(generator, "create_bulk_pdf_stream", generator.create_bulk_pdf)

    q = _queue.Queue()
    _DONE_SENTINEL = object()

    def _worker():
        try:
            for event in gen_fn(student_dicts, output_pdf=output_filename):
                q.put(event)
        except Exception as e:
            q.put({"type": "error", "msg": str(e)})
        finally:
            q.put(_DONE_SENTINEL)

    _threading.Thread(target=_worker, daemon=True).start()

    async def generate():
        loop = asyncio.get_event_loop()
        try:
            while True:
                event = await loop.run_in_executor(None, q.get)
                if event is _DONE_SENTINEL:
                    break
                if isinstance(event, dict) and event.get("type") == "error":
                    yield json.dumps(event) + "\n"
                    break
                if isinstance(event, dict) and event.get("finished"):
                    with open(output_filename, "rb") as f:
                        pdf_b64 = _b64.b64encode(f.read()).decode()
                    yield json.dumps({"type": "done", "pdf": pdf_b64}) + "\n"
                else:
                    yield json.dumps({"type": "progress",
                                      "done": event["done"],
                                      "total": event["total"],
                                      "name": event.get("name", "")}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "msg": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/generate-custom-batch")
async def generate_custom_batch(request: CustomBatchRequest):
    """Generate a batch PDF using a fully customizable NAFS-layout template."""
    try:
        output_filename = f"batch_custom_{request.subject}.pdf"
        config = request.template_config or {}
        if not config.get("logoDataUrl"):
            try:
                if os.path.exists(TEMPLATE_FILE):
                    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
                        saved = json.load(f)
                        if saved.get("logoDataUrl"):
                            config["logoDataUrl"] = saved["logoDataUrl"]
            except:
                pass
        student_dicts = [{"id": s.id, "name": s.name, "class": s.class_name,
                          "subject": _merged_student_subject(s.subject, request.subject),
                          "date": s.date, "day": s.day,
                          "seat_number": s.seat_number,
                          "committee_number": s.committee_number,
                          "num_questions": request.num_questions}
                         for s in request.students]
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_omr_executor, lambda: generator_custom.create_bulk_pdf(
            student_dicts, template_config=config, output_pdf=output_filename))
        return FileResponse(path=output_filename, filename=output_filename, media_type='application/pdf')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-custom-batch-stream")
async def generate_custom_batch_stream(request: CustomBatchRequest):
    """Streaming version of custom batch: NDJSON progress then base64 PDF.
    Runs the CPU-heavy generator in a thread to avoid blocking the event loop.
    """
    import base64 as _b64
    import queue as _queue
    import threading as _threading

    output_filename = f"batch_custom_{request.subject}.pdf"
    config = request.template_config or {}
    if not config.get("logoDataUrl"):
        try:
            if os.path.exists(TEMPLATE_FILE):
                with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    if saved.get("logoDataUrl"):
                        config["logoDataUrl"] = saved["logoDataUrl"]
        except:
            pass
    student_dicts = [{"id": s.id, "name": s.name, "class": s.class_name,
                      "subject": _merged_student_subject(s.subject, request.subject),
                      "date": s.date, "day": s.day,
                      "seat_number": s.seat_number,
                      "committee_number": s.committee_number,
                      "num_questions": request.num_questions}
                     for s in request.students]

    q = _queue.Queue()
    _DONE_SENTINEL = object()

    def _worker():
        try:
            for event in generator_custom.create_bulk_pdf_stream(
                    student_dicts, template_config=config, output_pdf=output_filename):
                q.put(event)
        except Exception as e:
            q.put({"type": "error", "msg": str(e)})
        finally:
            q.put(_DONE_SENTINEL)

    _threading.Thread(target=_worker, daemon=True).start()

    async def generate():
        loop = asyncio.get_event_loop()
        try:
            while True:
                event = await loop.run_in_executor(None, q.get)
                if event is _DONE_SENTINEL:
                    break
                if isinstance(event, dict) and event.get("type") == "error":
                    yield json.dumps(event) + "\n"
                    break
                if isinstance(event, dict) and event.get("finished"):
                    with open(output_filename, "rb") as f:
                        pdf_b64 = _b64.b64encode(f.read()).decode()
                    yield json.dumps({"type": "done", "pdf": pdf_b64}) + "\n"
                else:
                    yield json.dumps({"type": "progress",
                                      "done": event["done"],
                                      "total": event["total"],
                                      "name": event.get("name", "")}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "msg": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")

@app.get("/generate-individual")
async def generate_individual(student_id: str, student_name: str, class_name: str = "N/A", subject: str = "N/A", date: str = "2024", day: str = "", seat_number: str = "", committee_number: str = "", template: str = "default", num_questions: int = 30):
    try:
        filename = f"sheet_{student_id}.png"
        info = {"id": student_id, "name": student_name, "class": class_name, "subject": subject, "date": date, "day": day, "seat_number": seat_number, "committee_number": committee_number, "num_questions": num_questions}
        
        if template == "elite":
            generator_elite.generate_personalized_sheet(info, filename=filename)
        elif template == "nafs":
            generator_nafs.generate_personalized_sheet(info, filename=filename)
        else:
            generator.generate_personalized_sheet(info, filename=filename)
            
        return FileResponse(path=filename, filename=filename, media_type='image/png')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

TEMPLATE_FILE = "omr_template_config.json"

class TemplateConfig(BaseModel):
    tpl: Dict[str, Any]
    logoDataUrl: Optional[str] = ""

@app.post("/save-template")
async def save_template(config: TemplateConfig):
    """Save OMR template configuration from the visual designer."""
    try:
        with open(TEMPLATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"tpl": config.tpl, "logoDataUrl": config.logoDataUrl}, f, ensure_ascii=False, indent=2)
        return {"status": "ok", "message": "تم حفظ القالب بنجاح"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-template")
async def get_template():
    """Return the saved OMR template configuration."""
    if not os.path.exists(TEMPLATE_FILE):
        return JSONResponse(status_code=404, content={"detail": "لا يوجد قالب محفوظ"})
    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _build_ps_scan_script(pages: int) -> str:
    """
    Build a single PowerShell script that scans `pages` pages in one process,
    outputting each image path on a separate line as SCANPATH:<path>
    """
    return rf"""
Add-Type -AssemblyName "WIA"
$dm = New-Object -ComObject "WIA.DeviceManager"
if ($dm.DeviceInfos.Count -eq 0) {{
    Write-Output "SCANERR:لا يوجد سكانر متصل بجهازك"
    exit 1
}}
try {{
    $dev = $dm.DeviceInfos.Item(1).Connect()
}} catch {{
    Write-Output "SCANERR:فشل الاتصال بالسكانر (قد يكون مشغولاً أو مغلقاً)"
    exit 1
}}

if ($null -eq $dev) {{
    Write-Output "SCANERR:فشل الاتصال بالسكانر"
    exit 1
}}

$items = $dev.Items
if ($null -eq $items -or $items.Count -eq 0) {{
    Write-Output "SCANERR:خطأ في تعريف السكانر (لا يوجد Items)"
    exit 1
}}

$item = $items.Item(1)

# Try setting Document Handling Select (3088) to Feeder (1)
try {{ $dev.Properties.Item("3088").Value = 1 }} catch {{}}

# Set scan properties: color mode=4 (grayscale), 300 DPI to match template
try {{ $item.Properties.Item("6146").Value = 4 }} catch {{}}   # WIA_IPA_DATATYPE: Grayscale
try {{ $item.Properties.Item("6147").Value = 8 }} catch {{}}   # WIA_IPA_DEPTH: 8-bit
try {{ $item.Properties.Item("6148").Value = 300 }} catch {{}} # WIA_IPS_XRES: 300 DPI
try {{ $item.Properties.Item("6149").Value = 300 }} catch {{}} # WIA_IPS_YRES: 300 DPI

$WIA_FORMAT_BMP = "{{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}}"

for ($i = 1; $i -le {pages}; $i++) {{
    try {{
        $img = $item.Transfer($WIA_FORMAT_BMP)
        if ($null -ne $img) {{
            $tmp = [System.IO.Path]::GetTempFileName()
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            $outPath = $tmp -replace '\.tmp$','.bmp'
            
            $img.SaveFile($outPath)
            Write-Output "SCANPATH:$outPath"
        }}
    }} catch {{
        $errMsg = $_.Exception.Message
        # 0x80210003 is WIA_ERROR_PAPER_EMPTY
        if ($errMsg -match "0x80210003" -or $errMsg -match "Paper empty" -or $errMsg -match "empty") {{
            if ($i -eq 1) {{
                Write-Output "SCANERR:تم اختيار المسح ولكن لا يوجد ورق في ملقم السكانر (ADF)."
            }} else {{
                Write-Output "SCANDONE:انتهت الأوراق"
            }}
        }} else {{
            Write-Output "SCANERR:خطأ في الصفحة $i : $errMsg"
        }}
        break
    }}
}}
"""


def _run_omr_on_path(args):
    """Run OMR on a single image path (called in thread pool)."""
    img_path, page_num, template = args[:3]
    from_scanner = args[3] if len(args) > 3 else False
    num_questions = args[4] if len(args) > 4 else 30
    scan_mode = args[5] if len(args) > 5 else "hybrid"
    try:
        # ── Save a debug copy before processing ──────────────────────────
        os.makedirs(DEBUG_SCANS_DIR, exist_ok=True)
        debug_copy = os.path.join(DEBUG_SCANS_DIR, f"scanner_raw_p{page_num}.png")

        # Convert BMP → PNG using PIL for maximum compatibility
        try:
            from PIL import Image as PILImage
            img_pil = PILImage.open(img_path)
            img_pil.save(debug_copy, format="PNG")
            process_path = debug_copy          # process the PNG, not the BMP
        except Exception:
            process_path = img_path            # fall back to original BMP

        result = scanner.scan_omr_with_mode(process_path, is_bytes=False, style=template,
                                  from_scanner=from_scanner, num_questions=num_questions, scan_mode=scan_mode)
        result["page"] = page_num
        return {"ok": True, "result": result, "page": page_num}
    except Exception as e:
        return {"ok": False, "error": str(e), "page": page_num}
    finally:
        # Delete the original BMP temp file, keep the PNG debug copy
        try:
            os.remove(img_path)
        except Exception:
            pass


@app.post("/scan-from-scanner")
async def scan_from_scanner(template: str = "default", pages: int = 1, num_questions: int = 30, scan_mode: str = "hybrid"):
    """
    Fast multi-page scan:
    - ONE PowerShell process scans all pages sequentially (no per-page startup cost)
    - OMR processing runs in parallel on a thread pool
    """
    ps_script = _build_ps_scan_script(pages)

    # Run the scanner (blocking) in a thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        proc = await loop.run_in_executor(
            None,
            lambda: _run_powershell(ps_script, timeout=pages * 60),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="انتهت مهلة المسح — تأكد من وجود الأوراق في السكانر")

    if "NO_SCANNER" in proc.stderr:
        raise HTTPException(status_code=503, detail="لا يوجد سكانر متصل. تأكد من توصيل السكانر وتشغيله.")

    # Parse PowerShell output
    img_paths = []   # list of (path, page_num)
    ps_errors = []
    page_counter = 0
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith("SCANPATH:"):
            page_counter += 1
            path = line[len("SCANPATH:"):].strip()
            if os.path.exists(path):
                img_paths.append((path, page_counter))
            else:
                ps_errors.append(f"الصفحة {page_counter}: الملف غير موجود ({path})")
        elif line.startswith("SCANERR:"):
            page_counter += 1
            ps_errors.append(line[len("SCANERR:"):])

    if not img_paths and not ps_errors:
        ps_errors.append("لم يتم اكتشاف أي صور — تأكد من وجود الأوراق في السكانر")

    # Run OMR in parallel across all scanned images (with from_scanner=True)
    omr_tasks = [(path, pg, template, True, num_questions, scan_mode) for path, pg in img_paths]
    omr_results_raw = await loop.run_in_executor(
        _omr_executor,
        lambda: list(map(_run_omr_on_path, omr_tasks))
    )

    scanned_files = [r["result"] for r in omr_results_raw if r["ok"]]
    errors = ps_errors + [
        f"الصفحة {r['page']}: {r['error']}" for r in omr_results_raw if not r["ok"]
    ]

    return {
        "results": scanned_files,
        "errors": errors,
        "total_scanned": len(scanned_files),
        "status": "success" if scanned_files else "error"
    }


@app.post("/scan-from-scanner-stream")
async def scan_from_scanner_stream(template: str = "default", pages: int = 1, num_questions: int = 30, scan_mode: str = "hybrid"):
    """
    Streaming version: sends each OMR result as a JSON line (NDJSON)
    the moment it's ready, so the UI can show progress in real time.
    """
    ps_script = _build_ps_scan_script(pages)
    loop = asyncio.get_event_loop()

    async def generate():
        # 1. Run scanner (one process for all pages)
        try:
            proc = await loop.run_in_executor(
                None,
                lambda: _run_powershell(ps_script, timeout=pages * 60),
            )
        except subprocess.TimeoutExpired:
            yield json.dumps({"type": "error", "msg": "انتهت مهلة المسح"}) + "\n"
            return

        if "NO_SCANNER" in proc.stderr:
            yield json.dumps({"type": "error", "msg": "لا يوجد سكانر متصل"}) + "\n"
            return

        # 2. Collect paths
        img_paths = []
        page_counter = 0
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("SCANPATH:"):
                page_counter += 1
                path = line[len("SCANPATH:"):].strip()
                if os.path.exists(path):
                    img_paths.append((path, page_counter))
                else:
                    yield json.dumps({"type": "error", "msg": f"الصفحة {page_counter}: ملف مفقود"}) + "\n"
            elif line.startswith("SCANERR:"):
                page_counter += 1
                yield json.dumps({"type": "error", "msg": line[len("SCANERR:"):]}) + "\n"

        # 3. Process OMR for each image as soon as scan finishes, stream results
        for path, pg in img_paths:
            try:
                result = await loop.run_in_executor(
                    _omr_executor,
                    lambda p=path, pg=pg: _run_omr_on_path((p, pg, template, True, num_questions, scan_mode))
                )
                if result["ok"]:
                    yield json.dumps({"type": "result", "data": result["result"]}) + "\n"
                else:
                    yield json.dumps({"type": "error", "msg": f"الصفحة {pg}: {result['error']}"}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "msg": str(e)}) + "\n"

        yield json.dumps({"type": "done", "total": len(img_paths)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/calibrate-from-scanner")
async def calibrate_from_scanner():
    """Trigger a single-page scan and run calibration on it."""
    ps_script = _build_ps_scan_script(pages=1)
    loop = asyncio.get_event_loop()
    try:
        proc = await loop.run_in_executor(
            None,
            lambda: _run_powershell(ps_script, timeout=60),
        )
        if "NO_SCANNER" in (proc.stderr or ""):
            return JSONResponse(status_code=503, content={"detail": "لا يوجد سكانر متصل"})
            
        # Parse path
        path = None
        for line in proc.stdout.splitlines():
            if line.startswith("SCANPATH:"):
                path = line[len("SCANPATH:"):].strip()
                break
        
        if not path or not os.path.exists(path):
            return JSONResponse(status_code=500, content={"detail": "فشل استلام صورة المعايرة"})
            
        import cv2
        img = cv2.imread(path)
        if img is None:
            return JSONResponse(status_code=500, content={"detail": "فشل قراءة الملف الممسوح"})
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        if w > h:
            gray = cv2.rotate(gray, cv2.ROTATE_90_COUNTERCLOCKWISE)
            
        report = scanner.calibrate_printer_geometry(gray)
        
        # Cleanup temp file
        try: os.remove(path)
        except: pass
        
        return report
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.get("/scanner-status")
async def scanner_status():
    """Check if a WIA scanner is connected and available."""
    ps_check = r"""
Add-Type -AssemblyName "WIA"
$dm = New-Object -ComObject "WIA.DeviceManager"
$count = $dm.DeviceInfos.Count
$names = @()
for ($i=1; $i -le $count; $i++) {
    $names += $dm.DeviceInfos.Item($i).Properties("Name").Value
}
Write-Output ($count.ToString() + "|" + ($names -join ","))
"""
    try:
        result = _run_powershell(ps_check, timeout=10)
        output = result.stdout.strip()
        if "|" in output:
            count_str, names_str = output.split("|", 1)
            count = int(count_str)
            names = [n for n in names_str.split(",") if n]
            return {"available": count > 0, "count": count, "scanners": names}
        return {"available": False, "count": 0, "scanners": []}
    except Exception as e:
        return {"available": False, "count": 0, "scanners": [], "error": str(e)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

# trigger reload

# trigger reload 6 — safe COM property access for WIA scanners
