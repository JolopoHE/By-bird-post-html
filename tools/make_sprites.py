# 鳥鳥傳信：像素美術產生器。所有圖都在小畫布上逐格畫出，輸出到 assets/
import math, os  # 需要 Python 3 與 Pillow：pip install pillow；執行後會重新產生 assets/ 裡所有圖
from PIL import Image
OUTDIR=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','assets'); os.makedirs(OUTDIR,exist_ok=True)
OUT=(59,42,26)
def hexc(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def shade(c,f): return tuple(max(0,min(255,int(v*f))) for v in c)

def finish(g,flat,w,h,outline=True):
    """邊緣打亮/壓暗（光從左上來）＋深色外框"""
    im=Image.new('RGBA',(w,h),(0,0,0,0)); p=im.load()
    def e(x,y): return not(0<=x<w and 0<=y<h) or g[y][x] is None
    for y in range(h):
        for x in range(w):
            c=g[y][x]
            if c is None:
                if outline and any(not e(x+dx,y+dy) for dx,dy in((1,0),(-1,0),(0,1),(0,-1))): p[x,y]=OUT+(255,)
                continue
            if (x,y) not in flat:
                if e(x,y-1) or e(x-1,y): c=shade(c,1.16)
                elif e(x,y+1) or e(x+1,y): c=shade(c,0.80)
            p[x,y]=c+(255,)
    return im

# ---------- 靜態物件：直接在格子上畫 ----------
class Sprite:
    def __init__(s,w,h): s.w,s.h=w,h; s.g=[[None]*w for _ in range(h)]; s.flat=set()
    def px(s,x,y,c,flat=True):
        x=int(x); y=int(y)
        if 0<=x<s.w and 0<=y<s.h:
            s.g[y][x]=hexc(c) if isinstance(c,str) else c
            (s.flat.add if flat else s.flat.discard)((x,y))
    def rect(s,x0,y0,x1,y1,c,flat=False):
        for y in range(y0,y1+1):
            for x in range(x0,x1+1): s.px(x,y,c,flat)
    def ell(s,cx,cy,rx,ry,c,flat=False):
        for y in range(s.h):
            for x in range(s.w):
                if ((x+.5-cx)/rx)**2+((y+.5-cy)/ry)**2<=1: s.px(x,y,c,flat)
    def tri(s,a,b,c_,col,flat=False):
        def sg(p,q,r): return (p[0]-r[0])*(q[1]-r[1])-(q[0]-r[0])*(p[1]-r[1])
        for y in range(s.h):
            for x in range(s.w):
                P=(x+.5,y+.5); d1,d2,d3=sg(P,a,b),sg(P,b,c_),sg(P,c_,a)
                if not((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0)): s.px(x,y,col,flat)
    def line(s,x0,y0,x1,y1,c):
        n=int(max(abs(x1-x0),abs(y1-y0)))+1
        for i in range(n+1):
            t=i/n; s.px(round(x0+(x1-x0)*t),round(y0+(y1-y0)*t),c)
    def clear(s,x,y):
        if 0<=x<s.w and 0<=y<s.h: s.g[y][x]=None
    def render(s,outline=True): return finish(s.g,s.flat,s.w,s.h,outline)

# ---------- 鳥：用形狀描述，可朝任意方向重新取樣成像素 ----------
CELL=48
def raster(prims,angle):
    """prims: 以鳥頭朝上(-y)、中心(0,0) 描述的形狀；angle: 螢幕上的朝向(0=右，順時針)"""
    th=math.radians(angle+90); ct,st=math.cos(th),math.sin(th)
    g=[[None]*CELL for _ in range(CELL)]; flat=set()
    for py in range(CELL):
        for px in range(CELL):
            dx,dy=px+.5-CELL/2,py+.5-CELL/2
            lx,ly=dx*ct+dy*st,-dx*st+dy*ct
            for kind,a,col,fl in reversed(prims):
                if kind=='e':
                    cx,cy,rx,ry=a; hit=((lx-cx)/rx)**2+((ly-cy)/ry)**2<=1
                else:
                    x0,y0,x1,y1=a; hit=x0<=lx<=x1 and y0<=ly<=y1
                if hit:
                    g[py][px]=hexc(col)
                    if fl: flat.add((px,py))
                    break
    return finish(g,flat,CELL,CELL)

BIRDS={
 'sparrow':dict(body=(0,2,6.4,7.6),head=(0,-6,4.6,4.4),wing=(5.6,3.3,2.9,6.4),tail=(3,7,13),span=(7.2,4.6),
   back='#a8713f',wingc='#7d4f2a',headc='#c39a6b',tailc='#5e3c20',beak='#e0a13a',eye='#1c1410'),
 'pigeon':dict(body=(0,3,7.4,9.2),head=(0,-7.6,4.5,4.5),wing=(6.4,4.2,3.3,7.8),tail=(4,10,17),span=(8.8,5.2),
   back='#a3adb8',wingc='#8792a0',headc='#7d8a98',tailc='#5d6873',beak='#e8dccd',eye='#e07b39'),
 'owl':dict(body=(0,3.5,9.2,9.6),head=(0,-6.5,7.6,6.0),wing=(8.2,4.5,3.4,8.2),tail=(4,11,15.5),span=(9.6,6.2),
   back='#8a6a4c',wingc='#6a4f38',headc='#9a7858',tailc='#553f2c',beak='#e0a13a',eye='#1c1410'),
 'dove':dict(body=(0,3,6.6,8.4),head=(0,-6.6,4.2,4.2),wing=(5.8,4,2.9,7.2),tail=(3,10,18),span=(8.2,4.8),
   back='#b79a8c',wingc='#8f7466',headc='#c9afa2',tailc='#7a6256',beak='#5a4a44',eye='#7a2a22'),
}
def bird(kind,pose,cargo=False):
    d=BIRDS[kind]; P=[]
    def e(cx,cy,rx,ry,c,fl=False): P.append(('e',(cx,cy,rx,ry),c,fl))
    def r(x0,y0,x1,y1,c,fl=False): P.append(('r',(x0,y0,x1,y1),c,fl))
    def dot(x,y,c,rad=.78): e(x,y,rad,rad,c,True)
    fly=pose in('fly1','fly2'); dy=(-2 if pose=='fly1' else 2)
    hy=-2 if pose=='peck' else 0
    bx,by,brx,bry=d['body']; hx,hcy,hrx,hry=d['head']; hcy+=hy
    tw,t0,t1=d['tail']
    # 尾巴
    r(-tw,t0,tw,t1,d['tailc']); r(-tw+1,t1,tw-1,t1+1,d['tailc'])
    if kind=='dove': r(-tw,t1-1.2,tw,t1+1,'#f1e7d2',True)
    if kind=='pigeon': r(-tw,t1-2.2,tw,t1-0.8,'#3f4852',True)
    # 展開的翅膀（飛行）
    if fly:
        sp,ch=d['span']
        for sx in(-1,1):
            e(sx*(brx+sp*0.42),by-1.5+dy*0.6,sp,ch,d['wingc'])
            for i in range(3):
                dot(sx*(brx+sp*0.25+i*sp*0.42),by+0.6+dy*0.6+(i%2),'#3b2a1a')
            if kind in('sparrow','dove'):
                for i in range(3): dot(sx*(brx+sp*0.2+i*sp*0.36),by-3+dy*0.6,'#f1e7d2',.7)
            if kind=='pigeon':
                e(sx*(brx+sp*0.5),by-0.2+dy*0.6,sp*0.7,.8,'#3f4852',True)
    # 身體
    e(bx,by,brx,bry,d['back'])
    # 收起的翅膀
    if not fly:
        wx,wy,wrx,wry=d['wing']
        for sx in(-1,1):
            e(sx*wx,wy,wrx,wry,d['wingc'])
            if kind in('sparrow','dove'): e(sx*wx,wy-3.8,1.4,.75,'#f1e7d2',True)
            if kind=='pigeon':
                e(sx*wx,wy+1.5,wrx*.95,.8,'#3f4852',True); e(sx*wx,wy+4.2,wrx*.8,.8,'#3f4852',True)
            else:
                for k in(0.5,3.0): dot(sx*wx,wy+k,'#3b2a1a',.7)
    # 背上的花紋
    if kind=='sparrow':
        for (x,y) in((-.6,-2.5),(.6,.2),(-.6,3),(.6,5.6)): dot(x,by-2+y,'#3b2a1a')
    if kind=='owl':
        for (x,y) in((-3,-2),(2.5,-.5),(-1,2),(3.5,3.5),(-3.5,5),(0.5,6)): dot(x,by-2+y,'#d9c2a3')
    if kind=='pigeon': e(0,hcy+4.6,3.8,1.9,'#5f9a84',True)          # 頸部的綠色光澤
    if kind=='dove':                                                  # 頸環
        e(0,hcy+4.3,4.0,1.5,'#f1e7d2',True); e(0,hcy+4.3,3.4,.9,'#2e2318',True)
    # 頭
    e(hx,hcy,hrx,hry,d['headc'])
    if kind=='sparrow':
        e(0,hcy-.8,2.4,3.3,'#8a4a22',True)
        for sx in(-1,1): e(sx*4.0,hcy+1.6,1.25,1.05,'#e6dccb',True)
    if kind=='owl':
        for sx in(-1,1):
            e(sx*5.6,hcy-5.2,1.5,2.0,'#553f2c')                       # 耳羽
        e(0,hcy-2.4,5.6,3.0,'#c9ad8a',True)                           # 臉盤
        for sx in(-1,1):
            e(sx*2.9,hcy-2.6,1.55,1.55,'#f2c14e',True); dot(sx*2.9,hcy-2.9,'#1c1410',.72)
        r(-.9,hcy-6.3,.9,hcy-5.0,d['beak'],True)
    else:
        ex=hrx*.58
        for sx in(-1,1): dot(sx*ex,hcy-.3,d['eye'])
        r(-1,hcy-hry-1.25,1,hcy-hry-.05,d['beak'],True)
        if kind=='pigeon': dot(0,hcy-hry+.9,'#ffffff',.7)
    # 嘴上叼的信
    if cargo:
        ty=hcy-hry-(2.2 if kind!='owl' else 1.6)
        r(-3.4,ty-4.6,3.4,ty-.2,'#fbf3df',True); dot(0,ty-2.4,'#d9604c',.8)
    return P

ROWS=[('idle',0),('peck',0),('fly1',0),('fly2',0),('idle',1),('fly1',1),('fly2',1)]
for kind in BIRDS:
    sheet=Image.new('RGBA',(CELL*8,CELL*len(ROWS)),(0,0,0,0))
    for ri,(pose,cg) in enumerate(ROWS):
        P=bird(kind,pose,bool(cg))
        for di in range(8):
            sheet.paste(raster(P,di*45),(di*CELL,ri*CELL))
    sheet.save(f'{OUTDIR}/bird_{kind}.png')

# ---------- 信件三種紙張 × 未拆/已拆（標題由網頁疊上去，圖上不放字） ----------
def note(opened):
    """麻雀的信：信封。未拆有紅色封蠟；已拆封蓋掀開、露出信紙。標題疊在下半部"""
    P='#fbf3df'; L='#cdb98f'
    if not opened:
        s=Sprite(54,40); s.rect(1,1,52,38,P)
        for i in range(25):                               # 封蓋的 V 字摺線
            y=2+round(i*15/24)
            s.px(2+i,y,L); s.px(51-i,y,L)
        for i in range(11):                               # 下方兩側摺線
            s.px(2+i,37-i,L); s.px(51-i,37-i,L)
        s.rect(2,38,51,38,'#ddd0b2',True)
        s.rect(24,14,29,19,'#d9604c',True)                # 封蠟
        for (x,y) in((24,14),(29,14),(24,19),(29,19)): s.px(x,y,P)
        s.px(25,15,'#f08a78'); s.px(26,15,'#f08a78'); s.px(25,16,'#f08a78')
        return s.render()
    s=Sprite(54,48)
    for i in range(8):                                    # 掀開的梯形封蓋
        inset=(7-i)*3
        s.rect(1+inset,1+i,52-inset,1+i,'#f6ecd2')
    s.rect(1,9,52,46,P)
    s.rect(3,9,50,24,'#b89c6c',True)                      # 信封內側
    s.rect(9,3,44,24,'#ffffff',True)                      # 露出的信紙
    for y in(7,11,15,19): s.rect(12,y,41 if y<19 else 30,y,'#b9d3e6',True)
    s.rect(9,24,44,24,'#e2d6bb',True)
    s.rect(1,25,52,46,P)
    for i in range(11):
        s.px(2+i,45-i,L); s.px(51-i,45-i,L)
    s.rect(2,46,51,46,'#ddd0b2',True)
    return s.render()

def postcard(opened):
    s=Sprite(60,40); s.rect(1,1,58,38,'#fff3d2')
    for x in range(3,57): s.px(x,3,'#e9d6a8'); s.px(x,36,'#e9d6a8')
    for y in range(3,37): s.px(3,y,'#e9d6a8'); s.px(56,y,'#e9d6a8')
    s.rect(44,6,53,17,'#fffaf0',True); s.rect(45,7,52,16,'#d9604c',True)
    s.rect(47,9,50,14,'#f08a78',True); s.px(48,11,'#fffaf0'); s.px(49,12,'#fffaf0')
    for x in range(44,54,2): s.px(x,6,'#fff3d2'); s.px(x,17,'#fff3d2')
    if opened:                                            # 郵戳
        for a in range(0,360,6):
            x=45+7*math.cos(math.radians(a)); y=14+7*math.sin(math.radians(a)); s.px(round(x),round(y),'#4a3a2c')
        for yy in(11,14,17):
            for x in range(36,52): s.px(x,yy+(x//3)%2,'#4a3a2c')
    return s.render()

def parcel(opened):
    """貓頭鷹的包裹：牛皮紙包裝、麻繩十字綁、繩結上插一根羽毛；左上的標籤放標題"""
    KT='#d8ad74'; KF='#b08450'; ROPE='#74552f'; ROPE2='#a8854f'; LAB='#fff8ea'
    s=Sprite(60,50)
    def rope_v(x,y0,y1,dark=False):
        for y in range(y0,y1+1):
            c=(ROPE if (y%3) else ROPE2) if not dark else ('#6f5535' if (y%3) else '#8a6b45')
            s.px(x,y,c); s.px(x+1,y,c)
    def rope_h(y,x0,x1):
        for x in range(x0,x1+1):
            c=ROPE if (x%3) else ROPE2
            s.px(x,y,c); s.px(x,y+1,c)
    def feather(x0,y0,x1,y1):
        n=max(abs(x1-x0),abs(y1-y0))
        for i in range(n+1):
            t=i/n; x=round(x0+(x1-x0)*t); y=round(y0+(y1-y0)*t)
            w=1 if t<.15 else (3 if t<.8 else 2)          # 羽根細、中段寬、尖端收
            if t>=.15:
                for d in range(-w,w+1):
                    s.px(x+d,y,'#f4efe6' if d<0 else '#d9d2c5')
            s.px(x,y,'#7a7268')
        s.px(x1,y1-1,'#f4efe6')
    if not opened:
        s.rect(1,1,58,33,KT); s.rect(1,34,58,48,KF)
        s.rect(1,33,58,33,'#e2b981',True)                 # 頂面前緣的亮邊
        for i in range(7):                                # 包裝紙的摺角
            s.px(57-i,2+i,'#bb8f59'); s.px(2+i,32-i,'#bb8f59')
        for i in range(6): s.px(2+i,47-i,'#96703f'); s.px(57-i,47-i,'#96703f')
        s.rect(4,4,41,25,LAB,True); s.rect(4,25,41,25,'#e2d6bb',True)     # 空白標籤（放標題）
        s.rect(4,26,41,26,'#b08450',True)
        rope_h(28,1,58); rope_v(48,1,33); rope_v(48,34,48,True)
        s.rect(46,26,51,31,ROPE,True); s.px(47,27,ROPE2); s.px(50,30,ROPE2)   # 繩結
        s.rect(43,31,45,32,ROPE,True); s.rect(52,31,54,32,ROPE,True)
        feather(50,27,54,6)
    else:
        s.rect(1,1,58,33,'#6e5234',True); s.rect(1,34,58,48,KF)
        s.rect(1,1,7,33,'#dcb37c'); s.rect(52,1,58,33,'#dcb37c')        # 左右掀開的紙
        s.rect(8,1,51,5,'#dcb37c'); s.rect(8,30,51,33,KT)
        s.rect(11,8,47,26,LAB,True); s.rect(11,26,47,26,'#e2d6bb',True)  # 裡面的信紙（放標題）
        for y in(12,22): s.px(4,y,'#b58a5a'); s.px(55,y,'#b58a5a')
        for i in range(6): s.px(2+i,47-i,'#96703f'); s.px(57-i,47-i,'#96703f')
        for x in range(6,20): s.px(x,40+(x//3)%2,ROPE if x%3 else ROPE2)   # 解開的麻繩
        for x in range(38,46): s.px(x,43-(x//3)%2,ROPE if x%3 else ROPE2)
        feather(22,45,34,37)
    return s.render()
def aged(im,stage,seed):
    """信件變老的三個階段：逐步泛黃、出現污漬，最後一階段缺角"""
    import random; rnd=random.Random(seed*10+stage)
    im=im.copy(); p=im.load(); w,h=im.size
    f=(0,.33,.66,1)[stage]
    for y in range(h):
        for x in range(w):
            r,g,b,a=p[x,y]
            if not a or (r,g,b)==OUT: continue
            p[x,y]=(int(r*(1-.10*f)),int(g*(1-.20*f)),int(b*(1-.42*f)),a)
    for _ in range(stage*5):                              # 污漬
        x,y=rnd.randrange(3,w-3),rnd.randrange(3,h-3)
        for dx,dy in rnd.sample([(0,0),(1,0),(0,1),(1,1),(-1,0)],rnd.randint(1,3)):
            r,g,b,a=p[x+dx,y+dy]
            if a and (r,g,b)!=OUT: p[x+dx,y+dy]=(int(r*.82),int(g*.74),int(b*.6),a)
    if stage==3:                                          # 缺角與裂痕
        bottom=max(y for y in range(h) if p[w//2,y][3])
        for i in range(5):
            for j in range(5-i): p[w-1-j,bottom-i]=(0,0,0,0)
            xx=w-1-(5-i); 
            if 0<=xx<w and p[xx,bottom-i][3]: p[xx,bottom-i]=OUT+(255,)
        for i in range(6):
            x=6+i; y=bottom-1-i//2
            if p[x,y][3]: p[x,y]=(120,90,50,255)
    return im
for si,(nm,fn) in enumerate((('note',note),('postcard',postcard),('parcel',parcel))):
    for op in(False,True):
        base=fn(op); tag=f'{nm}_open' if op else nm
        base.save(f'{OUTDIR}/letter_{tag}.png')
        for st in(1,2,3): aged(base,st,si*2+op).save(f'{OUTDIR}/letter_{tag}_a{st}.png')

# ---------- 四個工具 ----------
def mailbox(flag_up):
    """郵箱：兩側各有一塊鳥台給送信鳥站；有新回應時旗子舉起"""
    s=Sprite(88,46); ox=24
    for x0,x1 in((2,27),(60,85)):                                          # 鳥台（木板＋支架）
        s.rect(x0,12,x1,15,'#b9905c'); s.rect(x0,16,x1,16,'#8a6238')
        for x in range(x0+3,x1,6): s.px(x,13,'#a07a4a')
    for i in range(6):
        s.rect(27-i,17+i,28-i,17+i,'#8a6238'); s.rect(59+i,17+i,60+i,17+i,'#8a6238')
    s.rect(ox+17,36,ox+22,43,'#8a6238'); s.rect(ox+13,43,ox+26,44,'#735736')   # 柱子與底座
    s.rect(ox+7,12,ox+32,37,'#d9604c')                                     # 箱體
    s.rect(ox+5,7,ox+34,12,'#b8473a'); s.rect(ox+8,4,ox+31,7,'#b8473a'); s.rect(ox+12,2,ox+27,4,'#b8473a')
    s.rect(ox+12,17,ox+27,19,'#3b2a1a',True); s.rect(ox+12,16,ox+27,16,'#f08a78',True)
    s.rect(ox+12,24,ox+27,33,'#c2503f',True); s.rect(ox+13,25,ox+26,32,'#cf5645',True)
    s.px(ox+24,29,'#e3b84f'); s.px(ox+24,28,'#e3b84f')
    if flag_up:
        s.rect(ox+36,1,ox+37,9,'#8a6238'); s.rect(ox+38,1,ox+43,5,'#e3b84f'); s.px(ox+39,2,'#f4d98a')
    else:
        s.rect(ox+33,22,ox+34,30,'#8a6238'); s.rect(ox+33,30,ox+38,34,'#c9963a')
    return s.render()
def feed():
    s=Sprite(40,40)
    s.ell(20,22,17,14,'#9a6a3c'); s.ell(20,20,14,10.5,'#6e4a28',True)
    s.ell(20,20.5,12,8.5,'#e3b84f',True)
    import random; rnd=random.Random(4)
    for _ in range(46):
        a=rnd.random()*6.283; rr=rnd.random()**.5
        x=20+math.cos(a)*11*rr; y=20.5+math.sin(a)*7.5*rr
        s.px(x,y,rnd.choice(['#c9963a','#f4d98a','#b88430','#f4d98a']))
    for (x,y) in((4,34),(8,37),(33,36),(36,32)): s.px(x,y,'#c9963a'); 
    return s.render()
def broom():
    s=Sprite(40,40)
    s.tri((20,17),(2,27),(14,38),'#e3b84f'); s.tri((20,17),(24,21),(14,38),'#e3b84f')
    for k in range(5):
        s.line(18-k*1.2,21+k*0.6,6+k*2.2,29+k*1.9,'#c9963a')
    for i in range(18):                                   # 握柄
        s.rect(36-i,3+i,37-i,4+i,'#9a6a3c')
    s.tri((17,18),(23,16),(25,22),'#d9604c',True); s.tri((17,18),(25,22),(20,24),'#d9604c',True)
    return s.render()
def storebox():
    s=Sprite(68,44)
    s.rect(1,3,66,27,'#b9905c'); s.rect(1,28,66,41,'#96703f')
    for y in(10,18): s.rect(2,y,65,y,'#a07a4a',True)
    s.rect(2,34,65,34,'#7e5c32',True); s.rect(1,27,66,28,'#6f5030',True)
    for x in(9,56): s.rect(x,3,x+3,41,'#8d8a86',True); s.px(x+1,7,'#5c5a57'); s.px(x+1,23,'#5c5a57'); s.px(x+1,37,'#5c5a57')
    s.rect(30,24,37,33,'#e3b84f',True); s.rect(33,27,34,30,'#3b2a1a',True); s.rect(31,25,36,25,'#f4d98a',True)
    return s.render()
for nm,fn in(('feed',feed),('broom',broom),('storebox',storebox)): fn().save(f'{OUTDIR}/tool_{nm}.png')
mailbox(False).save(f'{OUTDIR}/tool_mailbox.png'); mailbox(True).save(f'{OUTDIR}/tool_mailbox_up.png')

# ---------- 大張信紙（閱讀與寫信用）：邊框九宮格 + 可拼貼的紙面 ----------
def frame(fill,ring=None):
    s=Sprite(15,15); s.rect(1,1,13,13,fill)
    for x,y in((1,1),(13,1),(1,13),(13,13)): s.clear(x,y)
    if ring:
        for i in range(3,12):
            for x,y in((i,3),(i,11),(3,i),(11,i)): s.px(x,y,ring)
    return s.render()
frame('#fffdf6').save(f'{OUTDIR}/frame_note.png')
frame('#fff3d2','#e6c98f').save(f'{OUTDIR}/frame_postcard.png')
frame('#c9a070','#8a6b45').save(f'{OUTDIR}/frame_parcel.png')
t=Image.new('RGB',(16,16),hexc('#fffdf6')); p=t.load()
for x in range(16): p[x,15]=hexc('#b9d3e6')
t.save(f'{OUTDIR}/paper_note.png')
t=Image.new('RGBA',(16,48),(0,0,0,0)); p=t.load()                    # 活頁紙左側：紅線與裝訂孔
for y in range(48): p[14,y]=hexc('#f0a8a0')+(255,)
for y in range(21,26):
    for x in range(4,9): p[x,y]=hexc('#7a6248')+(255,)
for x,y in((4,21),(8,21),(4,25),(8,25)): p[x,y]=(0,0,0,0)
t.save(f'{OUTDIR}/paper_note_margin.png')
def stamp():
    s=Sprite(14,16); s.rect(1,1,12,14,'#fffaf0',True); s.rect(3,3,10,12,'#d9604c',True)
    s.rect(5,5,8,10,'#f08a78',True); s.px(6,7,'#fffaf0'); s.px(7,8,'#fffaf0')
    return s.render()
stamp().save(f'{OUTDIR}/stamp.png')
# ---------- 落葉：8 格翻轉動畫（每格 11x11），橫向排成一張圖 ----------
# 葉子一邊在平面上旋轉、一邊翻面：正面 → 側面（變窄成一條線）→ 背面（顏色較淡）→ 側面 → 正面
def leaf_sheet(top,vein,under):
    N=8; F=11
    sheet=Image.new('RGBA',(F*N,F),(0,0,0,0))
    for k in range(N):
        flip=math.cos(k*math.pi/4)                 # 1 正面、0 側面、-1 背面
        ry=max(0.55,2.5*abs(flip)); rx=4.3
        th=math.radians(k*45+20); ct,st=math.cos(th),math.sin(th)
        col=top if flip>=0 else under
        g=[[None]*F for _ in range(F)]; flat=set()
        for py in range(F):
            for px in range(F):
                dx,dy=px+.5-F/2,py+.5-F/2
                lx,ly=dx*ct+dy*st,-dx*st+dy*ct
                if (lx/rx)**2+(ly/ry)**2<=1:
                    g[py][px]=hexc(vein if abs(ly)<.5 and abs(flip)>.3 and lx<rx*.7 else col)
                    if abs(ly)<.5: flat.add((px,py))
                elif -rx-1.6<=lx<-rx+.3 and abs(ly)<.55:     # 葉柄
                    g[py][px]=hexc(vein); flat.add((px,py))
        sheet.paste(finish(g,flat,F,F),(k*F,0))
    return sheet
for i,(c1,c2,c3) in enumerate((('#d19a3a','#9a6a22','#e6c27a'),('#b9a14a','#7f6c2a','#d8c98a'),('#cf6f3a','#96461f','#e6a27a'))):
    leaf_sheet(c1,c2,c3).save(f'{OUTDIR}/leaf_{i}.png')

# ---------- 蛋 ----------
def egg(kind):
    base={'white':'#fffaf0','blue':'#cfe6ee','pink':'#f4cfc8','spot':'#efe2c6','gold':'#f0c94f'}[kind]
    s=Sprite(12,14); s.ell(6,7.6,4.6,5.6,base); s.ell(6,5.5,3.4,3.6,base)
    s.px(4,4,'#ffffff'); s.px(4,5,'#ffffff')
    if kind=='spot':
        for (x,y) in((6,6),(8,8),(4,9),(7,11),(5,7)): s.px(x,y,'#8a6b45')
    if kind=='gold':
        for (x,y) in((7,5),(8,7),(5,10)): s.px(x,y,'#fff3b0')
        s.px(8,10,'#c9963a'); s.px(7,11,'#c9963a')
    return s.render()
for k in('white','blue','pink','spot','gold'): egg(k).save(f'{OUTDIR}/egg_{k}.png')

# ---------- 地面材質（可重複拼貼） ----------
def tile(base,specks,seed,n):
    import random; rnd=random.Random(seed)
    im=Image.new('RGB',(32,32),hexc(base)); p=im.load()
    for _ in range(n): p[rnd.randrange(32),rnd.randrange(32)]=hexc(rnd.choice(specks))
    return im
tile('#f6ecd6',['#efe2c6','#fbf4e2','#ecdcba'],1,34).save(f'{OUTDIR}/ground_out.png')
t=tile('#ead8b4',['#e0cb9f','#f1e2c2','#d9c08f','#e0cb9f'],2,46); p=t.load()
for (x,y) in((5,7),(21,13),(12,25),(27,28)):                 # 小草
    for dx,dy in((0,0),(1,-1),(2,0)): p[(x+dx)%32,(y+dy)%32]=hexc('#c8b877')
t.save(f'{OUTDIR}/ground_rest.png')
tile('#fcf5e3',['#f6ecd2','#fffaf0'],3,26).save(f'{OUTDIR}/ground_inbox.png')
# 明信片與包裹的大張紙面
tile('#fff3d2',['#f9e9c0','#fff8e2'],7,10).save(f'{OUTDIR}/paper_postcard.png')
tile('#c9a070',['#bf955f','#d4ad7c','#b98d58'],9,26).save(f'{OUTDIR}/paper_parcel.png')
print('done')
