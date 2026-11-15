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

# ---------- 角色池 (橫向一排，結果放上下) ----------
Y=175; DW,DH=142,100; BW,BH=128,66
X=[64,224,396,568,740,912,1088]
B=[]
B.append(box(X[0],Y,112,84,'start',['抽卡'],['最多 90 抽','一定出五星']))
B.append(dia(X[1],Y,DW,DH,['出五星','了嗎？']))
B.append(dia(X[2],Y,DW,DH,['上一個','有歪嗎？']))
B.append(dia(X[3],Y,DW,DH,['明光計數','是 3 嗎？']))
B.append(dia(X[4],Y,DW,DH,['金光是','常駐角色？']))
B.append(dia(X[5],Y,DW,DH,['觸發','捕獲明光？'],'qg'))
B.append(box(X[6],Y,116,84,'lose',['歪了','拿到常駐'],['下一個一定 UP']))
B.append(box(X[2],45,BW,BH,'win',['一定是 UP'],['大保底']))
B.append(box(X[3],45,BW,BH,'glow',['捕獲明光！'],['一定是 UP']))
B.append(box(X[4],305,BW,BH,'win',['UP 角色']))
B.append(box(X[5],305,BW,BH,'glow',['捕獲明光！'],['救回來變 UP']))
h=DW/2
B.append(arrow([(X[0]+56,Y),(X[1]-h-6,Y)]))
B.append(arrow([(X[1]+h,Y),(X[2]-h-6,Y)],'是',(X[1]+X[2])/2,Y-10))
B.append(arrow([(X[1],Y-DH/2),(X[1],45),(X[0],45),(X[0],Y-48)],'沒出：繼續抽',(X[0]+X[1])/2,37))
B.append(arrow([(X[2],Y-DH/2),(X[2],45+BH/2+5)],'有',X[2]+10,Y-DH/2-12,'start'))
B.append(arrow([(X[2]+h,Y),(X[3]-h-6,Y)],'沒有',(X[2]+X[3])/2,Y-10))
B.append(arrow([(X[3],Y-DH/2),(X[3],45+BH/2+5)],'是',X[3]+10,Y-DH/2-12,'start'))
B.append(arrow([(X[3]+h,Y),(X[4]-h-6,Y)],'不是',(X[3]+X[4])/2,Y-10))
B.append(arrow([(X[4],Y+DH/2),(X[4],305-BH/2-5)],'不是',X[4]+10,Y+DH/2+22,'start'))
B.append(arrow([(X[4]+h,Y),(X[5]-h-6,Y)],'是',(X[4]+X[5])/2,Y-10))
B.append(arrow([(X[5],Y+DH/2),(X[5],305-BH/2-5)],'觸發',X[5]+10,Y+DH/2+22,'start'))
B.append(arrow([(X[5]+h,Y),(X[6]-58-6,Y)],'沒有',(X[5]+h+X[6]-58)/2,Y-10))
char=svg(1154,345,''.join(B),'角色活動祈願：抽卡到出五星，判斷會不會歪的流程圖')

# ---------- 武器池 ----------
X=[64,224,396,568]; R=790
B=[]
B.append(box(X[0],Y,112,84,'start',['抽卡'],['最多 77 抽','一定出五星']))
B.append(dia(X[1],Y,DW,DH,['出五星','了嗎？']))
B.append(dia(X[2],Y,DW,DH,['命定值','是 1 嗎？']))
B.append(dia(X[3],Y,DW,DH,['上一把','歪到常駐？']))
B.append(box(X[2],45,BW+10,BH,'win',['一定是','定軌那把']))
B.append(box(X[3],45,BW+44,BH,'neutral',['兩把 UP 二選一'],['不是定軌的 → 命定值 1']))
B.append(box(R,80,150,62,'win',['定軌那把'],['37.5%']))
B.append(box(R,175,150,62,'neutral',['另一把 UP'],['37.5%，命定值變 1']))
B.append(box(R,270,150,62,'lose',['常駐武器'],['25%，命定值變 1']))
B.append(arrow([(X[0]+56,Y),(X[1]-h-6,Y)]))
B.append(arrow([(X[1]+h,Y),(X[2]-h-6,Y)],'是',(X[1]+X[2])/2,Y-10))
B.append(arrow([(X[1],Y-DH/2),(X[1],45),(X[0],45),(X[0],Y-48)],'沒出：繼續抽',(X[0]+X[1])/2,37))
B.append(arrow([(X[2],Y-DH/2),(X[2],45+BH/2+5)],'是',X[2]+10,Y-DH/2-12,'start'))
B.append(arrow([(X[2]+h,Y),(X[3]-h-6,Y)],'不是',(X[2]+X[3])/2,Y-10))
B.append(arrow([(X[3],Y-DH/2),(X[3],45+BH/2+5)],'有',X[3]+10,Y-DH/2-12,'start'))
B.append(arrow([(X[3]+h,Y),(R-75-6,Y)],'沒有',(X[3]+h+R-75)/2,Y-10))
B.append(arrow([(680,Y),(680,80),(R-75-6,80)]))
B.append(arrow([(680,Y),(680,270),(R-75-6,270)]))
weap=svg(880,345,''.join(B),'武器活動祈願：抽卡到出五星，判斷是不是定軌那把的流程圖')

p=sys.argv[1]; s=open(p,encoding='utf-8').read()
def put(sec_id, svgstr):
    global s
    m=re.search(r'(<section class="card frame" id="%s">.*?<div class="flow"[^>]*>)(.*?)(\n      </div>\n      <p class="flow-key">)'%sec_id, s, re.S)
    assert m, sec_id
    s=s[:m.start(2)]+'\n        '+svgstr+s[m.end(2):]
put('flowChar',char); put('flowWeap',weap)
open(p,'w',encoding='utf-8').write(s)
print('ok')
