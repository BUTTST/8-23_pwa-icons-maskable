#!/usr/bin/env python3
"""
簡單的本地HTTPS服務器，用於測試PWA功能
PWA需要HTTPS才能正常工作（除了localhost）
"""

import http.server
import ssl
import socketserver
import os
from pathlib import Path

# 服務器配置
PORT = 8000
CERT_FILE = 'server.crt'
KEY_FILE = 'server.key'

class PWAHandler(http.server.SimpleHTTPRequestHandler):
    """自定義處理器，添加必要的PWA Headers"""
    
    def end_headers(self):
        # 添加安全Headers
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        
        # 添加Service Worker相關Headers
        if self.path.endswith('.js') and 'service-worker' in self.path:
            self.send_header('Service-Worker-Allowed', '/')
        
        # 添加manifest.json的正確MIME類型
        if self.path.endswith('.json'):
            self.send_header('Content-Type', 'application/json')
        
        super().end_headers()

def create_self_signed_cert():
    """創建自簽名證書用於本地HTTPS測試"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import serialization, hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime
        
        # 生成私鑰
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        
        # 創建證書
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "TW"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Taiwan"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Taipei"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Local Dev"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                x509.IPAddress(ipaddress.IPv6Address("::1")),
            ]),
            critical=False,
        ).sign(private_key, hashes.SHA256())
        
        # 寫入文件
        with open(CERT_FILE, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        with open(KEY_FILE, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        print("✅ 已創建自簽名證書")
        return True
        
    except ImportError:
        print("❌ 需要安裝 cryptography 庫來創建證書")
        print("請運行: pip install cryptography")
        return False
    except Exception as e:
        print(f"❌ 創建證書時出錯: {e}")
        return False

def main():
    # 檢查證書文件
    if not (Path(CERT_FILE).exists() and Path(KEY_FILE).exists()):
        print("🔧 未找到SSL證書，嘗試創建...")
        if not create_self_signed_cert():
            print("⚠️  無法創建HTTPS證書，使用HTTP模式")
            print("注意：某些PWA功能可能無法正常工作")
            
            # HTTP服務器
            with socketserver.TCPServer(("", PORT), PWAHandler) as httpd:
                print(f"🌐 HTTP服務器運行在: http://localhost:{PORT}")
                print("按 Ctrl+C 停止服務器")
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    print("\n👋 服務器已停止")
            return
    
    # HTTPS服務器
    with socketserver.TCPServer(("", PORT), PWAHandler) as httpd:
        # 配置SSL
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(CERT_FILE, KEY_FILE)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        
        print(f"🔒 HTTPS服務器運行在: https://localhost:{PORT}")
        print("📱 請在手機瀏覽器中訪問以測試PWA功能")
        print("⚠️  首次訪問時請接受自簽名證書警告")
        print("按 Ctrl+C 停止服務器")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 服務器已停止")

if __name__ == "__main__":
    import ipaddress
    main()
