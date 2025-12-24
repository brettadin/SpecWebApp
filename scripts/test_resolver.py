import urllib.request, json
names=['water','CO2','methane','benzene','ethanol','acetone','nitrogen dioxide','sulfur dioxide']
for n in names:
    try:
        data = json.dumps({'name':n,'index':0}).encode('utf-8')
        req = urllib.request.Request('http://localhost:8000/references/resolve/nist-webbook-ir', data=data, headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            txt = resp.read().decode('utf-8')
            print('---', n, resp.status)
            print(txt[:1000])
    except Exception as e:
        print('---', n, 'ERROR', e)
