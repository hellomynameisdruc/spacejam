"""Two pilots in two browsers against a stand-in for Supabase (REST and the realtime socket are mocked
here, nothing leaves the machine): the host goes on air, the crew finds it in ON AIR and tunes in, the
tracks match, the fleet's chat reaches both, the host skips and the crew follows, the broadcast ends.

  cd web && npm run build && npx vite preview --port 4173 &
  python3 e2e/fleet.py          # URL=… and PW_CHROMIUM=… to override

Prints what each side sees; every line should show the two sides agreeing.
"""
import asyncio
import json
import base64
import time
import re
from playwright.async_api import async_playwright
import os
import tempfile
S = tempfile.gettempdir() + "/"
URL = os.environ.get("URL", "http://localhost:4173/")
CHROME = os.environ.get("PW_CHROMIUM") or None
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
def session(uid, email):
    jwt = b64({"alg":"HS256","typ":"JWT"}) + "." + b64({"sub":uid,"exp":int(time.time())+86400,"role":"authenticated","email":email}) + ".sig"
    return {"access_token":jwt,"refresh_token":"r","expires_in":86400,"expires_at":int(time.time())+86400,"token_type":"bearer","user":{"id":uid,"email":email,"aud":"authenticated","role":"authenticated"}}
U1="11111111-2222-3333-4444-555555555555"; U2="22222222-2222-3333-4444-555555555555"
PILOTS={U1:{"id":U1,"nick":"hellomynameisdruc","avatar":123456,"rank":"founder","admin":True},U2:{"id":U2,"nick":"DEEP-DIVER","avatar":987,"rank":"dj","admin":False}}
MSGS=[]; NEXT=[100]; PGB=[]  # postgres bindings: (ws, topic, id, event, table)
def emit_pg(rec):
    for ws,topic,bid,ev,table in PGB:
        if table=="messages" and ev in ("INSERT","*"):
            send_json(ws,[None,None,topic,"postgres_changes",{"ids":[bid],"data":{"type":"INSERT","schema":"public","table":"messages","commit_timestamp":"2026-10-23T20:00:00Z","record":rec,"columns":[],"errors":None}}])
def rest_for(uid):
  async def rest(route):
    u=route.request.url; acc=route.request.headers.get("accept","")
    if "/rest/v1/messages" in u and route.request.method=="POST":
        d=json.loads(route.request.post_data); rec={"id":NEXT[0],"pilot":uid,"body":d["body"],"room":d["room"],"created_at":"2026-10-23T20:%02d:00Z"%(NEXT[0]%60)}; NEXT[0]+=1; MSGS.append(rec); emit_pg(rec)
        await route.fulfill(status=201, content_type="application/json", body=json.dumps(rec if "object" in acc else [rec])); return
    if "/rest/v1/logbooks" in u:
        await route.fulfill(status=200 if route.request.method=="GET" else 201, content_type="application/json", body=json.dumps(None if "object" in acc and route.request.method=="GET" else [])); return
    if "/rest/v1/messages" in u:
        m=re.search(r"room=eq\.([^&]+)",u); import urllib.parse; r=urllib.parse.unquote(m.group(1)) if m else "all"
        body=[x for x in MSGS if x["room"]==r][::-1]
    elif "/rest/v1/pilots" in u:
        m=re.search(r"id=eq\.([\w-]+)",u)
        if m: body = PILOTS[m.group(1)] if "object" in acc else [PILOTS[m.group(1)]]
        else: body=list(PILOTS.values())
    else: body={}
    await route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
  return rest

# a tiny realtime server: joins, presence and broadcast relay
socks=[]  # dicts: ws, topics {topic: (join_ref, key)}, meta {topic: meta}
def send_json(ws, arr): ws.send(json.dumps(arr))
def presence_diff(topic, joins, leaves):
    for s in socks:
        if topic in s["topics"]: send_json(s["ws"], [None, None, topic, "presence_diff", {"joins":joins, "leaves":leaves}])
def handler(ws):
    me={"ws":ws,"topics":{},"meta":{}}; socks.append(me)
    def on_msg(m):
        if isinstance(m, (bytes, bytearray)):
            b=bytes(m); kind,jl,rl,tl,el,ml,enc=b[:7]; o=7
            jr=b[o:o+jl]; o+=jl; ref=b[o:o+rl]; o+=rl; topic=b[o:o+tl].decode(); o+=tl; ev=b[o:o+el]; o+=el; meta=b[o:o+ml]; o+=ml; payload=b[o:]
            out=bytes([4,len(topic.encode()),len(ev),len(meta),enc])+topic.encode()+ev+meta+payload
            for s in socks:
                if s is not me and topic in s["topics"]: s["ws"].send(out)
            if ref: send_json(ws,[jr.decode() or None, ref.decode(), topic, "phx_reply", {"status":"ok","response":{}}])
            return
        jr,ref,topic,ev,p=json.loads(m)
        if ev=="phx_join":
            key=(p.get("config",{}).get("presence",{}) or {}).get("key") or ref
            me["topics"][topic]=(jr,key)
            pcs=[]
            for f in p.get("config",{}).get("postgres_changes",[]) or []:
                bid=len(PGB)+1; PGB.append((ws,topic,bid,f.get("event"),f.get("table"))); pcs.append(dict(f,id=bid))
            send_json(ws,[jr,ref,topic,"phx_reply",{"status":"ok","response":{"postgres_changes":pcs}}])
            state={}
            for s in socks:
                if topic in s["topics"] and topic in s["meta"]: state[s["topics"][topic][1]]={"metas":[s["meta"][topic]]}
            send_json(ws,[jr,None,topic,"presence_state",state])
        elif ev=="presence":
            key=me["topics"].get(topic,(None,"x"))[1]
            if p.get("event")=="track":
                old=me["meta"].get(topic); meta=dict(p["payload"]); meta["phx_ref"]=str(time.time())
                me["meta"][topic]=meta
                presence_diff(topic,{key:{"metas":[meta]}},{key:{"metas":[old]}} if old else {})
            else:
                old=me["meta"].pop(topic,None)
                if old: presence_diff(topic,{}, {key:{"metas":[old]}})
            send_json(ws,[jr,ref,topic,"phx_reply",{"status":"ok","response":{}}])
        elif ev=="phx_leave":
            t=me["topics"].pop(topic,None); old=me["meta"].pop(topic,None)
            send_json(ws,[jr,ref,topic,"phx_reply",{"status":"ok","response":{}}])
            if old and t: presence_diff(topic,{}, {t[1]:{"metas":[old]}})
        else:
            send_json(ws,[jr,ref,topic,"phx_reply",{"status":"ok","response":{}}])
    ws.on_message(on_msg)

async def page(b, uid, email, name):
    ctx = await b.new_context(viewport={"width":1440,"height":900}, device_scale_factor=1)
    await ctx.route("https://muuaqquhqgthkfzlqkvq.supabase.co/**", rest_for(uid))
    await ctx.route_web_socket(re.compile(r"wss://muuaqquhqgthkfzlqkvq\.supabase\.co/.*"), handler)
    await ctx.add_init_script("localStorage.setItem('kosmos-briefed','1');" + f"localStorage.setItem('sb-muuaqquhqgthkfzlqkvq-auth-token', {json.dumps(json.dumps(session(uid,email)))});")
    pg = await ctx.new_page(); pg.on("console", lambda m: print(name, "console:", m.text) if m.type in ("error",) else None)
    await pg.goto(URL); await pg.wait_for_timeout(3000)
    return pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        host = await page(b, U1, "a@x.com", "HOST"); crew = await page(b, U2, "b@x.com", "CREW")
        await host.keyboard.press("Escape"); await host.fill("#q", "Rush Hour"); await host.wait_for_timeout(700); await host.keyboard.press("Enter"); await host.wait_for_timeout(2000)
        await host.locator("[data-orbit]").click(); await host.wait_for_timeout(2500)
        await host.click("#dockCast"); await host.wait_for_timeout(1500)
        print("host bar:", await host.inner_text("#rail"))
        await crew.click("#tabComms"); await crew.wait_for_timeout(800); await crew.click("[data-ch=air]"); await crew.wait_for_timeout(1000)
        print("crew air:", (await crew.inner_text("#commsList"))[:200])
        await crew.screenshot(path=S+"fl_air.png")
        await crew.click("#commsList [data-join]"); await crew.wait_for_timeout(4000)
        print("crew bar:", await crew.inner_text("#rail"), "| crew np:", await crew.inner_text("#npTitle"), "| host np:", await host.inner_text("#npTitle"))
        print("host bar:", await host.inner_text("#rail"))
        await crew.fill("#commsIn", "hey captain, great track"); await crew.keyboard.press("Enter"); await crew.wait_for_timeout(800)
        await host.click("#tabComms"); await host.wait_for_timeout(800)
        await host.wait_for_timeout(800)
        print("host fleet chat:", (await host.inner_text("#commsList"))[:300])
        await host.fill("#commsIn", "welcome aboard"); await host.keyboard.press("Enter"); await crew.wait_for_timeout(1200)
        print("crew fleet chat:", (await crew.inner_text("#commsList"))[:300])
        # host changes track
        await host.click("#pNext"); await host.wait_for_timeout(3500)
        print("after next: crew np:", await crew.inner_text("#npTitle"), "| host np:", await host.inner_text("#npTitle"))
        await host.screenshot(path=S+"fl_host.png"); await crew.screenshot(path=S+"fl_crew.png")
        await host.click("#dockCast"); await host.wait_for_timeout(1500)
        print("after end: crew bar:", await crew.inner_text("#rail"))
        await b.close()
asyncio.run(main())
