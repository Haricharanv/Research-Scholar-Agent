import urllib.request
import json
import time
import os
import uuid

# 1. Check Ollama
print("Checking Ollama...")
try:
    req = urllib.request.Request("http://localhost:11434/api/tags")
    with urllib.request.urlopen(req) as response:
        tags = json.loads(response.read().decode())
        models = [m["name"] for m in tags.get("models", [])]
        print("Ollama Models available:", models)
except Exception as e:
    print("Ollama check failed:", e)

# Create a valid minimal PDF file for testing
pdf_path = "test_dummy.pdf"
with open(pdf_path, "wb") as f:
    minimal_pdf = b'''%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 131 >>
stream
BT
/F1 24 Tf
100 700 Td
(Academic Paper on AI) Tj
0 -30 Td
(This paper discusses the methodology and key findings of AI integration.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000222 00000 n 
0000000404 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
493
%%EOF'''
    f.write(minimal_pdf)

BASE_URL = "http://localhost:8000"

def post_json(url, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header('Content-Type', 'application/json')
    return urllib.request.urlopen(req)

def multipart_upload(url, file_path):
    boundary = uuid.uuid4().hex
    with open(file_path, "rb") as f:
        file_data = f.read()
    
    body = (
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data; name=\"file\"; filename=\"test_dummy.pdf\"\r\n"
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode('utf-8') + file_data + f"\r\n--{boundary}--\r\n".encode('utf-8')
    
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    return urllib.request.urlopen(req)

# 2. Set Model Config
print("\nSetting Model Config...")
try:
    resp = post_json(f"{BASE_URL}/api/set-model-config", {"model_name": "phi3:mini"})
    print("Set Model Response:", json.loads(resp.read().decode()))
except Exception as e:
    print("Failed to set model config:", e)

# 3. Upload PDF
print("\nUploading PDF...")
try:
    resp = multipart_upload(f"{BASE_URL}/api/upload", pdf_path)
    upload_resp = json.loads(resp.read().decode())
    print("Upload Response:", upload_resp)
    paper_id = upload_resp["id"]
except Exception as e:
    print("Upload Failed:", e)
    paper_id = None

if paper_id:
    # 4. Summarize
    print(f"\nSummarizing Paper {paper_id}...")
    try:
        resp = post_json(f"{BASE_URL}/api/summarize", {"paper_id": paper_id})
        print("Summarize Response Status:", resp.status)
        print("Summarize Output:", json.loads(resp.read().decode()))
    except Exception as e:
        print("Summarize Failed:", e)

    # 5. Chat
    print("\nTesting Chat...")
    try:
        resp = post_json(f"{BASE_URL}/api/chat", {"message": "What is the methodology discussed in this paper?"})
        print("Chat response streaming:")
        for line in resp:
            if line.strip():
                print(line.decode().strip(), end="", flush=True)
        print("\nChat finished.")
    except Exception as e:
        print("Chat failed:", e)

# Cleanup
if os.path.exists(pdf_path):
    os.remove(pdf_path)
