"""Servidor de desarrollo con no-cache: el navegador revalida SIEMPRE.

Evita que Safari/Chrome se queden con versiones viejas de index.html o los
JS/CSS durante las pruebas. Uso:  python serve.py  (puerto 8000)
"""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True

if __name__ == '__main__':
    with socketserver.ThreadingTCPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Sirviendo en http://localhost:{PORT} (sin cache)')
        httpd.serve_forever()
