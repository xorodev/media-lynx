import re
import subprocess
import tempfile
import os
import unicodedata
import json
import shutil
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Union

node_bin_path = os.path.join(os.getcwd(), "node-js", "bin")
if os.path.exists(node_bin_path):
    os.environ["PATH"] = f"{node_bin_path}:{os.environ['PATH']}"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

YOUTUBE_PATTERN = re.compile(
    r'^https?://(www\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)[\w\-]{11}'
)

class DownloadRequest(BaseModel):
    url: str
    format: Optional[str] = None
    format_id: Optional[str] = None
    media_type: Optional[str] = None
    quality: Optional[Union[str, int]] = None

class FormatRequest(BaseModel):
    url: str

def sanitize_url(url: str) -> str:
    url = url.strip()
    if not YOUTUBE_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="*ERROR. URL inválida, inténtelo de nuevo.")
    return url

def sanitize_filename(filename: str) -> str:
    filename = unicodedata.normalize('NFKD', filename)
    filename = filename.encode('ascii', 'ignore').decode('ascii')
    filename = re.sub(r'\s+', '_', filename)
    filename = re.sub(r'[^\w.-]', '_', filename)
    filename = re.sub(r'_{2,}', '_', filename)
    return filename

def cleanup_temp_dir(dir_path: str):
    try:
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
    except Exception as e:
        print(f"*ERROR al limpiar directorio temporal {dir_path}: {e}")

@app.post("/api/formats")
def get_formats(request: FormatRequest):
    url = sanitize_url(request.url)
    try:
        cmd = [
            "yt-dlp",
            "--dump-json",
            "--no-playlist",
            url
        ]
        
        if os.path.exists("cookies.txt"):
            cmd.insert(1, "cookies.txt")
            cmd.insert(1, "--cookies")
        else:
            cmd.insert(1, "youtube:player-client=android,web")
            cmd.insert(1, "--extractor-args")

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            print(f"--- ERROR DE YT-DLP EN FORMATOS: {result.stderr} ---")
            raise HTTPException(status_code=422, detail="*ERROR. No se pudo obtener los formatos del vídeo.")
        data = json.loads(result.stdout)
        raw_formats = data.get("formats", [])
        video_set = set()
        for f in raw_formats:
            height = f.get("height")
            vcodec = f.get("vcodec", "none")
            if vcodec not in (None, "none") and height and height > 0:
                video_set.add(height)

        video_qualities = sorted(list(video_set), reverse=True)
        audio_set = set()
        for f in raw_formats:
            vcodec = f.get("vcodec", "none")
            acodec = f.get("acodec", "none")
            if vcodec in (None, "none") and acodec not in (None, "none"):
                bitrate = f.get("abr") or f.get("tbr")
                if bitrate and bitrate > 0:
                    audio_set.add(int(bitrate))

            standard_audio = {320, 192, 128}
            audio_qualities = sorted(list(audio_set.union(standard_audio)), reverse=True)
            combined = [f for f in raw_formats if f.get("vcodec", "none") not in (None, "none")]

            seen = set()
            formats_out = []
            for f in reversed(combined):
                height = f.get("height")
                fps = f.get("fps")
                ext = f.get("ext", "?")
                acodec = f.get("acodec", "none")
                tbr = f.get("tbr") or f.get("vbr") or 0
                key = (height, fps, ext)

                if key in seen:
                    continue
                seen.add(key)

                if height:
                    label_parts = [f"{height}p"]
                    if fps and fps > 30:
                        label_parts.append(f"{int(fps)}fps")
                    label_parts.append(ext.upper())
                    if acodec and acodec != "none":
                        label_parts.append("+ audio")
                    label = " · ".join(label_parts)
                else:
                    label = f"{ext.upper()} ({int(tbr)}kbps)" if tbr else ext.upper()

                formats_out.append({
                    "format_id": f["format_id"],
                    "label": label,
                    "height": height or 0,
                    "fps": fps or 0,
                    "ext": ext,
                    "tbr": tbr,
                    "has_audio": acodec not in (None, "none"),
                })

            formats_out.sort(key=lambda x: (x["height"], x["fps"], x["tbr"]))

            return {
                "formats": formats_out,
                "video_qualities": video_qualities,
                "audio_qualities": audio_qualities,
                "title": data.get("title", "Sin título"),
                "thumbnail": data.get("thumbnail", ""),
                "duration": data.get("duration_string", ""),
                "channel": data.get("channel", "")
            }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="*ERROR. Tiempo de espera agotado.")


@app.post("/api/download")
def download(request: DownloadRequest, background_tasks: BackgroundTasks):
    url = sanitize_url(request.url)
    target_format = request.format
    if request.media_type:
        target_format = "mp3" if request.media_type == "audio" else "mp4"

    if target_format not in ("mp4", "mp3"):
        raise HTTPException(status_code=400, detail="*ERROR. Formato no permitido.")

    tmp_dir = tempfile.mkdtemp()

    try:
        if target_format == "mp3":
            audio_q = str(request.quality) if request.quality else "0"
            cmd = [
                "yt-dlp",
                "--no-playlist",
                "-x", "--audio-format", "mp3",
                "--audio-quality", audio_q,
                "-o", os.path.join(tmp_dir, "%(title)s.%(ext)s"),
                url
            ]
        else:
            if request.quality:
                fmt_selector = f"bestvideo[height={request.quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height={request.quality}]+bestaudio/best[height={request.quality}]/best"
            else:
                fmt_selector = (
                    f"{request.format_id}+bestaudio/best"
                    if request.format_id
                    else "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
                )

            cmd = [
                "yt-dlp",
                "--no-playlist",
                "-f", fmt_selector,
                "--merge-output-format", "mp4",
                "-o", os.path.join(tmp_dir, "%(title)s.%(ext)s"),
                url
            ]
            
        if os.path.exists("cookies.txt"):
            cmd.insert(1, "cookies.txt")
            cmd.insert(1, "--cookies")
        else:
            cmd.insert(1, "youtube:player-client=android,web")
            cmd.insert(1, "--extractor-args")

        media_type = "audio/mpeg" if target_format == "mp3" else "video/mp4"
        ext = target_format

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            print(f"--- ERROR DE YT-DLP EN DESCARGA: {result.stderr} ---")
            cleanup_temp_dir(tmp_dir)
            raise HTTPException(status_code=422, detail="*ERROR al procesar el archivo.")

        files = [f for f in os.listdir(tmp_dir) if f.endswith(f".{ext}")]
        if not files:
            cleanup_temp_dir(tmp_dir)
            raise HTTPException(status_code=500, detail="*ERROR. Archivo no generado.")

        file_path = os.path.join(tmp_dir, files[0])
        safe_filename = sanitize_filename(files[0])
        background_tasks.add_task(cleanup_temp_dir, tmp_dir)

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=safe_filename,
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'}
        )

    except subprocess.TimeoutExpired:
        cleanup_temp_dir(tmp_dir)
        raise HTTPException(status_code=504, detail="*ERROR. Descarga expirada. inténtelo de nuevo con un video más corto.")
    except Exception as e:
        cleanup_temp_dir(tmp_dir)
        raise HTTPException(status_code=500, detail=f"*ERROR interno: {str(e)}")

for folder in ["src", "assets"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app.mount("/src", StaticFiles(directory="src"), name="src")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

@app.get("/")
def serve_frontend():
    return FileResponse("index.html")