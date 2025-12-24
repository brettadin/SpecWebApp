import urllib.request, json, sys

def post_json(url, body):
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read().decode('utf-8')

for name in ['water','methane','benzene']:
    try:
        status, text = post_json('http://localhost:8000/references/resolve/nist-webbook-ir', {'name': name, 'index':0})
        print('resolve', name, status, text[:400])
        j = json.loads(text)
        url = j[0]['source_url']
        payload = {
            'title': f'NIST WebBook IR: {name}',
            'source_name': 'NIST Chemistry WebBook',
            'source_url': url,
            'citation_text': f'NIST WebBook lookup for {name}',
            'trust_tier': 'Primary/Authoritative',
            'license': {'redistribution_allowed':'unknown'},
            'on_duplicate': 'prompt'
        }
        status2, text2 = post_json('http://localhost:8000/references/import/jcamp-dx', payload)
        print('import', name, status2)
        print(text2[:800])
    except Exception as e:
        print('ERROR', name, e)
