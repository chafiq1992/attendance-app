from __future__ import annotations

import asyncio
from http import HTTPStatus
from typing import Iterable, Tuple, Callable, List


class AsgiToWsgi:
    """Minimal ASGI-to-WSGI adapter."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    def __call__(self, environ: dict, start_response: Callable) -> Iterable[bytes]:
        method = environ.get("REQUEST_METHOD", "GET")
        path = environ.get("PATH_INFO", "")
        query_string = environ.get("QUERY_STRING", "").encode("latin1")
        scheme = environ.get("wsgi.url_scheme", "http")
        server = (
            environ.get("SERVER_NAME", "localhost"),
            int(environ.get("SERVER_PORT", 80)),
        )
        client = (
            environ.get("REMOTE_ADDR", ""),
            int(environ.get("REMOTE_PORT", 0)),
        )

        headers: List[Tuple[bytes, bytes]] = []
        for key, value in environ.items():
            if key.startswith("HTTP_"):
                name = key[5:].replace("_", "-").encode("latin1")
                headers.append((name, value.encode("latin1")))
        if environ.get("CONTENT_TYPE"):
            headers.append((b"content-type", environ["CONTENT_TYPE"].encode("latin1")))
        if environ.get("CONTENT_LENGTH"):
            headers.append((b"content-length", environ["CONTENT_LENGTH"].encode("latin1")))

        body = environ.get("wsgi.input").read() if environ.get("wsgi.input") else b""

        scope = {
            "type": "http",
            "http_version": environ.get("SERVER_PROTOCOL", "HTTP/1.1").split("/")[1],
            "method": method,
            "scheme": scheme,
            "path": path,
            "raw_path": path.encode("utf8"),
            "query_string": query_string,
            "headers": headers,
            "server": server,
            "client": client,
        }

        response_status: int | None = None
        response_headers: List[Tuple[str, str]] = []
        response_body: bytearray = bytearray()

        async def receive() -> dict:
            nonlocal body
            data = {"type": "http.request", "body": body, "more_body": False}
            body = b""
            return data

        async def send(message: dict) -> None:
            nonlocal response_status, response_headers, response_body
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = [
                    (k.decode("latin1"), v.decode("latin1")) for k, v in message["headers"]
                ]
            elif message["type"] == "http.response.body":
                response_body.extend(message.get("body", b""))
            else:
                raise RuntimeError(f"Unsupported ASGI message: {message['type']}")

        async def run_app() -> None:
            await self.app(scope, receive, send)

        asyncio.run(run_app())

        status_line = f"{response_status} {HTTPStatus(response_status).phrase}"
        start_response(status_line, response_headers)
        return [bytes(response_body)]
