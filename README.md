# YT Media Fetcher

Aplicación web para descargar videos de YouTube en MP4 o audio en MP3, usando `yt-dlp` en el backend.

## Requisitos

- Python 3.10+
- `ffmpeg` instalado y disponible en el PATH (necesario para convertir a MP3 y unir video+audio en MP4)

## Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Variables de entorno opcionales:

- `ALLOWED_ORIGINS`: orígenes permitidos por CORS, separados por coma (default: `http://localhost:5500,http://127.0.0.1:5500`)
- `MAX_FILESIZE_MB`: tamaño máximo de descarga permitido en MB (default: `1024`)
- `PORT`: puerto del servidor (default: `8000`)

## Frontend

Sirve la carpeta `frontend/` con cualquier servidor estático, por ejemplo:

```bash
cd frontend
python3 -m http.server 5500
```

Abre `http://localhost:5500`. Si el backend corre en otra URL, actualiza la constante `API_BASE` en `script.js`.

## Uso responsable

Este proyecto es de carácter personal/educativo. El usuario es responsable de descargar únicamente contenido propio, de dominio público o para el cual tenga los derechos correspondientes, respetando los Términos de Servicio de YouTube y la legislación de derechos de autor aplicable.
