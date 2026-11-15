# 產生規則頁的兩張 SVG 流程圖，寫回 page.html 的 #flowChar / #flowWeap
import re, sys
FS=16
def esc(t): return t.replace('&','&amp;').replace('<','&lt;')
def text(cx, cy, lines, cls='t', small=None):
    # lines: list[str]; small: list[str] (smaller, muted)
    L=[(l,'t') for l in lines]+[(l,'ts') for l in (small or [])]
    hs=[FS*1.3 if c=='t' else FS*1.15 for _,c in L]
    y=cy-sum(hs)/2+hs[0]*0.72
    out=[]
    for (l,c),h in zip(L,hs):
        out.append(f'<text x="{cx}" y="{y:.1f}" class="{c if cls=="t" else cls+(" small" if c=="ts" else "")}">{esc(l)}</text>')
        y+=h
    return ''.join(out)
def box(cx,cy,w,h,kind,lines,small=None):
    tcls={'start':'tw'}.get(kind,'t')
    return f'<rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="12" class="n-{kind}"/>'+text(cx,cy,lines,tcls,small)
def dia(cx,cy,w,h,lines,kind='q'):
    pts=f'{cx},{cy-h/2} {cx+w/2},{cy} {cx},{cy+h/2} {cx-w/2},{cy}'
    return f'<polygon points="{pts}" class="n-{kind}"/>'+text(cx,cy,lines)
def arrow(pts,label=None,lx=None,ly=None,anchor='middle'):
    d='M'+' L'.join(f'{x},{y}' for x,y in pts)
    s=f'<path d="{d}" class="ar" marker-end="url(#ah)"/>'
    if label:
        s+=f'<text x="{lx}" y="{ly}" class="lb" text-anchor="{anchor}">{esc(label)}</text>'
    return s
def svg(w,h,body,label):
    defs='<defs><marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ahd"/></marker></defs>'
    return f'<svg class="flow-svg" viewBox="0 0 {w} {h}" role="img" aria-label="{label}">{defs}{body}</svg>'

# ---------- 角色池 ----------
y1,y2=230,470
B=[]
B.append(box(90,y1,130,84,'start',['抽卡'],['最多 90 抽','一定出五星']))
B.append(dia(300,y1,170,120,['出五星','了嗎？']))
B.append(dia(540,y1,170,120,['上一顆','有歪嗎？']))
B.append(dia(790,y1,170,120,['明光計數','是 3 嗎？']))
B.append(box(540,70,150,76,'win',['一定是 UP'],['大保底']))
B.append(box(790,70,150,76,'glow',['捕獲明光！'],['一定是 UP']))
B.append(dia(790,y2,170,120,['50 / 50','贏了嗎？']))
B.append(dia(540,y2,170,120,['觸發','捕獲明光？'],'qg'))
B.append(box(290,y2,150,84,'lose',['歪了','拿到常駐'],['下一顆一定 UP']))
B.append(box(790,630,150,70,'win',['UP 角色']))
B.append(box(540,630,150,76,'glow',['捕獲明光！'],['救回來變 UP']))
# arrows
B.append(arrow([(155,y1),(213,y1)]))
B.append(arrow([(385,y1),(453,y1)],'是',419,y1-10))
B.append(arrow([(300,y1-60),(300,130),(90,130),(90,y1-44)],'沒出：繼續抽',195,122))
B.append(arrow([(540,y1-60),(540,110)],'有',552,150,'start'))
B.append(arrow([(625,y1),(703,y1)],'沒有',664,y1-10))
B.append(arrow([(790,y1-60),(790,110)],'是',802,150,'start'))
B.append(arrow([(790,y1+60),(790,y2-62)],'不是',802,y1+100,'start'))
B.append(arrow([(790,y2+60),(790,593)],'贏',802,y2+92,'start'))
B.append(arrow([(705,y2),(627,y2)],'輸',666,y2-10))
B.append(arrow([(540,y2+60),(540,590)],'觸發',552,y2+92,'start'))
B.append(arrow([(455,y2),(367,y2)],'沒觸發',411,y2-10))
char=svg(900,680,''.join(B),'角色活動祈願：抽卡到出五星，判斷會不會歪的流程圖')

# ---------- 武器池 ----------
y1,y2=230,470
B=[]
B.append(box(90,y1,130,84,'start',['抽卡'],['最多 77 抽','一定出五星']))
B.append(dia(300,y1,170,120,['出五星','了嗎？']))
B.append(dia(540,y1,170,120,['命定值','是 1 嗎？']))
B.append(dia(790,y1,170,120,['上一把','歪到常駐？']))
B.append(box(540,70,160,76,'win',['一定是','定軌那把']))
B.append(box(790,70,170,84,'neutral',['兩把 UP','二選一'],['不是定軌的 → 命定值 1']))
B.append(box(560,y2+40,150,84,'win',['定軌那把'],['37.5%']))
B.append(box(790,y2+40,150,84,'neutral',['另一把 UP'],['37.5%','命定值變 1']))
B.append(box(1010-0,y2+40,150,84,'lose',['常駐武器'],['25%','命定值變 1']))
B.append(arrow([(155,y1),(213,y1)]))
B.append(arrow([(385,y1),(453,y1)],'是',419,y1-10))
B.append(arrow([(300,y1-60),(300,130),(90,130),(90,y1-44)],'沒出：繼續抽',195,122))
B.append(arrow([(540,y1-60),(540,110)],'是',552,150,'start'))
B.append(arrow([(625,y1),(703,y1)],'不是',664,y1-10))
B.append(arrow([(790,y1-60),(790,114)],'有',802,150,'start'))
B.append(arrow([(790,y1+60),(790,y2-4)],'沒有',802,y1+100,'start'))
B.append(arrow([(790,y2-30),(560,y2-30),(560,y2-4)]))
B.append(arrow([(790,y2-30),(1010,y2-30),(1010,y2-4)]))
weap=svg(1100,560,''.join(B),'武器活動祈願：抽卡到出五星，判斷是不是定軌那把的流程圖')

p=sys.argv[1]; s=open(p,encoding='utf-8').read()
def put(sec_id, svgstr):
    global s
    m=re.search(r'(<section class="card frame" id="%s">.*?<div class="flow"[^>]*>)(.*?)(\n      </div>\n      <p class="flow-key">)'%sec_id, s, re.S)
    assert m, sec_id
    s=s[:m.start(2)]+'\n        '+svgstr+s[m.end(2):]
put('flowChar',char); put('flowWeap',weap)
open(p,'w',encoding='utf-8').write(s)
print('ok')
